import * as NW from './npcwin.js';
import { combatPower, weeklyObjectives, ACTIVITY_ORDER, QUESTS, FURNITURE, validatePlacement, applyContentPatch, ACTIVITIES, MATERIALS, CLASSES, DIFFICULTIES, DUNGEON_MODIFIERS, BLESSING_MAP, SKILL_MAP, ENEMIES, computeStats, xpToNext, type CharacterData } from '@astra/shared';
import { ClientGame } from '../game.js';
import { Renderer } from '../render.js';
import { Input, keyLabel } from '../input.js';
import { store, type Backend, type Conn } from '../net.js';
import { ct, getLang, t } from '../i18n.js';
import { clear, confirmDialog, h, toast } from './dom.js';
import { bindTip, hideTip, skillTooltip } from './tooltip.js';
import { currencyIcon, matIcon, skillIcon, uiIcon, tileIcon } from './icons.js';
import { drawChibi } from '../sprites.js';
import * as P from './panels.js';
import { passiveTreePanel } from './passive.js';
import { inventoryWindow } from './invwin.js';
import { craftingWindow } from './craftwin.js';
import * as MW from './metawin.js';
import { AutoPilot } from '../auto.js';
import { gmWindow } from './gmwin.js';
import { SKILL_MAP as SKM, BENEFITS, benefitReady, dayIndex, normalizeMeta, COSMETICS } from '@astra/shared';
import { modeBanner } from './screens.js';
import * as S from './social.js';
import { sound } from '../audio.js';
import { itemName, translateDom, trText } from '../l10n.js';

type PanelName = 'inventory' | 'skills' | 'passives' | 'character' | 'quests' | 'codex' | 'social' | 'guild' | 'auction' | 'ladder' | 'alchemist' | 'season' | 'hearth' | 'carpenter' | 'settings' | 'dungeon' | 'smith' | 'quartermaster' | 'trainer' | 'stash' | 'map' | 'crafting' | 'login' | 'shop' | 'benefits' | 'wish' | 'awaken' | 'wardrobe' | 'friends' | 'gm' | 'auto';

export class GameUI {
  game = new ClientGame();
  auto!: AutoPilot;
  renderer!: Renderer;
  input!: Input;
  conn!: Conn;
  private raf = 0;
  private last = performance.now();
  private hudT = 0;
  private sendT = 0;
  private lastInput = '';
  private panel: PanelName | null = null;
  private panelExtra: any = null;
  private rid = 0;
  private pingT = 0;
  private alive = true;
  settings = { quality: 'high', style: 'action' as 'action' | 'tab', numbers: true, uiScale: 1 };
  touch = matchMedia('(pointer: coarse)').matches;
  private touchAttack = false;
  private showAll = false;
  // DOM
  el: Record<string, HTMLElement> = {};

  constructor(private root: HTMLElement, private backend: Backend, private charId: string, private exit: () => void) {
    try { Object.assign(this.settings, JSON.parse(store.get('astra.settings') ?? '{}')); } catch { /* defaults */ }
    if (import.meta.env.VITE_OFFLINE) (window as any).__ui = this; // offline-only test hook
  }

  start() {
    clear(this.root);
    const canvas = h('canvas', { class: 'game-canvas', 'aria-label': 'Game view' });
    const E = this.el;
    const th = getLang() === 'th';
    E.wrap = h('div', { class: 'game', style: `--ui:${this.settings.uiScale}` },
      canvas,
      modeBanner(this.backend, true),
      E.status = h('div', { class: 'status-overlay', hidden: true }),
      // ── top-left: brand, mode pill, portrait card, party ──
      h('div', { class: 'hud-tl' },
        h('div', { class: 'brand-row' }, h('div', { class: 'brand' }, 'ASTRA', h('span', null, ':'), h('small', null, 'ECLIPSE CHRONICLES')), E.pill = h('div', { class: 'pill' })),
        h('div', { class: 'pcard' },
          h('div', { class: 'portrait' }, E.portrait = h('canvas', { width: 96, height: 96 }), E.plv = h('div', { class: 'p-emblem' })),
          h('div', { class: 'pinfo' },
            E.name = h('div', { class: 'p-name' }),
            E.hp = h('div', { class: 'gbar hp' }, h('i'), h('b'), h('label', null, 'HP'), h('span')),
            E.res = h('div', { class: 'gbar mp' }, h('i'), h('label', null, 'MP'), h('span')),
            E.sec = h('div', { class: 'gbar fp' }, h('i'), h('label', null, 'FP'), h('span')),
            h('div', { class: 'cp-row' }, uiIcon('crossed', 20, '#ffd36a'), E.cp = h('b', { class: 'cp' }), E.buffs = h('div', { class: 'buffs' })))),
        E.party = h('div', { class: 'party-box', hidden: true }),
        E.zone = h('div', { class: 'zone' })),
      // ── top-centre: public event, boss, target ──
      h('div', { class: 'hud-tc' }, E.wevent = h('div', { class: 'wevent', hidden: true }), E.boss = h('div', { class: 'boss-bar', hidden: true }), E.target = h('div', { class: 'target-frame', hidden: true })),
      // ── top-right: feature menu, location, minimap, tracker ──
      h('div', { class: 'hud-tr' },
        h('div', { class: 'tr-top' }, E.topmenu = h('nav', { class: 'topmenu', 'aria-label': 'Features' }),
          h('div', { class: 'loc-col' }, E.loc = h('div', { class: 'loc' }), h('div', { class: 'mini-wrap' }, E.mini = h('canvas', { class: 'minimap', width: 168, height: 168, onclick: () => this.toggle('map') }), h('i', { class: 'compass' }, 'N')))),
        E.tracker = h('div', { class: 'tracker' })),
      E.prompt = h('div', { class: 'interact-prompt', hidden: true }),
      E.dps = h('div', { class: 'dps', hidden: true }),
      // ── bottom: chat, hotbar, round menu, EXP + currencies ──
      E.chat = h('div', { class: 'chat' },
        E.chatTabs = h('div', { class: 'chat-tabs' }),
        E.chatLog = h('div', { class: 'chat-log', role: 'log', 'aria-live': 'polite' }),
        h('div', { class: 'chat-row' }, E.chatCh = h('select', { class: 'chat-ch', 'aria-label': 'Channel' }, h('option', { value: 'local' }, th ? 'โลก' : 'World'), h('option', { value: 'party' }, th ? 'ปาร์ตี้' : 'Party'), h('option', { value: 'guild' }, th ? 'กิลด์' : 'Guild')),
          E.chatIn = h('input', { class: 'chat-in', maxLength: 200, placeholder: th ? 'พิมพ์ข้อความ…' : 'Type a message…', 'aria-label': 'Chat' }),
          h('button', { class: 'chat-send', 'aria-label': 'Send', onclick: () => this.sendChat() }, '➤'))),
      E.bar = h('div', { class: 'hotbar' }),
      E.gmBtn = h('button', { class: 'gm-btn', hidden: true, title: 'GM Console', onclick: () => this.toggle('gm') }, uiIcon('crown', 26), h('span', null, 'GM')),
      E.autoBox = h('div', { class: 'auto-box' }, E.autoBtn = h('button', { class: 'auto-btn', onclick: () => { this.auto.setCombat(!this.auto.s.combat); this.renderAuto(); } }, 'AUTO'), h('button', { class: 'auto-gear', title: getLang() === 'th' ? 'ตั้งค่าออโต้' : 'Auto settings', onclick: () => this.toggle('auto') }, uiIcon('gear', 18)), E.autoSt = h('small', { class: 'auto-st' })),
      E.menu = h('nav', { class: 'rmenu', 'aria-label': 'Game menu' }),
      h('div', { class: 'xpline' }, E.xp = h('div', { class: 'xpbar' }, h('i'), h('span')), E.cur = h('div', { class: 'currencies' })),
      E.panel = h('aside', { class: 'panel', hidden: true, role: 'dialog' }),
      E.modal = h('div', { class: 'modal-host' }),
      E.joy = h('div', { class: 'joy', hidden: true }, E.knob = h('div', { class: 'knob' })),
      E.touchBtns = h('div', { class: 'touch-btns', hidden: !this.touch }),
    );
    E.goal = h('div', { class: 'goal', hidden: true });
    this.root.append(E.wrap);
    // every HUD block that can cover the view can be collapsed to a small tab (remembered per browser)
    const th0 = getLang() === 'th';
    this.collapsible(E.tracker!, 'tracker', 'scroll', th0 ? 'เควสต์' : 'Quests');
    this.collapsible(E.party!, 'party', 'people', th0 ? 'ปาร์ตี้' : 'Party');
    this.collapsible(E.chat!, 'chat', 'chat', th0 ? 'แชท' : 'Chat');
    this.collapsible(E.mini!.parentElement!.parentElement!, 'map', 'mapicon', th0 ? 'แผนที่' : 'Map');
    this.collapsible(E.topmenu!, 'features', 'grid', th0 ? 'ฟีเจอร์' : 'Features');
    this.collapsible(E.zone!, 'zone', 'sigil', th0 ? 'ข้อมูลพื้นที่' : 'Zone');
    E.wrap.append(h('button', { class: 'hud-eye', title: th0 ? 'ซ่อน/แสดง HUD ทั้งหมด (F9)' : 'Hide / show the whole HUD (F9)', onclick: () => this.toggleHud() }, uiIcon('eye', 22, '#e8e0ff')));
    addEventListener('keydown', this.onHudKey);
    this.renderer = new Renderer(canvas, this.game);
    this.auto = new AutoPilot(this.game, (m) => this.send(m));
    this.input = new Input(canvas);
    this.input.onAction = (a) => this.onAction(a);
    if (this.touch) this.input.attachTouch(E.joy, E.knob);
    this.buildMenu();
    this.buildChatTabs();
    this.buildTouch();
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.renderer.cam.zoom = Math.max(0.6, Math.min(1.7, this.renderer.cam.zoom * (e.deltaY > 0 ? 0.92 : 1.08))); }, { passive: false });
    (E.chatIn as HTMLInputElement).addEventListener('keydown', (e) => { if (e.key === 'Enter') { this.sendChat(); (E.chatIn as HTMLInputElement).blur(); } if (e.key === 'Escape') (E.chatIn as HTMLInputElement).blur(); e.stopPropagation(); });
    addEventListener('resize', this.onResize);
    this.onResize();
    this.applySettings();
    this.status(t('connecting'));
    this.conn = this.backend.connect(this.charId, { onMessage: (m) => this.onMessage(m), onStatus: (s) => { if (s === 'reconnecting') this.status(t('reconnecting')); if (s === 'closed' && this.alive) { this.status('Disconnected.'); setTimeout(() => this.leave(), 1500); } } });
    this.raf = requestAnimationFrame(this.frame);
  }

  private onResize = () => { this.renderer.resize(); };
  private onHudKey = (e: KeyboardEvent) => { if (e.code === 'F9') { e.preventDefault(); this.toggleHud(); } };
  private hudState: Record<string, boolean> = (() => { try { return JSON.parse(store.get('astra.hud') ?? '{}'); } catch { return {}; } })();
  private toggleHud() { this.el.wrap!.classList.toggle('hud-hidden'); }
  /** Adds a collapse button to a HUD block; collapsed blocks show a small tab with an icon and a label. */
  private collapsible(el: HTMLElement, key: string, icon: string, label: string) {
    el.classList.add('collapsible');
    const tab = h('button', { class: 'cl-tab', title: label, onclick: () => set(false) }, uiIcon(icon, 18, '#e8e0ff'), h('span', null, label));
    const btn = h('button', { class: 'cl-btn', title: getLang() === 'th' ? 'ย่อ' : 'Collapse', onclick: (e: Event) => { e.stopPropagation(); set(true); } }, '–');
    const set = (v: boolean) => { this.hudState[key] = v; store.set('astra.hud', JSON.stringify(this.hudState)); el.classList.toggle('collapsed', v); };
    el.append(btn, tab);
    el.classList.toggle('collapsed', !!this.hudState[key]);
    // keep the controls when the block re-renders its content
    new MutationObserver(() => { if (!el.contains(btn)) el.append(btn); if (!el.contains(tab)) el.append(tab); }).observe(el, { childList: true });
  }

  destroy() {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    removeEventListener('resize', this.onResize);
    removeEventListener('keydown', this.onHudKey);
    this.input.enabled = false;
    this.conn?.close();
    sound.ambience(null);
    hideTip();
  }
  private leave() { this.destroy(); this.exit(); }

  send(m: any) { if (m.t !== 'input') m.rid = `${Date.now().toString(36)}-${this.rid++}`; this.conn.send(m); }

  private status(msg: string | null) { const s = this.el.status!; s.hidden = !msg; s.textContent = msg ?? ''; }

  applySettings() {
    store.set('astra.settings', JSON.stringify(this.settings));
    this.game.quality = this.settings.quality as 'low' | 'medium' | 'high';
    this.game.showNumbers = this.settings.numbers;
    this.el.wrap!.style.setProperty('--ui', String(this.settings.uiScale));
    this.renderer?.resize();
    this.buildMenu();
    if (this.panel) this.renderPanel();
  }

  // ─────────── Network messages ───────────
  private onMessage(m: any) {
    const g = this.game;
    switch (m.t) {
      case 'content': applyContentPatch(m.patch); this.buildBar(); if (this.panel) this.renderPanel(); break;
      case 'welcome': applyContentPatch(m.content ?? null); sound.ambience(m.room.kind === 'town' ? 'town' : m.room.id === 'highlands' ? 'ash' : m.room.kind === 'field' ? 'field' : m.room.mode === 'raid' ? 'raid' : 'dungeon'); g.welcome(m); this.status(null); this.buildBar(); this.updateZone(); this.closePanel(); this.renderWorldEvent(); if (m.mode === 'offline' && !this.offlineNoted) { this.offlineNoted = true; this.chatLine('system', 'Offline mode: this session is simulated locally in your browser.'); } this.chatLine('system', `Entered ${m.room.id.startsWith('house:') ? 'a Hearth' : m.room.kind === 'town' ? 'Lumenhold' : m.room.id === 'highlands' ? 'the Ashen Highlands (open world, levels 10-20)' : m.room.id === 'wastes' ? 'the Starfall Wastes (open world, levels 20-30)' : m.room.kind === 'field' ? 'Duskmeadow (open world, levels 2-9)' : 'an instance'}.`); break;
      case 'snap': g.applySnap(m); break;
      case 'ev': g.events(m.list); for (const ev of m.list) if (ev.t === 'msg') this.chatLine('system', ev.text); else if (ev.t === 'pickup' && ev.item) toast(`Picked up ${itemName(ev.item)}`, 'good'); break;
      case 'char': g.char = m.char; g.account = m.account; this.buildBar(); if (!this.tut?.cur) this.renderGoal(); if (this.panel && this.panel !== 'map') this.renderPanel(); if (this.trade) this.showModal(S.tradeModal(g.char!, this.trade, (x) => this.send(x))); break;
      case 'err': if (m.fatal) { toast(m.msg, 'error'); this.status(m.msg); setTimeout(() => this.leave(), 2500); } else this.flashErr(m.msg); break;
      case 'toast': toast(m.msg); this.chatLine('system', m.msg); break;
      case 'chat': this.chatLine(m.ch, `${m.ch === 'whisper' && m.to ? `→ ${m.to}` : m.from}: ${m.text}`); break;
      case 'party': g.party = m; this.renderParty(); if (this.panel === 'social') this.renderPanel(); break;
      case 'party_invite': void confirmDialog('Party invite', `${m.from} invited you to a party.`, t('accept'), t('decline')).then((ok) => { if (ok) this.send({ t: 'party_accept', id: m.id }); }); break;
      case 'open': this.panelExtra = m; this.openPanel(m.what === 'dungeon' ? 'dungeon' : m.what); break;
      case 'pf': this.pfEntries = m.entries; if (this.panel === 'social') this.renderPanel(); break;
      case 'party_request': void confirmDialog('Join request', `${m.from} (level ${m.level}) wants to join your party.`, t('invite'), t('decline')).then((ok) => { if (ok) this.send({ t: 'party_invite', name: m.from }); }); break;
      case 'trade_request': void confirmDialog('Trade request', `${m.from} wants to trade with you.`, t('accept'), t('decline')).then((ok) => this.send({ t: 'trade_respond', id: m.id, accept: ok })); break;
      case 'trade': if (m.closed) { this.trade = null; this.closeModal(); } else { this.trade = m; this.showModal(S.tradeModal(g.char!, m, (x) => this.send(x))); } break;
      case 'ah_results': this.ah.results = m; if (this.panel === 'auction') this.renderPanel(); break;
      case 'ah_mine': this.ah.mine = m.rows; if (this.panel === 'auction') this.renderPanel(); break;
      case 'guild': this.guildData = m; if (this.panel === 'guild') this.renderPanel(); break;
      case 'guild_invite': void confirmDialog('Guild invite', `${m.from} invited you to ‹${m.tag}› ${m.name}.`, t('accept'), t('decline')).then((ok) => { if (ok) this.send({ t: 'guild_accept', id: m.id }); }); break;
      case 'season': this.seasonData = m; if (this.panel === 'season') this.renderPanel(); break;
      case 'fish': if (m.state === 'cast') this.status('Fishing… press Interact (E) the moment a fish bites'); else if (m.state === 'bite') { this.status('!!! A fish is biting — press E now !!!'); sound.warn(); } else this.status(null); break;
      case 'map_update': if (g.map) { g.map = m.map; } this.stopPlacing(); if (this.panel === 'hearth') this.renderPanel(); break;
      case 'house': this.houseData = m; this.updateZone(); if (m.mine && this.panel !== 'hearth' && m.house && g.room?.id?.startsWith('house:')) this.openPanel('hearth'); else if (this.panel === 'hearth') this.renderPanel(); break;
      case 'tutorial': this.tut = m; this.renderGoal(); break;
      case 'tutorial_done': toast(getLang() === 'th' ? `สำเร็จ! +${m.gold} ทอง` : `Tutorial step done! +${m.gold} gold`, 'good'); sound.loot('rare'); break;
      case 'mats': toast('+ ' + Object.entries(m.got).map(([k, v]) => `${v} ${MATERIALS[k]?.name ?? k}`).join(', '), 'good'); break;
      case 'world_event': g.worldEvent = m; this.renderWorldEvent(); break;
      case 'ladder': this.ladderData = m.boards; if (this.panel === 'ladder') this.renderPanel(); break;
      case 'activity': if (g.room) { (g.room as any).wave = m.wave; this.updateZone(); } break;
      case 'choice': this.showModal(P.choiceModal(m.kind, m.options, (x) => this.send(x), () => this.closeModal())); break;
      case 'run': g.blessings = m.blessings; this.updateZone(); break;
      case 'run_end': this.showModal(P.runEndModal(m, () => this.closeModal())); break;
      case 'it_used': g.usedIts.add(m.id); break;
      case 'achievement': toast(`★ Achievement: ${m.name}`, 'good'); break;
      case 'hc_dead': this.showModal(h('div', { class: 'modal-wrap' }, h('div', { class: 'modal hc-dead' }, h('h2', null, `☠ ${m.name} ${t('hcDead')}`), h('p', null, `Level ${m.level}. Their legend is recorded on the Hardcore ladder.`), h('button', { class: 'btn', onclick: () => this.leave() }, t('close'))))); break;
      case 'pong': g.rtt = performance.now() - m.c; break;
      case 'afk': this.showAfk(m.pending); break;
      case 'gm': this.gmOn = !!m.on; if (this.gmOn) this.openPanel('gm'); break;
      case 'friends': this.friendsData = m; if (this.panel === 'friends') this.renderPanel(); break;
      case 'friend_request': void confirmDialog(getLang() === 'th' ? 'คำขอเป็นเพื่อน' : 'Friend request', `${m.from} ${getLang() === 'th' ? 'ขอเป็นเพื่อนกับคุณ' : 'wants to be your friend.'}`, t('accept'), t('decline')).then((ok) => { if (ok) this.send({ t: 'friend_accept', id: m.id }); }); break;
      case 'wish_result': this.lastWish = m.prizes; sound.loot(m.prizes.some((p: any) => p.r === 'SSR') ? 'legendary' : 'rare'); this.openPanel('wish'); break;
      default: break;
    }
  }
  private offlineNoted = false;
  private pfEntries: any[] = [];
  private trade: any = null;
  private ah: S.AhState = { results: null, mine: [], q: {}, tab: 'browse' };
  private guildData: any = null;
  private ladderData: any = null;
  private seasonData: any = null;
  private tut: any = null;
  /** Tutorial card while learning; afterwards a "next goal" card from the quest log. */
  private renderGoal() { this.renderTracker(); }
  private houseData: any = null;
  private placing: string | null = null;
  private startPlacing(id: string) { this.placing = id; this.closePanel(); toast('Click a spot to place · right-click or Esc to cancel'); }
  private stopPlacing() { this.placing = null; this.renderer.ghost = null; }
  private renderWorldEvent() {
    const el = this.el.wevent!;
    const ev = this.game.room?.kind === 'field' ? this.game.worldEvent : null;
    const b = S.worldEventBanner(ev);
    el.hidden = !b;
    clear(el);
    if (b) { el.append(b); el.classList.toggle('active', !!ev?.active); }
  }

  private errT = 0;
  private flashErr(msg: string) {
    const now = performance.now();
    if (msg === 'Busy' || msg === 'On cooldown') return; // shown on the skill bar already
    if (now - this.errT < 400) return; // avoid spamming the same error
    this.errT = now;
    toast(msg, 'error');
  }

  // ─────────── Frame loop ───────────
  private frame = (now: number) => {
    if (!this.alive) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.handleInput(dt);
    this.game.update(dt);
    this.renderer.draw(dt);
    this.hudT -= dt;
    if (this.hudT <= 0) { this.hudT = 0.1; this.updateHud(); }
    this.pingT -= dt;
    if (this.pingT <= 0) { this.pingT = 3; this.conn.send({ t: 'ping', c: performance.now() }); }
    this.raf = requestAnimationFrame(this.frame);
  };

  private aim(): [number, number] {
    const g = this.game;
    const tgt = g.self?.target ? g.ents.get(g.self.target) : null;
    if (tgt && (this.settings.style === 'tab' || this.touch)) return [tgt.rx, tgt.ry];
    if (this.touch) {
      const me = g.me();
      const near = this.nearestEnemy(600);
      if (near) return [near.rx, near.ry];
      return me ? [me.rx + Math.cos(me.f) * 100, me.ry + Math.sin(me.f) * 100] : [0, 0];
    }
    return this.renderer.screenToWorld(this.input.mouse.x, this.input.mouse.y);
  }

  private handleInput(dt: number) {
    const g = this.game;
    let [mx, my] = this.input.enabled && document.activeElement !== this.el.chatIn ? this.input.moveVector() : [0, 0];
    if (mx || my || this.input.mouse.left) this.auto.pause();
    const ov = this.auto.update(dt);
    if (ov) { mx = ov.mx; my = ov.my; }
    g.input.mx = mx; g.input.my = my;
    let [ax, ay] = this.aim();
    if (ov) { ax = ov.ax; ay = ov.ay; }
    // hover detection for targeting
    const [wx, wy] = this.renderer.screenToWorld(this.input.mouse.x, this.input.mouse.y);
    let hover = 0;
    for (const e of g.ents.values()) if (e.kind === 1 && Math.hypot(e.rx - wx, e.ry - 14 - wy) < 26) hover = e.id;
    this.renderer.hoverId = hover;
    if (this.placing && g.map) {
      const f = FURNITURE[this.placing]!;
      const gx = Math.floor(wx / 32 - f.w / 2 + 0.5), gy = Math.floor(wy / 32 - f.h / 2 + 0.5);
      const house = this.houseData?.house;
      const ok = !!house && !validatePlacement(house, this.placing, gx, gy);
      this.renderer.ghost = { x: gx, y: gy, w: f.w, h: f.h, ok };
    }
    const overUI = this.panel !== null && this.input.mouse.x > innerWidth - (this.el.panel!.offsetWidth || 0);
    const atk = (this.input.mouse.left && !overUI && !this.touch) || this.touchAttack || !!ov?.atk;
    this.sendT -= dt;
    const key = `${mx.toFixed(2)},${my.toFixed(2)},${atk}`;
    if (this.sendT <= 0 || key !== this.lastInput) {
      this.sendT = 0.05;
      this.lastInput = key;
      this.conn.send({ t: 'input', mx, my, ax: Math.round(ax), ay: Math.round(ay), atk, q: ++g.seq });
    }
  }

  private nearestEnemy(range: number, exclude = 0) {
    const g = this.game; const me = g.me();
    if (!me) return null;
    let best = null, bd = range;
    for (const e of g.ents.values()) { if (e.kind !== 1 || e.dead || e.id === exclude) continue; const d = Math.hypot(e.rx - me.rx, e.ry - me.ry); if (d < bd) { bd = d; best = e; } }
    return best;
  }

  private cast(kind: 'a' | 'u', slot: number) {
    this.auto.pause(1.5);
    const [ax, ay] = this.aim();
    const g = this.game;
    const tid = this.settings.style === 'tab' || this.touch ? g.self?.target || this.nearestEnemy(700)?.id || 0 : this.renderer.hoverId || 0;
    this.send({ t: 'cast', k: kind, s: slot, ax: Math.round(ax), ay: Math.round(ay), tid });
  }

  private onAction(a: string) {
    if (document.activeElement === this.el.chatIn) return;
    const g = this.game;
    if (/^a[1-8]$/.test(a)) return this.cast('a', Number(a[1]) - 1);
    if (/^u[1-4]$/.test(a)) return this.cast('u', Number(a[1]) - 1);
    switch (a) {
      case 'dodge': { sound.dodge(); const [mx, my] = this.input.moveVector(); const me = g.me(); const [ax, ay] = this.aim(); this.send({ t: 'dodge', dx: mx || (me ? ax - me.rx : 1), dy: my || (me ? ay - me.ry : 0) }); break; }
      case 'potion': sound.potion(); this.send({ t: 'potion' }); break;
      case 'interact': this.send({ t: 'interact' }); break;
      case 'pickup': this.pickupNearest(); break;
      case 'target': { const cur = g.self?.target ?? 0; const n = this.nearestEnemy(700, cur) ?? this.nearestEnemy(700); if (n) this.send({ t: 'target', id: n.id }); break; }
      case 'rclick': case 'click': {
        if (this.placing && a === 'rclick') { this.stopPlacing(); break; }
        if (this.placing && a === 'click') { const gh = this.renderer.ghost; if (gh) this.send({ t: 'house_place', id: this.placing, x: gh.x, y: gh.y }); break; }
        if (this.renderer.hoverId) this.send({ t: 'target', id: this.renderer.hoverId });
        // click on a drop picks it up
        const [wx, wy] = this.renderer.screenToWorld(this.input.mouse.x, this.input.mouse.y);
        const d = g.drops.find((d) => Math.hypot(d.x - wx, d.y - wy) < 28);
        if (d) this.send({ t: 'pickup', id: d.id });
        break;
      }
      case 'chat': (this.el.chatIn as HTMLInputElement).focus(); break;
      case 'escape': if (this.placing) this.stopPlacing(); else if (this.trade) this.send({ t: 'trade_cancel' }); else if (this.el.modal!.firstChild) this.closeModal(); else if (this.panel) this.closePanel(); else this.openPanel('settings'); break;
      case 'inventory': case 'skills': case 'passives': case 'character': case 'quests': case 'codex': case 'social': case 'guild': case 'ladder': case 'season': case 'hearth': case 'map': this.toggle(a as PanelName); break;
      default: break;
    }
  }

  private pickupNearest() {
    const me = this.game.me();
    if (!me) return;
    const d = [...this.game.drops].filter((d) => d.rarity !== 'gold').sort((a, b) => Math.hypot(a.x - me.rx, a.y - me.ry) - Math.hypot(b.x - me.rx, b.y - me.ry))[0];
    if (d) this.send({ t: 'pickup', id: d.id });
  }

  // ─────────── HUD ───────────
  private buildMenu() {
    const th = getLang() === 'th';
    // feature menu (top-right): only entries backed by a real system
    const top: Array<[string, string, string, () => void, string]> = [
      ['events', th ? 'อีเวนต์' : 'Events', '#ff6a8a', () => this.toggle('season'), ''],
      ['calendar', th ? 'รางวัลล็อกอิน' : 'Login Rewards', '#ff6a8a', () => this.toggle('login'), 'login'],
      ['pass', th ? 'ซีซันพาส' : 'Battle Pass', '#9b6cff', () => this.toggle('season'), ''],
      ['shop', th ? 'ร้านค้า' : 'Shop', '', () => this.toggle('shop'), ''],
      ['gacha', th ? 'ขอพร' : 'Wish', '#b36cff', () => this.toggle('wish'), 'wish'],
      ['gift', th ? 'สิทธิประโยชน์' : 'Benefits', '#ff4f6a', () => this.toggle('benefits'), 'benefits'],
    ];
    clear(this.el.topmenu!).append(...top.map(([ic, label, col, fn, dot]) => h('button', { class: 'tm-btn', onclick: fn, title: label, 'data-dot': dot }, uiIcon(ic, 34, col || '#9b6cff'), h('i', { class: 'dot-red', hidden: true }), h('span', null, label))));
    const right: Array<[string, string, string, () => void, string]> = [
      ['people', th ? 'สังคม' : 'Social', '#ffb36a', () => this.toggle('social'), 'social'],
      ['crest', th ? 'กิลด์' : 'Guild', '#3a5ab0', () => this.toggle('guild'), 'guild'],
      ['mapicon', th ? 'แผนที่' : 'Map', '', () => this.toggle('map'), 'map'],
      ['anvil', th ? 'คราฟต์' : 'Crafting', '', () => this.toggle('crafting'), ''],
      ['gear', th ? 'ตั้งค่า' : 'Settings', '', () => this.toggle('settings'), ''],
    ];
    clear(this.el.menu!).append(...right.map(([ic, label, col, fn, bind]) => h('button', { class: 'rm-btn', onclick: fn, title: label + (bind ? ` (${keyLabel(this.input?.binds[bind] ?? '')})` : '') }, h('div', { class: 'rm-ring' }, uiIcon(ic, 38, col || '#9b6cff')), h('span', null, label))));
  }
  private buildChatTabs() {
    const th = getLang() === 'th';
    const tabs: Array<[string, string]> = [['all', th ? 'ทั้งหมด' : 'All'], ['local', th ? 'โลก' : 'World'], ['guild', th ? 'กิลด์' : 'Guild'], ['party', th ? 'ปาร์ตี้' : 'Party'], ['system', th ? 'ระบบ' : 'System']];
    clear(this.el.chatTabs!).append(...tabs.map(([id, label]) => h('button', { class: 'ct' + (this.chatTab === id ? ' on' : ''), onclick: () => { this.chatTab = id; this.buildChatTabs(); this.filterChat(); } }, label)));
  }
  private chatTab = 'all';
  private filterChat() { for (const el of Array.from(this.el.chatLog!.children) as HTMLElement[]) el.hidden = this.chatTab !== 'all' && el.dataset.ch !== this.chatTab && !(this.chatTab === 'local' && el.dataset.ch === 'whisper'); this.el.chatLog!.scrollTop = this.el.chatLog!.scrollHeight; }
  private menuGrid() {
    const th = getLang() === 'th';
    const items: Array<[PanelName, string, string, string]> = [['inventory', 'bag', t('inventory'), 'inventory'], ['character', 'person', t('character'), 'character'], ['skills', 'book', t('skills'), 'skills'], ['passives', 'tree', t('passives'), 'passives'], ['quests', 'scroll', t('quests'), 'quests'], ['codex', 'book', t('codex'), 'codex'], ['social', 'people', t('social'), 'social'], ['guild', 'crest', 'Guild', 'guild'], ['ladder', 'trophy', th ? 'อันดับ' : 'Leaderboards', 'ladder'], ['season', 'pass', th ? 'ซีซัน' : 'Season', 'season'], ['crafting', 'anvil', th ? 'คราฟต์' : 'Crafting', ''], ['hearth', 'house', th ? 'บ้าน' : 'Hearth', 'hearth'], ['map', 'mapicon', t('map'), 'map'], ['awaken', 'awaken', th ? 'ตื่นรู้และตราสัญลักษณ์' : 'Awakening & Emblems', ''], ['wardrobe', 'costume', th ? 'ตู้เสื้อผ้า' : 'Wardrobe', ''], ['shop', 'shop', th ? 'ร้านค้า' : 'Shop', ''], ['wish', 'gacha', th ? 'ขอพร' : 'Wish', ''], ['login', 'calendar', th ? 'รางวัลล็อกอิน' : 'Login Rewards', ''], ['benefits', 'gift', th ? 'สิทธิประโยชน์' : 'Benefits', ''], ['settings', 'gear', t('settings'), ''], ...(this.gmOn ? [['gm', 'crown', 'GM', ''] as [PanelName, string, string, string]] : [])];
    const close = () => this.closeModal();
    this.showModal(h('div', { class: 'modal-wrap', onclick: (e: Event) => { if (e.target === e.currentTarget) close(); } }, h('div', { class: 'modal menu-grid' }, h('header', { class: 'row between' }, h('h2', null, th ? 'เมนู' : 'Menu'), h('button', { class: 'btn ghost tiny', onclick: close }, '✕')),
      h('div', { class: 'mg' }, ...items.map(([p, ic, label, bind]) => h('button', { class: 'mg-btn', onclick: () => { close(); this.openPanel(p); } }, uiIcon(ic, 40), h('span', null, label), bind ? h('kbd', null, keyLabel(this.input.binds[bind] ?? '')) : null))))));
  }

  private buildBar() {
    const g = this.game; const ch = g.char;
    if (!ch) return;
    const th = getLang() === 'th';
    const bar = clear(this.el.bar!);
    const keys = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'], ukeys = ['u1', 'u2', 'u3', 'u4'];
    const mk = (kind: 'a' | 'u', i: number, id: string | null) => {
      const sk = id ? SKILL_MAP[id] : null;
      const n = kind === 'a' ? i + 1 : i + 9;
      const el = h('button', { class: 'slot' + (kind === 'u' ? ' ult' : '') + (sk ? '' : ' empty'), 'data-k': kind, 'data-i': i, 'aria-label': sk?.name ?? 'empty slot' }, sk ? skillIcon(sk, 46) : null, h('div', { class: 'cd' }), h('kbd', null, keyLabel(this.input.binds[(kind === 'a' ? keys : ukeys)[i]!] ?? '')), h('em', { class: 'num' }, String(n)));
      if (sk) bindTip(el, () => skillTooltip(sk, ch));
      el.onclick = () => (sk ? this.cast(kind, i) : this.openPanel('skills'));
      return el;
    };
    const util = (n: number, ic: string, col: string, label: string, bind: string, fn: () => void, extraCls = '') => {
      const el = h('button', { class: 'slot util ' + extraCls, 'aria-label': label, onclick: fn }, uiIcon(ic, 40, col), h('div', { class: 'cd' }), bind ? h('kbd', null, keyLabel(this.input.binds[bind] ?? bind)) : null, h('em', { class: 'num' }, String(n)), h('b', { class: 'qty' }));
      bindTip(el, () => h('div', { class: 'tip' }, h('div', { class: 'tip-title' }, label), bind ? h('small', null, `${th ? 'ปุ่มลัด' : 'Key'}: ${keyLabel(this.input.binds[bind] ?? bind)}`) : null));
      return el;
    };
    const group = (title: string, ...els: HTMLElement[]) => h('div', { class: 'hb-group' }, h('div', { class: 'hb-title' }, title), h('div', { class: 'hb-slots' }, ...els));
    bar.append(
      group(th ? 'สกิลแอคทีฟ (1~8)' : 'Active Skills (1~8)', ...ch.loadout.active.map((id, i) => mk('a', i, id))),
      group(th ? 'สกิลอัลติเมต (9~12)' : 'Ultimate Skills (9~12)', ...ch.loadout.ultimate.map((id, i) => mk('u', i, id))),
      group(th ? 'ไอเทม / ยูทิลิตี้ (13~20)' : 'Items / Utilities (13~20)',
        this.el.pot = util(13, 'potion', '#ff4a5a', t('potion'), 'potion', () => { sound.potion(); this.send({ t: 'potion' }); }),
        this.el.dodgeSlot = util(14, 'dodge', '#8fd8ff', t('dodge'), 'dodge', () => this.onAction('dodge')),
        util(15, 'chestbox', '', th ? 'เก็บของใกล้ตัว' : 'Pick up nearest item', 'pickup', () => this.pickupNearest()),
        this.el.mountSlot = util(16, 'mount', '#e8eaff', th ? 'ขึ้น/ลงพาหนะ (นอกการต่อสู้)' : 'Mount / dismount (out of combat)', '', () => this.send({ t: 'mount_toggle' })),
        util(17, 'chat', '#9b6cff', th ? 'แชท' : 'Chat', '', () => (this.el.chatIn as HTMLInputElement).focus()),
        util(18, 'bag', '', t('inventory'), 'inventory', () => this.toggle('inventory')),
        util(19, 'scroll', '', t('quests'), 'quests', () => this.toggle('quests')),
        util(20, 'grid', '#9b6cff', th ? 'เมนูทั้งหมด' : 'All menus', '', () => this.menuGrid())));
  }

  private buildTouch() {
    if (!this.touch) return;
    const tb = clear(this.el.touchBtns!);
    const btn = (label: string, cls: string, down: () => void, up?: () => void) => { const b = h('button', { class: 'tbtn ' + cls }, label); b.addEventListener('touchstart', (e) => { e.preventDefault(); down(); }, { passive: false }); b.addEventListener('touchend', (e) => { e.preventDefault(); up?.(); }); return b; };
    tb.append(
      btn('⚔', 'big', () => { this.touchAttack = true; }, () => { this.touchAttack = false; }),
      btn('⤴', '', () => this.onAction('dodge')), btn('♥', '', () => this.onAction('potion')), btn('E', '', () => this.onAction('interact')), btn('◎', '', () => this.onAction('target')),
      btn('⋯', '', () => { this.showAll = !this.showAll; this.el.bar!.classList.toggle('show-all', this.showAll); }));
  }

  private updateHud() {
    const g = this.game; const ch = g.char; const me = g.me(); const s = g.self;
    if (!ch || !me || !s) return;
    const d = CLASSES[ch.cls];
    const E = this.el;
    const th = getLang() === 'th';
    if (this.nameKey !== `${ch.level}|${ch.name}|${g.account?.achievements.length}|${normalizeMeta(g.account?.meta).login.total}`) { this.nameKey = `${ch.level}|${ch.name}|${g.account?.achievements.length}|${normalizeMeta(g.account?.meta).login.total}`; E.name!.replaceChildren(h('em', null, `Lv.${ch.level}`), ` ${ch.name}`, ch.hardcore ? h('span', { class: 'hc-badge' }, 'HC') : '', g.account ? MW.renownBadge(g.account) : ''); }
    const hpPct = me.hp / me.mhp;
    (E.hp!.children[0] as HTMLElement).style.width = `${hpPct * 100}%`;
    (E.hp!.children[1] as HTMLElement).style.width = `${Math.min(1, me.barrier / me.mhp) * 100}%`;
    E.hp!.children[3]!.textContent = `${me.hp.toLocaleString()} / ${me.mhp.toLocaleString()}${me.barrier ? ` (+${me.barrier})` : ''}`;
    E.hp!.classList.toggle('low', hpPct < 0.3);
    (E.res!.children[0] as HTMLElement).style.width = `${(s.res / s.maxRes) * 100}%`;
    E.res!.children[1]!.textContent = d.resource.name.slice(0, 2).toUpperCase();
    E.res!.title = d.resource.name;
    E.res!.style.setProperty('--bc', d.resource.color);
    E.res!.children[2]!.textContent = `${Math.floor(s.res)} / ${s.maxRes}`;
    if (d.secondary) { E.sec!.hidden = false; (E.sec!.children[0] as HTMLElement).style.width = `${(s.sec / Math.max(1, s.secMax)) * 100}%`; E.sec!.children[1]!.textContent = d.secondary.name.slice(0, 2).toUpperCase(); E.sec!.title = d.secondary.name; E.sec!.children[2]!.textContent = `${Math.floor(s.sec)} / ${s.secMax}`; } else E.sec!.hidden = true;
    const st0 = this.statsCache(ch);
    E.cp!.textContent = `CP ${combatPower(st0).toLocaleString()}`;
    clear(E.buffs!).append(...s.buffs.slice(0, 6).map(([n, tt]: [string, number]) => { const b = h('span', { class: 'buff' }, uiIcon('awaken', 18, '#9b6cff'), h('i', null, String(Math.ceil(tt)))); bindTip(b, () => h('div', { class: 'tip' }, `${n} · ${Math.ceil(tt)}s`)); return b; }),
      ...g.blessings.map((b) => { const el = h('span', { class: 'buff run' }, uiIcon('star', 18, '#ffd36a')); bindTip(el, () => h('div', { class: 'tip' }, h('b', null, BLESSING_MAP[b]?.name ?? b), h('p', null, BLESSING_MAP[b]?.desc ?? ''))); return el; }));
    const need = xpToNext(ch.level);
    (E.xp!.children[0] as HTMLElement).style.width = `${(ch.xp / need) * 100}%`;
    E.xp!.children[1]!.textContent = `EXP ${((ch.xp / need) * 100).toFixed(2)}% (${ch.xp.toLocaleString()} / ${need.toLocaleString()})`;
    if (this.portraitKey !== ch.cls) this.drawPortrait();
    const shards = g.account?.season?.shards ?? 0;
    const curKey = `${ch.gold}|${ch.dust}|${shards}`;
    if (this.curKey !== curKey) { this.curKey = curKey; clear(E.cur!).append(...([['gold', ch.gold, th ? 'ทอง' : 'Gold'], ['dust', ch.dust, th ? 'ผงดวงดาว' : 'Astral Dust'], ['shard', shards, th ? 'เศษอัมเบอร์ (ซีซัน)' : 'Ember Shards (season)']] as const).map(([k, v, label]) => { const el = h('div', { class: 'cur' }, currencyIcon(k, 24), h('b', null, v.toLocaleString())); bindTip(el, () => h('div', { class: 'tip' }, label)); return el; })); }
    this.trackerT -= 0.1;
    this.renderAuto();
    if (this.trackerT <= 0) {
      this.trackerT = 1; this.renderTracker(); this.renderParty(); this.renderPill();
      const acc = g.account, meta = normalizeMeta(acc?.meta);
      const dots: Record<string, boolean> = { login: meta.login.last !== dayIndex(Date.now()), wish: meta.wish.tokens > 0, benefits: !!acc && BENEFITS.some((b) => !ch.benefits?.includes(b.id) && benefitReady(acc, ch, b)) };
      for (const b of Array.from(E.topmenu!.querySelectorAll<HTMLElement>('.tm-btn'))) { const d = b.dataset.dot; (b.querySelector('.dot-red') as HTMLElement).hidden = !(d && dots[d]); }
      const fr = meta.cosmetics.frame ? COSMETICS[meta.cosmetics.frame]?.color : null;
      (E.portrait as HTMLElement).style.borderColor = fr ?? '';
      (E.portrait as HTMLElement).style.boxShadow = fr ? `0 0 0 2px #000, 0 0 18px ${fr}` : '';
      if (E.mountSlot) E.mountSlot.classList.toggle('on', !!s.mount);
    }
    // skill cooldowns + affordability
    const st = st0;
    for (const el of Array.from(E.bar!.querySelectorAll<HTMLElement>('.slot[data-k]'))) {
      const kind = el.dataset.k, i = Number(el.dataset.i);
      const id = (kind === 'a' ? ch.loadout.active : ch.loadout.ultimate)[i];
      const cd = (kind === 'a' ? s.cdA : s.cdU)?.[i] ?? 0;
      const sk = id ? SKILL_MAP[id] : null;
      const total = sk ? sk.cooldown * (1 - st.cdr) : 1;
      const cdEl = el.querySelector<HTMLElement>('.cd')!;
      cdEl.style.setProperty('--p', String(Math.min(1, cd / Math.max(0.1, total))));
      cdEl.textContent = cd > 0 ? (cd >= 1 ? String(Math.ceil(cd)) : cd.toFixed(1)) : '';
      const cost = sk ? Math.round(sk.cost * (1 + (st.m.costPct ?? 0) / 100)) : 0;
      el.classList.toggle('nores', !!sk && (s.res < cost || (sk.requireSecondary ? s.sec < sk.requireSecondary : false)));
    }
    if (E.pot) { const c = E.pot.querySelector<HTMLElement>('.cd')!; c.style.setProperty('--p', String(s.potCd / 6)); c.textContent = s.potCd > 0 ? String(Math.ceil(s.potCd)) : ''; E.pot.querySelector('.qty')!.textContent = String(s.potions); }
    if (E.dodgeSlot) { const c = E.dodgeSlot.querySelector<HTMLElement>('.cd')!; c.style.setProperty('--p', String(s.dodge / 3)); c.textContent = s.dodge > 0 ? s.dodge.toFixed(1) : ''; }
    // target frame
    const tgt = s.target ? g.ents.get(s.target) : null;
    if (tgt && !(tgt.flags & 2)) {
      E.target!.hidden = false;
      clear(E.target!).append(h('b', null, `${tgt.name} · ${tgt.lv}`), h('div', { class: 'bar hp small' }, h('i', { style: `width:${(tgt.hp / tgt.mhp) * 100}%` }), h('span', null, `${tgt.hp}/${tgt.mhp}`)), h('small', null, tgt.st.join(' · ')));
    } else E.target!.hidden = true;
    // boss bar
    let boss = null;
    for (const e of g.ents.values()) if (e.flags & 2 && Math.hypot(e.rx - me.rx, e.ry - me.ry) < 900) boss = e;
    if (boss) {
      E.boss!.hidden = false;
      const def = ENEMIES[boss.def];
      const phases = def?.boss?.phases ?? [];
      clear(E.boss!).append(
        h('div', { class: 'bb-head' }, tileIcon('skull', '#ff4f9a', 'ancient', 44), h('div', { class: 'grow' },
          h('div', { class: 'row between' }, h('b', { class: 'bb-name' }, h('em', null, `Lv.${boss.lv} `), ct(`enemy.${boss.def}`, boss.name)), h('small', null, def?.boss?.title ?? '')),
          h('div', { class: 'bar hp boss' }, h('i', { style: `width:${(boss.hp / boss.mhp) * 100}%` }), h('span', null, `${boss.hp.toLocaleString()} / ${boss.mhp.toLocaleString()} (${((boss.hp / boss.mhp) * 100).toFixed(1)}%)`)))),
        h('div', { class: 'bb-phases' }, ...[1, ...phases].map((thr, i) => h('span', { class: 'ph' + (i < boss.phase ? ' done' : i === boss.phase ? ' cur' : '') }, `P${i + 1} ${Math.round(thr * 100)}%`)), boss.affixes.length ? h('span', { class: 'ph aff' }, boss.affixes.join(' · ')) : null),
        h('div', { class: 'bar brk' }, h('i', { style: `width:${Math.min(1, boss.breakG) * 100}%` }), h('span', null, boss.st.includes('broken') ? (th ? 'เกราะแตก — รับดาเมจ +30%!' : 'BROKEN — +30% damage taken!') : (th ? 'เกจเบรก (ควบคุมฝูงชนและการโจมตีหนัก)' : 'Break gauge (crowd control & heavy hits)'))));
    } else E.boss!.hidden = true;
    // interaction prompt
    const it = g.map?.interactables.filter((i) => !(i.used || g.usedIts.has(i.id)) || i.type === 'exit').map((i) => ({ i, d: Math.hypot(i.x - me.rx, i.y - me.ry) })).sort((a, b) => a.d - b.d)[0];
    const trz = ch.treasure && ch.treasure.zone === g.room?.id && Math.hypot(ch.treasure.hx - me.rx, ch.treasure.hy - me.ry) < ch.treasure.hr;
    if (it && it.d < 110 && !it.i.deco) { E.prompt!.hidden = false; E.prompt!.textContent = `[${keyLabel(this.input.binds.interact!)}] ${it.i.name}`; } else if (trz) { E.prompt!.hidden = false; E.prompt!.textContent = `[${keyLabel(this.input.binds.interact!)}] Dig for treasure`; } else E.prompt!.hidden = true;
    // death / respawn
    if (s.deadT === -2) this.status(ch.hardcore ? '☠' : 'You are down — an ally can revive you');
    else if (s.deadT >= 0) this.status(ch.hardcore ? '☠' : `${t('respawn')} ${Math.ceil(s.deadT)}s…`); else if (E.status!.textContent?.startsWith(t('respawn')) || E.status!.textContent === '☠' || E.status!.textContent?.startsWith('You are down')) this.status(null);
    // dps meter
    const now = performance.now();
    if (g.dps.total && now - g.dps.last < 4000) { E.dps!.hidden = false; E.dps!.textContent = `DPS ${Math.round(g.dps.total / Math.max(1, (g.dps.last - g.dps.start) / 1000 + 0.5))} · total ${g.dps.total}`; } else E.dps!.hidden = true;
    this.renderer.drawMinimap(E.mini as HTMLCanvasElement, false);
    if (this.panel === 'map') { const c = this.el.panel!.querySelector('canvas'); if (c) this.renderer.drawMinimap(c as HTMLCanvasElement, true); }
  }
  private stCache: { ch: CharacterData | null; st: ReturnType<typeof computeStats> | null } = { ch: null, st: null };
  private statsCache(ch: CharacterData) { if (this.stCache.ch !== ch) this.stCache = { ch, st: computeStats(ch) }; return this.stCache.st!; }

  private updateZone() {
    const g = this.game; const r = g.room;
    if (!r) return;
    const z = clear(this.el.zone!);
    if (r.id.startsWith('house:')) z.append(h('b', null, this.houseData?.mine ? 'Your Hearth' : `${this.houseData?.owner ?? ''}'s Hearth`), h('button', { class: 'btn tiny ghost', onclick: () => this.openPanel('hearth') }, 'Furniture (U)'));
    else if (r.kind === 'town') z.append(h('b', null, t('townSafe')), h('small', null, `${t('trainingGround')}: west side`));
    else if (r.kind === 'field') z.append(h('b', null, r.id === 'highlands' ? 'Ashen Highlands' : r.id === 'wastes' ? 'Starfall Wastes' : 'Duskmeadow'), h('small', null, `Open world · levels ${r.id === 'highlands' ? '10-20' : r.id === 'wastes' ? '20-30' : '2-9'} · shared with other players`));
    else {
      const rr = r as any; const act = ACTIVITIES[(rr.mode ?? 'rift') as keyof typeof ACTIVITIES];
      const th = getLang() === 'th';
      const card = h('div', { class: 'run-card' },
        h('div', { class: 'rc-head' }, uiIcon('sigil', 22, '#9b6cff'), h('b', null, th ? 'การผจญภัยในดันเจียน' : 'Dungeon Run')),
        h('div', { class: 'rc-title' }, tileIcon(rr.mode === 'raid' ? 'crown' : rr.mode === 'arena' ? 'trophy' : rr.mode === 'tower' ? 'pillar' : 'sigil', '#9b6cff', 'epic', 40), h('div', null, h('b', null, ct(`activity.${act?.id ?? 'rift'}.name`, act?.name ?? 'Rift')), h('small', null, `${act?.chooseDifficulty ? DIFFICULTIES[r.difficulty as keyof typeof DIFFICULTIES]?.name + ' · ' : ''}${th ? 'มอนเลเวล' : 'Monster Lv'} ${r.level}`))),
        rr.mode === 'tower' ? h('div', { class: 'rc-floor' }, `${th ? 'ชั้น' : 'Floor'} ${rr.floor}`, h('div', { class: 'diamonds-row' }, ...Array.from({ length: 5 }, (_, i) => h('i', { class: i < ((rr.floor - 1) % 5) + 1 ? 'on' : '' })), uiIcon('skull', 16))) : rr.mode === 'arena' ? h('div', { class: 'rc-floor' }, `${th ? 'เวฟ' : 'Wave'} ${rr.wave ?? 0}`) : null,
        r.modifiers.length ? h('div', { class: 'sec-title small' }, th ? 'ตัวแปรของรอบ' : 'Run Modifiers') : null,
        ...r.modifiers.map((mid) => { const md = DUNGEON_MODIFIERS.find((x) => x.id === mid); if (!md) return null; const row = h('div', { class: 'rc-mod ' + md.kind }, uiIcon(md.kind === 'positive' ? 'star' : md.kind === 'negative' ? 'skull' : 'awaken', 18, md.kind === 'positive' ? '#7be08a' : md.kind === 'negative' ? '#ff6b6b' : '#ffb347'), h('span', null, ct(`mod.${md.id}.name`, md.name))); bindTip(row, () => h('div', { class: 'tip' }, ct(`mod.${md.id}.desc`, md.desc))); return row; }),
        h('div', { class: 'sec-title small' }, th ? 'สถานะของรอบ' : 'Run Status'),
        h('div', { class: 'rc-status' }, h('span', null, uiIcon('skull', 18, '#ff4f5a'), ` ${th ? 'คำสาป' : 'Curse'} ${this.game.blessings.filter((b) => BLESSING_MAP[b]?.curse).length}`), h('span', null, uiIcon('star', 18, '#ffd36a'), ` ${th ? 'พร' : 'Blessing'} ${this.game.blessings.filter((b) => !BLESSING_MAP[b]?.curse).length}`)),
        h('button', { class: 'btn tiny', onclick: async () => { if (await confirmDialog(t('leaveRun'), 'Return to town? Items, gold and XP are kept; blessings are lost.', t('leaveRun'), t('cancel'))) this.send({ t: 'leave' }); } }, '⇦ ' + t('leaveRun')));
      z.append(card);
    }
  }

  private renderParty() {
    const p = this.game.party, el = this.el.party!;
    const th = getLang() === 'th';
    if (!p.members.length) { el.hidden = true; return; }
    el.hidden = false;
    const byName = new Map([...this.game.ents.values()].filter((e) => e.kind === 0).map((e) => [e.name.split(' ‹')[0]!, e]));
    clear(el).append(h('div', { class: 'pb-head' }, h('b', null, `${th ? 'ปาร์ตี้' : 'Party'} (${p.members.length}/4)`), h('button', { class: 'icon-btn', title: t('social'), onclick: () => this.toggle('social') }, uiIcon('gear', 18))),
      ...p.members.map((m) => { const e = byName.get(m.name); const cd = CLASSES[m.cls as keyof typeof CLASSES];
        return h('div', { class: 'pm' }, h('div', { class: 'pm-av', style: `--c:${cd?.colors.body ?? '#555'}` }, (m.cls[0] ?? '?').toUpperCase()), h('div', { class: 'grow' }, h('div', { class: 'pm-n' }, m.name === p.leader ? uiIcon('crown', 14) : null, h('em', null, `Lv.${m.level}`), ` ${m.name}`), e ? h('div', { class: 'gbar thin hp' }, h('i', { style: `width:${(e.hp / e.mhp) * 100}%` })) : h('small', { class: 'muted' }, m.room))); }));
  }
  private showAfk(p: any) {
    const th = getLang() === 'th';
    const close = () => this.closeModal();
    const hrs = Math.floor(p.minutes / 60), mins = p.minutes % 60;
    this.showModal(h('div', { class: 'modal-wrap' }, h('div', { class: 'modal afk' },
      h('h2', null, th ? 'ระหว่างที่คุณไม่อยู่…' : 'While you were away…'),
      h('p', null, th ? `ตัวละครตั้งแคมป์ล่าใน ${p.zone} เป็นเวลา ${hrs} ชม. ${mins} นาที (สูงสุด 12 ชม.)` : `Your character camped and hunted in ${p.zone} for ${hrs}h ${mins}m (max 12h).`),
      h('div', { class: 'afk-rw' }, h('span', null, currencyIcon('gold', 26), ` ${p.gold.toLocaleString()}`), h('span', null, uiIcon('star', 26, '#7be08a'), ` ${p.xp.toLocaleString()} XP`), ...Object.entries(p.mats as Record<string, number>).filter(([, n]) => n > 0).map(([k, n]) => h('span', null, matIcon(k, 26), ` ×${n}`))),
      h('button', { class: 'btn gold big', onclick: () => { this.send({ t: 'afk_claim' }); close(); } }, th ? 'รับรางวัล' : 'Collect'),
      h('small', { class: 'muted' }, th ? 'ออกจากเกมในโลกเปิด (ไม่ใช่ในเมือง) เพื่อตั้งแคมป์ฟาร์ม · อัตราต่ำกว่าการเล่นจริง' : 'Log out in the open world (not in town) to make camp. Camp rewards are lower than active play.'))));
  }
  private autoWindow() {
    const a = this.auto, th = getLang() === 'th', ch = this.game.char!;
    const save = () => { a.save(); this.renderPanel(); };
    const toggle = (label: string, desc: string, on: boolean, set: (v: boolean) => void) => h('div', { class: 'aset' }, h('div', { class: 'grow' }, h('b', null, label), h('small', { class: 'muted' }, desc)), h('button', { class: 'switch' + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(on), onclick: () => { set(!on); save(); } }, h('i')));
    const choice = (label: string, desc: string, value: string, opts: Array<[string, string]>, set: (v: string) => void) => h('div', { class: 'aset' }, h('div', { class: 'grow' }, h('b', null, label), h('small', { class: 'muted' }, desc)), h('div', { class: 'seg' }, ...opts.map(([v, l]) => h('button', { class: v === value ? 'on' : '', onclick: () => { set(v); save(); } }, l))));
    const skillRow = (ids: Array<string | null>, ult: boolean) => h('div', { class: 'aset-skills' }, ...ids.map((id, i) => { if (!id) return h('div', { class: 'lo-empty' }); const off = a.s.skillsOff.includes(id); const b = h('button', { class: 'askill' + (off ? ' off' : ''), onclick: () => { a.s.skillsOff = off ? a.s.skillsOff.filter((x) => x !== id) : [...a.s.skillsOff, id]; save(); } }, skillIcon(id, 46), h('em', null, String(ult ? i + 9 : i + 1)), h('small', null, off ? (th ? 'ปิด' : 'Off') : (th ? 'ใช้' : 'On'))); bindTip(b, () => h('div', { class: 'tip' }, SKM[id]?.name ?? id)); return b; }));
    return h('div', { class: 'autowin' },
      h('div', { class: 'aset-head' }, h('button', { class: 'auto-btn big' + (a.s.combat ? ' on' : ''), onclick: () => { a.setCombat(!a.s.combat); this.renderAuto(); this.renderPanel(); } }, 'AUTO'), h('div', null, h('b', null, a.s.combat ? (th ? 'ออโต้กำลังทำงาน' : 'Auto is running') : (th ? 'ออโต้ปิดอยู่' : 'Auto is off')), h('p', { class: 'muted' }, th ? 'ออโต้ใช้คำสั่งเดียวกับผู้เล่นและเซิร์ฟเวอร์ตรวจทุกอย่าง · เดินหรือใช้สกิลเองจะหยุดชั่วคราว 2.5 วินาที' : 'Auto sends the same commands as a player and the server checks everything. Moving or casting yourself pauses it for 2.5 s.'))),
      h('div', { class: 'sec-title' }, uiIcon('crossed', 20), th ? 'การต่อสู้' : 'Combat'),
      toggle(th ? 'ใช้อัลติเมตอัตโนมัติ' : 'Use ultimates', th ? 'ใช้กับบอส อีลิต หรือฝูง 3 ตัวขึ้นไป' : 'On bosses, elites or packs of 3+', a.s.useUlts, (v) => { a.s.useUlts = v; }),
      toggle(th ? 'หลบการโจมตีอัตโนมัติ' : 'Auto-dodge telegraphs', th ? 'กลิ้งออกจากวงแดงก่อนโดนโจมตี' : 'Roll out of red danger zones before they land', a.s.dodge, (v) => { a.s.dodge = v; }),
      choice(th ? 'ระยะไล่ล่า' : 'Hunt radius', th ? 'ระยะห่างสูงสุดจากจุดที่เปิดออโต้' : 'How far from where you switched auto on', String(a.s.leash), [['400', th ? 'ใกล้' : 'Near'], ['700', th ? 'กลาง' : 'Medium'], ['1000', th ? 'ไกล' : 'Far']], (v) => { a.s.leash = Number(v); }),
      h('div', { class: 'sec-title' }, uiIcon('book', 20), th ? 'สกิลที่ให้ออโต้ใช้ (คลิกเพื่อเปิด/ปิด)' : 'Skills auto may use (click to toggle)'), skillRow(ch.loadout.active, false), skillRow(ch.loadout.ultimate, true),
      h('div', { class: 'sec-title' }, uiIcon('potion', 20, '#ff4a5a'), th ? 'ยาและการเก็บของ' : 'Potions & loot'),
      choice(th ? 'ดื่มยาเมื่อ HP ต่ำกว่า' : 'Drink a potion below HP', th ? 'ทำงานแม้ไม่ได้เปิดออโต้ต่อสู้' : 'Works even when auto-combat is off', a.s.potion ? String(a.s.potionPct) : '0', [['0', th ? 'ปิด' : 'Off'], ['30', '30%'], ['40', '40%'], ['50', '50%'], ['60', '60%'], ['70', '70%']], (v) => { a.s.potion = v !== '0'; if (v !== '0') a.s.potionPct = Number(v); }),
      choice(th ? 'เก็บไอเทมตั้งแต่ระดับ' : 'Pick up items from', th ? 'ทองเก็บเสมอ' : 'Gold is always picked up', a.s.loot ? a.s.lootMin : 'off', [['off', th ? 'ปิด' : 'Off'], ['common', 'Common'], ['uncommon', 'Uncommon'], ['rare', 'Rare'], ['epic', 'Epic'], ['legendary', 'Legendary']], (v) => { a.s.loot = v !== 'off'; if (v !== 'off') a.s.lootMin = v; }),
      toggle(th ? 'หยุดเก็บเมื่อกระเป๋าเต็ม' : 'Stop looting when bags are full', th ? 'ไม่เดินไปหาของที่เก็บไม่ได้' : 'Do not walk to items that cannot fit', a.s.stopBagFull, (v) => { a.s.stopBagFull = v; }),
      h('div', { class: 'sec-title' }, uiIcon('mount', 20), th ? 'การเดินทาง' : 'Travel'),
      toggle(th ? 'ขึ้นพาหนะอัตโนมัติเมื่อเดินทาง' : 'Mount up when travelling', th ? 'ระหว่างเดินไปทำเควสต์ (ต้องมีพาหนะ)' : 'While travelling to a quest (needs a mount)', a.s.autoMount, (v) => { a.s.autoMount = v; }),
      toggle(th ? 'ยืนรอในเมือง' : 'Stay put in town', th ? 'ไม่เดินวนในเมืองที่ไม่มีศัตรู' : 'Do not wander around in safe towns', a.s.townIdle, (v) => { a.s.townIdle = v; }),
      h('p', { class: 'hint' }, th ? 'ปุ่ม ▶ ข้างเควสต์ในแถบด้านขวาจะเดินไปทำเควสต์ให้ · ออกจากเกมในโลกเปิดเพื่อฟาร์ม AFK' : 'The ▶ next to a quest travels there and does it · log out in the open world to make an AFK camp.'));
  }
  renderAuto() {
    const a = this.auto, th = getLang() === 'th';
    this.el.autoBtn!.classList.toggle('on', a.s.combat);
    this.el.autoSt!.textContent = a.active ? ({ combat: th ? 'กำลังต่อสู้' : 'Fighting', loot: th ? 'เก็บของ' : 'Looting', searching: th ? 'ค้นหาศัตรู' : 'Searching', paused: th ? 'หยุดชั่วคราว (ควบคุมเอง)' : 'Paused (manual)' } as Record<string, string>)[a.status] ?? a.status : (th ? 'ปิดอยู่' : 'Off');
  }
  private trackerT = 0;
  shopState = { tab: 'supplies' as 'supplies' | 'materials' | 'cosmetics' | 'mounts' };
  lastWish: any[] | null = null;
  private friendsData: any = null;
  private gmFlag = false;
  private get gmOn() { return this.gmFlag; }
  private set gmOn(v: boolean) { this.gmFlag = v; this.el.gmBtn && (this.el.gmBtn.hidden = !v); }
  private curKey = '';
  private nameKey = '';
  private portraitKey = '';
  private drawPortrait() {
    const ch = this.game.char; if (!ch) return;
    this.portraitKey = ch.cls;
    const c = this.el.portrait as HTMLCanvasElement, x = c.getContext('2d')!;
    const d = CLASSES[ch.cls];
    x.clearRect(0, 0, 96, 96);
    const grd = x.createRadialGradient(48, 40, 6, 48, 48, 50); grd.addColorStop(0, '#4a3a7a'); grd.addColorStop(1, '#120c22');
    x.fillStyle = grd; x.fillRect(0, 0, 96, 96);
    drawChibi(x, 48, 150, 3.4, Math.PI / 2, d.colors.body, d.colors.hair, d.colors.accent, 0, 0, ch.cls);
    clear(this.el.plv!).append(uiIcon('emblem', 30, d.colors.accent));
  }
  private renderPill() {
    const r = this.game.room; if (!r) return;
    const th = getLang() === 'th';
    const chapter = Math.max(1, ...QUESTS.filter((q) => this.game.char?.quests[q.id]).map((q) => q.chapter));
    const zone = r.id.startsWith('house:') ? (th ? 'บ้าน' : 'Hearth') : r.kind === 'town' ? (th ? 'เมือง' : 'Town') : r.kind === 'field' ? (th ? 'โลกเปิด' : 'Open World') : (th ? 'อินสแตนซ์' : 'Instance');
    clear(this.el.pill!).append(h('span', { class: 'dot ' + this.backend.mode }), h('b', null, this.backend.mode === 'offline' ? (th ? 'ออฟไลน์' : 'Offline') : 'Online'), h('span', { class: 'sep' }), `CH.${String(chapter).padStart(2, '0')} (${zone})`);
    const me = this.game.me();
    if (me) clear(this.el.loc!).append(h('b', null, this.zoneName()), h('small', null, `(${Math.round(me.rx / 32)}, ${Math.round(me.ry / 32)})`));
  }
  private zoneName() {
    const r = this.game.room; if (!r) return '';
    const th = getLang() === 'th';
    if (r.id.startsWith('house:')) return th ? 'บ้านฮาร์ธ' : 'Hearthstone Lane';
    if (r.kind === 'town') return th ? 'ลูเมนโฮลด์' : 'Lumenhold';
    if (r.kind === 'field') return r.id === 'highlands' ? 'Ashen Highlands' : r.id === 'wastes' ? 'Starfall Wastes' : 'Duskmeadow';
    return ACTIVITIES[((r as any).mode ?? 'rift') as keyof typeof ACTIVITIES]?.name ?? 'Rift';
  }
  private trackTab: 'quests' | 'activities' = 'quests';
  /** Right-side tracker: tutorial / quests (with chapter tags) or activities (weekly objectives + activity list). */
  private renderTracker() {
    const g = this.game, ch = g.char, el = this.el.tracker!;
    if (!ch) return;
    const th = getLang() === 'th';
    const tab = (id: 'quests' | 'activities', label: string) => h('button', { class: 'tt' + (this.trackTab === id ? ' on' : ''), onclick: () => { this.trackTab = id; this.renderTracker(); } }, label);
    const body = h('div', { class: 'tr-body' });
    if (this.trackTab === 'quests') {
      if (this.tut?.cur) { const c = this.tut.cur; body.append(h('div', { class: 'tq tut' }, h('div', { class: 'tq-t' }, uiIcon('star', 16, '#ffd36a'), h('b', null, `[${th ? 'บทสอน' : 'Tutorial'} ${this.tut.step + 1}/${this.tut.total}] `), th ? c.th : c.en), h('small', null, th ? c.hintTh : c.hintEn), h('div', { class: 'row between' }, h('small', { class: 'gold' }, `${th ? 'รางวัล' : 'Reward'}: ${c.gold}g`), h('button', { class: 'btn ghost tiny', onclick: () => this.send({ t: 'tutorial_skip' }) }, th ? 'ข้าม' : 'Skip')))); }
      const active = QUESTS.filter((q) => ch.quests[q.id] && !ch.quests[q.id]!.claimed);
      const next = QUESTS.find((q) => !ch.quests[q.id] && (!q.requires || ch.quests[q.requires]?.claimed));
      const autoQ = (id: string) => h('span', { class: 'tq-auto' + (this.auto.quest === id ? ' on' : ''), title: th ? 'เดินทำเควสต์อัตโนมัติ' : 'Auto-travel & do this quest', onclick: (e: Event) => { e.stopPropagation(); this.auto.setQuest(this.auto.quest === id ? null : id); this.renderTracker(); this.renderAuto(); } }, this.auto.quest === id ? '■' : '▶');
      for (const q of active.slice(0, 4)) { const st = ch.quests[q.id]!; body.append(h('button', { class: 'tq', onclick: () => this.toggle('quests') }, autoQ(q.id), h('div', { class: 'tq-t' }, h('b', { class: 'tag-main' }, `[${th ? 'หลัก' : 'Main'}] `), ct(`quest.${q.id}.name`, q.name)), h('small', null, st.done ? (th ? '• สำเร็จ — กลับไปส่งเควสต์' : '• Complete — return to the quest giver') : `• ${th ? 'ความคืบหน้า' : 'Progress'} (${st.progress}/${q.objective.count})`))); }
      if (next) body.append(h('button', { class: 'tq', onclick: () => this.toggle('quests') }, autoQ(next.id), h('div', { class: 'tq-t' }, h('b', { class: 'tag-story' }, `[${th ? 'เนื้อเรื่อง' : 'Story'}] `), ct(`quest.${next.id}.name`, next.name)), h('small', null, `• ${th ? 'รับเควสต์จาก' : 'Accept from'} ${next.giver}`)));
      const wk = weeklyObjectives(Date.now()), prog = g.account?.season;
      for (const o of wk) { const v = prog?.weekly?.[o.id] ?? 0, done = prog?.weeklyDone?.includes(o.id); body.append(h('button', { class: 'tq', onclick: () => this.toggle('season') }, h('div', { class: 'tq-t' }, h('b', { class: 'tag-weekly' }, `[${th ? 'รายสัปดาห์' : 'Weekly'}] `), o.name), h('small', null, done ? (th ? '• สำเร็จ ✓' : '• Done ✓') : `• (${Math.min(v, o.count)}/${o.count})`))); }
    } else {
      for (const id of ACTIVITY_ORDER) { const a = ACTIVITIES[id]; const ok = ch.level >= a.minLevel; body.append(h('div', { class: 'ta' + (ok ? '' : ' locked') }, uiIcon(id === 'raid' ? 'crown' : id === 'arena' ? 'trophy' : id === 'tower' ? 'pillar' : 'sigil', 20, '#9b6cff'), h('span', { class: 'grow' }, ct(`activity.${id}.name`, a.name)), h('small', null, ok ? (th ? 'เข้าได้ที่ประตูริฟต์' : 'Rift Gate') : `Lv.${a.minLevel}`))); }
      const we = g.worldEvent; if (we) body.append(h('div', { class: 'ta' }, uiIcon('events', 20, '#ff6a8a'), h('span', { class: 'grow' }, we.name ?? (th ? 'อีเวนต์โลก' : 'World event')), h('small', { class: we.active ? 'good' : '' }, we.active ? (th ? 'กำลังเกิด' : 'Ongoing') : `${Math.max(0, Math.ceil(((we.next ?? Date.now()) - Date.now()) / 60000))}m`)));
    }
    clear(el).append(h('div', { class: 'tr-tabs' }, tab('quests', th ? 'เควสต์' : 'Quests'), tab('activities', th ? 'กิจกรรม' : 'Activities')), body);
  }

  private chatLine(ch: string, text: string) {
    const log = this.el.chatLog!;
    const tagName: Record<string, string> = { local: 'World', party: 'Party', guild: 'Guild', whisper: 'Whisper', system: 'System' };
    const line = h('div', { class: 'cl ' + ch, 'data-ch': ch }, h('b', { class: 'cl-tag' }, `[${tagName[ch] ?? ch}] `), ch === 'system' ? trText(text) : text);
    line.hidden = this.chatTab !== 'all' && this.chatTab !== ch;
    log.append(line);
    while (log.children.length > 60) log.firstChild?.remove();
    log.scrollTop = log.scrollHeight;
  }

  private sendChat() {
    const inp = this.el.chatIn as HTMLInputElement;
    const v = inp.value.trim();
    inp.value = '';
    if (!v) return;
    const m = v.match(/^\/(\w+)\s*(.*)$/);
    if (v.toLowerCase() === '/gmadminonline01') return this.send({ t: 'gm_open', code: 'gmadminonline01' }); // never echoed to chat
    if (v.toLowerCase() === '/gm' && this.gmOn) return this.openPanel('gm');
    if (!m) return this.send({ t: 'chat', ch: (this.el.chatCh as HTMLSelectElement)?.value || 'local', text: v });
    const [, cmd, rest] = m;
    const [arg, ...more] = rest!.split(' ');
    switch (cmd) {
      case 'p': this.send({ t: 'chat', ch: 'party', text: rest }); break;
      case 'g': this.send({ t: 'chat', ch: 'guild', text: rest }); break;
      case 'trade': this.send({ t: 'trade_request', name: arg }); break;
      case 'visit': this.send({ t: 'house_visit', name: arg }); break;
      case 'w': this.send({ t: 'chat', ch: 'whisper', to: arg, text: more.join(' ') }); break;
      case 'invite': this.send({ t: 'party_invite', name: arg }); break;
      case 'leave': this.send({ t: 'party_leave' }); break;
      case 'block': this.send({ t: 'block', name: arg }); break;
      case 'report': this.send({ t: 'report', name: arg, reason: more.join(' ') }); break;
      default: this.chatLine('system', 'Commands: /p, /g, /w name, /trade name, /visit name, /invite name, /leave, /block name, /report name reason');
    }
  }

  // ─────────── Panels ───────────
  private nearbyPlayers(): string[] { return [...this.game.ents.values()].filter((e) => e.kind === 0 && e.id !== this.game.pid).map((e) => e.name.split(' ‹')[0]!); }
  private toggle(p: PanelName) { if (this.panel === p) this.closePanel(); else { this.panelExtra = null; this.openPanel(p); } }
  openPanel(p: PanelName) { this.panel = p; if (p === 'social') this.send({ t: 'pf_list' }); if (p === 'guild') this.send({ t: 'guild_info' }); if (p === 'ladder') this.send({ t: 'ladder' }); if (p === 'season') this.send({ t: 'season_info' }); this.renderPanel(); }
  closePanel() { this.panel = null; this.el.panel!.hidden = true; hideTip(); }
  private ctx(): P.PanelCtx {
    return { ch: this.game.char!, account: this.game.account!, send: (m) => this.send(m), room: this.game.room, input: this.input, settings: this.settings, applySettings: () => this.applySettings(), logout: () => this.leave(), extra: { open: (p: PanelName) => this.openPanel(p) }, party: this.game.party };
  }
  private renderPanel() {
    const p = this.panel;
    if (!p || !this.game.char) return;
    const ctx = this.ctx();
    const inTown = this.game.room?.kind === 'town';
    const titles: Record<PanelName, string> = { inventory: t('inventory'), skills: t('skills'), passives: t('passives'), character: t('character'), quests: t('quests'), codex: t('codex'), social: t('social'), guild: 'Guild', ladder: 'Leaderboards', alchemist: 'Sister Maelis — alchemy & cooking', season: 'Season & weekly', hearth: 'Your Hearth', carpenter: 'Carpenter Odo — furniture', auction: 'Auctioneer Vell — auction house', settings: t('settings'), dungeon: 'Rift Gate', smith: 'Brenna the Smith — forge, salvage & enchant', quartermaster: 'Quartermaster Sol — potions & selling', trainer: 'Master Ilrin — trainer', stash: 'Astral Vault', map: t('map'), crafting: getLang() === 'th' ? 'คราฟต์และทักษะชีวิต' : 'Crafting & Life Skills', login: getLang() === 'th' ? 'รางวัลล็อกอิน' : 'Login Rewards', shop: getLang() === 'th' ? 'ร้านค้า' : 'Shop', benefits: getLang() === 'th' ? 'สิทธิประโยชน์' : 'Benefits', wish: getLang() === 'th' ? 'ขอพรแห่งดวงดาว' : 'Astral Wish', awaken: getLang() === 'th' ? 'ตื่นรู้และตราสัญลักษณ์' : 'Awakening & Emblems', wardrobe: getLang() === 'th' ? 'ตู้เสื้อผ้า' : 'Wardrobe', friends: getLang() === 'th' ? 'สังคมและชุมชน' : 'Social & Community', gm: 'GM Console', auto: getLang() === 'th' ? 'ตั้งค่าระบบออโต้' : 'Auto Settings' };
    let body: HTMLElement;
    switch (p) {
      case 'inventory': body = inventoryWindow(ctx, 'normal', () => this.renderPanel()); break;
      case 'smith': body = h('div', null, inventoryWindow(ctx, 'smith', () => this.renderPanel()), craftingWindow(ctx.ch, ['smithing'], (m) => this.send(m), () => this.renderPanel())); break;
      case 'hearth': body = S.hearthPanel(this.houseData, (m) => this.send(m), (id) => this.startPlacing(id)); break;
      case 'carpenter': body = NW.carpenterWindow(ctx.ch, ctx.account, (m) => this.send(m), () => this.renderPanel()); break;
      case 'season': body = S.seasonPanel(this.seasonData, ctx.ch, ctx.account, (m) => this.send(m)); break;
      case 'alchemist': body = craftingWindow(ctx.ch, ['alchemy', 'cooking'], (m) => this.send(m), () => this.renderPanel()); break;
      case 'crafting': body = craftingWindow(ctx.ch, [], (m) => this.send(m), () => this.renderPanel()); break;
      case 'login': body = MW.loginWindow(ctx.ch, ctx.account, (m) => this.send(m)); break;
      case 'shop': body = MW.shopWindow(ctx.ch, ctx.account, (m) => this.send(m), this.shopState, () => this.renderPanel()); break;
      case 'benefits': body = MW.benefitsWindow(ctx.ch, ctx.account, (m) => this.send(m)); break;
      case 'wish': body = MW.wishWindow(ctx.ch, ctx.account, (m) => this.send(m), this.lastWish); break;
      case 'awaken': body = MW.awakenWindow(ctx.ch, ctx.account, (m) => this.send(m)); break;
      case 'wardrobe': body = MW.wardrobeWindow(ctx.account, (m) => this.send(m)); break;
      case 'auto': body = this.autoWindow(); break;
      case 'gm': body = gmWindow(ctx.ch.level, (m) => this.send(m), () => this.renderPanel()); break;
      case 'friends': body = S.friendsPanel(this.friendsData, (m) => this.send(m), (n) => { const i = this.el.chatIn as HTMLInputElement; i.value = `/w ${n} `; i.focus(); }); break;
      case 'quartermaster': body = inventoryWindow(ctx, 'quartermaster', () => this.renderPanel()); break;
      case 'stash': body = inventoryWindow(ctx, 'stash', () => this.renderPanel()); break;
      case 'skills': body = P.skillsPanel(ctx); break;
      case 'passives': body = passiveTreePanel(ctx.ch, ctx.send, inTown); break;
      case 'character': body = P.characterPanel(ctx); break;
      case 'quests': body = P.questsPanel(ctx, this.panelExtra?.what === 'quests' && inTown); break;
      case 'codex': body = P.codexPanel(ctx); break;
      case 'social': body = h('div', null, P.socialPanel(ctx), S.finderSection(ctx.ch, this.pfEntries, this.nearbyPlayers(), (m) => this.send(m))); break;
      case 'guild': body = S.guildPanel(ctx.ch, this.guildData, (m) => this.send(m), inTown); break;
      case 'auction': body = S.auctionPanel(ctx.ch, this.ah, (m) => this.send(m), () => this.renderPanel()); break;
      case 'settings': body = h('div', null, h('button', { class: 'btn gold', onclick: () => this.openPanel('auto') }, getLang() === 'th' ? '⚙ ตั้งค่าระบบออโต้' : '⚙ Auto settings'), P.settingsPanel(ctx)); break;
      case 'dungeon': body = P.dungeonPanel(ctx, this.panelExtra?.unlocked ?? ['story', 'normal'], this.panelExtra?.locks ?? {}); break;
      case 'ladder': body = P.ladderPanel(this.ladderData, ctx.ch, (m) => this.send(m)); break;
      case 'trainer': body = NW.trainerWindow(ctx, inTown, () => this.renderPanel()); break;
      case 'map': body = h('div', null, h('canvas', { class: 'bigmap', width: 640, height: 480 })); break;
    }
    const scroll = this.el.panel!.querySelector('.panel-body')?.scrollTop ?? 0;
    const panel = clear(this.el.panel!);
    panel.hidden = false;
    panel.classList.toggle('wide', p === 'passives' || p === 'map' || (p === 'trainer' && NW.trainerState.tab === 'tree'));
    panel.classList.toggle('win', ['inventory', 'smith', 'quartermaster', 'stash', 'crafting', 'alchemist', 'auction', 'social', 'guild', 'skills', 'passives', 'character', 'season', 'dungeon', 'friends', 'gm', 'auto', 'login', 'shop', 'benefits', 'wish', 'awaken', 'wardrobe', 'trainer', 'carpenter'].includes(p));
    const th = getLang() === 'th';
    const socialTabs = ['social', 'guild', 'auction', 'friends'].includes(p) ? h('div', { class: 'win-tabs' }, ...([['auction', 'gavel', th ? 'ห้องประมูล' : 'Auction House'], ['guild', 'crest', th ? 'กิลด์' : 'Guild'], ['social', 'people', th ? 'ปาร์ตี้และเทรด' : 'Party & Trade'], ['friends', 'person', th ? 'เพื่อน' : 'Friends']] as const).map(([id, ic, label]) => h('button', { class: 'wt icon' + (p === id ? ' on' : ''), onclick: () => { this.openPanel(id); if (id === 'friends') this.send({ t: 'friend_list' }); if (id === 'auction') { this.send({ t: 'ah_search', q: this.ah.q }); this.send({ t: 'ah_mine' }); } } }, uiIcon(ic, 22), label))) : null;
    if (socialTabs) titles[p] = th ? 'สังคมและชุมชน' : 'Social & Community';
    panel.append(h('header', { class: 'row between' }, h('h2', null, titles[p]), h('button', { class: 'btn ghost tiny', onclick: () => this.closePanel(), 'aria-label': t('close') }, '✕')), h('div', { class: 'panel-body' }, socialTabs, body));
    panel.querySelector('.panel-body')!.scrollTop = scroll;
    translateDom(panel);
    if (p !== 'quests' && p !== 'dungeon') this.panelExtra = null;
  }
  private showModal(el: HTMLElement) { translateDom(el); clear(this.el.modal!).append(el); }
  private closeModal() { clear(this.el.modal!); }
}
