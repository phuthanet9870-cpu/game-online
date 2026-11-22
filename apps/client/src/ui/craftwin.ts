// Crafting & Life Skills window (concept 08): profession tabs, life-skill levels, recipe list, recipe detail with
// required materials (owned / needed), cost and the Craft button. Crafting still happens at the right NPC (server rule).
import { ELIXIRS, MATERIALS, PROF_MAX, PROFESSIONS, RECIPES, profXpToNext, type CharacterData, type ProfId } from '@astra/shared';
import { getLang } from '../i18n.js';
import { ct } from '../i18n.js';
import { statText } from '../l10n.js';
import { h } from './dom.js';
import { bindTip } from './tooltip.js';
import { matIcon, tileIcon, uiIcon } from './icons.js';

type Send = (m: any) => void;
const CRAFT_SLOTS = ['weapon', 'helmet', 'chest', 'gloves', 'boots', 'ring', 'necklace'];
const PROF_ICON: Record<ProfId, [string, string]> = { smithing: ['anvil', ''], alchemy: ['potion', '#9b6cff'], cooking: ['plate', '#ffb36a'], mining: ['ore', '#c8d0e0'], herbalism: ['flower', '#7ed23c'], fishing: ['fish', '#8ab0d8'] };
const NPC_FOR: Record<string, string> = { smithing: 'Brenna the Smith', alchemy: 'Sister Maelis', cooking: 'Sister Maelis' };
const ui = { tab: 'smithing' as ProfId, sel: null as string | null, q: '', slot: 'weapon' };

function recipeIcon(r: (typeof RECIPES)[number], size: number): HTMLElement {
  if (r.result.kind === 'item') return tileIcon(ui.slot === 'weapon' ? 'greatsword' : ui.slot === 'helmet' ? 'helm' : ui.slot === 'chest' ? 'chest_plate' : ui.slot === 'gloves' ? 'gauntlets' : ui.slot === 'boots' ? 'greaves' : ui.slot === 'ring' ? 'ring' : 'amulet', '#ffd36a', (r.result as { rarity?: string }).rarity ?? 'rare', size);
  if (r.result.kind === 'potion') return matIcon('elixir_fury', size);
  const id = (r.result as { id?: string }).id ?? '';
  return MATERIALS[id] ? matIcon(id, size) : tileIcon(r.prof === 'cooking' ? 'plate' : 'potion', r.prof === 'cooking' ? '#c8a070' : '#9b6cff', 'uncommon', size);
}

/** `stations` = professions whose NPC the player is standing at (crafting is allowed only there). */
export function craftingWindow(ch: CharacterData, stations: ProfId[], send: Send, rerender: () => void): HTMLElement {
  const th = getLang() === 'th';
  const lv = (p: ProfId) => ch.prof[p]?.lv ?? 1;
  const xp = (p: ProfId) => ch.prof[p]?.xp ?? 0;
  const craftable: ProfId[] = ['smithing', 'alchemy', 'cooking'];
  if (!craftable.includes(ui.tab)) ui.tab = stations[0] ?? 'smithing';
  const tabs = h('div', { class: 'win-tabs' }, ...craftable.map((p) => h('button', { class: 'wt icon' + (ui.tab === p ? ' on' : ''), onclick: () => { ui.tab = p; ui.sel = null; rerender(); } }, uiIcon(PROF_ICON[p][0], 22, PROF_ICON[p][1] || '#9b6cff'), ct(`prof.${p}`, PROFESSIONS[p].name))));
  // left: life skills
  const left = h('div', { class: 'cw-left' }, h('div', { class: 'sec-title' }, th ? 'ทักษะชีวิต' : 'Life Skills'),
    ...(Object.keys(PROFESSIONS) as ProfId[]).map((p) => { const L = lv(p), need = profXpToNext(L), pct = L >= PROF_MAX ? 100 : Math.round((xp(p) / need) * 100);
      return h('div', { class: 'ls' }, uiIcon(PROF_ICON[p][0], 34, PROF_ICON[p][1] || '#9b6cff'), h('div', { class: 'grow' }, h('div', { class: 'row between' }, h('b', null, ct(`prof.${p}`, PROFESSIONS[p].name)), h('small', null, L >= PROF_MAX ? `Lv.${L} ★MAX` : `Lv.${L}  ${pct}%`)), h('div', { class: 'gbar thin' }, h('i', { style: `width:${pct}%;background:linear-gradient(90deg,#c8902a,#ffe28a)` })), h('small', { class: 'muted' }, PROFESSIONS[p].desc))); }),
    ch.elixir && ch.elixir.until > Date.now() ? h('div', { class: 'ls-active' }, uiIcon('potion', 22, '#5fe0d0'), `${th ? 'กำลังใช้' : 'Active'}: ${ELIXIRS[ch.elixir.id]?.name} (${Math.ceil((ch.elixir.until - Date.now()) / 60000)}m)`) : null);
  // middle: recipes
  const list = RECIPES.filter((r) => r.prof === ui.tab && (!ui.q || r.name.toLowerCase().includes(ui.q.toLowerCase())));
  if (!ui.sel || !list.some((r) => r.id === ui.sel)) ui.sel = list[0]?.id ?? null;
  const search = h('input', { type: 'search', placeholder: th ? 'ค้นหาสูตร…' : 'Search recipes…', value: ui.q, 'aria-label': 'Search recipes' });
  search.oninput = () => { ui.q = search.value; rerender(); setTimeout(() => (document.querySelector('.cw-mid input[type=search]') as HTMLInputElement | null)?.focus(), 0); };
  const mid = h('div', { class: 'cw-mid' }, h('div', { class: 'sec-title' }, `${th ? 'สูตร' : 'Recipes'} (${ct(`prof.${ui.tab}`, PROFESSIONS[ui.tab].name)})`), search,
    h('div', { class: 'rlist' }, ...list.map((r) => { const ok = Object.entries(r.mats).every(([m, n]) => (ch.mats[m] ?? 0) >= n) && lv(r.prof) >= r.level;
      return h('button', { class: 'rrow' + (ui.sel === r.id ? ' on' : '') + (ok ? ' ok' : ''), onclick: () => { ui.sel = r.id; rerender(); } }, recipeIcon(r, 40), h('div', { class: 'grow' }, h('b', null, ct(`recipe.${r.id}`, r.name)), h('small', { class: 'muted' }, `${th ? 'ต้องการ' : 'Requires'} Lv.${r.level}`)), ok ? uiIcon('star', 18, '#ffd36a') : null); })));
  // right: detail
  const r = RECIPES.find((x) => x.id === ui.sel);
  let right: HTMLElement;
  if (!r) right = h('div', { class: 'cw-right' }, h('p', { class: 'muted' }, th ? 'ไม่มีสูตร' : 'No recipe'));
  else {
    const here = stations.includes(r.prof);
    const missing = Object.entries(r.mats).filter(([m, n]) => (ch.mats[m] ?? 0) < n);
    const lvOk = lv(r.prof) >= r.level, dustOk = (r.dust ?? 0) <= ch.dust, goldOk = (r.gold ?? 0) <= ch.gold;
    const can = here && lvOk && !missing.length && dustOk && goldOk;
    const why = !here ? (th ? `ไปหา ${NPC_FOR[r.prof]} เพื่อคราฟต์` : `Visit ${NPC_FOR[r.prof]} to craft`) : !lvOk ? `Requires level ${r.level}` : missing.length ? (th ? 'วัตถุดิบไม่พอ' : 'Not enough materials') : !dustOk ? 'Not enough Astral Dust' : !goldOk ? 'Not enough gold' : '';
    const el = r.result.kind === 'elixir' ? ELIXIRS[(r.result as { id: string }).id] : null;
    const slotSel = h('select', { 'aria-label': 'Forge slot', onchange: (e: Event) => { ui.slot = (e.target as HTMLSelectElement).value; rerender(); } }, ...CRAFT_SLOTS.map((x) => h('option', { value: x, selected: ui.slot === x }, x)));
    const craftBtn = h('button', { class: 'btn primary big', disabled: !can, onclick: () => send({ t: 'craft', recipe: r.id, slot: ui.slot }) }, uiIcon('hammer', 22), th ? ' คราฟต์' : ' Craft');
    if (!can) craftBtn.title = why;
    right = h('div', { class: 'cw-right' },
      h('div', { class: 'rd-head' }, recipeIcon(r, 96), h('div', { class: 'grow' }, h('h3', null, ct(`recipe.${r.id}`, r.name)), h('div', { class: 'row wrap' }, h('span', { class: 'tag' }, `Lv.${r.level}`), h('span', { class: 'tag' }, `+${r.xp} XP`), r.result.kind === 'item' ? h('span', { class: 'tag' }, (r.result as { rarity?: string }).rarity ?? '') : null),
        r.result.kind === 'item' ? h('div', { class: 'row' }, h('small', { class: 'muted' }, th ? 'ช่องที่จะตีขึ้น:' : 'Forge slot:'), slotSel) : null)),
      h('div', { class: 'sec-title' }, th ? 'ผลลัพธ์' : 'Result'),
      el ? h('ul', { class: 'icard-list' }, h('li', null, `${el.minutes} ${th ? 'นาที' : 'minutes'}:`), ...el.mods.map((m) => h('li', null, '• ' + statText(m.stat, m.value)))) : r.result.kind === 'potion' ? h('p', null, th ? '+1 ช่องยาฟื้นฟู' : '+1 Restorative Draught charge') : h('p', { class: 'muted' }, th ? 'อุปกรณ์สุ่มค่าเสริมตามระดับความหายาก (เลเวลไอเทมเท่ากับเลเวลตัวละคร)' : 'Equipment with random affixes of this rarity (item level = your level).'),
      h('div', { class: 'sec-title' }, th ? 'วัตถุดิบที่ต้องใช้' : 'Required Materials'),
      h('div', { class: 'req' }, ...Object.entries(r.mats).map(([m, n]) => { const have = ch.mats[m] ?? 0; const c = h('div', { class: 'reqm' + (have >= n ? ' ok' : ' no') }, matIcon(m, 56), h('small', null, MATERIALS[m]?.name ?? m), h('b', null, `${have} / ${n}`)); bindTip(c, () => h('div', { class: 'tip' }, h('b', null, MATERIALS[m]?.name ?? m), h('p', null, MATERIALS[m]?.source ?? ''))); return c; }),
        r.dust ? h('div', { class: 'reqm' + (dustOk ? ' ok' : ' no') }, uiIcon('dust', 56, '#6aa8ff'), h('small', null, th ? 'ผงดวงดาว' : 'Astral Dust'), h('b', null, `${ch.dust} / ${r.dust}`)) : null,
        r.gold ? h('div', { class: 'reqm' + (goldOk ? ' ok' : ' no') }, uiIcon('coin', 56), h('small', null, th ? 'ทอง' : 'Gold'), h('b', null, `${r.gold.toLocaleString()}`)) : null),
      h('div', { class: 'craft-go' }, !can ? h('small', { class: 'warn' }, why) : h('small', { class: 'good' }, th ? 'พร้อมคราฟต์' : 'Ready to craft'), craftBtn));
  }
  return h('div', { class: 'craftwin' }, tabs, h('div', { class: 'cw-cols' }, left, mid, right), h('p', { class: 'hint' }, th ? 'เก็บ Moonpetal ใน Duskmeadow · แร่และ Emberbloom ใน Ashen Highlands · สัตว์ดรอปเนื้อ · Cinderkin ดรอปแกนเพลิง' : 'Gather Moonpetal in Duskmeadow; ore and Emberbloom in the Ashen Highlands. Beasts drop meat; Cinderkin drop Cinder Cores.'));
}

