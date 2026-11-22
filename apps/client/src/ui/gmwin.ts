// GM window (admin accounts, opened with the /gmadminonline01 chat command). Every button is a server-checked,
// audited GM action. Items are picked from their icons, monsters from their sprites.
import { ENEMIES, ITEM_BASES, MATERIALS, RARITIES, RARITY_DEFS, LEVEL_CAP } from '@astra/shared';
import { getLang } from '../i18n.js';
import { h } from './dom.js';
import { bindTip } from './tooltip.js';
import { itemIcon, matIcon, uiIcon } from './icons.js';
import { drawEnemySprite, setAnimTime } from '../sprites.js';

type Send = (m: any) => void;
export const gmState = { tab: 'items' as 'items' | 'mats' | 'monsters' | 'player' | 'world', rarity: 'legendary', ilvl: 0, n: 1, mlv: 0, mn: 1, elite: false, matN: 50 };

function monsterIcon(id: string, size = 72): HTMLCanvasElement {
  const def = ENEMIES[id]!;
  const c = document.createElement('canvas'); c.width = size * 2; c.height = size * 2; c.className = 'mon-ico';
  c.style.width = c.style.height = `${size}px`;
  const x = c.getContext('2d')!; x.imageSmoothingEnabled = false;
  const scale = Math.min(1.6, 30 / Math.max(12, def.radius)) * 1.6;
  setAnimTime(0.3);
  x.translate(size, size * 1.75);
  drawEnemySprite(x, { id: 1, def: id, f: Math.PI / 2 + 0.6, moving: 0, windup: 0, flash: 0, rx: 0, ry: 0 }, def, false, !!def.boss, scale);
  return c;
}

export function gmWindow(level: number, send: Send, rerender: () => void): HTMLElement {
  const th = getLang() === 'th', S = gmState;
  if (!S.ilvl) S.ilvl = level; if (!S.mlv) S.mlv = level;
  const tabs: Array<[typeof S.tab, string, string]> = [['items', 'greatsword', th ? 'เสกไอเทม' : 'Items'], ['mats', 'ore', th ? 'วัตถุดิบ' : 'Materials'], ['monsters', 'skull', th ? 'เสกมอนสเตอร์' : 'Monsters'], ['player', 'person', th ? 'ผู้เล่น' : 'Player'], ['world', 'mapicon', th ? 'โลกและผู้เล่นอื่น' : 'World']];
  const num = (label: string, val: number, min: number, max: number, on: (v: number) => void) => { const i = h('input', { type: 'number', min, max, value: String(val), 'aria-label': label }) as HTMLInputElement; i.onkeydown = (e) => e.stopPropagation(); i.onchange = () => on(Math.max(min, Math.min(max, Number(i.value) || min))); return h('label', { class: 'gm-f' }, label, i); };
  let body: HTMLElement;
  if (S.tab === 'items') {
    body = h('div', null,
      h('div', { class: 'row wrap gm-bar' }, h('span', null, th ? 'ความหายาก' : 'Rarity'), ...RARITIES.map((r) => h('button', { class: 'btn tiny' + (S.rarity === r ? ' on' : ''), style: `color:${RARITY_DEFS[r].color}`, onclick: () => { S.rarity = r; rerender(); } }, RARITY_DEFS[r].name)),
        num(th ? 'เลเวลไอเทม' : 'Item level', S.ilvl, 1, LEVEL_CAP, (v) => { S.ilvl = v; }), num(th ? 'จำนวน' : 'Count', S.n, 1, 10, (v) => { S.n = v; })),
      h('div', { class: 'gm-grid' }, ...ITEM_BASES.map((b) => { const c = h('button', { class: 'gm-cell', onclick: () => send({ t: 'gm', a: 'item', baseId: b.id, rarity: S.rarity, ilvl: S.ilvl, n: S.n }) }, itemIcon({ baseId: b.id, rarity: S.rarity as never }, 56), h('small', null, b.name)); bindTip(c, () => h('div', { class: 'tip' }, h('b', null, b.name), h('div', null, `${b.slot}${b.classes ? ' · ' + b.classes.join('/') : ''}`))); return c; })));
  } else if (S.tab === 'mats') {
    body = h('div', null, h('div', { class: 'row gm-bar' }, num(th ? 'จำนวน' : 'Amount', S.matN, 1, 9999, (v) => { S.matN = v; })),
      h('div', { class: 'gm-grid' }, ...Object.entries(MATERIALS).map(([id, m]) => h('button', { class: 'gm-cell', onclick: () => send({ t: 'gm', a: 'mat', id, n: S.matN }) }, matIcon(id, 56), h('small', null, m.name)))));
  } else if (S.tab === 'monsters') {
    body = h('div', null,
      h('div', { class: 'row wrap gm-bar' }, num(th ? 'เลเวล' : 'Level', S.mlv, 1, LEVEL_CAP, (v) => { S.mlv = v; }), num(th ? 'จำนวน' : 'Count', S.mn, 1, 20, (v) => { S.mn = v; }),
        h('label', { class: 'check' }, (() => { const c = h('input', { type: 'checkbox', checked: S.elite }) as HTMLInputElement; c.onchange = () => { S.elite = c.checked; }; return c; })(), th ? ' อีลิต' : ' Elite'),
        h('button', { class: 'btn danger', onclick: () => send({ t: 'gm', a: 'killall' }) }, th ? 'ฆ่าทั้งหมดในห้อง' : 'Kill all in room')),
      h('div', { class: 'gm-grid mon' }, ...Object.values(ENEMIES).map((e) => h('button', { class: 'gm-cell' + (e.boss ? ' boss' : ''), onclick: () => send({ t: 'gm', a: 'spawn', id: e.id, n: S.mn, level: S.mlv, elite: S.elite }) }, monsterIcon(e.id), h('small', null, e.name), h('em', null, e.boss ? 'BOSS' : e.role)))));
  } else if (S.tab === 'player') {
    const cur = (k: string, label: string, ic: string) => h('div', { class: 'gm-cur' }, uiIcon(ic, 28), h('span', null, label), ...[100, 1000, 10000].map((n) => h('button', { class: 'btn tiny gold', onclick: () => send({ t: 'gm', a: 'currency', k, n }) }, `+${n.toLocaleString()}`)));
    let lv = level;
    body = h('div', { class: 'col' },
      h('div', { class: 'row wrap' }, h('button', { class: 'btn gold', onclick: () => send({ t: 'gm', a: 'heal' }) }, th ? 'ฟื้นเต็ม + รีเซ็ตคูลดาวน์' : 'Full heal + reset cooldowns'), h('button', { class: 'btn', onclick: () => send({ t: 'gm', a: 'god' }) }, th ? 'สลับโหมดอมตะ' : 'Toggle God Mode'), h('button', { class: 'btn ghost', onclick: () => send({ t: 'gm', a: 'cleardrops' }) }, th ? 'ล้างของที่ตก' : 'Clear drops')),
      h('div', { class: 'row' }, num(th ? 'ตั้งเลเวล' : 'Set level', level, 1, LEVEL_CAP, (v) => { lv = v; }), h('button', { class: 'btn', onclick: () => send({ t: 'gm', a: 'level', n: lv }) }, th ? 'ตั้ง' : 'Set')),
      cur('gold', th ? 'ทอง' : 'Gold', 'coin'), cur('dust', th ? 'ผงดวงดาว' : 'Astral Dust', 'dust'), cur('tokens', th ? 'โทเค็นขอพร' : 'Wish Tokens', 'gacha'), cur('shards', th ? 'เศษอัมเบอร์' : 'Ember Shards', 'shard'), cur('potions', th ? 'ยา' : 'Potions', 'potion'));
  } else {
    const name = h('input', { type: 'text', placeholder: th ? 'ชื่อผู้เล่น' : 'Player name' }) as HTMLInputElement; name.onkeydown = (e) => e.stopPropagation();
    const text = h('input', { type: 'text', placeholder: th ? 'ข้อความประกาศ' : 'Announcement', maxLength: 200 }) as HTMLInputElement; text.onkeydown = (e) => e.stopPropagation();
    body = h('div', { class: 'col' },
      h('div', { class: 'sec-title' }, th ? 'วาร์ป' : 'Teleport'), h('div', { class: 'row wrap' }, ...([['town', 'Lumenhold'], ['field', 'Duskmeadow'], ['highlands', 'Ashen Highlands'], ['wastes', 'Starfall Wastes']] as const).map(([z, l]) => h('button', { class: 'btn', onclick: () => send({ t: 'gm', a: 'teleport', zone: z }) }, l))),
      h('div', { class: 'sec-title' }, th ? 'ประกาศทั้งเซิร์ฟเวอร์' : 'Server announcement'), h('div', { class: 'row' }, text, h('button', { class: 'btn gold', onclick: () => send({ t: 'gm', a: 'announce', text: text.value }) }, th ? 'ประกาศ' : 'Announce')),
      h('div', { class: 'sec-title' }, th ? 'จัดการผู้เล่น' : 'Moderation'), h('div', { class: 'row wrap' }, name, h('button', { class: 'btn', onclick: () => send({ t: 'gm', a: 'mute', name: name.value, minutes: 10 }) }, th ? 'ปิดแชท 10 นาที' : 'Mute 10 min'), h('button', { class: 'btn danger', onclick: () => send({ t: 'gm', a: 'kick', name: name.value }) }, th ? 'เตะออก' : 'Kick')),
      h('p', { class: 'hint' }, th ? 'ทุกคำสั่ง GM ถูกบันทึกใน audit log · การตั้งค่าเศรษฐกิจและคอนเทนต์ใช้คอนโซล /admin.html' : 'Every GM action is written to the audit log. Economy and content tuning live in the staff console (/admin.html).'));
  }
  return h('div', { class: 'gmwin' }, h('div', { class: 'win-tabs' }, ...tabs.map(([id, ic, l]) => h('button', { class: 'wt icon' + (S.tab === id ? ' on' : ''), onclick: () => { S.tab = id; rerender(); } }, uiIcon(ic, 22), l))), body);
}

