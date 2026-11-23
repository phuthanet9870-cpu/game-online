// NPC service windows: a framed portrait of the NPC with their line, then the service. Trainer (passive paths,
// skills, resets, info) and Carpenter (furniture catalogue) follow the reference layouts.
import { PVP, PVP_SIZES, PVP_TIERS, pvpTier, BAG_MAX_EXTRA, BAG_STEP, MOUNTS, PETS, POTION, ZONES, bagExpandCost, waypointCost, CLASSES, CLASS_IDS, FURNITURE, MATERIALS, PASSIVE_MAP, passivePointsFor, respecCost, refundCost, type AccountProgress, type CharacterData } from '@astra/shared';
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

// ── Small single-purpose NPC windows (each service has its own NPC) ──
export function apothecaryWindow(ch: CharacterData, send: Send): HTMLElement {
  const th = getLang() === 'th';
  return h('div', { class: 'npcwin' }, npcHeader('npc_apothecary', 'Apothecary Fenna', th ? 'ยาฟื้นพลังสดใหม่ทุกวัน เติมเข็มขัดยาให้เต็มก่อนออกเดินทางนะ' : 'Fresh restoratives every day. Fill your belt before you head out.'),
    h('div', { class: 'svc-card' }, uiIcon('potion', 56, '#ff4a5a'), h('div', { class: 'grow' }, h('b', null, th ? 'ยาฟื้นพลัง' : 'Healing potion'), h('small', { class: 'muted' }, `${th ? 'มีอยู่' : 'Carried'} ${ch.potions}/${POTION.maxCharges} · ${POTION.buyPrice}g`)),
      h('button', { class: 'btn gold', disabled: ch.potions >= POTION.maxCharges || ch.gold < POTION.buyPrice, onclick: () => send({ t: 'buy_potion' }) }, th ? 'ซื้อ 1 ขวด' : 'Buy 1'),
      h('button', { class: 'btn', disabled: ch.potions >= POTION.maxCharges, onclick: () => { for (let k = ch.potions; k < POTION.maxCharges; k++) send({ t: 'buy_potion' }); } }, th ? 'เติมให้เต็ม' : 'Fill belt')));
}
export function stableWindow(acc: AccountProgress, send: Send): HTMLElement {
  const th = getLang() === 'th';
  return h('div', { class: 'npcwin' }, npcHeader('npc_stable', 'Stablemaster Rook', th ? 'สัตว์เลี้ยงและพาหนะทุกตัวที่นี่ได้รับการดูแลอย่างดี เลือกเพื่อนร่วมทางได้เลย' : 'Every companion and mount here is well cared for. Pick a travelling friend.'),
    h('div', { class: 'sec-title' }, uiIcon('mount', 20), th ? 'สัตว์เลี้ยง' : 'Companions'),
    ...Object.entries(PETS).map(([id, p]) => h('div', { class: 'svc-card' }, tileIcon('mount', p.color, 'rare', 48), h('div', { class: 'grow' }, h('b', null, p.name), h('small', { class: 'muted' }, p.desc)),
      acc.pets?.includes(id) ? h('button', { class: 'btn', onclick: () => send({ t: 'pet_set', id: acc.pet === id ? null : id }) }, acc.pet === id ? (th ? 'เก็บ' : 'Dismiss') : (th ? 'เรียก' : 'Summon'))
        : h('button', { class: 'btn gold', onclick: () => send({ t: 'pet_buy', id }) }, `${th ? 'รับเลี้ยง' : 'Adopt'} ${p.cost.gold}g${p.cost.mats ? ' + ' + Object.entries(p.cost.mats).map(([m, n]) => `${n} ${MATERIALS[m]?.name ?? m}`).join(', ') : ''}`))),
    h('div', { class: 'sec-title' }, uiIcon('mount', 20, '#ffd36a'), th ? 'พาหนะ' : 'Mounts'),
    ...Object.values(MOUNTS).map((m) => h('div', { class: 'svc-card' }, tileIcon('mount', m.color, m.rarity === 'SSR' ? 'legendary' : m.rarity === 'SR' ? 'epic' : 'rare', 48), h('div', { class: 'grow' }, h('b', null, `${m.name} (${m.rarity})`), h('small', { class: 'muted' }, `+${Math.round(m.speed * 100)}% ${th ? 'ความเร็ว' : 'speed'}`)),
      h('small', { class: 'muted' }, th ? 'ได้จากร้านค้า/ขอพร · ขี่ด้วยปุ่มบนแถบ' : 'From the Shop / Wish · ride from the hotbar'))));
}
export function tailorWindow(ch: CharacterData, send: Send): HTMLElement {
  const th = getLang() === 'th', extra = ch.bagSlots ?? 0, c = bagExpandCost(extra);
  return h('div', { class: 'npcwin' }, npcHeader('npc_tailor', 'Tailor Pim', th ? 'กระเป๋าเต็มอีกแล้วเหรอ? เดี๋ยวข้าเย็บช่องเพิ่มให้' : 'Bag full again? I will stitch you some more room.'),
    h('div', { class: 'svc-card' }, uiIcon('bag', 56), h('div', { class: 'grow' }, h('b', null, `${th ? 'ช่องกระเป๋า' : 'Bag slots'} ${ch.inventory.length}`), h('small', { class: 'muted' }, `${th ? 'ขยายได้อีก' : 'Can still add'} ${BAG_MAX_EXTRA - extra}`)),
      extra < BAG_MAX_EXTRA ? h('button', { class: 'btn gold', disabled: ch.gold < c.gold || ch.dust < c.dust, onclick: () => send({ t: 'bag_expand' }) }, `+${BAG_STEP} · ${c.gold}g ${c.dust}✦`) : h('b', null, th ? 'สูงสุดแล้ว' : 'Maxed')));
}
export function waymasterWindow(ch: CharacterData, send: Send): HTMLElement {
  const th = getLang() === 'th';
  return h('div', { class: 'npcwin' }, npcHeader('npc_waymaster', 'Waymaster Juno', th ? 'ข้าส่งเจ้าไปถึงประตูทิศตะวันตกของทุกเขต ขอแค่เลเวลพอและจ่ายค่าเดินทาง' : 'I can send you to the west gate of any zone — if you are strong enough and pay the fare.'),
    h('div', { class: 'way-list' }, ...ZONES.map((z, i) => {
      const cost = waypointCost(z.id), ok = i === 0 || ch.level >= z.levelMin - 5;
      return h('div', { class: 'svc-card' + (ok ? '' : ' locked') }, h('b', { class: 'way-n' }, String(i + 1)), h('div', { class: 'grow' }, h('b', null, th ? z.th : z.name), h('small', { class: 'muted' }, `Lv ${z.levelMin}-${z.levelMax} · ${z.familyName}`)),
        h('button', { class: 'btn gold', disabled: !ok || ch.gold < cost, title: ok ? '' : (th ? `ต้องเลเวล ${z.levelMin - 5}+` : `Requires level ${z.levelMin - 5}+`), onclick: () => send({ t: 'waypoint', zone: z.id }) }, ok ? (cost ? `${cost}g` : (th ? 'ฟรี' : 'Free')) : `🔒 Lv ${z.levelMin - 5}`));
    })));
}

// ── Arena Master Brann: ranked arena ──
export function arenaWindow(ch: CharacterData, data: any, send: Send): HTMLElement {
  const th = getLang() === 'th', r = ch.pvp ?? { rp: 1000, wins: 0, losses: 0, best: 1000, streak: 0 }, tier = pvpTier(r.rp);
  const next = PVP_TIERS.find((x) => x.min > r.rp);
  return h('div', { class: 'npcwin' }, npcHeader('npc_arena', 'Arena Master Brann', th ? 'สนามประลองไม่สนใจว่าเจ้ามาจากไหน มีแค่ชนะหรือแพ้ ชนะ 3 ใน 5 ยกเพื่อไต่อันดับ' : 'The arena does not care where you came from. Win 3 of 5 rounds and climb.'),
    h('div', { class: 'pvp-top' },
      h('div', { class: 'pvp-rank', style: `--tc:${tier.color}` }, uiIcon('crossed', 54, tier.color), h('b', null, th ? tier.th : tier.name), h('span', null, `${r.rp} RP`), next ? h('small', { class: 'muted' }, `${th ? 'อีก' : 'Next tier in'} ${next.min - r.rp} RP`) : null),
      h('div', { class: 'pvp-stats' }, h('div', null, h('b', null, String(r.wins)), h('small', null, th ? 'ชนะ' : 'Wins')), h('div', null, h('b', null, String(r.losses)), h('small', null, th ? 'แพ้' : 'Losses')),
        h('div', null, h('b', null, `${r.wins + r.losses ? Math.round((r.wins / (r.wins + r.losses)) * 100) : 0}%`), h('small', null, th ? 'อัตราชนะ' : 'Win rate')), h('div', null, h('b', null, String(r.best)), h('small', null, th ? 'สูงสุด' : 'Best')))),
    data?.queued ? h('div', { class: 'svc-card' }, uiIcon('search', 36), h('div', { class: 'grow' }, h('b', null, `${th ? 'กำลังหาคู่' : 'Searching'} ${data.queued.size}v${data.queued.size}…`), h('small', { class: 'muted' }, th ? `รอ ${data.queued.wait} วินาที · ถ้าคนไม่ครบ ระบบจะเติม AI แชมเปี้ยนให้` : `Waited ${data.queued.wait}s · missing players are filled with AI champions`)),
      h('button', { class: 'btn', onclick: () => send({ t: 'pvp_leave' }) }, th ? 'ยกเลิก' : 'Cancel'))
      : h('div', { class: 'pvp-modes' }, ...PVP_SIZES.map((n) => h('button', { class: 'pvp-mode', onclick: () => send({ t: 'pvp_queue', size: n }) }, h('b', null, `${n}v${n}`), h('small', null, `${data?.sizes?.find((x: any) => x.size === n)?.waiting ?? 0} ${th ? 'คนรอ' : 'waiting'}`)))),
    h('p', { class: 'hint' }, th ? `กติกา: ชนะ ${PVP.roundsToWin} ยกก่อนชนะ · ยกละ ${PVP.roundTime} วินาที · ดาเมจระหว่างผู้เล่นถูกปรับให้สมดุล · ตายในอารีน่าไม่นับเป็นการตายของ Hardcore และไม่เสียของ · ออกกลางคันนับว่าแพ้` : `Rules: first to ${PVP.roundsToWin} rounds · ${PVP.roundTime}s per round · player damage is normalised · arena deaths never count as Hardcore deaths and drop nothing · leaving counts as a loss`),
    h('div', { class: 'sec-title' }, uiIcon('trophy', 20), th ? 'อันดับอารีน่า' : 'Arena leaderboard'),
    h('table', { class: 'gw-rank' }, h('tbody', null, ...(data?.board ?? []).map((x: any, i: number) => h('tr', { class: x.name === ch.name ? 'me' : '' }, h('td', null, String(i + 1)), h('td', null, x.name), h('td', null, CLASSES[x.cls as keyof typeof CLASSES]?.name ?? x.cls), h('td', null, `${x.value} RP`), h('td', null, th ? pvpTier(x.value).th : pvpTier(x.value).name))))),
    (data?.board ?? []).length ? null : h('p', { class: 'muted' }, th ? 'ยังไม่มีใครลงแข่ง' : 'No ranked matches yet.'));
}
