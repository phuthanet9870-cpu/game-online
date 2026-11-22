import { CLASSES, DIFFICULTIES, DUNGEON_MODIFIERS, BLESSING_MAP, SKILL_MAP, ENEMIES, computeStats, xpToNext, type CharacterData } from '@astra/shared';
import { ClientGame } from '../game.js';
import { Renderer } from '../render.js';
import { Input, keyLabel } from '../input.js';
import { store, type Backend, type Conn } from '../net.js';
import { t } from '../i18n.js';
import { clear, confirmDialog, h, toast } from './dom.js';
import { bindTip, hideTip, icon, skillColor, skillTooltip } from './tooltip.js';
import * as P from './panels.js';
import { passiveTreePanel } from './passive.js';
import { modeBanner } from './screens.js';

type PanelName = 'inventory' | 'skills' | 'passives' | 'character' | 'quests' | 'codex' | 'social' | 'settings' | 'dungeon' | 'smith' | 'quartermaster' | 'trainer' | 'stash' | 'map';

export class GameUI {
  game = new ClientGame();
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
  }

  start() {
    clear(this.root);
    const canvas = h('canvas', { class: 'game-canvas', 'aria-label': 'Game view' });
    const E = this.el;
    E.wrap = h('div', { class: 'game', style: `--ui:${this.settings.uiScale}` },
      canvas,
      modeBanner(this.backend, true),
      E.status = h('div', { class: 'status-overlay', hidden: true }),
      h('div', { class: 'hud-tl' },
        E.name = h('div', { class: 'hud-name' }),
        E.hp = h('div', { class: 'bar hp' }, h('i'), h('b'), h('span')),
        E.res = h('div', { class: 'bar res' }, h('i'), h('span')),
        E.sec = h('div', { class: 'pips' }),
        E.buffs = h('div', { class: 'buffs' })),
      E.target = h('div', { class: 'target-frame', hidden: true }),
      E.boss = h('div', { class: 'boss-bar', hidden: true }),
      h('div', { class: 'hud-tr' }, E.mini = h('canvas', { class: 'minimap', width: 180, height: 140, onclick: () => this.toggle('map') }), E.zone = h('div', { class: 'zone' }), E.party = h('div', { class: 'party-frames' })),
      E.prompt = h('div', { class: 'interact-prompt', hidden: true }),
      E.dps = h('div', { class: 'dps', hidden: true }),
      E.bar = h('div', { class: 'skillbar' }),
      E.xp = h('div', { class: 'xpbar' }, h('i'), h('span')),
      E.menu = h('nav', { class: 'menu', 'aria-label': 'Game menu' }),
      E.chat = h('div', { class: 'chat' }, E.chatLog = h('div', { class: 'chat-log', role: 'log', 'aria-live': 'polite' }), E.chatIn = h('input', { class: 'chat-in', maxLength: 200, placeholder: t('chatHint'), 'aria-label': 'Chat' })),
      E.panel = h('aside', { class: 'panel', hidden: true, role: 'dialog' }),
      E.modal = h('div', { class: 'modal-host' }),
      E.joy = h('div', { class: 'joy', hidden: true }, E.knob = h('div', { class: 'knob' })),
      E.touchBtns = h('div', { class: 'touch-btns', hidden: !this.touch }),
    );
    this.root.append(E.wrap);
    this.renderer = new Renderer(canvas, this.game);
    this.input = new Input(canvas);
    this.input.onAction = (a) => this.onAction(a);
    if (this.touch) this.input.attachTouch(E.joy, E.knob);
    this.buildMenu();
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

  destroy() {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    removeEventListener('resize', this.onResize);
    this.input.enabled = false;
    this.conn?.close();
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
      case 'welcome': g.welcome(m); this.status(null); this.buildBar(); this.updateZone(); this.closePanel(); if (m.mode === 'offline' && !this.offlineNoted) { this.offlineNoted = true; this.chatLine('system', 'Offline mode: this session is simulated locally in your browser.'); } this.chatLine('system', `Entered ${m.room.kind === 'town' ? 'Lumenhold' : m.room.kind === 'field' ? 'Duskmeadow (open world, levels 2-9)' : 'the Rift'}.`); break;
      case 'snap': g.applySnap(m); break;
      case 'ev': g.events(m.list); for (const ev of m.list) if (ev.t === 'msg') this.chatLine('system', ev.text); else if (ev.t === 'pickup' && ev.item) toast(`Picked up ${ev.item.name}`, 'good'); break;
      case 'char': g.char = m.char; g.account = m.account; this.buildBar(); if (this.panel && this.panel !== 'map') this.renderPanel(); break;
      case 'err': if (m.fatal) { toast(m.msg, 'error'); this.status(m.msg); setTimeout(() => this.leave(), 2500); } else this.flashErr(m.msg); break;
      case 'toast': toast(m.msg); this.chatLine('system', m.msg); break;
      case 'chat': this.chatLine(m.ch, `${m.ch === 'whisper' && m.to ? `→ ${m.to}` : m.from}: ${m.text}`); break;
      case 'party': g.party = m; this.renderParty(); if (this.panel === 'social') this.renderPanel(); break;
      case 'party_invite': void confirmDialog('Party invite', `${m.from} invited you to a party.`, t('accept'), t('decline')).then((ok) => { if (ok) this.send({ t: 'party_accept', id: m.id }); }); break;
      case 'open': this.panelExtra = m; this.openPanel(m.what === 'dungeon' ? 'dungeon' : m.what); break;
      case 'choice': this.showModal(P.choiceModal(m.kind, m.options, (x) => this.send(x), () => this.closeModal())); break;
      case 'run': g.blessings = m.blessings; this.updateZone(); break;
      case 'run_end': this.showModal(P.runEndModal(m, () => this.closeModal())); break;
      case 'it_used': g.usedIts.add(m.id); break;
      case 'achievement': toast(`★ Achievement: ${m.name}`, 'good'); break;
      case 'hc_dead': this.showModal(h('div', { class: 'modal-wrap' }, h('div', { class: 'modal hc-dead' }, h('h2', null, `☠ ${m.name} ${t('hcDead')}`), h('p', null, `Level ${m.level}. Their legend is recorded on the Hardcore ladder.`), h('button', { class: 'btn', onclick: () => this.leave() }, t('close'))))); break;
      case 'pong': g.rtt = performance.now() - m.c; break;
      default: break;
    }
  }
  private offlineNoted = false;

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
    const [mx, my] = this.input.enabled && document.activeElement !== this.el.chatIn ? this.input.moveVector() : [0, 0];
    g.input.mx = mx; g.input.my = my;
    const [ax, ay] = this.aim();
    // hover detection for targeting
    const [wx, wy] = this.renderer.screenToWorld(this.input.mouse.x, this.input.mouse.y);
    let hover = 0;
    for (const e of g.ents.values()) if (e.kind === 1 && Math.hypot(e.rx - wx, e.ry - 14 - wy) < 26) hover = e.id;
    this.renderer.hoverId = hover;
    const overUI = this.panel !== null && this.input.mouse.x > innerWidth - (this.el.panel!.offsetWidth || 0);
    const atk = (this.input.mouse.left && !overUI && !this.touch) || this.touchAttack;
    this.sendT -= dt;
    const key = `${mx.toFixed(2)},${my.toFixed(2)},${atk}`;
    if (this.sendT <= 0 || key !== this.lastInput) {
      this.sendT = 0.05;
      this.lastInput = key;
      this.conn.send({ t: 'input', mx, my, ax: Math.round(ax), ay: Math.round(ay), atk });
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
      case 'dodge': { const [mx, my] = this.input.moveVector(); const me = g.me(); const [ax, ay] = this.aim(); this.send({ t: 'dodge', dx: mx || (me ? ax - me.rx : 1), dy: my || (me ? ay - me.ry : 0) }); break; }
      case 'potion': this.send({ t: 'potion' }); break;
      case 'interact': this.send({ t: 'interact' }); break;
      case 'pickup': this.pickupNearest(); break;
      case 'target': { const cur = g.self?.target ?? 0; const n = this.nearestEnemy(700, cur) ?? this.nearestEnemy(700); if (n) this.send({ t: 'target', id: n.id }); break; }
      case 'click': case 'rclick': {
        if (this.renderer.hoverId) this.send({ t: 'target', id: this.renderer.hoverId });
        // click on a drop picks it up
        const [wx, wy] = this.renderer.screenToWorld(this.input.mouse.x, this.input.mouse.y);
        const d = g.drops.find((d) => Math.hypot(d.x - wx, d.y - wy) < 28);
        if (d) this.send({ t: 'pickup', id: d.id });
        break;
      }
      case 'chat': (this.el.chatIn as HTMLInputElement).focus(); break;
      case 'escape': if (this.el.modal!.firstChild) this.closeModal(); else if (this.panel) this.closePanel(); else this.openPanel('settings'); break;
      case 'inventory': case 'skills': case 'passives': case 'character': case 'quests': case 'codex': case 'social': case 'map': this.toggle(a as PanelName); break;
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
    const items: Array<[PanelName, string, string]> = [['inventory', t('inventory'), 'inventory'], ['skills', t('skills'), 'skills'], ['passives', t('passives'), 'passives'], ['character', t('character'), 'character'], ['quests', t('quests'), 'quests'], ['codex', t('codex'), 'codex'], ['social', t('social'), 'social'], ['settings', t('settings'), '']];
    clear(this.el.menu!).append(...items.map(([p, label, bind]) => h('button', { class: 'menu-btn', onclick: () => this.toggle(p), title: label }, label, bind ? h('kbd', null, keyLabel(this.input?.binds[bind] ?? '')) : h('kbd', null, 'Esc'))));
  }

  private buildBar() {
    const g = this.game; const ch = g.char;
    if (!ch) return;
    const bar = clear(this.el.bar!);
    const keys = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'], ukeys = ['u1', 'u2', 'u3', 'u4'];
    const mk = (kind: 'a' | 'u', i: number, id: string | null) => {
      const sk = id ? SKILL_MAP[id] : null;
      const el = h('button', { class: 'slot' + (kind === 'u' ? ' ult' : ''), 'data-k': kind, 'data-i': i, 'aria-label': sk?.name ?? 'empty slot' }, sk ? icon(sk.icon, skillColor(sk), 26) : null, h('div', { class: 'cd' }), h('kbd', null, keyLabel(this.input.binds[(kind === 'a' ? keys : ukeys)[i]!] ?? '')));
      if (sk) bindTip(el, () => skillTooltip(sk, ch));
      el.onclick = () => (sk ? this.cast(kind, i) : this.openPanel('skills'));
      return el;
    };
    bar.append(h('div', { class: 'slots' }, ...ch.loadout.active.map((id, i) => mk('a', i, id))), h('div', { class: 'slots ults' }, ...ch.loadout.ultimate.map((id, i) => mk('u', i, id))),
      this.el.pot = h('button', { class: 'slot pot', onclick: () => this.send({ t: 'potion' }), 'aria-label': t('potion') }, icon('heal', '#ff6b7a', 24), h('div', { class: 'cd' }), h('kbd', null, keyLabel(this.input.binds.potion!)), h('em', null, '')),
      this.el.dodgeSlot = h('button', { class: 'slot pot', onclick: () => this.onAction('dodge'), 'aria-label': t('dodge') }, icon('blink', '#9fd8ff', 24), h('div', { class: 'cd' }), h('kbd', null, 'Spc')));
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
    E.name!.textContent = `${ch.name} · ${d.name} ${ch.level}${ch.hardcore ? ' · HC' : ''}`;
    const hpPct = me.hp / me.mhp;
    (E.hp!.children[0] as HTMLElement).style.width = `${hpPct * 100}%`;
    (E.hp!.children[1] as HTMLElement).style.width = `${Math.min(1, me.barrier / me.mhp) * 100}%`;
    E.hp!.children[2]!.textContent = `${me.hp} / ${me.mhp}${me.barrier ? ` (+${me.barrier})` : ''}`;
    E.hp!.classList.toggle('low', hpPct < 0.3);
    (E.res!.children[0] as HTMLElement).style.width = `${(s.res / s.maxRes) * 100}%`;
    (E.res!.children[0] as HTMLElement).style.background = d.resource.color;
    E.res!.children[1]!.textContent = `${d.resource.name} ${s.res}/${s.maxRes}`;
    if (d.secondary) { const n = Math.floor(s.sec); clear(E.sec!).append(h('small', null, d.secondary.name), ...Array.from({ length: s.secMax }, (_, i) => h('i', { class: i < n ? 'on' : '', style: `--c:${d.secondary!.color}` }))); }
    clear(E.buffs!).append(...s.buffs.map(([n, tt]: [string, number]) => h('span', { class: 'buff' }, `${n} ${Math.ceil(tt)}s`)), ...g.blessings.map((b) => h('span', { class: 'buff run', title: BLESSING_MAP[b]?.desc ?? '' }, '✧ ' + (BLESSING_MAP[b]?.name ?? b))));
    (E.xp!.children[0] as HTMLElement).style.width = `${(ch.xp / xpToNext(ch.level)) * 100}%`;
    E.xp!.children[1]!.textContent = `${t('level')} ${ch.level} · ${ch.xp}/${xpToNext(ch.level)} XP`;
    // skill cooldowns + affordability
    const st = this.statsCache(ch);
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
    if (E.pot) { const c = E.pot.querySelector<HTMLElement>('.cd')!; c.style.setProperty('--p', String(s.potCd / 6)); c.textContent = s.potCd > 0 ? String(Math.ceil(s.potCd)) : ''; E.pot.querySelector('em')!.textContent = String(s.potions); }
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
      clear(E.boss!).append(h('div', { class: 'row between' }, h('b', null, boss.name), h('small', null, `${def?.boss?.title ?? ''} · Phase ${boss.phase + 1}${boss.affixes.length ? ' · ' + boss.affixes.join(', ') : ''}`)),
        h('div', { class: 'bar hp boss' }, h('i', { style: `width:${(boss.hp / boss.mhp) * 100}%` }), h('span', null, `${Math.round((boss.hp / boss.mhp) * 100)}%`)),
        h('div', { class: 'bar brk' }, h('i', { style: `width:${Math.min(1, boss.breakG) * 100}%` }), h('span', null, boss.st.includes('broken') ? 'BROKEN — +30% damage taken!' : 'Break gauge (crowd control & heavy hits)')));
    } else E.boss!.hidden = true;
    // interaction prompt
    const it = g.map?.interactables.filter((i) => !(i.used || g.usedIts.has(i.id)) || i.type === 'exit').map((i) => ({ i, d: Math.hypot(i.x - me.rx, i.y - me.ry) })).sort((a, b) => a.d - b.d)[0];
    if (it && it.d < 110) { E.prompt!.hidden = false; E.prompt!.textContent = `[${keyLabel(this.input.binds.interact!)}] ${it.i.name}`; } else E.prompt!.hidden = true;
    // death / respawn
    if (s.deadT >= 0) this.status(ch.hardcore ? '☠' : `${t('respawn')} ${Math.ceil(s.deadT)}s…`); else if (E.status!.textContent?.startsWith(t('respawn')) || E.status!.textContent === '☠') this.status(null);
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
    if (r.kind === 'town') z.append(h('b', null, t('townSafe')), h('small', null, `${t('trainingGround')}: west side`));
    else if (r.kind === 'field') z.append(h('b', null, 'Duskmeadow'), h('small', null, 'Open world · shared with other players'));
    else {
      z.append(h('b', null, `The Rift · ${DIFFICULTIES[r.difficulty as keyof typeof DIFFICULTIES]?.name}`), h('small', null, `Monster level ${r.level} · seed ${r.seed}`));
      for (const mid of r.modifiers) { const md = DUNGEON_MODIFIERS.find((x) => x.id === mid); if (md) { const tag = h('span', { class: 'tag mod ' + md.kind }, md.name); bindTip(tag, () => h('div', { class: 'tip' }, md.desc)); z.append(tag); } }
      z.append(h('button', { class: 'btn tiny ghost', onclick: async () => { if (await confirmDialog(t('leaveRun'), 'Return to town? Items, gold and XP are kept; blessings are lost.', t('leaveRun'), t('cancel'))) this.send({ t: 'leave' }); } }, t('leaveRun')));
    }
  }

  private renderParty() {
    const p = this.game.party;
    clear(this.el.party!).append(...p.members.filter((m) => m.name !== this.game.char?.name).map((m) => h('div', { class: 'pf' }, `${m.name === p.leader ? '♛ ' : ''}${m.name} · ${m.level} · ${m.room}`)));
  }

  private chatLine(ch: string, text: string) {
    const log = this.el.chatLog!;
    log.append(h('div', { class: 'cl ' + ch }, ch !== 'system' && ch !== 'local' ? `[${ch}] ` : '', text));
    while (log.children.length > 60) log.firstChild?.remove();
    log.scrollTop = log.scrollHeight;
  }

  private sendChat() {
    const inp = this.el.chatIn as HTMLInputElement;
    const v = inp.value.trim();
    inp.value = '';
    if (!v) return;
    const m = v.match(/^\/(\w+)\s*(.*)$/);
    if (!m) return this.send({ t: 'chat', ch: 'local', text: v });
    const [, cmd, rest] = m;
    const [arg, ...more] = rest!.split(' ');
    switch (cmd) {
      case 'p': this.send({ t: 'chat', ch: 'party', text: rest }); break;
      case 'w': this.send({ t: 'chat', ch: 'whisper', to: arg, text: more.join(' ') }); break;
      case 'invite': this.send({ t: 'party_invite', name: arg }); break;
      case 'leave': this.send({ t: 'party_leave' }); break;
      case 'block': this.send({ t: 'block', name: arg }); break;
      case 'report': this.send({ t: 'report', name: arg, reason: more.join(' ') }); break;
      default: this.chatLine('system', 'Commands: /p, /w name, /invite name, /leave, /block name, /report name reason');
    }
  }

  // ─────────── Panels ───────────
  private toggle(p: PanelName) { if (this.panel === p) this.closePanel(); else { this.panelExtra = null; this.openPanel(p); } }
  openPanel(p: PanelName) { this.panel = p; this.renderPanel(); }
  closePanel() { this.panel = null; this.el.panel!.hidden = true; hideTip(); }
  private ctx(): P.PanelCtx {
    return { ch: this.game.char!, account: this.game.account!, send: (m) => this.send(m), room: this.game.room, input: this.input, settings: this.settings, applySettings: () => this.applySettings(), logout: () => this.leave(), extra: { open: (p: PanelName) => this.openPanel(p) }, party: this.game.party };
  }
  private renderPanel() {
    const p = this.panel;
    if (!p || !this.game.char) return;
    const ctx = this.ctx();
    const inTown = this.game.room?.kind === 'town';
    const titles: Record<PanelName, string> = { inventory: t('inventory'), skills: t('skills'), passives: t('passives'), character: t('character'), quests: t('quests'), codex: t('codex'), social: t('social'), settings: t('settings'), dungeon: 'Rift Gate', smith: 'Brenna the Smith — salvage & enchant', quartermaster: 'Quartermaster Sol — potions & selling', trainer: 'Master Ilrin — trainer', stash: 'Astral Vault', map: t('map') };
    let body: HTMLElement;
    switch (p) {
      case 'inventory': body = P.inventoryPanel(ctx); break;
      case 'smith': body = P.inventoryPanel(ctx, 'smith'); break;
      case 'quartermaster': body = P.inventoryPanel(ctx, 'quartermaster'); break;
      case 'stash': body = P.inventoryPanel(ctx, 'stash'); break;
      case 'skills': body = P.skillsPanel(ctx); break;
      case 'passives': body = passiveTreePanel(ctx.ch, ctx.send, inTown); break;
      case 'character': body = P.characterPanel(ctx); break;
      case 'quests': body = P.questsPanel(ctx, this.panelExtra?.what === 'quests' && inTown); break;
      case 'codex': body = P.codexPanel(ctx); break;
      case 'social': body = P.socialPanel(ctx); break;
      case 'settings': body = P.settingsPanel(ctx); break;
      case 'dungeon': body = P.dungeonPanel(ctx, this.panelExtra?.unlocked ?? ['story', 'normal']); break;
      case 'trainer': body = P.trainerPanel(ctx); break;
      case 'map': body = h('div', null, h('canvas', { class: 'bigmap', width: 640, height: 480 })); break;
    }
    const scroll = this.el.panel!.querySelector('.panel-body')?.scrollTop ?? 0;
    const panel = clear(this.el.panel!);
    panel.hidden = false;
    panel.classList.toggle('wide', p === 'passives' || p === 'map');
    panel.append(h('header', { class: 'row between' }, h('h2', null, titles[p]), h('button', { class: 'btn ghost tiny', onclick: () => this.closePanel(), 'aria-label': t('close') }, '✕')), h('div', { class: 'panel-body' }, body));
    panel.querySelector('.panel-body')!.scrollTop = scroll;
    if (p !== 'quests' && p !== 'dungeon') this.panelExtra = null;
  }
  private showModal(el: HTMLElement) { clear(this.el.modal!).append(el); }
  private closeModal() { clear(this.el.modal!); }
}
