// Inventory & equipment window (concept 07): character card + paper doll, filtered item grid, Equipped vs Selected
// comparison cards and context actions. All numbers come from the real item data; actions are the server's.
import { AFFIX_MAP, CLASSES, EQUIP_SLOTS, ITEM_BASE_MAP, MATERIALS, PETS, POTION, RARITIES, RARITY_DEFS, AURAS, ACHIEVEMENTS, ENEMIES, combatPower, computeStats, enchantCost, itemMods, salvageValue, sellValue, type EquipSlot, type Item } from '@astra/shared';
import { getLang, t } from '../i18n.js';
import { itemName, powerDesc, rarityName, slotName, statText } from '../l10n.js';
import { clear, h } from './dom.js';
import { bindTip, hideTip, itemTooltip } from './tooltip.js';
import { itemIcon, matIcon, uiIcon, tileIcon } from './icons.js';
import { drawChibi } from '../sprites.js';
import type { PanelCtx } from './panels.js';

type Mode = 'normal' | 'smith' | 'quartermaster' | 'stash';
type Filter = 'all' | 'weapon' | 'armor' | 'jewelry' | 'relic';
const FILTERS: Array<[Filter, string, string]> = [['all', 'grid', 'All'], ['weapon', 'crossed', 'Weapons'], ['armor', 'chest_plate', 'Armor'], ['jewelry', 'ring', 'Jewelry'], ['relic', 'relic_star', 'Relics & runes']];
const inFilter = (it: Item, f: Filter) => f === 'all' || (f === 'weapon' && it.slot === 'weapon') || (f === 'armor' && ['helmet', 'chest', 'gloves', 'boots'].includes(it.slot)) || (f === 'jewelry' && ['ring', 'necklace'].includes(it.slot)) || (f === 'relic' && ['relic', 'rune'].includes(it.slot));
const stars = (r: string) => '★'.repeat(RARITIES.indexOf(r as never) + 1);
const ui = { tab: 'equipment' as 'equipment' | 'materials' | 'collections', filter: 'all' as Filter, sort: 'rarity' as 'rarity' | 'level' | 'slot', sel: null as number | null };

function equippedFor(ch: PanelCtx['ch'], it: Item): Item | null { return it.slot === 'ring' ? ch.equipment.ring1 ?? null : (ch.equipment[it.slot as EquipSlot] as Item | undefined) ?? null; }
function sumMods(it: Item | null) { const m: Record<string, number> = {}; if (!it) return m; for (const md of itemMods(it)) m[md.stat] = (m[md.stat] ?? 0) + md.value; return m; }

/** One comparison card (Equipped or Selected). */
function itemCard(it: Item | null, label: string, other: Item | null, cls: string): HTMLElement {
  const th = getLang() === 'th';
  if (!it) return h('div', { class: 'icard empty ' + cls }, h('div', { class: 'icard-tag' }, label), h('p', { class: 'muted' }, th ? 'ไม่มีไอเทม' : 'Nothing here'));
  const rd = RARITY_DEFS[it.rarity], base = ITEM_BASE_MAP[it.baseId], mine = sumMods(it), oth = sumMods(other);
  const delta = (stat: string, v: number) => { if (!other) return null; const d = v - (oth[stat] ?? 0); return Math.abs(d) < 0.001 ? null : h('span', { class: d > 0 ? 'up' : 'down' }, ` (${d > 0 ? '+' : ''}${Math.round(d * 100) / 100})`); };
  const newStats = other ? Object.keys(mine).filter((k) => oth[k] === undefined) : [];
  return h('div', { class: 'icard ' + cls, style: `--rc:${rd.color}` },
    h('div', { class: 'icard-tag' }, label),
    h('div', { class: 'icard-head' }, itemIcon(it, 56), h('div', null, h('b', { class: 'icard-name' }, itemName(it)), h('div', { class: 'muted' }, `${rarityName(it.rarity)} · ${slotName(it.slot)}`), h('div', { class: 'stars' }, stars(it.rarity)))),
    h('div', { class: 'icard-kv' }, h('span', null, th ? 'เลเวลไอเทม' : 'Item Level'), h('b', null, String(it.ilvl)),
      h('span', null, th ? 'ต้องการเลเวล' : 'Req. Lv'), h('b', null, String(it.reqLevel)),
      h('span', null, th ? 'อาชีพที่ถนัด' : 'Affinity'), h('b', null, base?.classes ? base.classes.map((c) => CLASSES[c].name).join(' / ') : (th ? 'ทุกอาชีพ' : 'Any class')),
      it.weaponPower ? h('span', null, th ? 'พลังอาวุธ' : 'Weapon Power') : null, it.weaponPower ? h('b', null, String(it.weaponPower), other?.weaponPower !== undefined && other.weaponPower !== it.weaponPower ? h('span', { class: (it.weaponPower - (other.weaponPower ?? 0)) > 0 ? 'up' : 'down' }, ` (${it.weaponPower - (other.weaponPower ?? 0) > 0 ? '+' : ''}${it.weaponPower - (other.weaponPower ?? 0)})`) : null) : null),
    h('div', { class: 'icard-sec' }, th ? 'ค่าพื้นฐาน' : 'Base Stats'),
    h('ul', { class: 'icard-list' }, it.implicit.map((m) => h('li', null, statText(m.stat, m.value), delta(m.stat, mine[m.stat] ?? 0)))),
    h('div', { class: 'icard-sec' }, `${th ? 'ค่าเสริม' : 'Affixes'} (${it.affixes.length}/${rd.affixes[1]})`),
    h('ul', { class: 'icard-list aff' }, it.affixes.map((a) => h('li', null, uiIcon('shard', 14, rd.color), AFFIX_MAP[a.id] ? AFFIX_MAP[a.id]!.label.replace('{v}', String(a.value)) : statText(a.stat, a.value), h('small', { class: 'muted' }, ` T${a.tier}`), newStats.includes(a.stat) ? h('span', { class: 'new' }, th ? ' (ใหม่)' : ' (New)') : delta(a.stat, mine[a.stat] ?? 0)))),
    it.power ? h('div', { class: 'icard-trait' }, h('div', { class: 'icard-sec' }, uiIcon('star', 16, '#ffd36a'), th ? ' พลังพิเศษ (ตำนาน)' : ' Unique Trait'), h('p', null, powerDesc(it.power))) : null,
    h('div', { class: 'icard-foot muted' }, [it.bound ? (th ? 'ผูกกับตัวละคร' : 'Bound to character') : (th ? 'แลกเปลี่ยนได้' : 'Tradeable'), it.hardcore ? 'Hardcore' : null].filter(Boolean).join(' · ')));
}

export function inventoryWindow(ctx: PanelCtx, mode: Mode, rerender: () => void): HTMLElement {
  const { ch, send } = ctx;
  const th = getLang() === 'th';
  const st = computeStats(ch), d = CLASSES[ch.cls];
  const tabs = h('div', { class: 'win-tabs' }, ...([['equipment', th ? 'อุปกรณ์' : 'Equipment'], ['materials', th ? 'วัตถุดิบ' : 'Materials'], ['collections', th ? 'สะสม' : 'Collections']] as const).map(([id, label]) => h('button', { class: 'wt' + (ui.tab === id ? ' on' : ''), onclick: () => { ui.tab = id; rerender(); } }, label)));
  if (ui.tab === 'materials') return h('div', { class: 'invwin' }, tabs, materialsTab(ctx));
  if (ui.tab === 'collections') return h('div', { class: 'invwin' }, tabs, collectionsTab(ctx));

  // ── left: character card + paper doll ──
  const doll = h('canvas', { class: 'doll-sprite', width: 160, height: 200 });
  const dx = doll.getContext('2d')!; dx.imageSmoothingEnabled = false;
  drawChibi(dx, 80, 176, 3.6, Math.PI / 2 - 0.3, d.colors.body, d.colors.hair, d.colors.accent, 0, 0, ch.cls);
  const slotLabel: Record<string, string> = th ? { weapon: 'อาวุธ', helmet: 'หัว', chest: 'อก', gloves: 'ถุงมือ', boots: 'รองเท้า', ring1: 'แหวน (ซ้าย)', ring2: 'แหวน (ขวา)', necklace: 'สร้อยคอ', relic: 'เรลิก', rune: 'รูน' } : { weapon: 'Weapon', helmet: 'Head', chest: 'Chest', gloves: 'Gloves', boots: 'Boots', ring1: 'Ring (L)', ring2: 'Ring (R)', necklace: 'Necklace', relic: 'Relic', rune: 'Rune' };
  const slotGlyph: Record<string, string> = { weapon: 'greatsword', helmet: 'helm', chest: 'chest_plate', gloves: 'gauntlets', boots: 'greaves', ring1: 'ring', ring2: 'ring', necklace: 'amulet', relic: 'relic_star', rune: 'rune' };
  const eqSlot = (s: EquipSlot) => {
    const it = ch.equipment[s];
    const b = h('button', { class: 'eq' + (it ? ' has' : ''), 'aria-label': slotLabel[s] }, it ? itemIcon(it, 54) : h('div', { class: 'eq-ph' }, uiIcon(slotGlyph[s]!, 34)), h('small', null, slotLabel[s]));
    if (it) { bindTip(b, () => itemTooltip(it)); b.onclick = () => { hideTip(); send({ t: 'unequip', slot: s }); }; b.title = th ? 'คลิกเพื่อถอด' : 'Click to unequip'; }
    return b;
  };
  const cosmetic = (label: string, icon: HTMLElement, on: boolean, owned: boolean, fn: () => void) => { const b = h('button', { class: 'cos' + (on ? ' on' : '') + (owned ? '' : ' locked'), disabled: !owned, onclick: fn }, icon, h('small', null, label)); if (!owned) b.title = th ? 'ยังไม่ได้ปลดล็อก' : 'Not unlocked yet'; return b; };
  const left = h('div', { class: 'inv-left' },
    h('div', { class: 'char-head' }, uiIcon('emblem', 40, d.colors.accent), h('div', { class: 'grow' }, h('b', { class: 'ch-name' }, ch.name, h('em', null, ` Lv.${ch.level}`)), h('div', { class: 'muted' }, d.name)), h('div', { class: 'cpbox' }, uiIcon('crossed', 22, '#ffd36a'), h('b', null, `CP ${combatPower(st).toLocaleString()}`))),
    h('div', { class: 'doll' }, h('div', { class: 'doll-col' }, ...(['helmet', 'chest', 'gloves', 'boots'] as EquipSlot[]).map(eqSlot)), h('div', { class: 'doll-mid' }, h('div', { class: 'doll-ring' }), doll), h('div', { class: 'doll-col' }, ...(['weapon', 'necklace', 'ring1', 'ring2'] as EquipSlot[]).map(eqSlot))),
    h('div', { class: 'doll-row' }, eqSlot('relic'), eqSlot('rune')),
    h('div', { class: 'sec-title' }, uiIcon('costume', 20, '#9b6cff'), th ? 'ชั้นคอสเมติก' : 'Cosmetic Layers'),
    h('div', { class: 'cos-row' },
      ...Object.entries(AURAS).map(([id, a]) => cosmetic(a.name, tileIcon('awaken', a.color, ctx.account.auras?.includes(id) ? 'epic' : 'common', 44), ctx.account.aura === id, !!ctx.account.auras?.includes(id), () => { if (ctx.account.auras?.includes(id)) send({ t: 'set_aura', id: ctx.account.aura === id ? null : id }); })),
      ...Object.entries(PETS).map(([id, p]) => cosmetic(p.name, tileIcon('mount', p.color, ctx.account.pets?.includes(id) ? 'rare' : 'common', 44), ctx.account.pet === id, !!ctx.account.pets?.includes(id), () => { if (ctx.account.pets?.includes(id)) send({ t: 'pet_set', id: ctx.account.pet === id ? null : id }); }))),
    mode === 'quartermaster' ? h('div', { class: 'adopt' }, ...Object.entries(PETS).filter(([id]) => !ctx.account.pets?.includes(id)).map(([id, p]) => h('button', { class: 'btn tiny', onclick: () => send({ t: 'pet_buy', id }) }, `${th ? 'รับ' : 'Adopt'} ${p.name} (${p.cost.gold}g${Object.entries(p.cost.mats ?? {}).map(([m, n]) => ` + ${n} ${MATERIALS[m]?.name ?? m}`).join('')})`))) : null,
    h('small', { class: 'muted' }, th ? 'ออร่าได้จากซีซันพาส · สัตว์เลี้ยงรับได้ที่ Quartermaster Sol' : 'Auras come from the Season Pass · companions from Quartermaster Sol'));

  // ── middle: filters + grid ──
  const order = ch.inventory.map((it, i) => ({ it, i })).filter((x) => x.it && inFilter(x.it, ui.filter));
  const rIdx = (r: string) => RARITIES.indexOf(r as never);
  order.sort((a, b) => ui.sort === 'rarity' ? rIdx(b.it!.rarity) - rIdx(a.it!.rarity) || b.it!.ilvl - a.it!.ilvl : ui.sort === 'level' ? b.it!.ilvl - a.it!.ilvl : a.it!.slot.localeCompare(b.it!.slot));
  const used = ch.inventory.filter(Boolean).length;
  const grid = h('div', { class: 'igrid' });
  for (const { it, i } of order) {
    const c = h('button', { class: 'icell' + (ui.sel === i ? ' sel' : ''), style: `--rc:${RARITY_DEFS[it!.rarity].color}` }, itemIcon(it!, 58), h('em', { class: 'ilv' }, String(it!.ilvl)), h('i', { class: 'st' }, stars(it!.rarity)));
    bindTip(c, () => itemTooltip(it!, equippedFor(ch, it!)));
    c.onclick = () => { hideTip(); ui.sel = i; rerender(); };
    c.oncontextmenu = (e) => { e.preventDefault(); hideTip(); send({ t: 'equip', inv: i }); };
    grid.append(c);
  }
  for (let k = order.length; k < Math.max(24, Math.ceil(order.length / 6) * 6); k++) grid.append(h('div', { class: 'icell empty' }));
  const mid = h('div', { class: 'inv-mid' },
    h('div', { class: 'filters' }, ...FILTERS.map(([f, ic, label]) => { const b = h('button', { class: 'flt' + (ui.filter === f ? ' on' : ''), title: label, onclick: () => { ui.filter = f; rerender(); } }, uiIcon(ic, 26)); return b; })),
    h('div', { class: 'row between inv-sub' }, h('b', null, uiIcon('bag', 20), ` ${th ? 'กระเป๋า' : 'Inventory'} (${used} / ${ch.inventory.length})`),
      h('select', { class: 'sortsel', 'aria-label': 'Sort', onchange: (e: Event) => { ui.sort = (e.target as HTMLSelectElement).value as typeof ui.sort; rerender(); } }, ...([['rarity', th ? 'ความหายาก' : 'Rarity'], ['level', th ? 'เลเวลไอเทม' : 'Item level'], ['slot', th ? 'ช่องสวมใส่' : 'Slot']] as const).map(([v, l]) => h('option', { value: v, selected: ui.sort === v }, l)))),
    grid,
    h('div', { class: 'inv-foot' }, h('span', null, uiIcon('potion', 20, '#ff4a5a'), ` ${t('potion')} ${ch.potions}/${POTION.maxCharges}`), (ch.mats?.treasure_map ?? 0) > 0 || ch.treasure ? h('span', null, matIcon('treasure_map', 20), ` ${ch.mats?.treasure_map ?? 0}`, ch.treasure ? h('small', { class: 'muted' }, th ? ' กำลังล่าสมบัติ' : ' hunt active') : h('button', { class: 'btn tiny', onclick: () => send({ t: 'use_map' }) }, th ? 'อ่านแผนที่' : 'Read map')) : null,
      mode === 'quartermaster' ? h('button', { class: 'btn tiny gold', onclick: () => send({ t: 'buy_potion' }) }, `${th ? 'ซื้อยา' : 'Buy potion'} (${POTION.buyPrice}g)`) : null));

  // ── right: compare + actions ──
  const sel = ui.sel !== null ? ch.inventory[ui.sel] ?? null : null;
  if (ui.sel !== null && !sel) ui.sel = null;
  const eq = sel ? equippedFor(ch, sel) : null;
  const i = ui.sel ?? -1;
  const need = (who: string) => (th ? `ไปหา ${who}` : `Visit ${who}`);
  const act = (label: string, icon: string, enabled: boolean, why: string, fn: () => void, cls = '') => { const b = h('button', { class: 'abtn ' + cls, disabled: !enabled, onclick: fn }, uiIcon(icon, 24), h('span', null, label)); if (!enabled && why) b.title = why; return b; };
  const right = h('div', { class: 'inv-right' },
    h('div', { class: 'cmp' }, itemCard(eq, th ? 'สวมอยู่' : 'Equipped', null, 'eqd'), itemCard(sel, th ? 'ที่เลือก' : 'Selected', eq, 'seld')),
    h('div', { class: 'actions' },
      act(t('equip'), 'person', !!sel, '', () => send({ t: 'equip', inv: i })),
      sel?.slot === 'ring' ? act(th ? 'ใส่แหวนขวา' : 'Equip ring (R)', 'ring', true, '', () => send({ t: 'equip', inv: i, slot: 'ring2' })) : null,
      act(th ? `แยกชิ้นส่วน${sel ? ` (+${salvageValue(sel)}✦)` : ''}` : `Salvage${sel ? ` (+${salvageValue(sel)}✦)` : ''}`, 'anvil', mode === 'smith' && !!sel, need('Brenna the Smith'), () => send({ t: 'salvage', inv: i }), 'gold'),
      act(th ? `ขาย${sel ? ` (+${sellValue(sel)}g)` : ''}` : `Sell${sel ? ` (+${sellValue(sel)}g)` : ''}`, 'coin', mode === 'quartermaster' && !!sel, need('Quartermaster Sol'), () => send({ t: 'sell', inv: i }), 'gold'),
      act(th ? 'ฝากคลัง' : 'Store', 'chestbox', mode === 'stash' && !!sel && !sel.bound, sel?.bound ? (th ? 'ไอเทมผูกกับตัวละคร' : 'Bound items cannot be stored') : need('the Astral Vault'), () => send({ t: 'stash_put', inv: i }))),
    mode === 'smith' && sel && sel.affixes.length ? h('div', { class: 'reroll' }, h('small', { class: 'muted' }, th ? `เสริมพลัง (${enchantCost(sel).dust}✦ ${enchantCost(sel).gold}g) — เลือกค่าเสริมที่จะสุ่มใหม่:` : `Enchant (${enchantCost(sel).dust}✦ ${enchantCost(sel).gold}g) — choose an affix to reroll:`), ...sel.affixes.map((a, ai) => h('button', { class: 'btn tiny', onclick: () => send({ t: 'enchant', inv: i, affix: ai }) }, `↻ ${AFFIX_MAP[a.id]?.label.replace('{v}', String(a.value)) ?? a.stat}`))) : null,
    !sel ? h('p', { class: 'hint' }, th ? 'คลิกไอเทมเพื่อเลือก · คลิกขวาเพื่อสวมทันที' : 'Click an item to compare · right-click to equip') : null);
  const stash = mode === 'stash' ? h('div', { class: 'stash-row' }, h('div', { class: 'sec-title' }, uiIcon('chestbox', 20), `${t('stash')} (${ch.hardcore ? 'Hardcore' : 'Normal'})`), h('div', { class: 'igrid small' }, ...(ch.hardcore ? ctx.account.stash.hardcore : ctx.account.stash.normal).map((it, k) => it ? (() => { const c = h('button', { class: 'icell', style: `--rc:${RARITY_DEFS[it.rarity].color}` }, itemIcon(it, 44)); bindTip(c, () => itemTooltip(it)); c.onclick = () => { hideTip(); send({ t: 'stash_take', idx: k }); }; return c; })() : h('div', { class: 'icell empty' })))) : null;
  return h('div', { class: 'invwin' }, tabs, h('div', { class: 'inv-cols' }, left, mid, right), stash);
}

function materialsTab(ctx: PanelCtx): HTMLElement {
  const th = getLang() === 'th';
  return h('div', { class: 'mat-grid' }, ...Object.entries(MATERIALS).map(([id, m]) => {
    const n = ctx.ch.mats?.[id] ?? 0;
    const c = h('div', { class: 'mat' + (n ? '' : ' none') }, matIcon(id, 56), h('em', { class: 'qty' }, String(n)), h('b', null, m.name), h('small', { class: 'muted' }, m.source));
    bindTip(c, () => h('div', { class: 'tip' }, h('div', { class: 'tip-title' }, m.name), h('p', null, m.source), h('small', null, `${th ? 'มีอยู่' : 'Owned'}: ${n}`)));
    return c;
  }), h('div', { class: 'mat' }, uiIcon('dust', 56, '#6aa8ff'), h('em', { class: 'qty' }, String(ctx.ch.dust)), h('b', null, th ? 'ผงดวงดาว' : 'Astral Dust'), h('small', { class: 'muted' }, th ? 'ได้จากการแยกชิ้นส่วนไอเทม' : 'From salvaging items')));
}
function collectionsTab(ctx: PanelCtx): HTMLElement {
  const th = getLang() === 'th', known = ctx.account.codex;
  const ach = Object.entries(ACHIEVEMENTS);
  return h('div', { class: 'coll' },
    h('div', { class: 'sec-title' }, uiIcon('trophy', 20), `${th ? 'ความสำเร็จ' : 'Achievements'} (${ctx.account.achievements.length}/${ach.length})`),
    h('div', { class: 'ach-grid' }, ...ach.map(([id, a]) => { const got = ctx.account.achievements.includes(id); const c = h('div', { class: 'achv' + (got ? ' got' : '') }, tileIcon('trophy', got ? '#ffd36a' : '#555', got ? 'legendary' : 'common', 44), h('b', null, a.name), h('small', { class: 'muted' }, a.desc)); return c; })),
    h('div', { class: 'sec-title' }, uiIcon('book', 20), `${th ? 'สารานุกรมศัตรู' : 'Bestiary'} (${Object.keys(known).length}/${Object.keys(ENEMIES).length - 1})`),
    h('div', { class: 'ach-grid' }, ...Object.values(ENEMIES).filter((e) => e.id !== 'dummy').map((e) => { const n = known[e.id] ?? 0; return h('div', { class: 'achv' + (n ? ' got' : '') }, tileIcon(e.boss ? 'skull' : 'ghost', n ? e.color : '#333', e.boss ? 'ancient' : 'common', 44), h('b', null, n ? e.name : '???'), h('small', { class: 'muted' }, n ? `${e.family} · ×${n}` : (th ? 'ยังไม่พบ' : 'Not yet encountered'))); })));
}
