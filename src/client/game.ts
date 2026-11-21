/**
 * Client-side game state.
 *  - Local player: client-side prediction with the shared movement code,
 *    server reconciliation (replay unacknowledged inputs) and smoothed error.
 *  - Remote entities: snapshot interpolation ~100 ms in the past.
 * The client never decides damage, loot or cooldown outcomes.
 */
import { getZone, type ZoneDef } from '../shared/config/zones.ts';
import { generateMap, type TileMap } from '../shared/mapgen.ts';
import { moveParamsFor, newMoveState, stepMove, TICK_DT, type MoveState } from '../shared/movement.ts';
import { BTN, type CharacterView, type ClientMessage, type EntityMeta, type GameEvent, type SelfState, type ServerMessage } from '../shared/protocol.ts';
import { STAT_CONFIG } from '../shared/config/stats.ts';
import { getWeapon, type WeaponDef } from '../shared/config/weapons.ts';
import type { ItemInstance } from '../shared/config/items.ts';
import { lerp } from '../shared/math.ts';
import type { Transport } from './net.ts';

export interface Snap { tick: number; x: number; y: number; f: number; hp: number; anim: number; flags: number }

export interface ClientEntity {
  id: number;
  meta: EntityMeta;
  snaps: Snap[];
  x: number; y: number; f: number; hp: number; anim: number; flags: number;
  hurtUntil: number;
  actUntil: number; actId: string; actX: number; actY: number;
  dead: boolean;
  deadAt: number;
}

export interface ClientProjectile { id: number; x: number; y: number; vx: number; vy: number; r: number; born: number; life: number; fx: string; owner: number }
export interface Telegraph { x: number; y: number; r: number; ang: number; arc: number; shape: 'circle' | 'arc'; start: number; dur: number }
export interface Floater { x: number; y: number; text: string; color: string; start: number; big: boolean }
export interface Fx { kind: string; x: number; y: number; ax: number; ay: number; start: number; dur: number; owner: number }

interface PendingInput { s: number; mx: number; my: number; dodge: boolean; block: boolean }

const INTERP_TICKS = 2.2;

export class GameClient {
  zone: ZoneDef | null = null;
  map: TileMap | null = null;
  selfId = 0;
  self: SelfState | null = null;
  ms: MoveState = newMoveState(0, 0, 100);
  prevMs: MoveState = newMoveState(0, 0, 100);
  /** Visual smoothing of reconciliation corrections. */
  corrX = 0; corrY = 0;
  corrections = 0;
  pending: PendingInput[] = [];
  seq = 0;
  ents = new Map<number, ClientEntity>();
  projectiles = new Map<number, ClientProjectile>();
  telegraphs: Telegraph[] = [];
  floaters: Floater[] = [];
  fx: Fx[] = [];
  char: CharacterView | null = null;
  weapon: WeaponDef | null = null;
  items: ItemInstance[] = [];
  gold = 0;
  bagSlots = 40;
  serverTick = 0;
  lastSnapAt = 0;
  renderTick = 0;
  snapCount = 0;
  snapRate = 0;
  private snapWindowStart = 0;
  ping = 0;
  private acc = 0;
  facingX = 1; facingY = 0;
  /** Click-to-move/attack UI state (render only). */
  targetId: number | null = null;
  moveMarker: { x: number; y: number; t: number } | null = null;
  /** Local animation prediction for responsiveness (cosmetic only). */
  localAct: { id: string; until: number; x: number; y: number } | null = null;
  private localCd = new Map<string, number>();
  input = { mx: 0, my: 0, aimX: 1, aimY: 0, buttons: 0 };
  onEvent: (ev: GameEvent) => void = () => {};
  onZone: () => void = () => {};

  constructor(public net: Transport) {}

  send(m: ClientMessage) { this.net.send(m); }

  // ------------------------------------------------------------ messages
  handle(m: ServerMessage) {
    const now = performance.now();
    switch (m.t) {
      case 'enter_zone': {
        this.zone = getZone(m.zone) ?? null;
        this.map = this.zone ? generateMap(this.zone) : null;
        this.selfId = m.selfId;
        this.ents.clear();
        this.projectiles.clear();
        this.telegraphs = [];
        this.fx = [];
        this.pending = [];
        this.targetId = null;
        this.moveMarker = null;
        this.applySelf(m.self, true);
        this.serverTick = m.tick;
        this.renderTick = m.tick - INTERP_TICKS;
        this.lastSnapAt = now;
        for (const meta of m.metas) this.addEntity(meta, m.tick);
        this.onZone();
        break;
      }
      case 'snap': {
        if (!this.map) return;
        this.serverTick = m.tick;
        this.lastSnapAt = now;
        this.snapCount++;
        if (now - this.snapWindowStart > 1000) { this.snapRate = this.snapCount; this.snapCount = 0; this.snapWindowStart = now; }
        for (const meta of m.add) this.addEntity(meta, m.tick);
        for (const id of m.rem) this.ents.delete(id);
        for (const [id, x, y, f, hp, anim, flags] of m.ents) {
          const e = this.ents.get(id);
          if (!e) continue;
          e.snaps.push({ tick: m.tick, x: x / 100, y: y / 100, f: f / 100, hp, anim, flags });
          if (e.snaps.length > 12) e.snaps.shift();
        }
        // reconciliation
        this.pending = this.pending.filter((p) => p.s > m.ack);
        this.applySelf(m.self, false);
        for (const ev of m.ev) this.applyEvent(ev, now);
        break;
      }
      case 'char': {
        this.char = m.c;
        this.weapon = getWeapon(m.c.weapon);
        break;
      }
      case 'inv': {
        this.items = m.items;
        this.gold = m.gold;
        this.bagSlots = m.slots;
        break;
      }
      case 'pong': this.ping = Math.round(performance.now() - m.c); break;
      default: break;
    }
  }

  private addEntity(meta: EntityMeta, tick: number) {
    const existing = this.ents.get(meta.id);
    if (existing) { existing.meta = meta; return; }
    const x = 'x' in meta ? meta.x : 0, y = 'y' in meta ? meta.y : 0;
    this.ents.set(meta.id, {
      id: meta.id, meta, snaps: meta.k === 1 || meta.k === 2 ? [] : [{ tick, x, y, f: 0, hp: 100, anim: 0, flags: 0 }],
      x, y, f: 0, hp: 100, anim: 0, flags: 0, hurtUntil: 0, actUntil: 0, actId: '', actX: 0, actY: 0, dead: false, deadAt: 0,
    });
  }

  private applySelf(s: SelfState, hard: boolean) {
    const before = { x: this.ms.x + this.corrX, y: this.ms.y + this.corrY };
    this.self = s;
    const ms = this.ms;
    Object.assign(ms, {
      x: s.x, y: s.y, dodgeT: s.dodgeT, dvx: s.dvx, dvy: s.dvy, forceT: s.forceT, fvx: s.fvx, fvy: s.fvy, rootT: s.rootT,
      animT: s.animT, animMoveMult: s.animMoveMult, stamina: s.stamina, staminaDelay: s.staminaDelay, dodgeCd: s.dodgeCd,
      slowT: s.slowT, slowMult: s.slowMult,
    });
    if (this.map && this.char) {
      const params = this.params();
      for (const p of this.pending) stepMove(ms, p, params, this.map);
    }
    if (hard) {
      this.corrX = 0; this.corrY = 0;
      Object.assign(this.prevMs, ms);
    } else {
      const ex = before.x - ms.x, ey = before.y - ms.y;
      const err = Math.hypot(ex, ey);
      if (err > 3) { this.corrX = 0; this.corrY = 0; Object.assign(this.prevMs, ms); this.corrections++; }
      else if (err > 0.01) { this.corrX = ex; this.corrY = ey; this.corrections++; }
    }
  }

  private params() {
    return moveParamsFor(this.char?.stats ?? STAT_CONFIG.base, this.weapon, STAT_CONFIG.regen);
  }

  private applyEvent(ev: GameEvent, now: number) {
    switch (ev.e) {
      case 'hit': {
        const tgt = ev.t === this.selfId ? null : this.ents.get(ev.t);
        const pos = ev.t === this.selfId ? { x: this.ms.x, y: this.ms.y } : tgt ? { x: tgt.x, y: tgt.y } : null;
        if (!pos) break;
        if (tgt) tgt.hurtUntil = now + 120;
        const isSelf = ev.t === this.selfId;
        const text = ev.m ? (ev.d === 0 ? 'MISS' : '') : String(ev.d);
        if (text) this.floaters.push({ x: pos.x, y: pos.y, text: ev.c ? `${text}!` : text, color: isSelf ? '#ff5050' : ev.c ? '#ffd040' : '#ffffff', start: now, big: !!ev.c });
        break;
      }
      case 'act': {
        if (ev.s === this.selfId && ev.a !== 'dodge') break; // predicted locally
        const e = this.ents.get(ev.s);
        if (e) { e.actUntil = now + 300; e.actId = ev.a; e.actX = ev.x; e.actY = ev.y; }
        const src = ev.s === this.selfId ? { x: this.ms.x, y: this.ms.y } : e;
        if (src) this.spawnSkillFx(ev.a, src.x, src.y, ev.x, ev.y, now, ev.s);
        break;
      }
      case 'proj':
        this.projectiles.set(ev.id, { id: ev.id, x: ev.x, y: ev.y, vx: ev.vx, vy: ev.vy, r: ev.r, born: now, life: ev.life * 1000, fx: ev.fx, owner: ev.s });
        break;
      case 'pend': {
        const p = this.projectiles.get(ev.id);
        if (p) { this.fx.push({ kind: 'burst', x: p.x, y: p.y, ax: 0, ay: 0, start: now, dur: 220, owner: p.owner }); this.projectiles.delete(ev.id); }
        break;
      }
      case 'tele':
        this.telegraphs.push({ x: ev.x, y: ev.y, r: ev.r, ang: ev.ang, arc: ev.arc, shape: ev.shape, start: now, dur: ev.dur * 1000 });
        break;
      case 'die': {
        const e = this.ents.get(ev.id);
        if (e) { e.dead = true; e.deadAt = now; }
        break;
      }
      case 'heal': {
        const pos = ev.t === this.selfId ? this.ms : this.ents.get(ev.t);
        if (pos) this.floaters.push({ x: pos.x, y: pos.y, text: `+${ev.v}`, color: '#60ff80', start: now, big: false });
        break;
      }
      case 'lvl': {
        const pos = ev.id === this.selfId ? this.ms : this.ents.get(ev.id);
        if (pos) {
          this.floaters.push({ x: pos.x, y: pos.y, text: `LEVEL ${ev.lvl}!`, color: '#ffe060', start: now, big: true });
          this.fx.push({ kind: 'levelup', x: pos.x, y: pos.y, ax: 0, ay: 0, start: now, dur: 1200, owner: ev.id });
        }
        break;
      }
      case 'counter': {
        const pos = ev.id === this.selfId ? this.ms : this.ents.get(ev.id);
        if (pos) {
          this.fx.push({ kind: 'counter', x: pos.x, y: pos.y, ax: 0, ay: 0, start: now, dur: 400, owner: ev.id });
          this.floaters.push({ x: pos.x, y: pos.y, text: 'COUNTER!', color: '#80e0ff', start: now, big: true });
        }
        break;
      }
      case 'node': {
        const e = this.ents.get(ev.id);
        if (e && e.meta.k === 5) e.meta = { ...e.meta, ready: ev.ready };
        break;
      }
    }
    this.onEvent(ev);
  }

  spawnSkillFx(id: string, x: number, y: number, ax: number, ay: number, now: number, owner: number) {
    const kinds: Record<string, [string, number]> = {
      sword_normal: ['slash', 200], sword_heavy: ['cleave', 300], sword_blade_rush: ['rush', 300], sword_rising_slash: ['rising', 350],
      sword_guard_counter: ['guard', 900], staff_normal: ['cast', 200], staff_heavy: ['cast', 300], staff_arcane_bolt: ['cast', 200],
      staff_mana_wave: ['wave', 450], staff_mystic_barrier: ['barrier', 500], dodge: ['dodge', 250],
    };
    const k = kinds[id];
    if (k) this.fx.push({ kind: k[0], x, y, ax, ay, start: now, dur: k[1], owner });
    else if (id.endsWith('_melee')) this.fx.push({ kind: 'bite', x, y, ax, ay, start: now, dur: 200, owner });
    else if (id.endsWith('_aoe')) this.fx.push({ kind: 'slam', x, y, ax, ay, start: now, dur: 300, owner });
  }

  // ------------------------------------------------------------ simulation
  /** Advance by real dt (ms). Runs fixed 20 Hz input ticks; returns interpolation alpha. */
  update(dtMs: number): number {
    if (!this.map || !this.self) return 0;
    this.acc += dtMs;
    if (this.acc > 250) this.acc = 250; // tab was hidden; don't flood the server
    while (this.acc >= TICK_DT * 1000) {
      this.acc -= TICK_DT * 1000;
      this.inputTick();
    }
    // render clock for remote entities
    const now = performance.now();
    const est = this.serverTick + (now - this.lastSnapAt) / (TICK_DT * 1000);
    const target = est - INTERP_TICKS;
    this.renderTick += dtMs / (TICK_DT * 1000);
    const diff = target - this.renderTick;
    if (Math.abs(diff) > 8) this.renderTick = target; else this.renderTick += diff * 0.08;
    this.interpolate();
    // decay corrections
    const k = Math.pow(0.0001, dtMs / 1000 / 0.5);
    this.corrX *= k; this.corrY *= k;
    // expire transient visuals
    this.floaters = this.floaters.filter((f) => now - f.start < 1000);
    this.telegraphs = this.telegraphs.filter((t) => now - t.start < t.dur + 80);
    this.fx = this.fx.filter((f) => now - f.start < f.dur);
    for (const p of this.projectiles.values()) {
      const age = now - p.born;
      if (age > p.life + 200) this.projectiles.delete(p.id);
    }
    for (const [id, e] of this.ents) if (e.dead && now - e.deadAt > 900 && e.meta.k === 2 && e.hp <= 0) e.snaps.length = 0, void id;
    return this.acc / (TICK_DT * 1000);
  }

  private inputTick() {
    if (!this.map || !this.self) return;
    const i = this.input;
    let { mx, my } = i;
    const b = i.buttons;
    const al = Math.hypot(i.aimX, i.aimY);
    if (al > 0.01) { this.facingX = i.aimX / al; this.facingY = i.aimY / al; }
    const dodge = (b & BTN.DODGE) !== 0;
    if (dodge && mx === 0 && my === 0) { mx = this.facingX; my = this.facingY; }
    const s = ++this.seq;
    const cmd = { t: 'in' as const, s, mx: round3(mx), my: round3(my), ax: round3(this.facingX), ay: round3(this.facingY), b, vt: Math.max(0, Math.floor(this.renderTick)) };
    this.send(cmd);
    Object.assign(this.prevMs, this.ms);
    const block = (b & BTN.BLOCK) !== 0 && this.weapon !== null && !(this.weapon.defensive.kind === 'mana_guard' && (this.self.en <= 0));
    const p: PendingInput = { s, mx: cmd.mx, my: cmd.my, dodge, block };
    if (!this.self.dead) stepMove(this.ms, p, this.params(), this.map);
    this.pending.push(p);
    if (this.pending.length > 60) this.pending.shift();
    this.predictAction(b);
  }

  private predictAction(b: number) {
    const w = this.weapon;
    if (!w || !this.self || this.self.dead || (b & BTN.BLOCK)) return;
    const now = performance.now();
    if (this.localAct && now < this.localAct.until) return;
    if (this.ms.dodgeT > 0 || this.ms.rootT > 0 || this.ms.forceT > 0) return;
    const pick = b & BTN.SKILL1 ? w.skills[0] : b & BTN.SKILL2 ? w.skills[1] : b & BTN.SKILL3 ? w.skills[2] : b & BTN.HEAVY ? w.heavy : b & BTN.ATTACK ? w.normal : null;
    if (!pick) return;
    const serverCd = this.self.cd[pick.id] ?? 0;
    if (serverCd > 0.05 || (this.localCd.get(pick.id) ?? 0) > now) return;
    if (this.self.en < pick.energyCost || this.ms.stamina < pick.staminaCost) return;
    const atkSpd = this.char?.stats.atkSpd ?? 1;
    const cd = pick.type === 'normal' ? pick.cooldown / atkSpd : pick.cooldown * (1 - (this.char?.stats.cdr ?? 0));
    const anim = pick.type === 'normal' ? pick.animTime / atkSpd : pick.animTime;
    this.localCd.set(pick.id, now + cd * 1000 - 30);
    this.localAct = { id: pick.id, until: now + Math.max(200, anim * 1000), x: this.facingX, y: this.facingY };
    this.spawnSkillFx(pick.id, this.ms.x, this.ms.y, this.facingX, this.facingY, now, this.selfId);
  }

  private interpolate() {
    const rt = this.renderTick;
    for (const e of this.ents.values()) {
      const s = e.snaps;
      if (!s.length) continue;
      if (s.length === 1 || rt <= s[0].tick) { Object.assign(e, pick(s[0])); continue; }
      let a = s[s.length - 1], b = a;
      for (let i = s.length - 1; i > 0; i--) {
        if (s[i - 1].tick <= rt) { a = s[i - 1]; b = s[i]; break; }
      }
      if (rt >= s[s.length - 1].tick) { Object.assign(e, pick(s[s.length - 1])); continue; }
      const t = b.tick === a.tick ? 1 : (rt - a.tick) / (b.tick - a.tick);
      // teleport (respawn/knockback) -> snap instead of sliding across the map
      if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 4) { Object.assign(e, pick(b)); continue; }
      e.x = lerp(a.x, b.x, t); e.y = lerp(a.y, b.y, t);
      e.f = t < 0.5 ? a.f : b.f; e.hp = b.hp; e.anim = t < 0.5 ? a.anim : b.anim; e.flags = b.flags;
      if (b.hp > 0 && e.dead && e.meta.k === 2 && b.anim !== 8) e.dead = false;
    }
  }

  /** Rendered local position (prediction interpolated between ticks + smoothed correction). */
  selfRenderPos(alpha: number): { x: number; y: number } {
    return { x: lerp(this.prevMs.x, this.ms.x, alpha) + this.corrX, y: lerp(this.prevMs.y, this.ms.y, alpha) + this.corrY };
  }
}

function pick(s: Snap) { return { x: s.x, y: s.y, f: s.f, hp: s.hp, anim: s.anim, flags: s.flags }; }
const round3 = (v: number) => Math.round(v * 1000) / 1000;
