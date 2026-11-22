import { Vfx } from './vfx.js';
import { sound } from './audio.js';
import { CLASSES, SKILL_MAP, computeStats, moveCircle, type AccountProgress, type CharacterData, type GameMap, type Interactable } from '@astra/shared';

export interface CEnt {
  id: number; kind: 0 | 1 | 2; x: number; y: number; f: number; hp: number; mhp: number; barrier: number; def: string; name: string; lv: number; st: string[];
  flags: number; windup: number; dead: boolean; size: number; affixes: string[]; breakG: number; phase: number; invuln: boolean; aura: string; pet: string;
  rx: number; ry: number; moving: number; swingT: number; flash: number; seen: number; petX?: number; petY?: number;
}
export interface FloatText { x: number; y: number; text: string; color: string; t: number; size: number; vy: number }
export interface Particle { x: number; y: number; vx: number; vy: number; t: number; life: number; color: string; r: number }

export class ClientGame {
  vfx = new Vfx(this);
  map: GameMap | null = null;
  pid = 0;
  char: CharacterData | null = null;
  account: AccountProgress | null = null;
  room: { id: string; kind: 'town' | 'field' | 'dungeon'; mode?: string; floor?: number; wave?: number; difficulty: string; seed: number; modifiers: string[]; level: number } | null = null;
  ents = new Map<number, CEnt>();
  projs: Array<{ id: number; x: number; y: number; vx: number; vy: number; r: number; v: string; team: number }> = [];
  areas: Array<{ id: number; x: number; y: number; r: number; outside?: boolean; cone: boolean; ang: number; arc: number; delay: number; delayT: number; team: number; v: string; dur: number; fired: boolean; age: number }> = [];
  drops: Array<{ id: number; x: number; y: number; rarity: string; name: string }> = [];
  self: any = null;
  fx: FloatText[] = [];
  particles: Particle[] = [];
  blessings: string[] = [];
  party: { id: string | null; leader: string | null; members: Array<{ name: string; cls: string; level: number; room: string }> } = { id: null, leader: null, members: [] };
  usedIts = new Set<string>();
  worldEvent: any = null;
  shake = 0;
  lastSnap = 0;
  snapInterval = 66;
  rtt = 0;
  // local prediction
  px = 0; py = 0; predicted = false;
  seq = 0;
  frames: Array<{ seq: number; mx: number; my: number; dt: number; sp: number }> = [];
  private statics = new Map<number, any[]>();
  input = { mx: 0, my: 0 };
  showNumbers = true;
  quality: 'low' | 'medium' | 'high' = 'high';
  dps = { total: 0, start: 0, last: 0 };
  private speedCache = { at: 0, v: 200 };

  welcome(m: any) {
    this.map = m.map; this.pid = m.pid; this.char = m.char; this.account = m.account; this.room = m.room;
    this.ents.clear(); this.statics.clear(); this.frames = []; this.projs = []; this.areas = []; this.drops = []; this.fx = []; this.particles = []; this.usedIts.clear(); this.predicted = false; this.blessings = [];
    for (const it of m.map.interactables as Interactable[]) if (it.used) this.usedIts.add(it.id);
  }

  applySnap(m: any) {
    const now = performance.now();
    if (this.lastSnap) this.snapInterval = this.snapInterval * 0.9 + (now - this.lastSnap) * 0.1;
    this.lastSnap = now;
    const seen = new Set<number>();
    for (const raw of m.ents as any[]) {
      const id = raw[0] as number;
      seen.add(id);
      // short tuples (static fields unchanged) are merged with the cached static block
      let a = raw;
      if (raw.length === 13) { const st = this.statics.get(id); if (!st) continue; a = [raw[0], st[1], raw[1], raw[2], raw[3], raw[4], st[6], raw[5], st[8], st[9], st[10], raw[6], st[12], raw[7], raw[8], raw[9], st[16], raw[10], raw[11], raw[12], st[20], st[21]]; }
      else this.statics.set(id, raw);
      let e = this.ents.get(id);
      const next = { id, kind: a[1], x: a[2], y: a[3], f: a[4], hp: a[5], mhp: a[6], barrier: a[7], def: a[8], name: a[9], lv: a[10], st: a[11] ? String(a[11]).split(',') : [], flags: a[12], windup: a[13], dead: !!a[14], size: a[15], affixes: a[16] ? String(a[16]).split(',') : [], breakG: a[17], phase: a[18], invuln: !!a[19], aura: a[20] ?? '', pet: a[21] ?? '' };
      if (!e) { e = { ...next, rx: next.x, ry: next.y, moving: 0, swingT: 0, flash: 0, seen: now }; this.ents.set(id, e); }
      else {
        const moved = Math.hypot(next.x - e.x, next.y - e.y);
        e.moving = moved > 1 ? Math.min(1, e.moving + 0.5) : Math.max(0, e.moving - 0.34);
        if (next.hp < e.hp) e.flash = 0.15;
        Object.assign(e, next);
        e.seen = now;
      }
    }
    for (const id of this.ents.keys()) if (!seen.has(id)) { this.ents.delete(id); this.statics.delete(id); }
    if (m.z) {
      // delta lists: new/changed items + ids still alive
      const pAlive = new Set<number>(m.pid);
      const pMap = new Map(this.projs.filter((p) => pAlive.has(p.id)).map((p) => [p.id, p]));
      for (const p of m.projs as any[]) pMap.set(p[0], { id: p[0], x: p[1], y: p[2], vx: p[3], vy: p[4], r: p[5], v: p[6], team: p[7] });
      this.projs = [...pMap.values()];
      const aAlive = new Set<number>(m.aid);
      const aMap = new Map(this.areas.filter((a) => aAlive.has(a.id)).map((a) => [a.id, a]));
      for (const a of m.areas as any[]) aMap.set(a[0], { id: a[0], x: a[1], y: a[2], r: a[3], cone: a[4] === 1, outside: a[4] === 2, ang: a[5], arc: a[6], delay: a[7], delayT: a[8], team: a[9], v: a[10], dur: a[11], fired: !!a[12], age: aMap.get(a[0])?.age ?? 0 });
      this.areas = [...aMap.values()];
    } else {
      this.projs = (m.projs as any[]).map((p) => ({ id: p[0], x: p[1], y: p[2], vx: p[3], vy: p[4], r: p[5], v: p[6], team: p[7] }));
      const prevAreas = new Map(this.areas.map((a) => [a.id, a.age]));
      this.areas = (m.areas as any[]).map((a) => ({ id: a[0], x: a[1], y: a[2], r: a[3], cone: a[4] === 1, outside: a[4] === 2, ang: a[5], arc: a[6], delay: a[7], delayT: a[8], team: a[9], v: a[10], dur: a[11], fired: !!a[12], age: prevAreas.get(a[0]) ?? 0 }));
    }
    this.drops = (m.drops as any[]).map((d) => ({ id: d[0], x: d[1], y: d[2], rarity: d[3], name: d[4] }));
    this.self = m.self;
    const me = this.ents.get(this.pid);
    if (me && this.map) {
      if (!this.predicted || me.dead || me.invuln) { this.px = me.x; this.py = me.y; this.predicted = true; this.frames = []; return; }
      // Reconcile: start from the authoritative position and replay movement the server has not processed yet.
      const ack = m.self?.ack ?? 0;
      this.frames = this.frames.filter((f) => f.seq > ack);
      let x = me.x, y = me.y;
      for (const f of this.frames) [x, y] = moveCircle(this.map, x, y, 14, f.mx * f.sp * f.dt, f.my * f.sp * f.dt);
      const err = Math.hypot(x - this.px, y - this.py);
      if (err > 120) { this.px = x; this.py = y; } else { this.px += (x - this.px) * 0.3; this.py += (y - this.py) * 0.3; }
    }
  }

  moveSpeed(): number {
    const now = performance.now();
    if (this.char && now - this.speedCache.at > 1000) { this.speedCache = { at: now, v: computeStats(this.char).moveSpeed }; }
    let v = this.speedCache.v;
    const me = this.ents.get(this.pid);
    if (me?.st.includes('slow') || me?.st.includes('chill')) v *= 0.65;
    if (me?.st.includes('stun') || me?.st.includes('freeze') || me?.dead) v = 0;
    if (this.self?.lock > 0) v *= 0.35;
    return v;
  }

  events(list: any[]) {
    for (const ev of list) {
      const e = this.ents.get(ev.id);
      switch (ev.t) {
        case 'dmg': {
          if (!e) break;
          const mine = ev.src === this.pid || this.isMyMinion(ev.src);
          const onMe = ev.id === this.pid;
          if (onMe) { this.shake = Math.min(8, this.shake + (ev.v / Math.max(1, e.mhp)) * 40); sound.hurt(); }
          else if (mine) sound.hit(ev.dt, ev.c);
          if (mine && e.def === 'dummy') { const n = performance.now(); if (n - this.dps.last > 4000) { this.dps.total = 0; this.dps.start = n; } this.dps.total += ev.v; this.dps.last = n; }
          if (this.showNumbers && (mine || onMe || this.quality !== 'low')) this.float(e.rx, e.ry - 30, String(ev.v) + (ev.c ? '!' : ''), onMe ? '#ff5a5a' : ev.c ? '#ffd23a' : mine ? DMG_COLORS[ev.dt] ?? '#fff' : '#bbb', ev.c ? 20 : onMe ? 15 : 14);
          this.vfx.onHit(e, ev.dt, !!ev.c, ev.v, mine);
          break;
        }
        case 'heal': if (e && this.showNumbers) this.float(e.rx, e.ry - 34, '+' + ev.v, '#5dff8a', 14); break;
        case 'miss': if (e) this.float(e.rx, e.ry - 34, ev.kind === 'dodge' ? 'Dodge' : ev.kind === 'block' ? 'Block' : 'Immune', '#9fd8ff', 13); break;
        case 'cast': { if (e) e.swingT = 0.25; this.vfx.onCast(ev); if (ev.id === this.pid) { const sk = SKILL_MAP[ev.skill]; sound.cast(['fire', 'ice', 'lightning', 'holy', 'shadow', 'poison'].find((x) => sk?.tags.includes(x)) ?? 'physical'); } break; }
        case 'death': if (e) { this.vfx.onDeath(e); if (e.id === this.pid) sound.death(); } break;
        case 'msg': if (ev.kind === 'warn') sound.warn(); break;
        case 'level': if (e && ev.id === this.pid) sound.levelUp(); if (e) { this.float(e.rx, e.ry - 50, 'LEVEL UP!', '#ffe47a', 22); this.burst(e.rx, e.ry, '#ffe47a', 30); } break;
        case 'phase': sound.phase(); if (e) { this.shake = 10; this.burst(e.rx, e.ry, '#ff4f9a', 40); } break;
        case 'broken': if (e) { this.float(e.rx, e.ry - 60, 'BROKEN!', '#ffb347', 24); this.shake = 6; } break;
        case 'it_add': if (this.map && !this.map.interactables.some((i) => i.id === ev.it.id)) this.map.interactables.push(ev.it); break;
        case 'pickup': if (ev.item) sound.loot(ev.item.rarity); if (ev.gold) { sound.gold(); const me = this.ents.get(this.pid); if (me) this.float(me.rx, me.ry - 40, `+${ev.gold}g`, '#ffd76a', 13); } break;
        default: break;
      }
    }
  }

  isMyMinion(id: number) { const e = this.ents.get(id); return !!e && e.kind === 2; }

  float(x: number, y: number, text: string, color: string, size: number) {
    if (this.fx.length > 120) this.fx.shift();
    this.fx.push({ x: x + (Math.random() - 0.5) * 20, y, text, color, t: 0, size, vy: -50 });
  }
  burst(x: number, y: number, color: string, n: number) {
    const max = this.quality === 'high' ? 400 : 150;
    for (let i = 0; i < n && this.particles.length < max; i++) {
      const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 140;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: 0.3 + Math.random() * 0.4, color, r: 1.5 + Math.random() * 2.5 });
    }
  }

  update(dt: number) {
    const me = this.ents.get(this.pid);
    // client prediction for own movement (server stays authoritative)
    if (me && this.map && this.predicted && !me.dead) {
      const sp = this.moveSpeed();
      [this.px, this.py] = moveCircle(this.map, this.px, this.py, 14, this.input.mx * sp * dt, this.input.my * sp * dt);
      if (this.input.mx || this.input.my) { this.frames.push({ seq: this.seq, mx: this.input.mx, my: this.input.my, dt, sp }); if (this.frames.length > 240) this.frames.shift(); }
    }
    // hit-stop: other bodies freeze for a few frames on heavy hits (own movement stays responsive)
    const k = this.vfx.hitstop > 0 ? 0 : 1 - Math.pow(0.0001, dt * (1000 / Math.max(40, this.snapInterval)) / 6);
    for (const e of this.ents.values()) {
      if (e.id === this.pid && this.predicted) { e.rx = this.px; e.ry = this.py; }
      else { e.rx += (e.x - e.rx) * k; e.ry += (e.y - e.ry) * k; if (Math.hypot(e.x - e.rx, e.y - e.ry) > 300) { e.rx = e.x; e.ry = e.y; } }
      e.swingT = Math.max(0, e.swingT - dt);
      e.flash = Math.max(0, e.flash - dt);
    }
    this.vfx.update(dt);
    for (const p of this.projs) { p.x += p.vx * dt; p.y += p.vy * dt; }
    for (const a of this.areas) { a.age += dt; if (a.delay > 0) a.delay -= dt; }
    for (const f of this.fx) { f.t += dt; f.y += f.vy * dt; f.vy *= 0.94; }
    this.fx = this.fx.filter((f) => f.t < 1.1);
    for (const p of this.particles) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; }
    this.particles = this.particles.filter((p) => p.t < p.life);
    this.shake *= Math.pow(0.02, dt);
  }

  me() { return this.ents.get(this.pid); }
  classDef() { return this.char ? CLASSES[this.char.cls] : null; }
}

export const DMG_COLORS: Record<string, string> = { physical: '#f2efe6', fire: '#ff8a3d', ice: '#8fe3ff', lightning: '#d7c5ff', holy: '#ffe58a', shadow: '#c58cff', poison: '#8ff06a' };
