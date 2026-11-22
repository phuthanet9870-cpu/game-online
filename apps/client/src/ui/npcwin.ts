// NPC service windows: a framed portrait of the NPC with their line, then the service. Trainer (passive paths,
// skills, resets, info) and Carpenter (furniture catalogue) follow the reference layouts.
import { CLASSES, CLASS_IDS, FURNITURE, MATERIALS, PASSIVE_MAP, passivePointsFor, respecCost, refundCost, type AccountProgress, type CharacterData } from '@astra/shared';
import { getLang, t } from '../i18n.js';
import { confirmDialog, h } from './dom.js';
import { tileIcon, uiIcon, matIcon } from './icons.js';
import { drawChibi } from '../sprites.js';
import { NPC_COLORS, drawFurniture } from '../render.js';
import { passiveTreePanel } from './passive.js';
import { skillsPanel, type PanelCtx } from './panels.js';

type Send = (m: any) => void;
/** Window header with the NPC's portrait, name, title and a quote. */
export function npcHeader(npcType: string, name: string, quote: string): HTMLElement {
  const [body, hair] = NPC_COLORS[npcType] ?? ['#777', '#333'];
  const c = h('canvas', { class: 'npc-portrait', width: 120, height: 120 }) as HTMLCanvasElement;
  const x = c.getContext('2d')!; x.imageSmoothingEnabled = false;
  const g = x.createRadialGradient(60, 50, 8, 60, 60, 70); g.addColorStop(0, '#5a3a9a'); g.addColorStop(1, '#120c24');
  x.fillStyle = g; x.fillRect(0, 0, 120, 120);
  drawChibi(x, 60, 170, 4.2, Math.PI / 2 - 0.3, body, hair, '#ccc', 0, 0, '');
  return h('div', { class: 'npc-head' }, c, h('div', { class: 'npc-quote' }, h('b', null, name), h('p', null, `“${quote}”`)));
}

export const trainerState = { tab: 'tree' as 'tree' | 'skills' | 'reset' | 'info', path: '' as string };
export function trainerWindow(ctx: PanelCtx, inTown: boolean, rerender: () => void): HTMLElement {
  const th = getLang() === 'th', ch = ctx.ch, S = trainerState;
  if (!S.path) S.path = ch.cls;
  const pts = passivePointsFor(ch.level, ch.bonusPoints) - ch.passives.length;
  const tabs: Array<[typeof S.tab, string, string]> = [['tree', 'tree', th ? 'ต้นไม้พาสซีฟ' : 'Passive Tree'], ['skills', 'book', th ? 'สกิล' : 'Skills'], ['reset', 'awaken', th ? 'รีเซ็ต' : 'Reset'], ['info', 'scroll', th ? 'ข้อมูล' : 'Info']];
  const paths = h('div', { class: 'tr-paths' }, h('div', { class: 'sec-title' }, th ? 'เลือกสายพาสซีฟ' : 'Passive paths'),
    h('button', { class: 'tr-path' + (S.path === 'central' ? ' on' : ''), onclick: () => { S.path = 'central'; rerender(); } }, tileIcon('star', '#ffd36a', 'legendary', 34), th ? 'สายหลัก (ทั่วไป)' : 'Astral Core (shared)'),
    ...CLASS_IDS.map((c) => h('button', { class: 'tr-path' + (S.path === c ? ' on' : '') + (c === ch.cls ? ' mine' : ''), onclick: () => { S.path = c; rerender(); } }, tileIcon('emblem', CLASSES[c].colors.accent, c === ch.cls ? 'epic' : 'common', 34), CLASSES[c].name)),
    h('div', { class: 'tr-points' }, h('div', { class: 'sec-title' }, th ? 'แต้มพาสซีฟ' : 'Passive points'), h('div', { class: 'tr-pts' }, uiIcon('star', 30, '#ffd36a'), h('b', null, String(pts))), h('small', { class: 'muted' }, `${th ? 'เลเวล' : 'Level'} ${ch.level} · ${th ? 'ใช้ไป' : 'used'} ${ch.passives.length}`)));
  let body: HTMLElement;
  if (S.tab === 'tree') body = h('div', { class: 'tr-main' }, paths, passiveTreePanel(ch, ctx.send, inTown, S.path));
  else if (S.tab === 'skills') body = skillsPanel(ctx);
  else if (S.tab === 'reset') {
    const full = respecCost(ch), one = refundCost(ch);
    body = h('div', { class: 'tr-reset' },
      h('div', { class: 'rs-card' }, uiIcon('dodge', 48, '#5aa8ff'), h('b', null, th ? 'รีเซ็ตบางส่วน' : 'Partial reset'), h('p', { class: 'muted' }, th ? 'คืนทีละโหนดได้ในต้นไม้พาสซีฟ (คลิกขวาที่โหนด) ถ้าไม่ทำให้โหนดอื่นหลุดการเชื่อมต่อ' : 'Refund single nodes in the passive tree (right-click a node) as long as nothing else gets disconnected.'), h('span', null, uiIcon('coin', 18), ` ${one ? one.toLocaleString() + 'g' : (th ? 'ฟรี' : 'free')} / ${th ? 'โหนด' : 'node'}`), h('button', { class: 'btn', onclick: () => { S.tab = 'tree'; rerender(); } }, th ? 'ไปที่ต้นไม้' : 'Open the tree')),
      h('div', { class: 'rs-card' }, uiIcon('awaken', 48, '#b36cff'), h('b', null, th ? 'รีเซ็ตทั้งหมด' : 'Full reset'), h('p', { class: 'muted' }, th ? 'คืนแต้มพาสซีฟทั้งหมด (ทำได้ในเมือง)' : 'Refund every passive point (in town).'), h('span', null, uiIcon('coin', 18), ` ${full ? full.toLocaleString() + 'g' : (th ? 'ฟรีถึงเลเวล 15' : 'free until level 15')}`, th ? ' หรือ ' : ' or ', uiIcon('tree', 18), ` ${th ? 'โทเค็นรีเซ็ต' : 'respec token'} (${ch.respecTokens})`),
        h('button', { class: 'btn gold', disabled: !inTown, onclick: async () => { if (await confirmDialog(t('respec'), `${full}g${ch.respecTokens && full ? ` — ${th ? 'จะใช้โทเค็นรีเซ็ตแทน' : 'a respec token will be used instead'}` : ''}`, t('confirm'), t('cancel'))) ctx.send({ t: 'respec', token: ch.respecTokens > 0 && full > 0 }); } }, th ? 'รีเซ็ตทั้งหมด' : 'Reset all')));
  } else body = h('div', { class: 'tr-info' }, h('p', null, th ? 'แต่ละอาชีพมีต้นไม้ของตัวเอง เชื่อมกันผ่านแกนกลาง Astral Core ลงแต้มได้เฉพาะโหนดที่ต่อกับจุดเริ่มของอาชีพคุณ' : 'Every class has its own tree; all of them connect through the Astral Core. You can only take nodes connected to your class start.'),
    h('ul', null, h('li', null, th ? 'แต้มได้จากเลเวล เควสต์ และ Mastery ทุก 5 เลเวล' : 'Points come from levels, quests and every 5 mastery levels.'), h('li', null, th ? 'Keystone เปลี่ยนกติกาการเล่นของคุณอย่างมาก' : 'Keystones change how your character plays.'), h('li', null, th ? 'บันทึกบิลด์และแชร์โค้ดได้ในหน้าต้นไม้' : 'Save builds and share build codes from the tree.')), void PASSIVE_MAP);
  return h('div', { class: 'npcwin' }, npcHeader('npc_trainer', 'Master Ilrin', th ? 'เส้นทางของเจ้าจะไม่มีวันตายตัว จงปรับเปลี่ยนตัวเองได้เสมอ แต่การเริ่มต้นใหม่ทุกครั้ง… ย่อมมีราคาที่ต้องจ่าย' : 'Your path is never fixed. Rebuild yourself as often as you need — but every new beginning has a price.'),
    h('div', { class: 'win-tabs' }, ...tabs.map(([id, ic, l]) => h('button', { class: 'wt icon' + (S.tab === id ? ' on' : ''), onclick: () => { S.tab = id; rerender(); } }, uiIcon(ic, 22), l))), body);
}

const FURN_ICON: Record<string, [string, string, string]> = { rug: ['rug', '#7a3a5a', 'decor'], lantern: ['lantern', '#ffe08a', 'decor'], plant: ['plant', '#ff9ad5', 'decor'], table: ['table', '', 'furniture'], bed: ['bed', '#3a5a9a', 'furniture'], bookshelf: ['bookshelf', '', 'storage'], chest: ['chestbox', '', 'utility'], alchemy_table: ['potion', '#4a8a7a', 'utility'], anvil: ['anvil', '', 'utility'], dummy: ['eye', '#c8a46a', 'utility'], trophy_veyra: ['crown', '', 'special'], trophy_nyx: ['throne', '#c58cff', 'special'], trophy_carp: ['fish', '#ffd23a', 'special'] };
const FURN_DESC: Record<string, [string, string]> = { rug: ['พรมทอลายสุริยคราส ปูพื้นให้ห้องดูอบอุ่น', 'Woven eclipse-pattern rug that warms up any floor.'], lantern: ['โคมแสงจันทร์ ส่องสว่างนุ่มๆ ยามค่ำ', 'Moonglass lantern with a soft night glow.'], plant: ['กระถางดอกมูนพีทัล หอมอ่อนๆ', 'A potted moonpetal with a faint scent.'], table: ['โต๊ะไม้โอ๊กแข็งแรง', 'A sturdy oak table.'], bed: ['เตียงทอด้วยด้ายดาว', 'A bed stitched with starthread.'], bookshelf: ['ชั้นหนังสือเก็บโคเด็กซ์', 'Shelf for your codex volumes.'], chest: ['หีบเชื่อมต่อคลัง Astral Vault', 'Opens your Astral Vault from home.'], alchemy_table: ['ปรุงยาและทำอาหารได้ในบ้าน', 'Brew potions and cook at home.'], anvil: ['ตีอาวุธและแยกชิ้นส่วนในบ้าน', 'Forge and salvage at home.'], dummy: ['หุ่นทดสอบดาเมจ', 'Training dummy for damage tests.'], trophy_veyra: ['ถ้วยรางวัลผู้พิชิต Veyra', 'Trophy for defeating Veyra.'], trophy_nyx: ['บัลลังก์ที่ระลึกการโค่น Nyx', 'Memorial throne for felling Nyx.'], trophy_carp: ['ปลาคาร์ปทองในตำนาน', 'The legendary golden carp.'] };
export const carpState = { cat: 'all', sel: 'rug' };
export function carpenterWindow(ch: CharacterData, acc: AccountProgress, send: Send, rerender: () => void): HTMLElement {
  const th = getLang() === 'th', S = carpState, owned = acc.house?.owned ?? {};
  const cats: Array<[string, string, string]> = [['all', 'grid', th ? 'ทั้งหมด' : 'All'], ['decor', 'plant', th ? 'ตกแต่ง' : 'Decor'], ['furniture', 'table', th ? 'เฟอร์นิเจอร์' : 'Furniture'], ['storage', 'bookshelf', th ? 'ตู้ / ชั้นวาง' : 'Storage'], ['utility', 'anvil', th ? 'ของใช้งาน' : 'Functional'], ['special', 'crown', th ? 'ตกแต่งพิเศษ' : 'Special']];
  const list = Object.values(FURNITURE).filter((f) => S.cat === 'all' || FURN_ICON[f.id]?.[2] === S.cat);
  const sel = FURNITURE[S.sel] ?? list[0];
  const preview = h('canvas', { class: 'furn-preview', width: 220, height: 160 }) as HTMLCanvasElement;
  if (sel) { const x = preview.getContext('2d')!; x.fillStyle = '#2a2040'; x.fillRect(0, 0, 220, 160); for (let i = 0; i < 220; i += 20) for (let j = 0; j < 160; j += 20) { x.fillStyle = (i + j) % 40 ? '#33284c' : '#2c2244'; x.fillRect(i, j, 20, 20); } x.save(); x.translate(110, 110); const k = Math.min(1.6, 120 / (Math.max(sel.w, sel.h) * 32)); x.scale(k, k); try { drawFurniture(x, sel.id, sel.w, sel.h, 0); } catch { /* preview only */ } x.restore(); }
  return h('div', { class: 'npcwin' }, npcHeader('npc_carpenter', 'Carpenter Odo', th ? 'เฟอร์นิเจอร์สำหรับบ้านของเจ้าที่ Hearthstone Lane — หีบเปิดคลังได้ โต๊ะเล่นแร่ใช้ปรุงยาและทำอาหาร ทั่งใช้ตีอาวุธ หุ่นใช้ทดสอบดาเมจ' : 'Furniture for your Hearth on Hearthstone Lane. Chest = vault access, alchemy table = brewing & cooking, anvil = forging, dummy = damage testing.'),
    h('div', { class: 'wallet' }, h('span', null, uiIcon('coin', 22), ` ${th ? 'ทอง' : 'Gold'}: ${ch.gold.toLocaleString()}`)),
    h('div', { class: 'carp' },
      h('div', { class: 'carp-left' }, ...cats.map(([id, ic, l]) => h('button', { class: 'tr-path' + (S.cat === id ? ' on' : ''), onclick: () => { S.cat = id; rerender(); } }, uiIcon(ic, 24), `${l} (${Object.values(FURNITURE).filter((f) => id === 'all' || FURN_ICON[f.id]?.[2] === id).length})`)),
        sel ? h('div', { class: 'carp-prev' }, preview, h('b', null, sel.name), h('small', { class: 'muted' }, `${sel.w}×${sel.h} ${th ? '(พื้นที่)' : 'tiles'}`)) : null),
      h('div', { class: 'carp-list' }, ...list.map((f) => {
        const [g, c] = FURN_ICON[f.id] ?? ['chestbox', ''];
        const locked = f.req && !acc.achievements?.includes(f.req);
        const lack = Object.entries(f.cost.mats ?? {}).some(([m, n]) => (ch.mats[m] ?? 0) < n) || ch.gold < f.cost.gold;
        return h('div', { class: 'carp-row' + (S.sel === f.id ? ' on' : ''), onclick: () => { S.sel = f.id; rerender(); } }, tileIcon(g, c || '#c8a46a', f.utility ? 'epic' : f.req ? 'legendary' : 'rare', 48),
          h('div', { class: 'grow' }, h('b', null, f.name, f.utility ? ' ★' : ''), h('small', null, FURN_DESC[f.id]?.[th ? 0 : 1] ?? ''), h('small', { class: 'muted' }, owned[f.id] ? `${th ? 'มีแล้ว' : 'Owned'} ${owned[f.id]}` : f.utility ? (th ? 'ใช้งานได้ในบ้าน' : 'Functional in your Hearth') : (th ? 'ของตกแต่ง' : 'Decoration'))),
          h('span', { class: 'carp-cost' }, `${f.w}×${f.h} · ${f.cost.gold}g`, ...Object.entries(f.cost.mats ?? {}).map(([m, n]) => h('span', { class: 'mc' }, ' +', matIcon(m, 18), `${n}`))),
          h('button', { class: 'btn gold', disabled: !!locked || lack, title: locked ? (th ? 'ปลดล็อกด้วยความสำเร็จ' : 'Unlocked by an achievement') : lack ? (th ? 'ทองหรือวัตถุดิบไม่พอ' : 'Not enough gold or materials') : '', onclick: (e: Event) => { e.stopPropagation(); send({ t: 'house_buy', id: f.id }); } }, locked ? `🔒 ${th ? 'ล็อก' : 'Locked'}` : `🛒 ${th ? 'ซื้อ' : 'Buy'}`));
      }))),
    h('p', { class: 'hint' }, th ? `วัตถุดิบ: ${Object.entries(MATERIALS).filter(([k]) => ch.mats[k]).map(([k, m]) => `${m.name} ${ch.mats[k]}`).join(' · ') || '—'}` : `Materials: ${Object.entries(MATERIALS).filter(([k]) => ch.mats[k]).map(([k, m]) => `${m.name} ${ch.mats[k]}`).join(' · ') || '—'}`));
}
