/**
 * In-game HUD and panels. Every button here sends a real request to the
 * server; nothing is simulated client-side.
 */
import { EQUIP_SLOTS, RARITY_INFO, getItem, isEquipment, itemStats, type EquipSlot, type ItemInstance } from '../../shared/config/items.ts';
import { MONSTERS } from '../../shared/config/monsters.ts';
import { AUTO_CONFIG, DEFAULT_AUTO, sanitizeAuto, type AutoSettings } from '../../shared/config/auto.ts';

const AUTO_KEY = 'tpew.auto.v1';
function loadAutoCfg(): AutoSettings { try { const r = localStorage.getItem(AUTO_KEY); if (r) return sanitizeAuto(JSON.parse(r)) ?? structuredClone(DEFAULT_AUTO); } catch { /* ignore */ } return structuredClone(DEFAULT_AUTO); }
function saveAutoCfg(c: AutoSettings) { try { localStorage.setItem(AUTO_KEY, JSON.stringify(c)); } catch { /* ignore */ } }
import { ITEMS } from '../../shared/config/items.ts';
import { ZONES } from '../../shared/config/zones.ts';
import { PERCENT_STATS, STAT_KEYS, STAT_LABELS, type StatKey } from '../../shared/config/stats.ts';
import { WEAPON_DISPLAY, WEAPON_TYPES } from '../../shared/config/weapons.ts';
import { POWERS, POWER_CONFIG, findPowerSkill, powerAllowsWeapon, unlockedAbilities, type PowerDef } from '../../shared/config/powers.ts';
import type { SkillDef } from '../../shared/config/skills.ts';
import type { ServerMessage } from '../../shared/protocol.ts';
import type { GameClient } from '../game.ts';
import type { Renderer } from '../render/renderer.ts';
import { itemIcon, monsterSprite } from '../render/sprites.ts';
import { clear, confirmBox, h, spriteImg } from './dom.ts';

const SLOT_TH: Record<EquipSlot, string> = { weapon: 'อาวุธ', armor: 'เกราะ', helmet: 'หมวก', gloves: 'ถุงมือ', boots: 'รองเท้า', accessory1: 'เครื่องประดับ 1', accessory2: 'เครื่องประดับ 2' };

const fmtStat = (k: StatKey, v: number) => (PERCENT_STATS.has(k) ? `${(v * 100).toFixed(1)}%` : k === 'atkSpd' ? v.toFixed(2) : k === 'moveSpeed' ? v.toFixed(2) : String(Math.round(v)));

export class Hud {
  root: HTMLElement;
  private bars: Record<'hp' | 'en' | 'st' | 'exp', { fill: HTMLElement; text: HTMLElement }>;
  private nameEl: HTMLElement;
  private zoneEl: HTMLElement;
  private netEl: HTMLElement;
  private skillEls = new Map<string, { cd: HTMLElement; slot: HTMLElement }>();
  private skillBar: HTMLElement;
  private buffs: HTMLElement;
  private chatLog: HTMLElement;
  chatInput: HTMLInputElement;
  private notices: HTMLElement;
  private minimap: HTMLCanvasElement;
  private minimapImg: HTMLCanvasElement | null = null;
  private panels: Record<'inv' | 'char' | 'shop' | 'dialog' | 'help' | 'gm' | 'auto' | 'power', HTMLElement>;
  private powerNpc: { npc: number; role: 'power' | 'ritual' } | null = null;
  private powerSel: string | null = null;
  private lastPowerKey = '';
  private autoCfg: AutoSettings = loadAutoCfg();
  private autoBtn!: HTMLElement;
  private death: HTMLElement;
  private shop: { npc: number; items: { itemId: string; price: number }[] } | null = null;
  private selectedUid: string | null = null;
  private lastInvKey = '';
  private lastCharKey = '';
  private lastWeapon = '';
  private lastAuto = false;
  gm: Extract<ServerMessage, { t: 'gm' }> | null = null;
  private gmBtn: HTMLElement;

  constructor(parent: HTMLElement, private g: GameClient, private r: Renderer, private onLogout: () => void, private onSkill: (id: string) => void = () => {}) {
    const bar = (cls: string) => {
      const fill = h('div', { class: 'fill' });
      const text = h('div', { class: 'btext' });
      return { el: h('div', { class: `bar ${cls}` }, fill, text), fill, text };
    };
    const hp = bar('hp'), en = bar('en'), st = bar('st'), exp = bar('exp');
    this.bars = { hp, en, st, exp };
    this.nameEl = h('div', { class: 'pname' });
    this.zoneEl = h('div', { class: 'zone' });
    this.netEl = h('div', { class: 'net' });
    this.skillBar = h('div', { class: 'skills' });
    this.buffs = h('div', { class: 'buffs' });
    this.chatLog = h('div', { class: 'chatlog' });
    this.chatInput = h('input', { class: 'chatin', maxlength: 200, placeholder: 'Enter เพื่อแชต · /gm ...' });
    this.notices = h('div', { class: 'notices' });
    this.minimap = h('canvas', { class: 'minimap', width: 150, height: 150 });
    this.death = h('div', { class: 'death hidden' }, h('div', { class: 'death-t' }, 'คุณถูกสังหาร'),
      h('p', {}, 'The Power และไอเทมจะไม่สูญหายจากการตาย'),
      h('button', { class: 'btn primary', id: 'respawn', onclick: () => this.g.send({ t: 'respawn' }) }, 'ฟื้นคืนชีพที่ Aether Capital'));
    this.gmBtn = h('button', { class: 'btn small gm-btn hidden', onclick: () => this.toggle('gm') }, 'GM');
    this.panels = {
      inv: h('div', { class: 'panel win inv hidden' }),
      char: h('div', { class: 'panel win char hidden' }),
      shop: h('div', { class: 'panel win shop hidden' }),
      dialog: h('div', { class: 'panel win dialog hidden' }),
      help: h('div', { class: 'panel win help hidden' }),
      gm: h('div', { class: 'panel win gm hidden' }),
      auto: h('div', { class: 'panel win auto hidden' }),
      power: h('div', { class: 'panel win power hidden' }),
    };
    this.autoBtn = h('button', { class: 'btn small auto-btn', onclick: () => this.toggle('auto') }, 'ออโต้ [O]');
    this.chatInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const t = this.chatInput.value.trim();
        if (t) this.g.send({ t: 'chat', text: t });
        this.chatInput.value = '';
        this.chatInput.blur();
      } else if (e.key === 'Escape') this.chatInput.blur();
    });
    this.root = h('div', { class: 'hud' },
      h('div', { class: 'pframe' }, this.nameEl, hp.el, en.el, st.el, this.buffs),
      h('div', { class: 'tr' }, this.zoneEl, this.minimap,
        h('div', { class: 'menu' },
          h('button', { class: 'btn small', onclick: () => this.toggle('inv') }, 'กระเป๋า [I]'),
          h('button', { class: 'btn small', onclick: () => this.toggle('char') }, 'ตัวละคร [C]'),
          h('button', { class: 'btn small', onclick: () => { this.powerNpc = null; this.toggle('power'); } }, 'The Power [P]'),
          this.autoBtn,
          h('button', { class: 'btn small', onclick: () => this.toggle('help') }, 'ปุ่ม [H]'),
          this.gmBtn,
          h('button', { class: 'btn small', onclick: () => this.onLogout() }, 'ออก'))),
      h('div', { class: 'bottom' }, this.skillBar, exp.el),
      h('div', { class: 'chat' }, this.chatLog, this.chatInput),
      this.netEl, this.notices, this.death,
      ...Object.values(this.panels));
    parent.append(this.root);
    this.buildHelp();
  }

  // ------------------------------------------------------------ events from server
  handle(m: ServerMessage) {
    switch (m.t) {
      case 'chat': this.addChat(m.ch === 'system' ? `[${m.from}] ${m.text}` : `${m.from}: ${m.text}`, m.ch); break;
      case 'notice': this.notice(m.text, m.kind); break;
      case 'error': this.notice(m.msg, 'warn'); break;
      case 'shop': this.shop = { npc: m.npc, items: m.items }; this.renderShop(); this.show('shop'); this.show('inv'); break;
      case 'dialog': this.renderDialog(m.name, m.lines); this.show('dialog'); break;
      case 'gm': this.gm = m; this.gmBtn.classList.toggle('hidden', !m.on); if (!m.on) this.hide('gm'); else this.renderGm(); break;
      case 'auto':
        if (!m.on && m.reason) this.notice(`ออโต้หยุด: ${m.reason} (ฆ่าไป ${m.kills} ตัว)`, 'warn');
        if (m.on) this.notice('เริ่มออโต้', 'info');
        if (this.isOpen('auto')) setTimeout(() => this.renderAuto(), 50);
        break;
      case 'power_npc': this.powerNpc = { npc: m.npc, role: m.role }; this.show('power'); break;
      case 'powers': if (this.isOpen('power')) this.renderPower(true); this.lastWeapon = '#'; break;
      case 'enter_zone': this.minimapImg = null; if (this.isOpen('auto')) setTimeout(() => this.renderAuto(), 50); this.hide('shop'); this.hide('dialog'); this.shop = null; break;
      default: break;
    }
  }

  addChat(text: string, ch: string) {
    const line = h('div', { class: `cl ${ch}` }, text);
    this.chatLog.append(line);
    while (this.chatLog.childElementCount > 80) this.chatLog.firstElementChild?.remove();
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
  }

  notice(text: string, kind: string) {
    const ITEM_RE = /^\+(\d+) ([a-z_]+)$/;
    const mm = text.match(ITEM_RE);
    if (mm) { const d = getItem(mm[2]); if (d) text = `+${mm[1]} ${d.nameTh}`; }
    const n = h('div', { class: `notice ${kind}` }, text);
    this.notices.append(n);
    setTimeout(() => n.classList.add('fade'), 2200);
    setTimeout(() => n.remove(), 3000);
    while (this.notices.childElementCount > 6) this.notices.firstElementChild?.remove();
  }

  // ------------------------------------------------------------ panels
  isOpen(k: keyof Hud['panels']) { return !this.panels[k].classList.contains('hidden'); }
  show(k: keyof Hud['panels']) { this.panels[k].classList.remove('hidden'); if (k === 'inv') this.renderInv(true); if (k === 'char') this.renderChar(true); if (k === 'gm') this.renderGm(); if (k === 'auto') this.renderAuto(); if (k === 'power') this.renderPower(true); }
  hide(k: keyof Hud['panels']) { this.panels[k].classList.add('hidden'); if (k === 'shop') this.shop = null; if (k === 'power') this.powerNpc = null; }
  toggle(k: keyof Hud['panels']) { if (this.isOpen(k)) this.hide(k); else this.show(k); }
  closeAll() { for (const k of Object.keys(this.panels) as (keyof Hud['panels'])[]) this.hide(k); }

  private header(title: string, k: keyof Hud['panels']) {
    return h('div', { class: 'whead' }, h('span', {}, title), h('button', { class: 'x', onclick: () => this.hide(k) }, '×'));
  }

  private buildHelp() {
    const p = this.panels.help;
    const rows: [string, string][] = [
      ['คลิกพื้น', 'เดินไปจุดนั้น (กดค้าง = เดินตามเมาส์)'], ['คลิกมอนสเตอร์', 'เดินเข้าระยะแล้วโจมตีอัตโนมัติ (คอมโบ 3 จังหวะ)'],
      ['คลิก NPC / ไอเทม / สมุนไพร / แร่', 'เดินไปคุย / เก็บ'], ['คลิกปุ่มสกิลด้านล่าง', 'ใช้สกิล (เล็งเป้าที่เลือก หรือทิศเมาส์)'],
      ['W A S D', 'เดินด้วยคีย์บอร์ด (ยกเลิกคำสั่งคลิก)'], ['O', 'ออโต้ฟาร์ม'], ['Q E R T G', 'สกิล The Power 5 ช่อง'], ['X', 'Ultimate'], ['P', 'หน้าต่าง The Power'], ['คลิกขวา', 'โจมตีหนักไปทางเมาส์ (ใช้ Stamina)'],
      ['Space', 'หลบ (มี i-frame)'], ['Shift (ค้าง)', 'ป้องกัน'], ['1 2 3', 'สกิลอาวุธ'], ['4 / 5', 'ยา HP / Energy'],
      ['F', 'เก็บของ / คุยกับ NPC / เก็บทรัพยากร'], ['I / C', 'กระเป๋า / ตัวละคร'], ['Enter', 'แชต'], ['Esc', 'ปิดหน้าต่าง'],
    ];
    p.append(this.header('ปุ่มควบคุม', 'help'), h('table', {}, ...rows.map(([a, b]) => h('tr', {}, h('td', { class: 'key' }, a), h('td', {}, b)))),
      h('p', { class: 'dim' }, 'ทุกการกระทำถูกตรวจสอบบนเซิร์ฟเวอร์ ตัวเลขดาเมจ ไอเทม และทองมาจากเซิร์ฟเวอร์เท่านั้น'));
  }

  private itemTooltip(it: ItemInstance): HTMLElement {
    const def = getItem(it.defId);
    if (!def) return h('div', {}, it.defId);
    const r = RARITY_INFO[it.rarity];
    const lines: HTMLElement[] = [h('div', { class: 'tt-name', style: `color:${r.color}` }, `${def.nameTh}`), h('div', { class: 'dim' }, `${def.name} · ${r.nameTh}${isEquipment(def) ? ` · iLv ${it.ilvl}` : ''}`)];
    if (def.levelReq > 1) lines.push(h('div', { class: (this.g.char?.level ?? 1) >= def.levelReq ? '' : 'bad' }, `ต้องการเลเวล ${def.levelReq}`));
    if (def.weaponType) lines.push(h('div', {}, `ประเภท: ${WEAPON_DISPLAY[def.weaponType].nameTh}`));
    const st = itemStats(it);
    const eqSlot = def.category === 'accessory' ? 'accessory1' : (def.category as EquipSlot);
    const cur = isEquipment(def) && it.equip === null ? this.g.items.find((x) => x.equip === eqSlot) : undefined;
    const curSt = cur ? itemStats(cur) : {};
    for (const [k, v] of Object.entries(st) as [StatKey, number][]) {
      const diff = cur ? v - (curSt[k] ?? 0) : 0;
      lines.push(h('div', { class: 'tt-stat' }, `+${fmtStat(k, v)} ${STAT_LABELS[k]}`, cur && Math.abs(diff) > 1e-6 ? h('span', { class: diff > 0 ? 'good' : 'bad' }, ` (${diff > 0 ? '+' : ''}${fmtStat(k, diff)})`) : null));
    }
    if (cur) for (const [k, v] of Object.entries(curSt) as [StatKey, number][]) if (!(k in st)) lines.push(h('div', { class: 'bad' }, `-${fmtStat(k, v)} ${STAT_LABELS[k]}`));
    lines.push(h('div', { class: 'dim' }, def.description));
    if (it.bound) lines.push(h('div', { class: 'dim' }, 'ผูกกับตัวละคร (ซื้อขายไม่ได้)'));
    lines.push(h('div', { class: 'dim' }, `ราคาขาย ${def.sellPrice} gold`));
    return h('div', { class: 'tt' }, ...lines);
  }

  private slotEl(it: ItemInstance | undefined, onClick: () => void, label?: string) {
    const def = it ? getItem(it.defId) : undefined;
    const el = h('div', { class: `slot${it && it.uid === this.selectedUid ? ' sel' : ''}`, onclick: onClick, style: it ? `border-color:${RARITY_INFO[it.rarity].color}` : '' },
      def ? spriteImg(itemIcon(def.icon, def.color), 2) : label ? h('span', { class: 'slot-l' }, label) : null,
      it && it.qty > 1 ? h('span', { class: 'qty' }, String(it.qty)) : null);
    if (it) {
      el.addEventListener('mouseenter', () => { el.append(this.itemTooltip(it)); });
      el.addEventListener('mouseleave', () => { el.querySelector('.tt')?.remove(); });
    }
    return el;
  }

  renderInv(force = false) {
    const key = JSON.stringify([this.g.items, this.g.gold, this.selectedUid, !!this.shop]);
    if (!force && key === this.lastInvKey) return;
    this.lastInvKey = key;
    const p = this.panels.inv;
    clear(p);
    const bag = new Map<number, ItemInstance>();
    for (const it of this.g.items) if (it.slot !== null) bag.set(it.slot, it);
    const grid = h('div', { class: 'grid' });
    for (let i = 0; i < this.g.bagSlots; i++) {
      const it = bag.get(i);
      grid.append(this.slotEl(it, () => { this.selectedUid = it ? it.uid : null; this.renderInv(true); }));
    }
    const sel = this.selectedUid ? this.g.items.find((x) => x.uid === this.selectedUid && x.slot !== null) : undefined;
    const def = sel ? getItem(sel.defId) : undefined;
    const actions = h('div', { class: 'row actions' });
    if (sel && def) {
      if (isEquipment(def)) actions.append(h('button', { class: 'btn small', onclick: () => this.g.send({ t: 'equip', uid: sel.uid }) }, 'สวมใส่'));
      if (def.use) actions.append(h('button', { class: 'btn small', onclick: () => this.g.send({ t: 'use', uid: sel.uid }) }, 'ใช้'));
      if (this.shop) {
        const qty = h('input', { type: 'number', min: 1, max: sel.qty, value: sel.qty, class: 'qtyin' });
        actions.append(qty, h('button', { class: 'btn small', onclick: () => this.g.send({ t: 'shop_sell', npc: this.shop!.npc, uid: sel.uid, qty: Math.max(1, Math.min(sel.qty, Number(qty.value) || 1)) }) }, `ขาย (${def.sellPrice}g/ชิ้น)`));
      }
      actions.append(h('button', { class: 'btn small danger', onclick: () => { void confirmBox(`ทิ้ง ${def.nameTh} ×${sel.qty}? ไม่สามารถกู้คืนได้`, 'ทิ้ง').then((ok) => ok && this.g.send({ t: 'discard', uid: sel.uid, qty: sel.qty })); } }, 'ทิ้ง'));
    } else actions.append(h('span', { class: 'dim' }, 'คลิกไอเทมเพื่อเลือก · ชี้เพื่อดูรายละเอียด'));
    p.append(this.header('กระเป๋า', 'inv'), grid, actions, h('div', { class: 'gold' }, `💰 ${this.g.gold.toLocaleString()} Gold · ${bag.size}/${this.g.bagSlots}`));
  }

  renderChar(force = false) {
    const c = this.g.char;
    if (!c) return;
    const key = JSON.stringify([c, this.g.items.filter((i) => i.equip)]);
    if (!force && key === this.lastCharKey) return;
    this.lastCharKey = key;
    const p = this.panels.char;
    clear(p);
    const eq = h('div', { class: 'equip' });
    for (const s of EQUIP_SLOTS) {
      const it = this.g.items.find((x) => x.equip === s);
      eq.append(h('div', { class: 'eqrow' }, this.slotEl(it, () => { if (it) this.g.send({ t: 'unequip', slot: s }); }, SLOT_TH[s].slice(0, 4)), h('span', { class: 'dim' }, it ? getItem(it.defId)?.nameTh ?? '' : SLOT_TH[s])));
    }
    const stats = h('table', { class: 'stats' }, ...STAT_KEYS.map((k) => h('tr', {}, h('td', {}, STAT_LABELS[k]), h('td', { class: 'v' }, fmtStat(k, c.stats[k])))));
    const mastery = h('div', {}, h('b', {}, 'Weapon Mastery'), ...Object.entries(c.mastery).map(([w, m]) =>
      h('div', {}, `${WEAPON_DISPLAY[w as keyof typeof WEAPON_DISPLAY]?.nameTh ?? w}: Lv.${m.level} (${m.xp}/${Number.isFinite(m.next) ? m.next : 'MAX'}) · +${m.level}% ดาเมจ`)));
    p.append(this.header(`${c.name} · Lv.${c.level}`, 'char'),
      h('div', { class: 'charcols' }, h('div', {}, eq, mastery,
        h('div', { class: 'dim' }, `EXP ${c.exp}/${c.expNext}`, c.rested > 0 ? ` · Rested ${c.rested}` : ''),
        h('div', { class: 'dim' }, 'คลิกช่องอุปกรณ์เพื่อถอด · เปลี่ยนอาวุธได้เฉพาะในเมือง')), stats));
  }

  private renderShop() {
    const p = this.panels.shop;
    clear(p);
    if (!this.shop) return;
    p.append(this.header('ร้านค้า', 'shop'));
    for (const e of this.shop.items) {
      const def = getItem(e.itemId);
      if (!def) continue;
      const qty = h('input', { type: 'number', min: 1, max: def.stackMax, value: 1, class: 'qtyin' });
      p.append(h('div', { class: 'shoprow' }, spriteImg(itemIcon(def.icon, def.color), 2), h('div', { class: 'grow' }, h('div', {}, def.nameTh), h('div', { class: 'dim' }, def.description)),
        h('span', { class: 'price' }, `${e.price}g`), qty,
        h('button', { class: 'btn small', onclick: () => this.g.send({ t: 'shop_buy', npc: this.shop!.npc, item: def.id, qty: Math.max(1, Math.min(def.stackMax, Number(qty.value) || 1)) }) }, 'ซื้อ')));
    }
    p.append(h('div', { class: 'dim' }, 'ขายของ: เลือกไอเทมในกระเป๋าแล้วกด "ขาย"'));
  }

  private renderDialog(name: string, lines: string[]) {
    const p = this.panels.dialog;
    clear(p);
    p.append(this.header(name, 'dialog'), ...lines.map((l) => h('p', {}, l)));
  }

  private gmTab: 'self' | 'items' | 'players' | 'world' | 'server' = 'items';
  private gmCat: string = 'weapon';

  private renderGm() {
    const p = this.panels.gm;
    clear(p);
    if (!this.gm?.on) return;
    const g = this.gm;
    const cmd = (line: string) => this.g.send({ t: 'chat', text: `/gm ${line}` });
    const val = (id: string) => ((p.querySelector(`#${id}`) as HTMLInputElement | HTMLSelectElement | null)?.value ?? '').trim();
    const input = (id: string, ph: string, w = 70, v = '') => h('input', { id, placeholder: ph, style: `width:${w}px`, value: v || undefined });
    const btn = (label: string, fn: () => void, cls = '') => h('button', { class: `btn small ${cls}`, onclick: fn }, label);
    const toggle = (label: string, on: boolean, c: string) => btn(`${label}: ${on ? 'ON' : 'OFF'}`, () => cmd(c), on ? 'primary' : '');
    const tabs: [typeof this.gmTab, string][] = [['self', 'ตัวเอง'], ['items', 'เสกไอเทม'], ['players', 'ผู้เล่น'], ['world', 'โลก / มอนสเตอร์'], ['server', 'เซิร์ฟเวอร์']];
    p.append(this.header('GM Panel', 'gm'),
      h('div', { class: 'tabs' }, ...tabs.map(([k, l]) => h('button', { class: `tab${this.gmTab === k ? ' on' : ''}`, onclick: () => { this.gmTab = k; this.renderGm(); } }, l))));
    const body = h('div', { class: 'gmbody' });
    p.append(body);
    const target = () => val('gm-target');
    const targetRow = () => h('div', { class: 'row' }, 'ผู้รับ:', input('gm-target', 'ชื่อผู้เล่น (ว่าง = ตัวเอง)', 170, this.gmTarget), h('span', { class: 'dim' }, 'ใช้กับเสกของ/ทอง/เลเวล'));

    if (this.gmTab === 'self') {
      body.append(
        h('div', { class: 'gmsec' }, 'สถานะ'),
        h('div', { class: 'row' }, toggle('อมตะ', g.god, 'god'), toggle('ล่องหน', g.invis, 'invis'), toggle('ไม่มีคูลดาวน์', g.nocd, 'nocd')),
        h('div', { class: 'row' }, 'ความเร็ว ×', ...[1, 1.5, 2, 3].map((v) => btn(String(v), () => cmd(`speed ${v}`), g.speed === v ? 'primary' : ''))),
        h('div', { class: 'row' }, btn('ฟื้นฟูเต็ม', () => cmd('heal')), btn('ชุบชีวิต', () => cmd('revive')), ),
        h('div', { class: 'row' }, 'ถืออาวุธ:', ...WEAPON_TYPES.map((t) => btn(WEAPON_DISPLAY[t].nameTh, () => cmd(`weapon ${t}`), this.g.weapon?.type === t ? 'primary' : ''))),
        h('div', { class: 'gmsec' }, 'The Power'),
        h('div', { class: 'row' }, ...Object.values(POWERS).map((pw) => btn(`ให้ ${pw.nameTh}`, () => cmd(`power ${pw.id} 3`))), btn('ให้ทั้ง 6 (Awakening III)', () => cmd('power all 3'), 'primary')),
        h('div', { class: 'row' }, 'ใช้พลังทันที (ข้ามพิธี):', ...Object.values(POWERS).map((pw) => btn(pw.nameTh, () => cmd(`setpower ${pw.id}`), this.g.powers?.active === pw.id ? 'primary' : '')),
          'Power Mastery', input('gm-pm', '0-20', 50), btn('ตั้ง', () => cmd(`mastery_power ${val('gm-pm') || 0}`))),
        h('div', { class: 'gmsec' }, 'ความก้าวหน้า (ตัวเอง)'),
        h('div', { class: 'row' }, 'เลเวล', input('gm-level', '1-100', 60), btn('ตั้ง', () => cmd(`level ${val('gm-level') || 1}`)), ...[10, 30, 50, 100].map((v) => btn(`Lv${v}`, () => cmd(`level ${v}`)))),
        h('div', { class: 'row' }, 'EXP', input('gm-exp', 'จำนวน', 80), btn('ให้', () => cmd(`exp ${val('gm-exp') || 0}`))),
        h('div', { class: 'row' }, 'Mastery', h('select', { id: 'gm-mw' }, ...WEAPON_TYPES.map((t) => h('option', { value: t, selected: this.g.weapon?.type === t }, WEAPON_DISPLAY[t].nameTh))), input('gm-ml', 'Lv 0-20', 60),
          btn('ตั้ง', () => cmd(`mastery ${val('gm-mw')} ${val('gm-ml') || 0}`))),
        h('div', { class: 'row' }, 'ทอง', input('gm-gold', '+/- จำนวน', 90), btn('เสก', () => cmd(`gold ${val('gm-gold') || 0}`)), ...[1000, 100000, 1000000].map((v) => btn(`+${v.toLocaleString()}`, () => cmd(`gold ${v}`)))),
      );
    }

    if (this.gmTab === 'items') {
      const cats: [string, string][] = [['weapon', 'อาวุธ'], ['armor', 'เกราะ'], ['helmet', 'หมวก'], ['gloves', 'ถุงมือ'], ['boots', 'รองเท้า'], ['accessory', 'เครื่องประดับ'],
        ['consumable', 'ยา/ใช้แล้วหมด'], ['material', 'วัตถุดิบ'], ['rune', 'รูน'], ['gold', 'ทอง']];
      const count = (c: string) => Object.values(ITEMS).filter((i) => i.category === c).length;
      body.append(targetRow(),
        h('div', { class: 'tabs sub' }, ...cats.map(([k, l]) => h('button', { class: `tab${this.gmCat === k ? ' on' : ''}`, onclick: () => { this.gmTarget = target(); this.gmCat = k; this.renderGm(); } }, k === 'gold' ? l : `${l} (${count(k)})`))));
      if (this.gmCat === 'gold') {
        body.append(h('div', { class: 'row' }, ...[100, 1000, 10000, 100000, 1000000, 100000000].map((v) => btn(`+${v.toLocaleString()} 💰`, () => cmd(`gold ${v} ${target()}`))),
          input('gm-goldx', 'จำนวนเอง (ติดลบ = หัก)', 160), btn('เสก', () => cmd(`gold ${val('gm-goldx') || 0} ${target()}`))));
      } else {
        const list = Object.values(ITEMS).filter((i) => i.category === this.gmCat);
        const equipCat = ['weapon', 'armor', 'helmet', 'gloves', 'boots', 'accessory'].includes(this.gmCat);
        body.append(h('div', { class: 'row' }, 'จำนวน', input('gm-qty', '1', 60, this.gmCat === 'material' ? '99' : '1'),
          equipCat ? h('select', { id: 'gm-rar' }, h('option', { value: '' }, 'ระดับตามค่าเริ่มต้น'), ...Object.entries(RARITY_INFO).map(([k, v]) => h('option', { value: k }, v.nameTh))) : null,
          btn(`เสกทั้งหมวด (${list.length} ชนิด)`, () => cmd(`itemall ${this.gmCat} ${val('gm-qty') || 1} ${equipCat ? val('gm-rar') || '-' : '-'} ${target()}`), 'primary')));
        const grid = h('div', { class: 'gmitems' });
        for (const it of list) {
          grid.append(h('button', { class: 'gmitem', title: `${it.id}\n${it.description}`, style: `border-color:${RARITY_INFO[it.rarity].color}`,
            onclick: () => cmd(`item ${it.id} ${val('gm-qty') || 1} ${(equipCat && val('gm-rar')) || it.rarity} ${target()}`) },
            spriteImg(itemIcon(it.icon, it.color), 2), h('span', {}, it.nameTh), h('small', {}, it.levelReq > 1 ? `Lv.${it.levelReq}` : it.rarity)));
        }
        body.append(grid, h('div', { class: 'dim' }, 'คลิกไอเทมเพื่อเสก · ไอเทมสร้างบนเซิร์ฟเวอร์และเข้ากระเป๋าผู้รับ (กระเป๋าเต็มจะแจ้งในแชต)'));
      }
    }

    if (this.gmTab === 'players') {
      body.append(targetRow(),
        h('div', { class: 'gmsec' }, 'ตำแหน่ง'),
        h('div', { class: 'row' }, btn('ไปหา', () => target() && cmd(`goto ${target()}`)), btn('ดึงมาหาฉัน', () => target() && cmd(`summon ${target()}`))),
        h('div', { class: 'gmsec' }, 'สถานะ'),
        h('div', { class: 'row' }, btn('ฟื้นฟู', () => cmd(`heal ${target()}`)), btn('ชุบชีวิต', () => cmd(`revive ${target()}`)), btn('ฆ่า', () => target() && cmd(`kill ${target()}`), 'danger'),
          'เลเวล', input('gm-plevel', 'Lv', 50), btn('ตั้ง', () => cmd(`level ${val('gm-plevel') || 1} ${target()}`))),
        h('div', { class: 'gmsec' }, 'ลงโทษ'),
        h('div', { class: 'row' }, btn('เตะ', () => target() && cmd(`kick ${target()}`), 'danger'),
          'มิวต์', input('gm-mute', 'นาที', 50, '10'), btn('มิวต์', () => target() && cmd(`mute ${target()} ${val('gm-mute') || 10}`), 'danger'),
          'แบน', input('gm-ban', 'ชั่วโมง', 60, '24'), btn('แบน', () => { const t = target(); if (t) void confirmBox(`แบน ${t} ${val('gm-ban') || 24} ชั่วโมง?`, 'แบน').then((ok) => ok && cmd(`ban ${t} ${val('gm-ban') || 24}`)); }, 'danger')),
        h('div', { class: 'row' }, input('gm-unban', 'username ที่จะปลดแบน', 170), btn('ปลดแบน', () => val('gm-unban') && cmd(`unban ${val('gm-unban')}`))),
        h('div', { class: 'row' }, btn('รายชื่อผู้เล่นออนไลน์ (แสดงในแชต)', () => cmd('players'))));
    }

    if (this.gmTab === 'world') {
      const zoneSel = h('select', { id: 'gm-zone' }, ...Object.values(ZONES).map((z) => h('option', { value: z.id, selected: z.id === this.g.zone?.id }, `${z.name} (${z.width}×${z.height})`)));
      body.append(
        h('div', { class: 'gmsec' }, 'วาร์ป'),
        h('div', { class: 'row' }, zoneSel, input('gm-x', 'x', 46), input('gm-y', 'y', 46), btn('วาร์ป (ว่าง = จุดเกิด)', () => cmd(`tp ${val('gm-x') || '-'} ${val('gm-y') || '-'} ${val('gm-zone')}`))),
        h('div', { class: 'gmsec' }, 'เสกมอนสเตอร์ (ข้างหน้าตัวละคร)'),
        h('div', { class: 'row' }, 'จำนวน', input('gm-count', '1', 50, '1')));
      const byTier = new Map<string, typeof MONSTERS[string][]>();
      for (const m of Object.values(MONSTERS)) { const k = m.tier === 'normal' ? 'มอนสเตอร์ทั่วไป' : 'Elite / บอส'; byTier.set(k, [...(byTier.get(k) ?? []), m]); }
      for (const [k, list] of byTier) {
        body.append(h('div', { class: 'dim' }, k), h('div', { class: 'gmitems' }, ...list.map((m) => h('button', { class: 'gmitem', title: m.id, onclick: () => cmd(`spawn ${m.id} ${val('gm-count') || 1}`) },
          spriteImg(monsterSprite(m, 0, false), 2), h('span', {}, m.nameTh), h('small', {}, `Lv.${m.levelMin}-${m.levelMax}`)))));
      }
      body.append(h('div', { class: 'gmsec' }, 'ควบคุมแมพ'),
        h('div', { class: 'row' }, btn('ฆ่ามอนรอบตัว (ได้ EXP/ดรอป)', () => cmd('killmobs 15')), btn('ลบมอนรอบตัว', () => cmd('clearmobs 15')), btn('รีสปอว์นทั้งแมพ', () => cmd('respawn'))));
    }

    if (this.gmTab === 'server') {
      body.append(
        h('div', { class: 'gmsec' }, 'Event rates (ทั้งเซิร์ฟ)'),
        h('div', { class: 'row' }, 'EXP', input('gm-rexp', '', 40, String(g.rates.exp)), 'Drop', input('gm-rdrop', '', 40, String(g.rates.drop)), 'Gold', input('gm-rgold', '', 40, String(g.rates.gold)),
          btn('ตั้ง', () => cmd(`rates ${val('gm-rexp') || 1} ${val('gm-rdrop') || 1} ${val('gm-rgold') || 1}`)), btn('รีเซ็ต ×1', () => cmd('rates 1 1 1'))),
        h('div', { class: 'gmsec' }, 'ประกาศ'),
        h('div', { class: 'row' }, input('gm-ann', 'ข้อความประกาศถึงทุกคน', 260), btn('ประกาศ', () => val('gm-ann') && cmd(`announce ${val('gm-ann')}`))),
        h('div', { class: 'gmsec' }, 'ข้อมูล'),
        h('div', { class: 'row' }, btn('สถานะเซิร์ฟเวอร์', () => cmd('status')), btn('ผู้เล่นออนไลน์', () => cmd('players')), btn('รายการคำสั่ง', () => cmd('help')), btn('ปิด GM', () => cmd('off'), 'danger')));
    }
    p.append(h('div', { class: 'dim' }, 'ผลลัพธ์แสดงในแชต · ทุกคำสั่งตรวจสิทธิ์บนเซิร์ฟเวอร์และบันทึก audit log'));
  }
  private gmTarget = '';

  renderPower(force = false) {
    const pv = this.g.powers;
    const key = JSON.stringify([pv, this.powerSel, this.powerNpc, this.g.weapon?.type, this.g.gold]);
    if (!force && key === this.lastPowerKey) return;
    this.lastPowerKey = key;
    const p = this.panels.power;
    clear(p);
    const title = this.powerNpc?.role === 'power' ? 'ปราชญ์แห่งพลัง — แลก The Power' : this.powerNpc?.role === 'ritual' ? 'Power Rebirth Temple — พิธีเปลี่ยนพลัง' : 'The Power';
    p.append(this.header(title, 'power'));
    if (!pv) { p.append(h('p', { class: 'dim' }, 'กำลังโหลด...')); return; }
    const owned = new Map(pv.owned.map((o) => [o.id, o]));
    const frag = this.g.items.filter((i) => i.defId === 'mat_power_fragment' && i.slot !== null).reduce((a, b) => a + b.qty, 0);
    const count = (id: string) => this.g.items.filter((i) => i.defId === id && i.slot !== null).reduce((a, b) => a + b.qty, 0);
    const sel = this.powerSel ?? pv.active ?? Object.keys(POWERS)[0];
    // ---- power list
    const list = h('div', { class: 'plist' });
    for (const def of Object.values(POWERS)) {
      const o = owned.get(def.id);
      list.append(h('button', { class: `pcard${sel === def.id ? ' sel' : ''}${o ? '' : ' notowned'}`, style: `--pc:${def.color}`, onclick: () => { this.powerSel = def.id; this.renderPower(true); } },
        h('b', {}, def.nameTh), h('small', {}, def.name),
        h('small', {}, o ? `${pv.active === def.id ? '● ใช้อยู่ · ' : ''}Awakening ${'I'.repeat(o.awakening)} · Mastery ${o.masteryLevel}` : 'ยังไม่มี')));
    }
    p.append(list);
    const def = POWERS[sel] as PowerDef;
    const o = owned.get(def.id);
    const info = h('div', { class: 'pinfo' },
      h('div', {}, h('b', { style: `color:${def.color}` }, `${def.nameTh} (${def.name})`), ` · ${def.type}`),
      h('div', { class: 'dim' }, `อาวุธ: ${def.weapons ? def.weapons.map((w) => WEAPON_DISPLAY[w].nameTh).join(', ') : 'ทุกประเภท'} · บทบาท: ${def.teamRole}`),
      h('div', { class: 'cols2' }, h('div', {}, h('span', { class: 'good' }, 'จุดเด่น: '), def.strengths.join(', ')), h('div', {}, h('span', { class: 'bad' }, 'จุดอ่อน: '), def.weaknesses.join(', '))),
      h('div', { class: 'dim' }, `วิธีตอบโต้: ${def.counterplay}`));
    p.append(info);
    // ---- NPC actions
    if (this.powerNpc?.role === 'power' && !o) {
      const c = POWER_CONFIG.exchange;
      p.append(h('div', { class: 'row pact' }, `แลกด้วยเศษพลัง ${frag}/${c.fragments} + ทอง ${c.gold.toLocaleString()}`,
        h('button', { class: 'btn primary', disabled: frag < c.fragments || this.g.gold < c.gold, onclick: () => this.g.send({ t: 'power_exchange', npc: this.powerNpc!.npc, power: def.id }) }, `หลอมเป็น ${def.nameTh}`)));
    }
    if (this.powerNpc?.role === 'ritual' && o && pv.active !== def.id) {
      const R = POWER_CONFIG.ritual;
      const need: [string, number][] = [...Object.entries(R.items), [def.ritualItem, R.powerItemQty]];
      const ok = need.every(([id, n]) => count(id) >= n) && this.g.gold >= R.gold && pv.ritualIn === 0 && powerAllowsWeapon(def, this.g.weapon?.type);
      p.append(h('div', { class: 'pact' },
        h('div', {}, 'วัตถุดิบพิธี: ', ...need.map(([id, n]) => h('span', { class: count(id) >= n ? 'good' : 'bad' }, `${getItem(id)?.nameTh ?? id} ${count(id)}/${n} · `)),
          h('span', { class: this.g.gold >= R.gold ? 'good' : 'bad' }, `ทอง ${R.gold.toLocaleString()}`)),
        h('div', { class: 'dim' }, `ภารกิจพิธีของพลังนี้: ${def.ritualTrial} (ด่านทดสอบในพิธียังไม่เปิด — ตอนนี้เป็นการทำพิธีแบบหักวัตถุดิบ)`),
        pv.ritualIn > 0 ? h('div', { class: 'bad' }, `พิธีพร้อมอีก ${Math.ceil(pv.ritualIn / 60)} นาที`) : null,
        !powerAllowsWeapon(def, this.g.weapon?.type) ? h('div', { class: 'bad' }, 'อาวุธที่ถืออยู่ใช้พลังนี้ไม่ได้') : null,
        h('button', { class: 'btn primary', disabled: !ok, onclick: () => this.g.send({ t: 'power_ritual', npc: this.powerNpc!.npc, power: def.id }) }, `ทำพิธีเปลี่ยนเป็น ${def.nameTh}`)));
    }
    if (!o) {
      p.append(h('p', { class: 'dim' }, `ยังไม่มีพลังนี้ — หาได้จากบอส/ดันเจี้ยน หรือแลกเศษพลัง ${POWER_CONFIG.exchange.fragments} ชิ้นที่ปราชญ์อิลยา (Aether Capital)`));
      this.abilityList(p, def, 0);
      return;
    }
    if (pv.active !== def.id) p.append(h('div', { class: 'dim' }, 'อยู่ใน Power Collection — เปลี่ยนมาใช้ต้องทำพิธีที่ Power Rebirth Temple (Warhaven Citadel ทางประตูตะวันตกของเมือง)'));
    if (pv.active === def.id && !pv.usable) p.append(h('div', { class: 'bad' }, 'อาวุธที่ถืออยู่ใช้พลังนี้ไม่ได้ — สกิลพลังถูกปิดจนกว่าจะเปลี่ยนอาวุธ'));
    p.append(h('div', { class: 'row' }, `Power Mastery Lv.${o.masteryLevel} (${o.masteryXp}/${Number.isFinite(o.next) ? o.next : 'MAX'}) · +${o.masteryLevel}% ดาเมจพลัง`));
    // ---- awakening
    if (o.awakening < 3) {
      const tier = POWER_CONFIG.awakening[o.awakening];
      const cost = tier.cost!;
      const ok = Object.entries(cost.items).every(([id, n]) => count(id) >= n) && this.g.gold >= cost.gold && o.masteryLevel >= cost.masteryLevel;
      p.append(h('div', { class: 'pact' }, h('b', {}, `ปลุกพลัง → ${tier.name}`), ' ต้องการ: ',
        h('span', { class: o.masteryLevel >= cost.masteryLevel ? 'good' : 'bad' }, `Mastery ${cost.masteryLevel} · `),
        ...Object.entries(cost.items).map(([id, n]) => h('span', { class: count(id) >= n ? 'good' : 'bad' }, `${getItem(id)?.nameTh ?? id} ${count(id)}/${n} · `)),
        h('span', { class: this.g.gold >= cost.gold ? 'good' : 'bad' }, `ทอง ${cost.gold.toLocaleString()}`),
        h('button', { class: 'btn small primary', disabled: !ok, onclick: () => this.g.send({ t: 'power_awaken', power: def.id }) }, 'ปลุกพลัง')));
    } else p.append(h('div', { class: 'good' }, 'Awakening III — ปลดล็อกครบ 25 ความสามารถ (Mastery stage: customization/visual evolution อยู่ในแผน)'));
    // ---- loadout editor
    const lo = pv.loadouts[def.id] ?? { actives: [null, null, null, null, null], ult: null, passives: [null, null, null] };
    const un = unlockedAbilities(def, o.awakening);
    const select = (id: string, opts: { id: string; nameTh: string }[], cur: string | null) =>
      h('select', { id }, h('option', { value: '' }, '— ว่าง —'), ...opts.map((x) => h('option', { value: x.id, selected: x.id === cur }, x.nameTh)));
    const keys = ['Q', 'E', 'R', 'T', 'G'];
    const loEl = h('div', { class: 'loadout' },
      h('div', { class: 'gmsec' }, `Loadout: Active ${POWER_CONFIG.loadout.actives} · Ultimate 1 · Passive ${POWER_CONFIG.loadout.passives}`),
      h('div', { class: 'lorow' }, ...lo.actives.map((a, i) => h('label', {}, keys[i], select(`lo-a${i}`, un.actives, a)))),
      h('div', { class: 'lorow' }, h('label', {}, 'X Ultimate', select('lo-u', un.ultimates, lo.ult)), ...lo.passives.map((a, i) => h('label', {}, `Passive ${i + 1}`, select(`lo-p${i}`, un.passives, a)))),
      h('button', { class: 'btn small primary', onclick: () => {
        const v = (id: string) => (p.querySelector(`#${id}`) as HTMLSelectElement).value || null;
        this.g.send({ t: 'power_loadout', power: def.id, actives: [0, 1, 2, 3, 4].map((i) => v(`lo-a${i}`)), ult: v('lo-u'), passives: [0, 1, 2].map((i) => v(`lo-p${i}`)) });
      } }, 'บันทึก Loadout'));
    p.append(loEl);
    this.abilityList(p, def, o.awakening);
  }

  private abilityList(p: HTMLElement, def: PowerDef, awakening: number) {
    const un = awakening ? unlockedAbilities(def, awakening) : { actives: [], ultimates: [], passives: [] };
    const ok = new Set([...un.actives, ...un.ultimates, ...un.passives].map((x) => x.id));
    const row = (x: { id: string; nameTh: string; name: string; description: string }, meta: string) =>
      h('div', { class: `abil${ok.has(x.id) ? '' : ' lockedab'}` }, h('b', {}, `${x.nameTh}`), h('small', {}, ` ${x.name} ${meta}`), h('div', { class: 'dim' }, x.description));
    const list = h('div', { class: 'abils' },
      h('div', { class: 'gmsec' }, 'Active (15)'), ...def.actives.map((s, i) => row(s, `· CD ${s.cooldown}s · EN ${s.energyCost}${s.castTime ? ` · ร่าย ${s.castTime}s` : ''} · ปลด ${i < 5 ? 'I' : i < 10 ? 'II' : 'III'}`)),
      h('div', { class: 'gmsec' }, 'Ultimate (5)'), ...def.ultimates.map((s, i) => row({ ...s, description: `${s.description} — ตอบโต้: ${s.counterplay}` }, `· CD ${s.cooldown}s · EN ${s.energyCost} · ปลด ${i < 1 ? 'I' : i < 3 ? 'II' : 'III'}`)),
      h('div', { class: 'gmsec' }, 'Passive (5)'), ...def.passives.map((s, i) => row(s, `· ปลด ${i < 2 ? 'I' : i < 3 ? 'II' : 'III'}`)));
    p.append(list);
  }

  renderAuto() {
    const p = this.panels.auto;
    clear(p);
    const c = this.autoCfg;
    const save = () => saveAutoCfg(c);
    const running = !!this.g.self?.auto;
    const z = this.g.zone;
    const chk = (label: string, get: () => boolean, set: (v: boolean) => void, disabled = false) => {
      const box = h('input', { type: 'checkbox', checked: get(), disabled });
      box.addEventListener('change', () => { set(box.checked); save(); if (label.startsWith('Elite')) this.renderAuto(); });
      return h('label', { class: 'chk' }, box, label);
    };
    const numIn = (label: string, get: () => number, set: (v: number) => void, min: number, max: number, unit = '') => {
      const inp = h('input', { type: 'number', min, max, value: get(), style: 'width:64px' });
      inp.addEventListener('change', () => { set(Math.max(min, Math.min(max, Number(inp.value) || 0))); save(); });
      return h('label', { class: 'chk' }, label, inp, unit);
    };
    p.append(this.header('ออโต้ฟาร์ม', 'auto'));
    if (!z || z.safe || z.kind !== 'field') {
      p.append(h('p', { class: 'dim' }, 'ใช้ออโต้ได้เฉพาะในแมพฟาร์ม (เช่น Greenfall Plains) ในเมืองหรือ Safe Zone ใช้ไม่ได้'));
    }
    // targets: monsters that live on this map
    const mons = [...new Set((z?.spawnGroups ?? []).map((g) => g.monsterId))].map((id) => MONSTERS[id]).filter(Boolean);
    const tgt = h('div', { class: 'autolist' });
    for (const m of mons) {
      const elite = m.tier !== 'normal';
      tgt.append(chk(`${m.nameTh} Lv.${m.levelMin}-${m.levelMax}${elite ? ' ★' : ''}`, () => c.targets.includes(m.id),
        (v) => { c.targets = v ? [...new Set([...c.targets, m.id])] : c.targets.filter((x) => x !== m.id); }, elite && !c.allowElite));
    }
    const w = this.g.weapon;
    p.append(
      h('div', { class: 'gmsec' }, 'เป้าหมาย (ไม่เลือก = ทุกตัวที่อนุญาต)'), tgt,
      chk(`Elite (รางวัลเหลือ ${AUTO_CONFIG.eliteRewardMult * 100}%)`, () => c.allowElite, (v) => { c.allowElite = v; }),
      h('div', { class: 'dim' }, 'บอสทุกประเภทใช้ออโต้ไม่ได้ (เซิร์ฟเวอร์บังคับ)'),
      numIn('รัศมีฟาร์ม', () => c.radius, (v) => { c.radius = v; }, AUTO_CONFIG.minRadius, AUTO_CONFIG.maxRadius, ' ช่อง (นับจากจุดเริ่ม)'),
      h('div', { class: 'gmsec' }, 'สกิล'),
      h('div', { class: 'row' }, ...(w ? w.skills.map((sk, i) => chk(`${i + 1}. ${sk.nameTh}${sk.damage ? '' : ' (ไม่ใช้ในออโต้)'}`, () => c.useSkills[i], (v) => { c.useSkills[i] = v; }, !sk.damage)) : []),
        chk(w ? `${w.heavy.nameTh}` : 'โจมตีหนัก', () => c.useHeavy, (v) => { c.useHeavy = v; })),
      h('div', { class: 'gmsec' }, 'ยา'),
      h('div', { class: 'row' }, numIn('ใช้ยา HP เมื่อต่ำกว่า', () => c.hpPotionPct, (v) => { c.hpPotionPct = v; }, 0, 90, '%'),
        numIn('ใช้ยา EN เมื่อต่ำกว่า', () => c.enPotionPct, (v) => { c.enPotionPct = v; }, 0, 90, '%')),
      h('div', { class: 'gmsec' }, 'เก็บของ'),
      h('div', { class: 'row' }, chk('ทอง', () => c.loot.gold, (v) => { c.loot.gold = v; }), chk('วัตถุดิบ/รูน', () => c.loot.materials, (v) => { c.loot.materials = v; }),
        chk('ยา', () => c.loot.consumables, (v) => { c.loot.consumables = v; }),
        (() => { const sel = h('select', {}, ...(['none', 'common', 'uncommon', 'rare', 'epic'] as const).map((r) => h('option', { value: r, selected: c.loot.equipmentMinRarity === r }, r === 'none' ? 'ไม่เก็บอุปกรณ์' : `อุปกรณ์ ${RARITY_INFO[r].nameTh}+`)));
          sel.addEventListener('change', () => { c.loot.equipmentMinRarity = sel.value as AutoSettings['loot']['equipmentMinRarity']; save(); }); return sel; })()),
      h('div', { class: 'gmsec' }, 'เงื่อนไขหยุด'),
      h('div', { class: 'row' }, numIn('เวลา', () => c.stop.minutes, (v) => { c.stop.minutes = v; }, 0, AUTO_CONFIG.maxSessionMinutes, 'นาที (0=ไม่จำกัด)'),
        numIn('จำนวนตัว', () => c.stop.kills, (v) => { c.stop.kills = v; }, 0, 100000, '(0=ไม่จำกัด)')),
      h('div', { class: 'row' }, chk('กระเป๋าเต็ม', () => c.stop.whenBagFull, (v) => { c.stop.whenBagFull = v; }), chk('ยา HP หมด', () => c.stop.whenOutOfPotions, (v) => { c.stop.whenOutOfPotions = v; })),
      h('div', { class: 'row' },
        running ? h('button', { class: 'btn danger', id: 'auto-stop', onclick: () => this.g.send({ t: 'auto_stop' }) }, `หยุดออโต้ (ฆ่าแล้ว ${this.g.self?.autoKills ?? 0})`)
          : h('button', { class: 'btn primary', id: 'auto-start', onclick: () => this.g.send({ t: 'auto_start', cfg: c }) }, 'เริ่มออโต้')),
      h('div', { class: 'dim' }, `เซิร์ฟเวอร์ควบคุมตัวละครระหว่างออโต้ · เดิน/คลิก/กดสกิลเองเพื่อยกเลิก · จำกัด ${AUTO_CONFIG.hourlyKillCap} ตัว/ชั่วโมง · หยุดเมื่อหลุด ตาย หรือย้ายแมพ`),
    );
  }

  // ------------------------------------------------------------ per-frame update
  private skillSlot(id: string, key: string, label: string, skill: SkillDef | null, extra?: string, cls = '') {
    const cd = h('div', { class: 'cdov' });
    const tip = skill
      ? `${skill.nameTh} (${skill.name})\n${skill.description}\nคูลดาวน์ ${skill.cooldown}s · Energy ${skill.energyCost}${skill.staminaCost ? ` · Stamina ${skill.staminaCost}` : ''}${skill.castTime ? ` · ร่าย ${skill.castTime}s` : ''}\nระยะ: ${describeShape(skill)}`
      : extra ?? label;
    const slot = h('div', { class: `sk ${cls}`, title: tip, onmousedown: (e: Event) => { e.preventDefault(); this.onSkill(id); } }, h('div', { class: 'skname' }, label), skill && skill.energyCost ? h('div', { class: 'skcost' }, String(skill.energyCost)) : null, h('div', { class: 'skkey' }, key), cd);
    this.skillEls.set(id, { cd, slot });
    return slot;
  }

  private powerSlots(): HTMLElement[] {
    const keys = ['Q', 'E', 'R', 'T', 'G'];
    const out: HTMLElement[] = [];
    if (!this.g.powers?.active) return out;
    if (!this.g.powers.usable) return [h('div', { class: 'sk locked', title: 'อาวุธที่ถืออยู่ใช้พลังนี้ไม่ได้' }, h('div', { class: 'skname' }, 'พลังถูกปิด'), h('div', { class: 'skkey' }, '—'))];
    for (let i = 0; i < 5; i++) {
      const sk = this.g.powerSlotSkill(i);
      out.push(sk ? this.skillSlot(sk.id, keys[i], sk.nameTh, sk, undefined, 'power') : h('div', { class: 'sk empty', title: 'ช่องว่าง — ตั้งค่าใน The Power [P]' }, h('div', { class: 'skkey' }, keys[i])));
    }
    const u = this.g.powerSlotSkill(-1);
    out.push(u ? this.skillSlot(u.id, 'X', u.nameTh, u, undefined, 'ult') : h('div', { class: 'sk empty ult' }, h('div', { class: 'skkey' }, 'X')));
    out.push(h('div', { class: 'sep' }));
    return out;
  }

  private buildSkills() {
    clear(this.skillBar);
    this.skillEls.clear();
    const w = this.g.weapon;
    this.skillBar.append(
      this.skillSlot(w?.normal.id ?? 'n', 'LMB', w?.normal.nameTh ?? 'โจมตี', w?.normal ?? null),
      this.skillSlot(w?.heavy.id ?? 'hv', 'RMB', w?.heavy.nameTh ?? 'หนัก', w?.heavy ?? null),
      this.skillSlot('dodge', 'SPC', 'หลบ', null, 'หลบ: เคลื่อนที่เร็วและอมตะชั่วครู่ ใช้ Stamina'),
      this.skillSlot('block', 'SHF', w?.defensive.kind === 'mana_guard' ? 'โล่มานา' : 'ป้องกัน', null, w ? `ลดดาเมจ ${Math.round(w.defensive.damageReduction * 100)}%` : ''),
      h('div', { class: 'sep' }),
      ...(w ? w.skills.map((s, i) => this.skillSlot(s.id, String(i + 1), s.nameTh, s)) : []),
      h('div', { class: 'sep' }),
      ...this.powerSlots(),
      this.skillSlot('pot_hp', '4', 'ยา HP', null, 'ใช้ยาฟื้นพลัง HP'),
      this.skillSlot('pot_en', '5', 'ยา EN', null, 'ใช้ยาฟื้นพลัง Energy'),
    );
  }

  update() {
    const g = this.g, s = g.self, c = g.char;
    if (!s || !c) return;
    if ((g.weapon?.type ?? '') !== this.lastWeapon || !this.skillEls.size) { this.lastWeapon = g.weapon?.type ?? ''; this.buildSkills(); if (this.isOpen('auto')) this.renderAuto(); }
    const setBar = (k: keyof Hud['bars'], v: number, max: number, text: string) => {
      this.bars[k].fill.style.width = `${Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100))}%`;
      this.bars[k].text.textContent = text;
    };
    setBar('hp', s.hp, s.mhp, `HP ${s.hp}/${s.mhp}${s.shield > 0 ? ` (+${s.shield})` : ''}`);
    setBar('en', s.en, s.men, `EN ${s.en}/${s.men}`);
    setBar('st', g.ms.stamina, s.mst, `ST ${Math.floor(g.ms.stamina)}/${s.mst}`);
    setBar('exp', c.exp, c.expNext, `Lv.${c.level}  EXP ${c.exp}/${c.expNext} (${((c.exp / Math.max(1, c.expNext)) * 100).toFixed(1)}%)${c.rested ? ' · Rested' : ''}`);
    this.nameEl.textContent = `${c.name}  Lv.${c.level}  ·  ${c.weapon ? WEAPON_DISPLAY[c.weapon].nameTh : 'มือเปล่า'}${this.gm?.on ? '  [GM]' : ''}`;
    const z = g.zone;
    this.zoneEl.textContent = z ? `${z.name}${z.safe ? ' (Safe Zone)' : ` Lv.${z.levelRange[0]}-${z.levelRange[1]}`}  (${g.ms.x.toFixed(0)}, ${g.ms.y.toFixed(0)})` : '';
    const mode = g.net.kind === 'online' ? 'Online' : g.net.kind === 'local-worker' ? 'Local (Worker)' : 'Local (main thread)';
    this.netEl.textContent = `${mode} · ping ${g.ping}ms${g.net.latencyMs ? ` (+${g.net.latencyMs * 2} sim)` : ''} · tick ${g.serverTick} · ${g.snapRate} snap/s · pending ${g.pending.length} · corr ${g.corrections}`;
    // cooldowns
    for (const [id, el] of this.skillEls) {
      let rem = s.cd[id] ?? 0, total = 1;
      const w = g.weapon;
      const sk = (w ? [w.normal, w.heavy, ...w.skills].find((x) => x.id === id) : undefined) ?? findPowerSkill(id)?.skill;
      if (sk) total = sk.type === 'normal' ? sk.cooldown / (c.stats.atkSpd || 1) : sk.cooldown * (1 - c.stats.cdr);
      if (id === 'dodge') { rem = g.ms.dodgeCd; total = (w?.dodge.cooldown ?? 0.5) + (w?.dodge.duration ?? 0.25); }
      if (id === 'pot_hp' || id === 'pot_en') { rem = s.potCd; total = 8; }
      const pct = rem > 0 ? Math.min(100, (rem / Math.max(0.01, total)) * 100) : 0;
      el.cd.style.height = `${pct}%`;
      el.cd.textContent = rem > 0.5 ? rem.toFixed(0) : '';
      el.slot.classList.toggle('noen', !!sk && s.en < sk.energyCost);
    }
    // buffs
    const b: string[] = [];
    if (s.shield > 0) b.push('🛡 โล่');
    if (s.dr > 0) b.push(`🪨 ลดดาเมจ ${s.dr.toFixed(0)}s`);
    if (s.charges > 0) b.push(`⚡×${s.charges}`);
    if (s.stealth) b.push('🌑 ล่องหน');
    if (s.cheat) b.push('🔥 คืนชีพพร้อม');
    for (const [src, rem] of s.buffs) { const ps = findPowerSkill(src); b.push(`✨ ${ps?.skill.nameTh ?? src} ${rem.toFixed(0)}s`); }
    if (s.rootT > 0) b.push('💫 มึน');
    if (s.slowT > 0) b.push('🐌 ช้า');
    if (s.dodgeT > 0) b.push('✨ อมตะ');
    if (this.gm?.god) b.push('👑 God');
    if (this.gm?.invis) b.push('👻 ล่องหน');
    if (this.gm?.nocd) b.push('⚡ NoCD');
    if (s.auto) b.push(`🤖 AUTO (${s.autoKills})`);
    const bt = b.join('  ');
    if (this.buffs.textContent !== bt) this.buffs.textContent = bt;
    this.death.classList.toggle('hidden', !s.dead);
    this.autoBtn.classList.toggle('primary', s.auto);
    const stopBtn = this.panels.auto.querySelector('#auto-stop');
    if (stopBtn) { const t = `หยุดออโต้ (ฆ่าแล้ว ${s.autoKills})`; if (stopBtn.textContent !== t) stopBtn.textContent = t; }
    if (s.auto !== this.lastAuto) { this.lastAuto = s.auto; if (this.isOpen('auto')) this.renderAuto(); }
    if (this.isOpen('inv')) this.renderInv();
    if (this.isOpen('char')) this.renderChar();
    this.drawMinimap();
  }

  private drawMinimap() {
    const g = this.g;
    if (!g.map) return;
    if (!this.minimapImg) this.minimapImg = this.r.minimap(g);
    const ctx = this.minimap.getContext('2d')!;
    const W = this.minimap.width, H = this.minimap.height;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const span = 60; // tiles shown
    const k = W / span;
    const ox = g.ms.x - span / 2, oy = g.ms.y - span / 2;
    if (this.minimapImg) ctx.drawImage(this.minimapImg, ox, oy, span, span, 0, 0, W, H);
    const dot = (x: number, y: number, col: string, r = 2) => { ctx.fillStyle = col; ctx.fillRect(Math.round((x - ox) * k - r / 2), Math.round((y - oy) * k - r / 2), r, r); };
    for (const p of g.zone?.portals ?? []) dot(p.x + p.w / 2, p.y + p.h / 2, '#80e0ff', 5);
    for (const e of g.ents.values()) {
      if (e.meta.k === 2 && e.snaps.length && !e.dead) dot(e.x, e.y, e.meta.tier !== 'normal' ? '#ff9020' : '#ff4040', e.meta.tier !== 'normal' ? 4 : 2);
      else if (e.meta.k === 1) dot(e.x, e.y, '#40ff60', 3);
      else if (e.meta.k === 4) dot(e.x, e.y, '#ffe060', 3);
    }
    dot(g.ms.x, g.ms.y, '#ffffff', 4);
  }
}

function describeShape(s: SkillDef): string {
  const sh = s.shape;
  switch (sh.kind) {
    case 'arc': return `${sh.range} ช่อง (วงโค้ง ${sh.arcDeg}°)`;
    case 'circle': return `รัศมี ${sh.radius} ช่องรอบตัว`;
    case 'line': return `เส้นตรง ${sh.length} ช่อง`;
    case 'projectile': return `กระสุน ${sh.range} ช่อง${sh.pierce ? ' (ทะลุ)' : ''}`;
    default: return 'ตัวเอง';
  }
}
