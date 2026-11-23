// ASTRA pixel VFX — our own effects, built to the conventions of hand-made pixel-art VFX:
//  • every effect is rasterised into a low-resolution pixel buffer (1 art pixel = PX world units) and upscaled
//    nearest-neighbour, so all effects share one pixel grid;
//  • two buffers per layer: COLOR (opaque pixels; fades go through a 4×4 ordered dither, only smoke/vapour is
//    translucent) and LIGHT (additive glow pools composited on top — hot things look hot because of the light);
//  • palettes are dark→bright ramps; pixels pick a step by heat / age / depth;
//  • motion has anticipation (energy gathers), a 1–2 frame release flare, the active shape, and a slow release
//    (sparks with gravity and floor bounce, smoke, embers, debris); heavy hits freeze for ~0.1 s and shake.
// Each skill's look follows what the skill does (signature / field / impact recipes). Purely cosmetic.
import { SKILL_MAP, type SkillDef, type SkillEffect } from '@astra/shared';
import type { ClientGame, CEnt } from './game.js';

export const PX = 2;
const TAU = Math.PI * 2;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
type Pal = number[];
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 3;
function rgba(h: string) { const n = parseInt(h.slice(1), 16); return ((255 << 24) | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0; }
/** Ramps are resampled to 8 steps so any step index is valid for every palette. */
const P = (...h: string[]): Pal => { const c = h.map(rgba); return Array.from({ length: 8 }, (_, i) => c[Math.min(c.length - 1, Math.floor((i / 8) * c.length))]!); };
/** Element ramps, darkest → brightest (ASTRA's own). */
export const PAL: Record<string, Pal> = {
  fire: P('#3a1010', '#7a1a14', '#c02a1a', '#ee5a1c', '#ff9230', '#ffc845', '#ffe98a', '#fffbe0'),
  ice: P('#141a40', '#1f3472', '#2a5cae', '#3c90dc', '#6ccdf2', '#b0eeff', '#e2fcff', '#ffffff'),
  lightning: P('#1c1240', '#3a2a8a', '#6050d8', '#8c8cff', '#b8c4ff', '#e0e8ff', '#ffffff'),
  holy: P('#4a2e10', '#8a5a1a', '#c8902a', '#f0c040', '#ffe070', '#fff4b0', '#ffffff'),
  shadow: P('#0e0818', '#241036', '#44205e', '#6e3496', '#9c5ac8', '#c890ee', '#f0d8ff'),
  poison: P('#0e1a0a', '#1c3a12', '#2e6a1c', '#4aa02a', '#7ed23c', '#b8f070', '#effcc0'),
  physical: P('#1a1c26', '#333848', '#565c70', '#8a90a4', '#bcc2d2', '#e6eaf2', '#ffffff'),
  heal: P('#0e2a18', '#1a5a30', '#2a9a50', '#4ad078', '#8cf0a8', '#d0ffdc', '#ffffff'),
  time: P('#082420', '#0e4844', '#187a70', '#2cb0a0', '#6ae6d2', '#c0fff4', '#ffffff'),
  blood: P('#1e0408', '#4a0a12', '#86121e', '#c42030', '#ec4a50', '#ff9a98', '#ffe4e0'),
  bone: P('#2a2218', '#54462e', '#8a7a58', '#c0b088', '#e8dcc0', '#fffaf0'),
  wood: P('#24130f', '#3b2216', '#5a3520', '#8a5a34', '#b9884f'),
  spark: P('#c02a1a', '#ff9230', '#ffe98a', '#fffbe0'),
  smoke: P('#1a161e', '#2a2630', '#423c48', '#5c5660', '#7a7072'),
  dust: P('#3a3024', '#5e4e3a', '#8a7658', '#b8a27e'),
  /** Enemy danger colour: telegraphs and enemy shots always read as red. */
  enemy: P('#200008', '#4a0a18', '#8a1424', '#d02a3a', '#ff5a5a', '#ffb0a8', '#ffe8e0'),
  orb: P('#1a0614', '#40102e', '#7a1a5a', '#c02a8a', '#ff4fa0', '#ffa0d0', '#fff0f8'),
};
/** Steel blade ramp for physical slashes: deep blue-steel cooling from a white edge. */
const STEEL = P('#1a2240', '#2c3e6e', '#4a68a0', '#7a9ccc', '#b4cae8', '#e4eefc', '#ffffff');
const ELEMS = ['fire', 'ice', 'lightning', 'holy', 'shadow', 'poison', 'physical'];
const at = (p: Pal, t: number) => p[Math.max(0, Math.min(p.length - 1, Math.floor(t * p.length)))]!;
const hash = (n: number) => { let x = Math.imul(n | 0, 374761393); x = Math.imul(x ^ (x >>> 13), 1274126177); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
const rng = (seed: number) => { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };

// ─────────────────────────── pixel buffer (COLOR + LIGHT) ───────────────────────────
class PixBuf {
  w = 0; h = 0; x0 = 0; y0 = 0;
  color = new Uint32Array(0); light = new Uint32Array(0);
  dirty = false; lit = false; lightOn = true;
  private cv = document.createElement('canvas'); private lv = document.createElement('canvas');
  private cx = this.cv.getContext('2d')!; private lx = this.lv.getContext('2d')!;
  private ci: ImageData | null = null; private li: ImageData | null = null;
  begin(x0: number, y0: number, x1: number, y1: number, lightOn: boolean) {
    this.x0 = Math.floor(x0 / PX) * PX - PX * 4; this.y0 = Math.floor(y0 / PX) * PX - PX * 4;
    const w = Math.min(1400, Math.ceil((x1 - this.x0) / PX) + 8), h = Math.min(1000, Math.ceil((y1 - this.y0) / PX) + 8);
    if (w !== this.w || h !== this.h || !this.ci) {
      this.w = w; this.h = h; this.cv.width = this.lv.width = w; this.cv.height = this.lv.height = h;
      this.ci = new ImageData(w, h); this.li = new ImageData(w, h);
      this.color = new Uint32Array(this.ci.data.buffer); this.light = new Uint32Array(this.li.data.buffer);
    } else { if (this.dirty) this.color.fill(0); if (this.lit) this.light.fill(0); }
    this.dirty = false; this.lit = false; this.lightOn = lightOn;
  }
  bx(x: number) { return Math.floor((x - this.x0) / PX); }
  by(y: number) { return Math.floor((y - this.y0) / PX); }
  /** Opaque pixel at world (x, y). */
  px(x: number, y: number, c: number) { this.pxb(this.bx(x), this.by(y), c); }
  pxb(bx: number, by: number, c: number) { if (bx < 0 || by < 0 || bx >= this.w || by >= this.h) return; this.color[by * this.w + bx] = c; this.dirty = true; }
  /** Pixel at alpha a, faded by ordered dither (never translucent). */
  dot(x: number, y: number, c: number, a: number) { this.dotb(this.bx(x), this.by(y), c, a); }
  dotb(bx: number, by: number, c: number, a: number) { if (a <= 0 || (a < 1 && a <= BAYER[((by & 3) << 2) | (bx & 3)]!)) return; this.pxb(bx, by, c); }
  /** Translucent pixel (smoke, vapour) in buffer coordinates. */
  blendb(bx: number, by: number, c: number, a: number) {
    if (a <= 0.01 || bx < 0 || by < 0 || bx >= this.w || by >= this.h) return;
    const j = by * this.w + bx, d = this.color[j]!, da = d >>> 24;
    a = clamp01(a); this.dirty = true;
    if (da === 0) { this.color[j] = ((Math.round(a * 255) << 24) | (c & 0xffffff)) >>> 0; return; }
    const r = Math.round((c & 255) * a + (d & 255) * (1 - a)), g = Math.round(((c >>> 8) & 255) * a + ((d >>> 8) & 255) * (1 - a)), b = Math.round(((c >>> 16) & 255) * a + ((d >>> 16) & 255) * (1 - a));
    this.color[j] = ((Math.max(da, Math.round(a * 255)) << 24) | (b << 16) | (g << 8) | r) >>> 0;
  }
  /** Additive light at one pixel. */
  add(bx: number, by: number, c: number, k: number) {
    if (!this.lightOn || k <= 0.004 || bx < 0 || by < 0 || bx >= this.w || by >= this.h) return;
    const j = by * this.w + bx, d = this.light[j]!;
    const r = Math.min(255, (d & 255) + (c & 255) * k) | 0, g = Math.min(255, ((d >>> 8) & 255) + ((c >>> 8) & 255) * k) | 0, b = Math.min(255, ((d >>> 16) & 255) + ((c >>> 16) & 255) * k) | 0;
    this.light[j] = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0; this.lit = true;
  }
  /** Soft radial light pool (falls off with distance²). sy squashes it onto the floor. */
  glow(x: number, y: number, r: number, c: number, k: number, sy = 1) {
    if (!this.lightOn || k <= 0.01 || r <= 0) return;
    const R = r / PX, cx = (x - this.x0) / PX, cy = (y - this.y0) / PX, Ry = Math.max(1, R * sy);
    for (let by = Math.floor(cy - Ry); by <= cy + Ry; by++) for (let bx = Math.floor(cx - R); bx <= cx + R; bx++) {
      const dx = (bx + 0.5 - cx) / R, dy = (by + 0.5 - cy) / Ry, d = dx * dx + dy * dy;
      if (d < 1) { const f = 1 - Math.sqrt(d); this.add(bx, by, c, k * f * f); }
    }
  }
  flush(ctx: CanvasRenderingContext2D) {
    const sm = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    if (this.dirty && this.ci) { this.cx.putImageData(this.ci, 0, 0); ctx.drawImage(this.cv, this.x0, this.y0, this.w * PX, this.h * PX); }
    if (this.lit && this.li) {
      this.lx.putImageData(this.li, 0, 0);
      const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(this.lv, this.x0, this.y0, this.w * PX, this.h * PX); ctx.globalCompositeOperation = op;
    }
    ctx.imageSmoothingEnabled = sm;
  }
}

// ─────────────────────────── primitives ───────────────────────────
type CFn = number | ((q: number) => number);
function line(b: PixBuf, x0: number, y0: number, x1: number, y1: number, c: CFn, a: number | ((q: number) => number) = 1, lk = 0) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / PX));
  for (let i = 0; i <= n; i++) {
    const q = i / n, x = x0 + (x1 - x0) * q, y = y0 + (y1 - y0) * q, col = typeof c === 'number' ? c : c(q);
    b.dot(x, y, col, typeof a === 'number' ? a : a(q));
    if (lk) b.add(b.bx(x), b.by(y), col, lk);
  }
}
/** Ellipse outline; `dash` = pixels per dash (0 = solid), rotating with `phase`. */
function ring(b: PixBuf, x: number, y: number, r: number, sy: number, c: CFn, a = 1, dash = 0, phase = 0, lk = 0) {
  if (r < 1 || a <= 0) return;
  const n = Math.max(16, Math.ceil(((TAU * r) / PX) * 1.15));
  for (let i = 0; i < n; i++) {
    if (dash && (Math.floor(i / dash + phase) & 1)) continue;
    const q = i / n, an = q * TAU, xx = x + Math.cos(an) * r, yy = y + Math.sin(an) * r * sy, col = typeof c === 'number' ? c : c(q);
    b.dot(xx, yy, col, a); if (lk) b.add(b.bx(xx), b.by(yy), col, lk);
  }
}
/** Visit every art pixel inside a (world) ellipse: fn gets normalised distance 0..1, local offsets and buffer coords. */
function disc(b: PixBuf, x: number, y: number, r: number, sy: number, fn: (d: number, dx: number, dy: number, bx: number, by: number) => void) {
  const R = Math.max(0.5, r / PX), Ry = Math.max(0.5, R * sy), cx = (x - b.x0) / PX, cy = (y - b.y0) / PX;
  for (let by = Math.floor(cy - Ry); by <= cy + Ry; by++) for (let bx = Math.floor(cx - R); bx <= cx + R; bx++) {
    const dx = (bx + 0.5 - cx) / R, dy = (by + 0.5 - cy) / Ry, d = Math.sqrt(dx * dx + dy * dy);
    if (d <= 1) fn(d, dx, dy, bx, by);
  }
}
/** Ball with a dark rim, lit core and highlight toward the upper-left (fireballs, orbs, blobs, rocks). */
function ball(b: PixBuf, x: number, y: number, r: number, pal: Pal, heat = 1, lk = 0) {
  disc(b, x, y, r, 1, (d, dx, dy, bx, by) => {
    const lit = clamp01(1 - d * 0.85 - (dx + dy) * 0.18) * heat;
    const c = d > 0.86 ? pal[0]! : at(pal, 0.15 + lit * 0.85);
    b.pxb(bx, by, c); if (lk && d < 0.8) b.add(bx, by, c, lk * (1 - d));
  });
}
/** Glint: a 4-point star with long axis arms, short diagonals and a white centre. */
function sparkle(b: PixBuf, x: number, y: number, size: number, pal: Pal, a = 1) {
  const top = pal[pal.length - 1]!, mid = at(pal, 0.75), cx = b.bx(x), cy = b.by(y);
  for (let i = 1; i <= size; i++) { const c = i <= size * 0.5 ? top : mid; b.dotb(cx + i, cy, c, a); b.dotb(cx - i, cy, c, a); b.dotb(cx, cy + i, c, a); b.dotb(cx, cy - i, c, a); }
  const dg = Math.floor(size / 3); for (let i = 1; i <= dg; i++) { b.dotb(cx + i, cy + i, mid, a); b.dotb(cx - i, cy - i, mid, a); b.dotb(cx + i, cy - i, mid, a); b.dotb(cx - i, cy + i, mid, a); }
  if (a > 0.3) { b.pxb(cx, cy, top); b.add(cx, cy, top, 0.8 * a); }
}
/** Release flare: 8 rays, axis rays long, diagonals short. */
function flare(b: PixBuf, x: number, y: number, len: number, pal: Pal, k: number) {
  for (let i = 0; i < 8; i++) {
    const an = (i / 8) * TAU, L = (i % 2 ? len * 0.55 : len) * k;
    line(b, x, y, x + Math.cos(an) * L, y + Math.sin(an) * L, (q) => at(pal, 1 - q * 0.6), (q) => 1 - q * 0.8, 0.35);
  }
  b.glow(x, y, len * 1.6, pal[pal.length - 2]!, 0.6 * k);
}
/** Crescent smear (slashes): thickest just behind the leading edge, white outer rim cooling down the ramp
 *  toward the tail, tail dissolving through the dither. `lead` is the leading angle; sy squashes onto the floor. */
function crescent(b: PixBuf, cx: number, cy: number, R: number, W: number, lead: number, span: number, dir: number, pal: Pal, age: number, sy = 1) {
  if (span <= 0.02 || W < PX * 0.5) return;
  const RR = R + PX;
  disc(b, cx, cy, RR, sy, (_d, dx, dy, bx, by) => {
    const lx = dx * RR, ly = dy * RR, r = Math.hypot(lx, ly), depth = R - r;
    if (depth < 0 || depth > W + PX) return;
    let u = (dir * (lead - Math.atan2(ly, lx))) % TAU; if (u < 0) u += TAU;
    if (u > span) return;
    const behind = u / span, thick = W * (1 - behind) ** 0.7;
    if (depth > thick) return;
    const rim = depth < PX * 1.1;
    const t = rim ? 1.05 - behind * 0.45 - age : 0.85 - (depth / Math.max(1, W)) * 0.45 - behind * 0.55 - age;
    const c = at(pal, t);
    b.dotb(bx, by, c, 1.35 - behind * 1.3);
    if (rim) b.add(bx, by, c, 0.3 * (1 - behind));
  });
}
/** Jagged lightning segment with a white core and a coloured sheath. */
function jag(b: PixBuf, x0: number, y0: number, x1: number, y1: number, pal: Pal, rnd: () => number, segs: number, a = 1) {
  let px = x0, py = y0;
  for (let i = 1; i <= segs; i++) {
    const q = i / segs, nx = x0 + (x1 - x0) * q + (i < segs ? (rnd() - 0.5) * 12 : 0), ny = y0 + (y1 - y0) * q + (i < segs ? (rnd() - 0.5) * 12 : 0);
    line(b, px, py + PX, nx, ny + PX, pal[2]!, a * 0.8); line(b, px, py, nx, ny, i === 1 ? pal[pal.length - 1]! : pal[5]!, a, 0.4);
    px = nx; py = ny;
  }
}

// ─────────────────────────── particles & timed effects ───────────────────────────
type PK = 'spark' | 'ember' | 'flame' | 'smoke' | 'flake' | 'plus' | 'mote' | 'chunk' | 'bubble' | 'drip' | 'wisp' | 'streak';
interface Part { k: PK; x: number; y: number; vx: number; vy: number; t: number; life: number; pal: Pal; size: number; floor: number; seed: number; grav: number }
interface Fx { kind: string; x: number; y: number; ang: number; t: number; life: number; r: number; pal: Pal; seed: number; owner?: number; data?: { rev?: boolean; arc?: number; tx?: number; ty?: number } }

export function skillPal(sk: SkillDef | undefined, base: string): Pal {
  if (sk?.cls === 'chronomancer' && base !== 'shadow') return PAL.time!;
  if (sk && sk.tags.includes('heal')) return PAL.heal!;
  return PAL[base] ?? PAL.physical!;
}
function parseVisual(v: string) {
  const [b, sk] = v.split('@');
  const base = b!.replace('slash_', '').replace('enemy_', '').replace('_basic', '').replace('_heal', '').replace('_trap', '').replace(/^(beam|pull|debuff|detonate)_/, '');
  const enemy = b!.startsWith('enemy');
  return { base: ELEMS.includes(base) ? base : base === 'orb' ? 'orb' : 'physical', skill: sk && !enemy ? SKILL_MAP[sk] : undefined, kind: enemy ? sk ?? base : '', basic: b!.includes('_basic'), heal: b!.endsWith('_heal'), enemy };
}
function elemOf(sk: SkillDef) {
  for (const f of sk.effects) { const d = (f as { dmg?: { type: string } }).dmg; if (d?.type) return d.type; }
  return ELEMS.find((t) => sk.tags.includes(t)) ?? 'physical';
}
function buffPal(sk: SkillDef, pal: Pal): Pal {
  const byId: Record<string, Pal> = { war_u_titan: PAL.blood!, war_warcry: PAL.fire!, asn_u_frenzy: PAL.blood!, asn_venom: PAL.poison!, asn_smoke: PAL.smoke!, asn_mark: PAL.blood!, rng_mark: PAL.fire!, rng_u_focus: PAL.holy!, mag_u_overload: PAL.lightning!, nec_u_lich: PAL.shadow!, nec_bone_armor: PAL.bone!, war_fortify: PAL.ice!, war_u_bastion: PAL.ice!, pal_taunt: PAL.holy! };
  return byId[sk.id] ?? pal;
}

type Area = ClientGame['areas'][number];
type Proj = ClientGame['projs'][number];

export class Vfx {
  fx: Fx[] = [];
  parts: Part[] = [];
  hitstop = 0;
  private ground = new PixBuf();
  private top = new PixBuf();
  private seenArea = new Set<number>();
  private seenAreaQ: number[] = [];
  private trails = new Map<number, Array<{ x: number; y: number; t: number }>>();
  private dashUntil = new Map<number, number>();
  private dashPal = new Map<number, Pal>();
  private lastZap: { x: number; y: number; t: number } | null = null;
  private statusT = 0;
  private now = 0;
  private acc = 0;
  constructor(private g: ClientGame) {}

  get budget() { return this.g.quality === 'high' ? 1400 : this.g.quality === 'medium' ? 600 : 160; }
  private p(k: PK, x: number, y: number, vx: number, vy: number, life: number, pal: Pal, o: Partial<Part> = {}) {
    if (this.parts.length >= this.budget) return;
    this.parts.push({ k, x, y, vx, vy, t: 0, life, pal, size: 1, floor: y + 14, seed: (Math.random() * 1e6) | 0, grav: 0, ...o });
  }
  /** Spray n particles of kind k from (x, y) at speed s, optionally aimed (ang ± spread/2) and kicked upward. */
  private spray(k: PK, n: number, x: number, y: number, s: number, life: number, pal: Pal, o: Partial<Part> & { ang?: number; spread?: number; up?: number } = {}) {
    const { ang, spread, up, ...rest } = o;
    for (let i = 0; i < n; i++) {
      const a = ang === undefined ? Math.random() * TAU : ang + (Math.random() - 0.5) * (spread ?? 1), v = s * (0.35 + Math.random() * 0.65);
      this.p(k, x, y, Math.cos(a) * v, Math.sin(a) * v * 0.7 - (up ?? 0) * Math.random(), life * (0.6 + Math.random() * 0.6), pal, rest);
    }
  }
  add(kind: string, x: number, y: number, o: Partial<Fx> = {}) { this.fx.push({ kind, x, y, ang: 0, t: 0, life: 0.5, r: 40, pal: PAL.physical!, seed: (Math.random() * 1e9) | 0, ...o }); }

  // ─────────────────────────── events ───────────────────────────
  onCast(ev: { id: number; skill: string; x: number; y: number }) {
    const e = this.g.ents.get(ev.id);
    const sk = SKILL_MAP[ev.skill];
    if (!e || !sk) return;
    const pal = skillPal(sk, elemOf(sk));
    const aim = Math.atan2(ev.y - e.ry, ev.x - e.rx);
    // anticipation: energy gathers into the caster's hand
    this.add('gather', e.rx, e.ry, { life: 0.22, pal, r: 22, owner: e.id, ang: aim });
    for (const f of sk.effects) this.castEffect(e, sk, f, pal, ev.x, ev.y, aim);
    if (sk.kind === 'ultimate') {
      this.g.shake = Math.max(this.g.shake, 4);
      this.add('flare', e.rx, e.ry - 18, { life: 0.1, pal, r: 26 });
      this.add('shock', e.rx, e.ry, { life: 0.55, pal, r: 80 });
    }
    this.signature(e, sk, pal, ev.x, ev.y);
  }
  private castEffect(e: CEnt, sk: SkillDef, f: SkillEffect, pal: Pal, ax: number, ay: number, aim: number) {
    switch (f.t) {
      case 'blink': this.add('portal', e.rx, e.ry, { life: 0.4, pal, r: 22 }); this.spray('streak', 10, e.rx, e.ry - 14, 260, 0.2, pal, { ang: aim + (f.backward ? Math.PI : 0), spread: 0.4 }); break;
      case 'swap': this.add('portal', e.rx, e.ry, { life: 0.45, pal, r: 22 }); this.add('portal', ax, ay, { life: 0.45, pal, r: 22 }); break;
      case 'cleanse': this.spray('mote', 16, e.rx, e.ry - 10, 70, 0.8, PAL.heal!, { up: 90 }); this.add('shock', e.rx, e.ry, { life: 0.4, pal: PAL.heal!, r: f.radius ?? 40 }); break;
      case 'debuff': this.add('hexsigil', f.at === 'self' ? e.rx : ax, f.at === 'self' ? e.ry : ay, { life: 1.2, pal: PAL.shadow!, r: f.radius }); break;
      case 'detonate': { const x = f.at === 'self' ? e.rx : ax, y = f.at === 'self' ? e.ry : ay; this.add('flare', x, y - 10, { life: 0.14, pal, r: 30 }); this.add('shock', x, y, { life: 0.5, pal, r: f.radius }); this.spray('chunk', 14, x, y, 200, 0.7, pal, { up: 160, grav: 800 }); break; }
      case 'pull': { const x = f.at === 'self' ? e.rx : ax, y = f.at === 'self' ? e.ry : ay; this.add('portal', x, y, { life: 0.6, pal, r: f.radius * 0.5 }); for (let k = 0; k < 14; k++) { const a = (k / 14) * TAU, r = f.radius; this.p('streak', x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7, -Math.cos(a) * r * 2.4, -Math.sin(a) * r * 1.7, 0.4, pal); } break; }
      case 'buff': {
        const bp = buffPal(sk, pal), big = sk.kind === 'ultimate';
        this.add('aura', e.rx, e.ry, { life: big ? 1.3 : 0.9, pal: bp, r: big ? 34 : 24, owner: e.id });
        this.spray('mote', big ? 26 : 14, e.rx, e.ry - 4, 30, 0.9, bp, { ang: -Math.PI / 2, spread: 1.4, up: 60 });
        if (f.party || f.radius) this.add('shock', e.rx, e.ry, { life: 0.5, pal: bp, r: Math.min(120, f.radius ?? 120) });
        break;
      }
      case 'heal':
        this.spray('plus', 14, e.rx, e.ry - 10, 30, 1.0, PAL.heal!, { ang: -Math.PI / 2, spread: 2.4, up: 40 });
        this.add('shock', e.rx, e.ry, { life: 0.55, pal: PAL.heal!, r: f.radius ?? 36 });
        this.add('pool', e.rx, e.ry - 12, { life: 0.6, pal: PAL.heal!, r: 46 });
        break;
      case 'barrier': this.add('hexshield', e.rx, e.ry, { life: 0.9, pal: PAL.ice!, r: 24, owner: e.id }); if (f.radius) this.add('shock', e.rx, e.ry, { life: 0.6, pal: PAL.ice!, r: f.radius }); break;
      case 'summon': {
        const ground = sk.targeting === 'ground';
        this.add('portal', ground ? ax : e.rx + Math.cos(aim) * 30, ground ? ay : e.ry + Math.sin(aim) * 30, { life: 1.0, pal: sk.cls === 'necromancer' ? PAL.shadow! : sk.cls === 'paladin' ? PAL.holy! : sk.cls === 'ranger' ? PAL.dust! : pal, r: 30 });
        break;
      }
      case 'taunt':
        for (let i = 0; i < 3; i++) this.add('shout', e.rx, e.ry - 18, { life: 0.45 + i * 0.12, pal: PAL.fire!, r: f.radius * (0.45 + i * 0.28) });
        this.add('flare', e.rx, e.ry - 24, { life: 0.1, pal: PAL.fire!, r: 16 }); this.g.shake = Math.max(this.g.shake, 2.5);
        break;
      case 'dash':
        this.dashUntil.set(e.id, this.now + 0.35); this.dashPal.set(e.id, f.invuln || sk.cls === 'assassin' ? PAL.shadow! : sk.cls === 'paladin' ? PAL.holy! : sk.id === 'mag_blink' ? PAL.lightning! : pal === PAL.physical ? PAL.dust! : pal);
        if (sk.cls === 'assassin') this.spray('smoke', 8, e.rx, e.ry - 10, 50, 0.8, PAL.shadow!, { size: 7 });
        if (sk.id === 'mag_blink' || sk.id === 'chr_blink') { this.add('flare', e.rx, e.ry - 18, { life: 0.1, pal, r: 18 }); this.spray('streak', 10, e.rx, e.ry - 16, 260, 0.15, pal); }
        this.add('speedlines', e.rx, e.ry, { life: 0.32, pal: f.invuln ? PAL.shadow! : pal, ang: f.backward ? aim + Math.PI : aim, owner: e.id });
        this.spray('smoke', 5, e.rx, e.ry - 2, 30, 0.5, PAL.dust!, { size: 4 });
        break;
      case 'gain': if (f.secondary) this.spray('mote', Math.min(6, f.secondary * 2), e.rx, e.ry - 40, 25, 0.6, pal, { ang: -Math.PI / 2, spread: 1 }); break;
      default: break;
    }
  }
  /** Skills whose look is more than the sum of their effects. */
  /** Every extended skill gets its own cast signature: a shape × particle × placement combination unique within its class. */
  private recipe(e: CEnt, sk: SkillDef, pal: Pal, ax: number, ay: number) {
    const list = SKILL_ORDER[sk.cls] ?? [];
    const i = Math.max(0, list.indexOf(sk.id));
    const shape = RECIPE_SHAPES[i % RECIPE_SHAPES.length]!, part = RECIPE_PARTS[Math.floor(i / RECIPE_SHAPES.length) % RECIPE_PARTS.length]!;
    const atAim = sk.targeting === 'ground' || sk.targeting === 'target';
    const x = atAim ? ax : e.rx, y = atAim ? ay : e.ry, big = sk.kind === 'ultimate' ? 1.8 : 1;
    this.add(shape, x, y, { life: 0.55 * big, pal, r: (shape === 'clock' || shape === 'hexsigil' ? 46 : 30) * big, ang: Math.atan2(ay - e.ry, ax - e.rx) });
    this.spray(part, Math.round(10 * big), x, y - 10, 90 + 40 * big, 0.7, pal, { up: part === 'smoke' || part === 'wisp' || part === 'mote' ? 50 : 120, grav: part === 'chunk' || part === 'drip' || part === 'spark' ? 700 : 0 });
  }
  private signature(e: CEnt, sk: SkillDef, _pal: Pal, ax: number, ay: number) {
    if (!LAUNCH_SIGNATURES.has(sk.id)) return this.recipe(e, sk, _pal, ax, ay);
    switch (sk.id) {
      case 'chr_u_stop': this.add('clock', e.rx, e.ry, { life: 1.6, pal: PAL.time!, r: 170 }); break;
      case 'chr_rewind': case 'chr_u_paradox': this.add('clock', e.rx, e.ry, { life: 0.9, pal: PAL.time!, r: 40, owner: e.id, data: { rev: true } }); break;
      case 'chr_haste': case 'chr_u_accel': this.add('clock', e.rx, e.ry, { life: 0.8, pal: PAL.time!, r: 34, owner: e.id }); break;
      case 'war_u_titan': this.add('pillar', e.rx, e.ry, { life: 0.7, pal: PAL.blood!, r: 26 }); this.spray('chunk', 12, e.rx, e.ry, 160, 0.9, PAL.dust!, { up: 200, grav: 900 }); break;
      case 'pal_u_avatar': this.add('pillar', e.rx, e.ry, { life: 0.8, pal: PAL.holy!, r: 30 }); this.spray('mote', 20, e.rx, e.ry, 60, 1.2, PAL.holy!, { up: 80 }); break;
      case 'nec_u_lich': this.add('pillar', e.rx, e.ry, { life: 0.9, pal: PAL.shadow!, r: 26 }); this.spray('wisp', 16, e.rx, e.ry - 20, 60, 1.2, PAL.shadow!); break;
      case 'mag_u_overload': this.add('zapaura', e.rx, e.ry, { life: 1.0, pal: PAL.lightning!, r: 28, owner: e.id }); break;
      case 'asn_u_massacre': this.add('slashstorm', e.rx, e.ry, { life: 1.0, pal: PAL.blood!, r: 200 }); break;
      case 'asn_smoke': this.spray('smoke', 26, ax || e.rx, ay || e.ry, 80, 1.6, PAL.smoke!, { size: 10 }); break;
      case 'asn_u_clone': this.add('portal', e.rx, e.ry, { life: 0.6, pal: PAL.shadow!, r: 24 }); break;
      case 'war_warcry': case 'pal_taunt': this.g.shake = Math.max(this.g.shake, 3); break;
      case 'rng_u_snipe': this.add('scope', ax, ay, { life: 0.35, pal: PAL.fire!, r: 26 }); break;
      case 'nec_drain': { // life streams from the drained spot back into the caster
        for (let i = 0; i < 18; i++) { const an = Math.random() * TAU, rr = Math.random() * 90, sx = ax + Math.cos(an) * rr, sy = ay + Math.sin(an) * rr - 10, t = 0.45 + Math.random() * 0.3; this.p('mote', sx, sy, (e.rx - sx) / t, (e.ry - 20 - sy) / t, t, PAL.blood!); }
        break;
      }
      case 'nec_curse': this.add('hexsigil', ax, ay, { life: 2.2, pal: PAL.shadow!, r: 110 }); break;
      case 'war_u_execution': this.add('flare', ax, ay - 16, { life: 0.12, pal: PAL.blood!, r: 34 }); this.g.shake = Math.max(this.g.shake, 5); break;
      case 'pal_smite': this.add('flare', e.rx + Math.cos(Math.atan2(ay - e.ry, ax - e.rx)) * 50, e.ry - 14 + Math.sin(Math.atan2(ay - e.ry, ax - e.rx)) * 50, { life: 0.1, pal: PAL.holy!, r: 22 }); break;
      default: break;
    }
  }

  onHit(target: CEnt, dt: string, crit: boolean, v: number, mine: boolean) {
    const pal = PAL[dt] ?? PAL.physical!, x = target.rx, y = target.ry - 16, floor = target.ry + 2;
    const heavy = mine && (crit || v > target.mhp * 0.2);
    const n = crit ? 12 : mine ? 6 : 2;
    switch (dt) {
      case 'fire': this.spray('ember', n, x, y, 110, 0.7, PAL.fire!, { up: 60, floor }); break;
      case 'ice': this.spray('flake', n, x, y, 120, 0.6, PAL.ice!, { floor }); this.spray('chunk', crit ? 5 : 2, x, y, 130, 0.6, PAL.ice!, { grav: 700, up: 120, floor }); break;
      case 'lightning': this.spray('streak', n, x, y, 260, 0.18, PAL.lightning!); break;
      case 'poison': this.spray('drip', n, x, y, 90, 0.6, PAL.poison!, { grav: 500, up: 90, floor }); break;
      case 'shadow': this.spray('wisp', Math.ceil(n / 2), x, y, 50, 0.7, PAL.shadow!); break;
      case 'holy': this.spray('mote', n, x, y, 90, 0.5, PAL.holy!); break;
      default: this.spray('spark', n, x, y, 230, 0.45, PAL.spark!, { grav: 950, up: 160, floor }); break;
    }
    if (mine) this.add('hitflash', x, y, { life: crit ? 0.16 : 0.1, pal, r: crit ? 14 : 9 });
    if (mine && dt === 'lightning') { // consecutive lightning hits are joined by an arc (chains, tempests)
      const z = this.lastZap;
      if (z && this.now - z.t < 0.3 && Math.hypot(z.x - x, z.y - y) > 20 && Math.hypot(z.x - x, z.y - y) < 320) this.add('zap', z.x, z.y, { life: 0.18, pal: PAL.lightning!, data: { tx: x, ty: y } });
      this.lastZap = { x, y, t: this.now };
    }
    if (heavy) {
      this.hitstop = Math.max(this.hitstop, crit ? 0.12 : 0.07); // the freeze sells the weight
      this.g.shake = Math.max(this.g.shake, crit ? 3 : 2);
      if (crit) this.add('flare', x, y, { life: 0.07, pal, r: 18 });
    }
  }
  onDeath(e: CEnt) {
    const pal = e.kind === 1 ? PAL.shadow! : PAL.physical!;
    this.spray('smoke', 8, e.rx, e.ry - 8, 50, 1.0, PAL.smoke!, { size: 6 });
    this.spray('chunk', 8, e.rx, e.ry - 14, 140, 0.9, PAL.dust!, { grav: 800, up: 150, floor: e.ry + 2 });
    this.spray('wisp', 5, e.rx, e.ry - 20, 40, 1.1, pal, { ang: -Math.PI / 2, spread: 0.8, up: 40 });
    this.add('shock', e.rx, e.ry, { life: 0.4, pal, r: 34 });
  }

  // ─────────────────────────── simulation ───────────────────────────
  update(dt: number) {
    this.now += dt;
    if (this.hitstop > 0) { this.hitstop -= dt; return; } // freeze-frame: effects hold on the impact
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter((f) => f.t < f.life);
    // particles step at a fixed 120 Hz
    this.acc = Math.min(0.1, this.acc + dt);
    const h = 1 / 120;
    while (this.acc >= h) { this.acc -= h; this.stepParts(h); }
    this.parts = this.parts.filter((p) => p.t < p.life);
    // dash trails
    for (const [id, until] of this.dashUntil) {
      const e = this.g.ents.get(id);
      if (!e || this.now > until) { this.dashUntil.delete(id); continue; }
      const tr = this.trails.get(id) ?? []; tr.push({ x: e.rx, y: e.ry, t: this.now }); this.trails.set(id, tr);
    }
    for (const [id, tr] of this.trails) { const k = tr.filter((q) => this.now - q.t < 0.22); if (k.length) this.trails.set(id, k); else this.trails.delete(id); }
    // status ambience
    this.statusT -= dt;
    if (this.statusT <= 0 && this.g.quality !== 'low') { this.statusT = 0.1; for (const e of this.g.ents.values()) if (!e.dead && e.st.length) this.statusFx(e); }
    // projectile trails
    const hq = this.g.quality === 'high';
    for (const p of this.g.projs) {
      if ((!hq && Math.random() < 0.5) || (p.team !== 0 && Math.random() < 0.4)) continue;
      const v = parseVisual(p.v), pal = v.base === 'orb' ? PAL.orb! : skillPal(v.skill, v.base), sp = Math.hypot(p.vx, p.vy) || 1, bx = p.x - (p.vx / sp) * p.r, by = p.y - 12 - (p.vy / sp) * p.r;
      if (pal === PAL.time) { if (Math.random() < 0.6) this.p('mote', bx, by, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 0.4, pal); continue; }
      switch (v.base) {
        case 'fire': this.p('flame', bx, by, -p.vx * 0.08 + (Math.random() - 0.5) * 20, -p.vy * 0.08 - 20, 0.35, PAL.fire!, { size: Math.max(3, p.r * 0.6) }); if (Math.random() < 0.4) this.p('ember', bx, by, (Math.random() - 0.5) * 60, -30 - Math.random() * 40, 0.6, PAL.fire!); break;
        case 'ice': if (Math.random() < 0.5) this.p('flake', bx, by, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 0.5, PAL.ice!); if (Math.random() < 0.25) this.p('smoke', bx, by, 0, -10, 0.5, PAL.ice!, { size: 4 }); break;
        case 'orb': this.p('wisp', bx, by, (Math.random() - 0.5) * 20, -15, 0.5, PAL.orb!); break;
        case 'shadow': if (Math.random() < 0.6) this.p('wisp', bx, by, (Math.random() - 0.5) * 20, -15, 0.6, PAL.shadow!); break;
        case 'poison': if (Math.random() < 0.4) this.p('drip', bx, by, 0, 0, 0.5, PAL.poison!, { grav: 400, floor: by + 18 }); break;
        case 'holy': if (Math.random() < 0.5) this.p('mote', bx, by, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, 0.45, PAL.holy!); break;
        case 'lightning': if (Math.random() < 0.4) this.p('streak', p.x, p.y - 12, (Math.random() - 0.5) * 240, (Math.random() - 0.5) * 240, 0.1, PAL.lightning!); break;
        default: break;
      }
    }
    // first sight of a player area: slash sparks / impact bursts
    for (const a of this.g.areas) {
      if (a.outside || this.seenArea.has(a.id)) continue;
      if (a.team !== 0) { if (a.fired) { this.markSeen(a.id); this.enemyImpact(a); } continue; }
      if (a.cone) { this.markSeen(a.id); this.slashSparks(a); continue; }
      if (!a.fired) continue;
      this.markSeen(a.id);
      if (a.line) { const v = parseVisual(a.v), pal = skillPal(v.skill, v.base); for (let k = 0; k < 10; k++) { const d = (k / 10) * a.r; this.spray('spark', 2, a.x + Math.cos(a.ang) * d, a.y - 10 + Math.sin(a.ang) * d, 120, 0.35, pal, { up: 60 }); } continue; }
      if (/^(pull|debuff|detonate)_/.test(a.v)) continue; // drawn at cast time (castEffect)
      if (a.delayT > 0 || a.dur <= 0.05) this.areaImpact(a);
      else { const v = parseVisual(a.v); this.add('shock', a.x, a.y, { life: 0.45, pal: v.heal ? PAL.heal! : skillPal(v.skill, v.base), r: a.r }); }
    }
    // ambient emitters for active fields
    if (this.g.quality !== 'low') for (const a of this.g.areas) if (a.team === 0 && !a.cone && !a.outside && a.fired && a.dur > 0.05 && Math.random() < dt * 14) this.fieldEmit(a);
  }
  private markSeen(id: number) { this.seenArea.add(id); this.seenAreaQ.push(id); if (this.seenAreaQ.length > 400) this.seenArea.delete(this.seenAreaQ.shift()!); }
  private stepParts(h: number) {
    for (const p of this.parts) {
      p.t += h;
      p.vy += p.grav * h;
      switch (p.k) {
        case 'ember': p.vx += Math.sin((p.t + p.seed) * 9) * 60 * h; p.vy -= 40 * h; break;
        case 'smoke': p.vy -= 26 * h; p.vx += Math.sin((p.t * 2 + p.seed) * 1.7) * 18 * h; break;
        case 'wisp': p.vy -= 30 * h; p.vx += Math.sin(p.t * 5 + p.seed) * 50 * h; break;
        case 'flame': p.vy -= 70 * h; break;
        case 'flake': p.vy += 12 * h; p.vx += Math.sin(p.t * 6 + p.seed) * 20 * h; break;
        default: break;
      }
      const drag = p.k === 'spark' || p.k === 'chunk' || p.k === 'drip' ? 0.999 : 0.985;
      p.vx *= drag; if (!p.grav) p.vy *= drag;
      p.x += p.vx * h; p.y += p.vy * h;
      if (p.grav && p.y > p.floor && p.vy > 0) { // floor bounce
        p.y = p.floor; p.vy *= p.k === 'drip' ? 0 : -0.45; p.vx *= 0.7;
        if (p.k === 'drip') { p.grav = 0; p.vx = 0; p.life = Math.min(p.life, p.t + 0.25); p.k = 'bubble'; p.size = 1; }
      }
    }
  }
  private statusFx(e: CEnt) {
    const s = e.st, x = e.rx + (Math.random() - 0.5) * 18, y = e.ry - 8 - Math.random() * 22;
    if (s.includes('burn')) { this.p('flame', x, y + 8, 0, -30, 0.4, PAL.fire!, { size: 3 }); this.p('ember', x, y, 0, -40, 0.7, PAL.fire!); }
    if (s.includes('poison')) this.p('bubble', x, y, (Math.random() - 0.5) * 8, -18, 0.6, PAL.poison!, { size: 1 + ((Math.random() * 2) | 0) });
    if (s.includes('bleed')) this.p('drip', x, y + 6, 0, 10, 0.8, PAL.blood!, { grav: 500, floor: e.ry + 2 });
    if (s.includes('chill') || s.includes('freeze')) this.p('flake', x, y - 8, (Math.random() - 0.5) * 10, 14, 0.8, PAL.ice!);
    if (s.includes('shock')) this.p('streak', x, y, (Math.random() - 0.5) * 220, (Math.random() - 0.5) * 220, 0.09, PAL.lightning!);
    if (s.includes('curse') || s.includes('weaken')) this.p('wisp', e.rx + (Math.random() - 0.5) * 26, e.ry - 34, 0, -14, 0.8, PAL.shadow!);
    if (s.includes('stun')) this.p('mote', e.rx + Math.cos(this.now * 6) * 12, e.ry - 44 + Math.sin(this.now * 6) * 3, 0, 0, 0.25, PAL.holy!);
  }
  private slashSparks(a: Area) {
    const v = parseVisual(a.v);
    const tip = a.ang + a.arc / 2, x = a.x + Math.cos(tip) * a.r * 0.9, y = a.y + Math.sin(tip) * a.r * 0.9;
    if (v.base === 'physical') this.spray('spark', v.basic ? 3 : 7, x, y - 10, 200, 0.4, PAL.spark!, { ang: tip + Math.PI / 2, spread: 1.2, grav: 950, floor: y });
    else this.spray(v.base === 'fire' ? 'ember' : v.base === 'ice' ? 'flake' : v.base === 'lightning' ? 'streak' : 'mote', 6, x, y - 10, 140, 0.45, skillPal(v.skill, v.base));
    if (a.r > 105 || v.skill?.kind === 'ultimate') this.spray('smoke', 5, a.x + Math.cos(a.ang) * a.r * 0.6, a.y + Math.sin(a.ang) * a.r * 0.6, 40, 0.6, PAL.dust!, { size: 6 });
  }
  /** Impact recipe per element (and per skill where it matters). */
  private areaImpact(a: Area) {
    const v = parseVisual(a.v), id = v.skill?.id ?? '';
    const pal = v.heal ? PAL.heal! : skillPal(v.skill, v.base), r = a.r, big = r >= 110;
    this.add('flare', a.x, a.y - 8, { life: 0.07, pal, r: Math.min(40, 10 + r * 0.2) });
    this.add('shock', a.x, a.y, { life: 0.5, pal, r: r * 1.05 });
    if (v.heal) { this.spray('plus', 16, a.x, a.y, r * 0.8, 1.0, PAL.heal!, { up: 50 }); this.add('pool', a.x, a.y, { life: 0.7, pal, r }); return; }
    if (pal === PAL.time) {
      this.add('clock', a.x, a.y, { life: 0.7, pal, r: r * 0.8 }); this.spray('mote', 16, a.x, a.y, r * 1.5, 0.8, pal);
      if (id === 'chr_u_epoch') { this.add('pillar', a.x, a.y, { life: 0.9, pal, r: 40 }); this.add('cracks', a.x, a.y, { life: 2, pal: PAL.dust!, r }); this.g.shake = Math.max(this.g.shake, 6); this.hitstop = Math.max(this.hitstop, 0.12); }
      return;
    }
    this.burstAt(v.base, a.x, a.y, r, id);
  }
  /** Element burst shared by player and enemy area impacts. */
  private burstAt(base: string, x: number, y: number, r: number, id = '') {
    const a = { x, y }, big = r >= 110;
    switch (base) {
      case 'fire':
        this.add('blast', a.x, a.y, { life: 0.5, pal: PAL.fire!, r });
        this.spray('flame', big ? 26 : 12, a.x, a.y - 6, r * 2.2, 0.55, PAL.fire!, { size: big ? 9 : 6 });
        this.spray('ember', big ? 24 : 10, a.x, a.y, r * 3, 1.0, PAL.fire!, { up: 80 });
        this.spray('smoke', big ? 12 : 5, a.x, a.y - 10, r * 0.9, 1.6, PAL.smoke!, { size: big ? 14 : 9 });
        if (id === 'mag_u_meteor' || big) { this.spray('chunk', 14, a.x, a.y, r * 2.5, 1.0, PAL.dust!, { grav: 900, up: 220, floor: a.y + 10 }); this.add('scorch', a.x, a.y, { life: 2.5, pal: PAL.fire!, r: r * 0.7 }); }
        break;
      case 'ice':
        this.add('crystals', a.x, a.y, { life: id === 'mag_frost_nova' || big ? 1.6 : 1.1, pal: PAL.ice!, r });
        this.spray('flake', 18, a.x, a.y - 6, r * 2, 0.9, PAL.ice!);
        this.spray('smoke', 6, a.x, a.y, r, 1.2, PAL.ice!, { size: 10 });
        break;
      case 'lightning':
        this.add('bolt', a.x, a.y, { life: 0.28, pal: PAL.lightning!, r });
        this.spray('streak', 18, a.x, a.y - 6, 420, 0.16, PAL.lightning!);
        this.spray('spark', 8, a.x, a.y - 6, 200, 0.4, PAL.lightning!, { grav: 900, up: 160, floor: a.y + 4 });
        this.add('scorch', a.x, a.y, { life: 1.2, pal: PAL.lightning!, r: r * 0.4 });
        break;
      case 'holy':
        this.add('pillar', a.x, a.y, { life: 0.55, pal: PAL.holy!, r: Math.min(40, r * 0.45) });
        this.spray('mote', 18, a.x, a.y, r * 1.6, 0.9, PAL.holy!, { up: 60 });
        break;
      case 'shadow':
        this.add('void', a.x, a.y, { life: 0.6, pal: PAL.shadow!, r });
        this.spray('wisp', 14, a.x, a.y - 6, r * 1.4, 1.0, PAL.shadow!);
        this.spray('smoke', 6, a.x, a.y, r * 0.7, 1.2, PAL.shadow!, { size: 9 });
        break;
      case 'poison':
        this.spray('drip', 18, a.x, a.y - 8, r * 2.2, 0.8, PAL.poison!, { grav: 600, up: 180, floor: a.y + 6 });
        this.spray('smoke', 8, a.x, a.y, r * 0.9, 1.4, PAL.poison!, { size: 10 });
        break;
      default:
        this.add('cracks', a.x, a.y, { life: 1.4, pal: PAL.dust!, r });
        this.spray('chunk', big ? 16 : 8, a.x, a.y, r * 2.4, 0.9, PAL.dust!, { grav: 900, up: 220, floor: a.y + 8 });
        this.spray('smoke', big ? 10 : 5, a.x, a.y, r * 0.9, 1.0, PAL.dust!, { size: big ? 12 : 8 });
        if (big) this.g.shake = Math.max(this.g.shake, 3);
    }
  }
  /** Enemy attack resolving: the telegraph turns into the blow it promised. */
  private enemyImpact(a: Area) {
    const v = parseVisual(a.v), me = this.g.ents.get(this.g.pid), near = !!me && Math.hypot(me.rx - a.x, me.ry - a.y) < 320;
    const pal = PAL[v.base] && v.base !== 'physical' ? PAL[v.base]! : PAL.enemy!;
    if (v.kind === 'line') return; // charge lane: the charge itself is the effect
    if (a.cone) { this.add('eslash', a.x, a.y, { life: 0.28, pal: v.base === 'physical' ? PAL.enemy! : pal, r: a.r, ang: a.ang, data: { arc: a.arc } }); this.spray('spark', 5, a.x + Math.cos(a.ang) * a.r * 0.8, a.y + Math.sin(a.ang) * a.r * 0.8 - 8, 180, 0.4, PAL.spark!, { grav: 950, up: 120 }); return; }
    this.add('shock', a.x, a.y, { life: 0.45, pal: PAL.enemy!, r: a.r });
    if (v.kind === 'slam') { this.add('cracks', a.x, a.y, { life: 1.4, pal: PAL.dust!, r: a.r }); this.spray('chunk', 12, a.x, a.y, a.r * 2.2, 0.9, PAL.dust!, { grav: 900, up: 220, floor: a.y + 8 }); this.spray('smoke', 6, a.x, a.y, a.r * 0.8, 1.0, PAL.dust!, { size: 10 }); if (v.base !== 'physical') this.burstAt(v.base, a.x, a.y, a.r * 0.7); }
    else this.burstAt(v.base === 'physical' ? 'physical' : v.base, a.x, a.y, a.r);
    if (near) this.g.shake = Math.max(this.g.shake, v.kind === 'slam' ? 4 : 2.5);
  }
  /** Boss enters a new phase: a column of eclipse light, a shockwave and a long shake. */
  onPhase(e: CEnt) {
    this.add('pillar', e.rx, e.ry, { life: 0.9, pal: PAL.orb!, r: 30 });
    this.add('flare', e.rx, e.ry - 30, { life: 0.12, pal: PAL.orb!, r: 40 });
    this.add('shock', e.rx, e.ry, { life: 0.8, pal: PAL.orb!, r: 220 });
    this.spray('wisp', 24, e.rx, e.ry - 20, 160, 1.2, PAL.orb!);
    this.hitstop = Math.max(this.hitstop, 0.15);
  }
  /** Break gauge shattered: the guard breaks apart in shards. */
  onBreak(e: CEnt) {
    this.add('flare', e.rx, e.ry - 24, { life: 0.1, pal: PAL.fire!, r: 30 });
    this.spray('chunk', 22, e.rx, e.ry - 24, 260, 1.0, PAL.holy!, { grav: 900, up: 200, floor: e.ry + 4 });
    this.spray('spark', 16, e.rx, e.ry - 24, 300, 0.5, PAL.spark!, { grav: 950, up: 150, floor: e.ry + 4 });
    this.hitstop = Math.max(this.hitstop, 0.14);
  }
  private drawTelegraph(a: Area, time: number) {
    const b = this.ground, v = parseVisual(a.v), E = PAL.enemy!, ph = Math.floor(time * 30);
    if (!(a.delay > 0 && a.delayT > 0)) return; // resolved: enemyImpact spawned the blow
    const p = 1 - a.delay / a.delayT, el = PAL[v.base] && v.base !== 'physical' ? PAL[v.base]! : null;
    const inside = (dx: number, dy: number) => { const d = Math.hypot(dx, dy); if (d > a.r) return -1; if (a.cone) { let u = Math.atan2(dy, dx) - a.ang; u = Math.atan2(Math.sin(u), Math.cos(u)); if (Math.abs(u) > a.arc / 2) return -1; } return d / a.r; };
    disc(b, a.x, a.y, a.r + PX, 1, (_d, dx, dy, bx, by) => {
      const lx = dx * (a.r + PX), ly = dy * (a.r + PX), q = inside(lx, ly);
      if (q < 0) return;
      const dd = Math.hypot(lx, ly); let u = Math.atan2(ly, lx) - a.ang; u = Math.abs(Math.atan2(Math.sin(u), Math.cos(u)));
      const edge = a.r - dd < PX * 1.5 || (a.cone && dd > PX && (a.arc / 2 - u) * dd < PX * 1.5);
      if (edge) { b.pxb(bx, by, ((bx + by + (ph >> 2)) & 3) === 0 ? E[5]! : E[3]!); return; }
      const filled = q <= p;
      b.dotb(bx, by, filled ? E[3]! : E[2]!, filled ? 0.5 : 0.2);
      if (filled && p - q < 0.04) b.pxb(bx, by, E[5]!); // the advancing front
    });
    if (el) for (let i = 0; i < 6; i++) { const f = (time * 1.6 + i / 6) % 1, an = (i / 6) * TAU + f; const rr = a.r * (1 - f) * 0.9; const x = a.cone ? a.x + Math.cos(a.ang + (i / 5 - 0.5) * a.arc * 0.8) * (a.r * (0.3 + 0.7 * (1 - f))) : a.x + Math.cos(an) * rr, y = a.cone ? a.y + Math.sin(a.ang + (i / 5 - 0.5) * a.arc * 0.8) * (a.r * (0.3 + 0.7 * (1 - f))) : a.y + Math.sin(an) * rr; b.dot(x, y, el[5]!, 1 - f * 0.4); b.add(b.bx(x), b.by(y), el[4]!, 0.4); }
    if (p > 0.75) b.glow(a.x, a.y, a.r, E[4]!, (p - 0.75) * 0.8);
  }
  private fieldEmit(a: Area) {
    const v = parseVisual(a.v), an = Math.random() * TAU, rr = Math.sqrt(Math.random()) * a.r, x = a.x + Math.cos(an) * rr, y = a.y + Math.sin(an) * rr * 1;
    const pal = v.heal ? PAL.heal! : skillPal(v.skill, v.base);
    if (v.heal) { this.p('plus', x, y, 0, -40, 0.9, pal); return; }
    switch (v.base) {
      case 'fire': this.p('ember', x, y, 0, -50, 0.9, PAL.fire!); if (Math.random() < 0.3) this.p('smoke', x, y - 14, 0, -20, 1.4, PAL.smoke!, { size: 8 }); break;
      case 'poison': this.p('smoke', x, y, 0, -12, 1.4, PAL.poison!, { size: 9 }); break;
      case 'shadow': this.p('wisp', x, y, 0, -30, 1.0, PAL.shadow!); break;
      case 'holy': this.p('mote', x, y, 0, -45, 1.0, PAL.holy!); break;
      case 'ice': this.p('smoke', x, y, 0, -8, 1.2, PAL.ice!, { size: 8 }); break;
      case 'lightning': this.p('streak', x, y - 6, (Math.random() - 0.5) * 300, (Math.random() - 0.5) * 300, 0.1, PAL.lightning!); break;
      default: if (v.skill?.id === 'rng_rain') this.spray('spark', 2, x, y, 120, 0.3, PAL.spark!, { grav: 900, up: 100, floor: y + 2 }); break;
    }
  }

  // ─────────────────────────── drawing ───────────────────────────
  /** Called by the renderer before the ground layer, with the visible world rectangle. */
  begin(x0: number, y0: number, x1: number, y1: number) {
    const lightOn = this.g.quality !== 'low';
    this.ground.begin(x0, y0, x1, y1, lightOn); this.top.begin(x0, y0, x1, y1, lightOn);
  }
  /** Player areas go into the ground buffer; enemy telegraphs keep the renderer's readable red style. */
  drawArea(_ctx: CanvasRenderingContext2D, a: Area, time: number): boolean {
    if (a.outside) return false;
    if (a.team !== 0) { this.drawTelegraph(a, time); return true; }
    const v = parseVisual(a.v), pal = v.heal ? PAL.heal! : skillPal(v.skill, v.base), id = v.skill?.id ?? '';
    if (a.line) { drawBeam(_ctx, a, pal, time); return true; }
    if (a.v.includes('_trap') && !a.fired) { drawTrap(_ctx, a, pal, time); return true; }
    if (a.cone) this.drawSlash(a, pal, v.basic, v.skill);
    else if (a.delay > 0 && a.delayT > 0) this.drawSigil(a, pal, id, v.base, time);
    else if (a.dur > 0.05) this.drawField(a, pal, v.base, id, time, v.heal);
    return true;
  }
  flushGround(ctx: CanvasRenderingContext2D) {
    for (const f of this.fx) if (GROUND_FX.has(f.kind) || (f.kind === 'clock' && f.r > 100)) this.drawFx(f, this.now, this.ground);
    this.ground.flush(ctx);
  }

  private drawSlash(a: Area, pal: Pal, basic: boolean, sk?: SkillDef) {
    const age = a.age;
    if (age > 0.32) return;
    const sweep = easeOut(age / 0.07); // the blade whips round in ~2 frames
    const span = a.arc * sweep * (1 - smooth(0.08, 0.3, age) * 0.85); // the tail shortens as it dissolves
    const heavy = (sk && (sk.kind === 'ultimate' || a.r > 105)) || a.arc > 2.6;
    const W = a.r * (heavy ? 0.26 : basic ? 0.14 : 0.2);
    const lead = a.ang - a.arc / 2 + a.arc * sweep;
    const sp = sk?.cls === 'assassin' && pal === PAL.physical ? PAL.blood! : pal === PAL.physical ? STEEL : pal;
    crescent(this.ground, a.x, a.y - 8, a.r * 0.92, W, lead, span, 1, sp, smooth(0.04, 0.3, age) * 0.55, 1);
    if (heavy) crescent(this.ground, a.x, a.y - 8, a.r * 0.7, W * 0.5, lead - 0.15, span * 0.7, 1, sp, 0.25 + smooth(0.04, 0.3, age) * 0.5, 1); // echo
    if (age < 0.14) { const tx = a.x + Math.cos(lead) * a.r * 0.92, ty = a.y - 8 + Math.sin(lead) * a.r * 0.92 * 1; sparkle(this.ground, tx, ty, heavy ? 6 : 4, sp, 1 - age / 0.14); }
  }
  private drawSigil(a: Area, pal: Pal, id: string, base: string, time: number) {
    const b = this.ground, p = 1 - a.delay / a.delayT, ph = Math.floor(time * 30), sy = 1;
    // dithered pool that fills as the strike approaches
    disc(b, a.x, a.y, a.r * (0.3 + 0.7 * p), sy, (d, _dx, _dy, bx, by) => b.dotb(bx, by, at(pal, 0.2 + (1 - d) * 0.25), (0.15 + p * 0.3) * (1 - d * 0.5)));
    ring(b, a.x, a.y, a.r, sy, at(pal, 0.55 + p * 0.4), 1, 6, ph / 6, 0.15);
    if (p > 0.25) ring(b, a.x, a.y, a.r * 0.78, sy, at(pal, 0.45 + p * 0.3), 1, 3, -ph / 5);
    for (let i = 0; i < 6; i++) { const an = (i / 6) * TAU + time * 0.8; line(b, a.x + Math.cos(an) * a.r * 0.78, a.y + Math.sin(an) * a.r * 0.78 * sy, a.x + Math.cos(an) * a.r, a.y + Math.sin(an) * a.r * sy, at(pal, 0.8)); }
    // energy streaks spiralling inward (gathering)
    for (let i = 0; i < 8; i++) {
      const f = (time * 1.4 + i / 8) % 1, an = (i / 8) * TAU + f * 1.4, r0 = a.r * (1 - f), r1 = Math.max(0, r0 - 8);
      line(b, a.x + Math.cos(an) * r0, a.y + Math.sin(an) * r0 * sy, a.x + Math.cos(an - 0.15) * r1, a.y + Math.sin(an - 0.15) * r1 * sy, (q) => at(pal, 0.5 + q * 0.5), 1 - f * 0.3, 0.2);
    }
    b.glow(a.x, a.y, a.r * 0.8, pal[pal.length - 3]!, 0.08 + p * p * 0.25, sy);
    const t = this.top;
    if (base === 'fire' && id === 'mag_u_meteor') { // the meteor falls onto its mark
      const hgt = (1 - p) * 300, mx = a.x + (1 - p) * 110, my = a.y - hgt - 10;
      for (let i = 6; i >= 1; i--) { const q = i / 6; disc(t, mx + q * 34, my - q * 92, 12 * (1 - q * 0.7), 1, (d, _a, _c, bx, by) => t.dotb(bx, by, at(PAL.fire!, 1 - q * 0.8 - d * 0.3), 1.2 - q)); }
      ball(t, mx, my, 12, PAL.dust!, 0.9);
      disc(t, mx, my, 13, 1, (d, dx, dy, bx, by) => { if (d > 0.75 && dx + dy > 0) t.pxb(bx, by, at(PAL.fire!, 0.9)); });
      t.glow(mx, my, 60, PAL.fire![5]!, 0.6);
    } else if (base === 'holy') { // light gathers into a column
      const w = 3 + p * 6;
      for (let y = 0; y < 220; y += PX) { const fl = (Math.floor(y / 6) + ph) % 3; t.dot(a.x - w / 2 + ((fl * 2) % w), a.y - y - 10, at(PAL.holy!, 0.95 - y / 400), p * (1 - y / 220)); }
      t.glow(a.x, a.y - 20, 30 + p * 20, PAL.holy![5]!, 0.25 * p);
    } else if (base === 'lightning') { // charge: sparks crawl over the ring
      for (let i = 0; i < 4; i++) { const an = hash(ph * 7 + i) * TAU; sparkle(t, a.x + Math.cos(an) * a.r, a.y + Math.sin(an) * a.r * sy, 2, PAL.lightning!); }
    } else if (pal === PAL.time) { // a clock hand sweeps round
      const an = -Math.PI / 2 + p * TAU;
      line(b, a.x, a.y, a.x + Math.cos(an) * a.r * 0.9, a.y + Math.sin(an) * a.r * 0.9 * sy, PAL.time![6]!, 1, 0.3);
    }
  }
  private drawField(a: Area, pal: Pal, base: string, id: string, time: number, heal: boolean) {
    const b = this.ground, R = a.r, sy = 1, ph = Math.floor(time * 30), seed = a.id * 131;
    // spinning blades (cyclones, orbiting edges, auras that follow the caster)
    if (id === 'war_whirl' || id === 'war_u_blade_storm' || id === 'asn_blades' || id === 'pal_u_avatar') {
      const n = id === 'war_u_blade_storm' ? 4 : id === 'asn_blades' ? 3 : 2, spin = time * (id === 'asn_blades' ? 10 : 14);
      const bp = id === 'asn_blades' ? PAL.blood! : id === 'pal_u_avatar' ? PAL.holy! : STEEL;
      for (let i = 0; i < n; i++) crescent(b, a.x, a.y - 6, R * 0.95, R * 0.16, spin + (i / n) * TAU, 1.6, 1, bp, 0.1, sy);
      ring(b, a.x, a.y - 6, R * 0.55, sy, at(PAL.dust!, 0.6), 0.6, 5, -ph / 3);
      return;
    }
    const life = smooth(0, 0.25, a.age) * (a.dur < 0.4 ? a.dur / 0.4 : 1); // grow in, fade out
    if (heal || base === 'holy') {
      disc(b, a.x, a.y, R, sy, (d, _x, _y, bx, by) => b.dotb(bx, by, at(pal, 0.35 + (1 - d) * 0.2), 0.22 * life * (1.2 - d)));
      ring(b, a.x, a.y, R, sy, at(pal, 0.8), life, 0, 0, 0.2); ring(b, a.x, a.y, R * 0.82, sy, at(pal, 0.6), life, 4, ph / 8);
      for (let i = 0; i < 8; i++) { const an = (i / 8) * TAU + time * 0.5; sparkle(b, a.x + Math.cos(an) * R * 0.91, a.y + Math.sin(an) * R * 0.91 * sy, 2, pal, life); }
      for (let i = 0; i < 14; i++) { const f = (time * 0.7 + hash(seed + i)) % 1, an = hash(seed + i * 3) * TAU, rr = Math.sqrt(hash(seed + i * 7)) * R; b.dot(a.x + Math.cos(an) * rr, a.y + Math.sin(an) * rr * sy - f * 40, at(pal, 1 - f * 0.6), (1 - f) * life * 1.4); }
      b.glow(a.x, a.y, R, pal[pal.length - 3]!, 0.14 * life, sy);
      return;
    }
    if (pal === PAL.time) {
      ring(b, a.x, a.y, R, sy, at(pal, 0.7), life, 0, 0, 0.15);
      for (let i = 0; i < 12; i++) { const an = (i / 12) * TAU; line(b, a.x + Math.cos(an) * R * 0.86, a.y + Math.sin(an) * R * 0.86 * sy, a.x + Math.cos(an) * R, a.y + Math.sin(an) * R * sy, at(pal, i % 3 ? 0.6 : 0.95), life); }
      const h1 = time * 0.9, h2 = time * 5;
      line(b, a.x, a.y, a.x + Math.cos(h1) * R * 0.5, a.y + Math.sin(h1) * R * 0.5 * sy, pal[6]!, life, 0.2); line(b, a.x, a.y, a.x + Math.cos(h2) * R * 0.8, a.y + Math.sin(h2) * R * 0.8 * sy, pal[5]!, life, 0.2);
      for (let i = 0; i < 16; i++) { const an = hash(seed + i) * TAU - time * (0.6 + hash(i) * 0.8), rr = R * (0.2 + 0.75 * hash(seed + i * 5)); b.dot(a.x + Math.cos(an) * rr, a.y + Math.sin(an) * rr * sy, at(PAL.holy!, 0.7), life); }
      return;
    }
    switch (base) {
      case 'fire': {
        disc(b, a.x, a.y, R, sy, (d, _x, _y, bx, by) => b.dotb(bx, by, at(PAL.fire!, 0.12 + (1 - d) * 0.2), 0.28 * life * (1 - d * 0.8)));
        const n = Math.min(28, 6 + Math.floor(R / 6));
        for (let i = 0; i < n; i++) { // flame tongues licking up from the ground, cooling as they rise
          const an = hash(seed + i) * TAU, rr = Math.sqrt(hash(seed + i * 3)) * R * 0.9, fx = a.x + Math.cos(an) * rr, fy = a.y + Math.sin(an) * rr * sy;
          const f = (time * 1.8 + hash(seed + i * 5)) % 1, hgt = (10 + hash(seed + i * 7) * 14) * (1 - f * 0.4) * life, w = 4 + hash(i) * 3;
          for (let y = 0; y < hgt; y += PX) {
            const q = y / hgt, ww = w * (1 - q) ** 0.8 * (1 + Math.sin(time * 14 + i + y * 0.3) * 0.15), sway = Math.sin(time * 9 + i * 1.7 + y * 0.12) * q * 3;
            for (let x = -ww; x <= ww; x += PX) { const edge = Math.abs(x) / Math.max(1, ww); b.px(fx + x + sway, fy - y, edge > 0.75 ? PAL.fire![1]! : at(PAL.fire!, 1 - q * 0.75 - edge * 0.25 - f * 0.2)); }
          }
        }
        b.glow(a.x, a.y - 8, R * 1.1, PAL.fire![4]!, 0.22 * life, sy);
        break;
      }
      case 'ice': {
        disc(b, a.x, a.y, R, sy, (d, _dx, _dy, bx, by) => { const crust = hash(bx * 7 + by * 13) > 0.9; b.dotb(bx, by, crust ? PAL.ice![6]! : at(PAL.ice!, 0.4 + (1 - d) * 0.2), (crust ? 0.7 : 0.16) * life * (1.15 - d)); });
        ring(b, a.x, a.y, R, sy, PAL.ice![6]!, life * 0.9);
        for (let i = 0; i < 26; i++) { // snow driven by the wind
          const f = (time * 0.9 + hash(seed + i)) % 1, an = hash(seed + i * 3) * TAU, rr = Math.sqrt(hash(seed + i * 5)) * R, x = a.x + Math.cos(an) * rr + f * 18, y = a.y + Math.sin(an) * rr * sy - 50 + f * 50;
          if (i % 4 === 0) sparkle(b, x, y, 1, PAL.ice!, life * (1 - f * 0.5)); else b.dot(x, y, PAL.ice![6]!, life);
        }
        b.glow(a.x, a.y, R, PAL.ice![4]!, 0.1 * life, sy);
        break;
      }
      case 'poison': {
        disc(b, a.x, a.y, R, sy, (d, dx, dy, bx, by) => { const wob = Math.sin(dx * 6 + time * 2) * 0.05 + Math.cos(dy * 5 - time * 1.6) * 0.05; if (d + wob > 0.97) return; const rim = d + wob > 0.9; b.dotb(bx, by, rim ? PAL.poison![3]! : at(PAL.poison!, 0.2 + (1 - d) * 0.2 + (hash(bx * 3 + by * 17) > 0.93 ? 0.3 : 0)), (rim ? 0.6 : 0.42 * (1.1 - d)) * life); });
        for (let i = 0; i < 12; i++) { // bubbles swell and pop
          const f = (time * 1.1 + hash(seed + i)) % 1, an = hash(seed + i * 3) * TAU, rr = Math.sqrt(hash(seed + i * 5)) * R * 0.8, x = a.x + Math.cos(an) * rr, y = a.y + Math.sin(an) * rr * sy;
          if (f < 0.82) { const r = 1 + f * 4; ring(b, x, y - r, r, 1, PAL.poison![5]!, life); b.dot(x - r * 0.4, y - r * 1.4, PAL.poison![6]!, life); }
          else for (let k = 0; k < 4; k++) b.dot(x + Math.cos(k * 1.57) * 7, y + Math.sin(k * 1.57) * 7 - 4, PAL.poison![5]!, life);
        }
        b.glow(a.x, a.y, R, PAL.poison![4]!, 0.08 * life, sy);
        break;
      }
      case 'shadow': {
        disc(b, a.x, a.y, R, sy, (d, _x, _y, bx, by) => b.dotb(bx, by, at(PAL.shadow!, 0.05 + (1 - d) * 0.25), 0.45 * life * (1.1 - d)));
        ring(b, a.x, a.y, R, sy, PAL.shadow![4]!, life, 7, ph / 10, 0.2);
        for (let i = 0; i < 6; i++) { const an = (i / 6) * TAU - time * 0.6; b.dot(a.x + Math.cos(an) * R * 0.85, a.y + Math.sin(an) * R * 0.85 * sy, PAL.shadow![6]!, life); }
        const n = Math.min(12, 4 + Math.floor(R / 15));
        for (let i = 0; i < n; i++) { // tendrils writhing up out of the pool
          const an = hash(seed + i) * TAU, rr = Math.sqrt(hash(seed + i * 3)) * R * 0.8, x0 = a.x + Math.cos(an) * rr, y0 = a.y + Math.sin(an) * rr * sy;
          const hgt = (14 + hash(seed + i * 5) * 16) * life * (0.8 + Math.sin(time * 3 + i) * 0.2);
          let px0 = x0, py0 = y0;
          for (let s = 1; s <= 8; s++) { const q = s / 8, x = x0 + Math.sin(time * 4 + i * 2 + q * 4) * q * 7, y = y0 - q * hgt; line(b, px0, py0, x, y, at(PAL.shadow!, 0.25 + q * 0.75), 1, q > 0.8 ? 0.3 : 0); px0 = x; py0 = y; }
        }
        break;
      }
      case 'lightning': {
        ring(b, a.x, a.y, R, sy, PAL.lightning![4]!, life, 4, ph / 4, 0.2);
        const rnd = rng(seed + Math.floor(time * 15));
        for (let i = 0; i < 3; i++) { // arcs crawl between points of the field
          const a0 = rnd() * TAU, a1 = a0 + (rnd() - 0.5) * 2.4, r0 = rnd() * R, r1 = rnd() * R;
          jag(b, a.x + Math.cos(a0) * r0, a.y + Math.sin(a0) * r0 * sy - 6, a.x + Math.cos(a1) * r1, a.y + Math.sin(a1) * r1 * sy - 6, PAL.lightning!, rnd, 6, life);
        }
        b.glow(a.x, a.y, R, PAL.lightning![3]!, 0.1 * life, sy);
        break;
      }
      default: {
        if (id === 'rng_rain') { // arrows falling at a slant, kicking up dust where they land
          for (let i = 0; i < 18; i++) {
            const f = (time * 2.4 + hash(seed + i)) % 1, an = hash(seed + i * 3) * TAU, rr = Math.sqrt(hash(seed + i * 5)) * R, x = a.x + Math.cos(an) * rr, y = a.y + Math.sin(an) * rr * sy;
            if (f < 0.75) { const q = f / 0.75, hx = x - (1 - q) * 30, hy = y - (1 - q) * 110; line(this.top, hx, hy, hx - 6, hy - 22, (u) => (u < 0.2 ? STEEL[6]! : at(PAL.wood!, 0.8 - u * 0.4)), life); }
            else { const q = (f - 0.75) / 0.25; ring(b, x, y, 3 + q * 8, 0.5, at(PAL.dust!, 0.9 - q * 0.5), (1 - q) * life); line(b, x, y, x - 2, y - 8, PAL.wood![3]!, (1 - q) * life); }
          }
          ring(b, a.x, a.y, R, sy, at(PAL.dust!, 0.8), life * 0.8, 5, 0);
        } else { // traps / generic physical fields: a ring of steel teeth
          ring(b, a.x, a.y, R, sy, at(STEEL, 0.7), life, 3, ph / 10);
          for (let i = 0; i < 10; i++) { const an = (i / 10) * TAU; const x = a.x + Math.cos(an) * R * 0.8, y = a.y + Math.sin(an) * R * 0.8 * sy; line(b, x, y, x, y - 5, (q) => at(STEEL, 0.5 + q * 0.5), life); }
        }
      }
    }
  }

  drawProjectile(_ctx: CanvasRenderingContext2D, p: Proj, time: number) {
    const b = this.top, v = parseVisual(p.v), id = v.skill?.id ?? '', pal = skillPal(v.skill, v.base);
    const sp = Math.hypot(p.vx, p.vy) || 1, cx = p.vx / sp, cy = p.vy / sp, x = p.x, y = p.y - 12, ph = Math.floor(time * 30);
    if (v.enemy) { // enemy shots: element body inside a pulsing red danger rim, so they always read as hostile
      const r = Math.max(5, p.r * 0.8), body = v.base === 'orb' ? PAL.orb! : v.base === 'physical' ? PAL.enemy! : PAL[v.base]!;
      if (v.base === 'lightning') { const rnd = rng(p.id * 31 + ph); jag(b, x, y, x - cx * 18, y - cy * 18, body, rnd, 3); }
      for (let i = 1; i <= 3; i++) disc(b, x - cx * r * i * 0.6, y - cy * r * i * 0.6, r * (1 - i * 0.22), 1, (d, _a, _c, bx, by) => b.dotb(bx, by, at(body, 0.7 - i * 0.15 - d * 0.3), 1.1 - i * 0.3));
      ball(b, x, y, r, body, 1.05, 0.3);
      ring(b, x, y, r + PX * 1.5, 1, ph % 6 < 3 ? PAL.enemy![4]! : PAL.enemy![3]!, 1);
      b.glow(x, y, r * 3.5, body[4]!, 0.35);
      return;
    }
    if (pal === PAL.time) { // sand-glass bolt: teal core with a ring of ticking sand
      ball(b, x, y, Math.max(4, p.r * 0.6), pal, 1, 0.3);
      for (let i = 0; i < 4; i++) { const an = time * 8 + (i / 4) * TAU; b.dot(x + Math.cos(an) * (p.r + 4), y + Math.sin(an) * (p.r + 4) * 0.6, PAL.holy![5]!, 1); }
      b.glow(x, y, p.r * 3, pal[4]!, 0.35);
      return;
    }
    switch (v.base) {
      case 'fire': { // fireball: dark rim, lit core, flame licking back
        const r = Math.max(4, p.r * 0.75);
        for (let i = 3; i >= 1; i--) disc(b, x - cx * r * i * 0.55, y - cy * r * i * 0.55, r * (1 - i * 0.2), 1, (d, _a, _c, bx, by) => b.dotb(bx, by, at(PAL.fire!, 0.75 - i * 0.15 - d * 0.3), 1.1 - i * 0.25));
        ball(b, x, y, r, PAL.fire!, 1.1, 0.25);
        b.glow(x, y, r * 4, PAL.fire![4]!, 0.45);
        break;
      }
      case 'ice': { // faceted shard: lit ridge, bright upper face, darker lower face, dark rim, white tip
        const L = id === 'mag_icelance' ? 30 : id === 'rng_frost_arrow' ? 18 : 14, W = id === 'mag_icelance' ? 6 : 4, nx = -cy, ny = cx;
        for (let s = -L; s <= L * 0.35; s += PX * 0.7) for (let w = -W; w <= W; w += PX * 0.7) {
          const q = s < 0 ? -s / L : s / (L * 0.35), half = W * (1 - q);
          if (Math.abs(w) > half) continue;
          const edge = Math.abs(w) > half - PX, c = edge ? PAL.ice![1]! : Math.abs(w) < PX * 0.6 ? PAL.ice![6]! : w < 0 ? PAL.ice![5]! : PAL.ice![3]!;
          b.px(x + cx * s + nx * w, y + cy * s + ny * w, s > L * 0.3 ? PAL.ice![7]! : c);
        }
        b.glow(x, y, 26, PAL.ice![4]!, 0.3);
        break;
      }
      case 'lightning': { // crackling ball, bolts licking off it
        const r = Math.max(4, p.r * 0.6), rnd = rng(p.id * 97 + Math.floor(time * 20));
        ball(b, x, y, r, PAL.lightning!, 1.2, 0.4);
        for (let i = 0; i < (p.r > 16 ? 4 : 2); i++) { const an = rnd() * TAU; jag(b, x, y, x + Math.cos(an) * (r + 10 + rnd() * 10), y + Math.sin(an) * (r + 10 + rnd() * 10), PAL.lightning!, rnd, 3); }
        line(b, x, y, x - cx * 24, y - cy * 24, (q) => at(PAL.lightning!, 1 - q), (q) => 1 - q, 0.2);
        if (id === 'mag_orb') for (let i = 0; i < 3; i++) { const an = time * 9 + (i * TAU) / 3; sparkle(b, x + Math.cos(an) * (r + 9), y + Math.sin(an) * (r + 9), 2, PAL.lightning!); }
        b.glow(x, y, r * 5, PAL.lightning![4]!, 0.5);
        break;
      }
      case 'holy': {
        if (id === 'pal_shield_throw') { // spinning shield: gold face, steel rim, glint sweeping across
          const squash = Math.abs(Math.cos(time * 14)) * 0.8 + 0.2;
          disc(b, x, y, 9, 1, (d, dx, _dy, bx, by) => { if (Math.abs(dx) > squash) return; b.pxb(bx, by, d > 0.8 ? STEEL[2]! : Math.abs(dx - Math.sin(time * 14) * 0.5) < 0.15 ? PAL.holy![6]! : at(PAL.holy!, 0.5 + (1 - d) * 0.3)); });
          b.glow(x, y, 26, PAL.holy![4]!, 0.3);
          break;
        }
        sparkle(b, x, y, 5, PAL.holy!); ball(b, x, y, 3, PAL.holy!, 1.2);
        line(b, x, y, x - cx * 18, y - cy * 18, (q) => at(PAL.holy!, 1 - q * 0.5), (q) => 1 - q);
        b.glow(x, y, 30, PAL.holy![5]!, 0.4);
        break;
      }
      case 'shadow': { // void orb: darkest core, flickering bright rim
        const r = Math.max(4, p.r * 0.7);
        disc(b, x, y, r, 1, (d, _dx, _dy, bx, by) => { const fl = hash(bx * 31 + by * 17 + ph) > 0.5; b.pxb(bx, by, d > 0.72 ? (fl ? PAL.shadow![5]! : PAL.shadow![3]!) : d < 0.4 ? PAL.shadow![0]! : PAL.shadow![1]!); });
        b.glow(x, y, r * 3, PAL.shadow![4]!, 0.3);
        break;
      }
      case 'poison': { // blob with a wet highlight
        const r = Math.max(4, p.r * 0.65);
        ball(b, x, y, r, PAL.poison!, 1); b.dot(x - r * 0.35, y - r * 0.4, PAL.poison![6]!, 1);
        b.glow(x, y, r * 3, PAL.poison![4]!, 0.2);
        break;
      }
      default: { // physical: arrows, knives, bone
        if (id === 'asn_fan' || id === 'asn_u_assassinate') { // thrown knife spinning end over end
          const an = time * 30; line(b, x - Math.cos(an) * 5, y - Math.sin(an) * 5, x + Math.cos(an) * 5, y + Math.sin(an) * 5, (q) => (q > 0.5 ? STEEL[5]! : PAL.wood![2]!));
          if (ph % 4 === 0) sparkle(b, x, y, 2, STEEL);
          break;
        }
        if (id === 'nec_bonespear') { // bone spear with a dark outline
          for (let s = -18; s <= 6; s += PX * 0.7) { const q = (s + 18) / 24, half = s > 2 ? (6 - s) * 0.8 : 2; for (let w = -half - PX; w <= half + PX; w += PX * 0.7) b.px(x + cx * s - cy * w, y + cy * s + cx * w, Math.abs(w) > half ? PAL.bone![0]! : at(PAL.bone!, 0.4 + q * 0.6 - (w > 0 ? 0.15 : 0))); }
          break;
        }
        const snipe = id === 'rng_u_snipe' || id === 'rng_pierce', L = snipe ? 22 : 14;
        if (snipe) { line(b, x, y, x - cx * 90, y - cy * 90, (q) => at(PAL.fire!, 1 - q * 0.7), (q) => 1 - q, 0.35); b.glow(x, y, 24, PAL.fire![5]!, 0.4); }
        else line(b, x - cx * 16, y - cy * 16, x - cx * 44, y - cy * 44, at(PAL.physical!, 0.8), (q) => 0.6 - q * 0.6); // speed streak
        line(b, x, y, x - cx * L, y - cy * L, (q) => (q < 0.15 ? STEEL[6]! : at(PAL.wood!, 0.85 - q * 0.3)));
        const fx = x - cx * L, fy = y - cy * L; b.px(fx - cy * PX - cx * PX, fy + cx * PX - cy * PX, PAL.fire![5]!); b.px(fx + cy * PX - cx * PX, fy - cx * PX - cy * PX, PAL.fire![5]!);
      }
    }
  }

  /** Effects drawn above entities; flushes the top buffer. */
  drawTop(ctx: CanvasRenderingContext2D, time: number, _quality: string) {
    const b = this.top;
    for (const [id, tr] of this.trails) { // dash: streaks left along the path
      if (!this.g.ents.get(id)) continue;
      const dp = this.dashPal.get(id) ?? PAL.ice!;
      for (let i = 1; i < tr.length; i++) { const a = tr[i - 1]!, c = tr[i]!, k = 1 - (this.now - c.t) / 0.22; for (const off of [-30, -20, -10]) line(b, a.x, a.y + off, c.x, c.y + off, at(dp, 0.4 + k * 0.5), k, 0.15); }
    }
    for (const e of this.g.ents.values()) if (!e.dead && (e.st.includes('marked') || e.st.includes('vulnerable'))) { // crosshair over marked targets
      const r = 16 + Math.sin(this.now * 6) * 2, cy = e.ry - 18, c = PAL.fire![4]!;
      ring(b, e.rx, cy, r, 1, c, 1, 3, Math.floor(this.now * 10));
      for (let i = 0; i < 4; i++) { const an = (i / 4) * TAU + Math.PI / 4; line(b, e.rx + Math.cos(an) * (r - 4), cy + Math.sin(an) * (r - 4), e.rx + Math.cos(an) * (r + 5), cy + Math.sin(an) * (r + 5), PAL.fire![5]!); }
    }
    for (const f of this.fx) if (!GROUND_FX.has(f.kind) && !(f.kind === 'clock' && f.r > 100)) this.drawFx(f, time, b);
    for (const p of this.parts) this.drawPart(p, time);
    b.flush(ctx);
  }
  private drawPart(p: Part, time: number) {
    const b = this.top, k = 1 - p.t / p.life, age = p.t / p.life;
    switch (p.k) {
      case 'spark': { // speed-stretched two-tone streak
        const sp = Math.hypot(p.vx, p.vy), len = Math.min(9, 1 + sp * 0.022) * PX, nx = p.vx / (sp || 1), ny = p.vy / (sp || 1);
        const head = k > 0.6 ? p.pal[p.pal.length - 1]! : k > 0.3 ? at(p.pal, 0.6) : at(p.pal, 0.25);
        line(b, p.x, p.y, p.x - nx * len, p.y - ny * len, (q) => (q < 0.4 ? head : at(p.pal, 0.3 + k * 0.3)), 1, 0.25 * k);
        break;
      }
      case 'streak': { const sp = Math.hypot(p.vx, p.vy) || 1; line(b, p.x, p.y, p.x - (p.vx / sp) * 10, p.y - (p.vy / sp) * 10, (q) => at(p.pal, 1 - q * 0.6), 1, 0.4); break; }
      case 'ember': if ((p.seed + Math.floor(time * 20)) % 6 !== 0) { const c = at(p.pal, 1 - age ** 0.62); b.dot(p.x, p.y, c, k * 1.5); b.add(b.bx(p.x), b.by(p.y), c, 0.4 * k); } break;
      case 'flame': { // flame puff cooling down the ramp, turning to smoke
        const r = p.size * (0.5 + k * 0.6), heat = 1 - age ** 0.62;
        if (age > 0.75) { disc(b, p.x, p.y, r, 1, (d, _x, _y, bx, by) => b.dotb(bx, by, at(PAL.smoke!, 0.4 + (1 - d) * 0.3), (1 - age) * 3)); break; }
        disc(b, p.x, p.y, r, 1, (d, _x, dy, bx, by) => { const c = d > 0.8 ? at(p.pal, heat * 0.4) : at(p.pal, heat * (1 - d * 0.5) - dy * 0.08); b.pxb(bx, by, c); if (d < 0.6) b.add(bx, by, c, 0.12 * heat); });
        break;
      }
      case 'smoke': { // translucent disc that swells and thins; a lit cap while young
        const r = p.size * (0.6 + age * 0.9), a = (k ** 1.3) * 0.5;
        disc(b, p.x, p.y, r, 1, (d, _dx, dy, bx, by) => b.blendb(bx, by, age < 0.3 && dy < -0.35 ? at(p.pal, 0.95) : at(p.pal, 0.45 + (1 - d) * 0.35), a * (1 - d * d)));
        break;
      }
      case 'flake': if (p.size > 1 || p.seed % 4 === 0) sparkle(b, p.x, p.y, 1, p.pal, k * 1.5); else b.dot(p.x, p.y, at(p.pal, 0.6 + k * 0.4), k * 1.6); break;
      case 'plus': { const c = at(p.pal, 0.5 + k * 0.5), bx = b.bx(p.x), by = b.by(p.y); for (const [dx, dy] of PLUS) b.dotb(bx + dx, by + dy, c, k * 1.5); b.add(bx, by, c, 0.4 * k); break; }
      case 'mote': { const c = at(p.pal, 0.55 + k * 0.45); b.dot(p.x, p.y, c, k * 1.6); b.dot(p.x - p.vx * 0.02, p.y - p.vy * 0.02, at(p.pal, 0.35), k); b.add(b.bx(p.x), b.by(p.y), c, 0.35 * k); break; }
      case 'wisp': { const c = at(p.pal, 0.35 + k * 0.6); b.dot(p.x, p.y, c, k * 1.4); b.dot(p.x, p.y + PX, at(p.pal, 0.3), k); b.dot(p.x - p.vx * 0.03, p.y + PX * 2, at(p.pal, 0.2), k * 0.8); break; }
      case 'chunk': { // shaded debris chunk: lit top-left, dark bottom-right
        const bx = b.bx(p.x), by = b.by(p.y), a = k * 2;
        b.dotb(bx, by, at(p.pal, 0.95), a); b.dotb(bx + 1, by, at(p.pal, 0.6), a); b.dotb(bx, by + 1, at(p.pal, 0.5), a); b.dotb(bx + 1, by + 1, p.pal[0]!, a);
        break;
      }
      case 'drip': b.dot(p.x, p.y, at(p.pal, 0.7), 1); b.dot(p.x, p.y - PX, at(p.pal, 0.9), 1); break;
      case 'bubble': ring(b, p.x, p.y - p.size * 2, p.size * 2 + age * 3, 1, at(p.pal, 0.8), k * 1.5); break;
    }
  }
  private drawFx(f: Fx, time: number, b: PixBuf) {
    const k = f.t / f.life, owner = f.owner ? this.g.ents.get(f.owner) : null;
    const x = owner ? owner.rx : f.x, y = owner ? owner.ry : f.y, ph = Math.floor(time * 30);
    switch (f.kind) {
      case 'gather': { // streaks accelerate into the hand
        const hx = x + Math.cos(f.ang) * 10, hy = y - 18;
        for (let i = 0; i < 6; i++) { const an = (i / 6) * TAU + f.seed, r0 = f.r * (1 - k * k), r1 = Math.max(0, r0 - 6); line(b, hx + Math.cos(an) * r0, hy + Math.sin(an) * r0, hx + Math.cos(an) * r1, hy + Math.sin(an) * r1, (q) => at(f.pal, 0.5 + q * 0.5), 1, 0.3); }
        b.glow(hx, hy, 10 + k * 10, f.pal[f.pal.length - 2]!, 0.4 * k);
        break;
      }
      case 'flare': flare(b, x, y, f.r, f.pal, 1 - k * 0.5); break;
      case 'zap': jag(b, x, y, f.data!.tx!, f.data!.ty!, f.pal, rng(f.seed + Math.floor(time * 20)), 6, 1.3 - k * 1.3); break;
      case 'hexsigil': { // curse mark: rotating rune ring with a six-point star, fading after the curse lands
        const a = Math.min(1, (1 - k) * 3) * Math.min(1, f.t * 6), r = f.r * 0.9;
        ring(b, x, y, r, 1, f.pal[4]!, a, 0, 0, 0.15); ring(b, x, y, r * 0.86, 1, f.pal[3]!, a, 3, ph / 6);
        for (let i = 0; i < 6; i++) { const a1 = (i / 6) * TAU + f.t * 0.6, a2 = ((i + 2) / 6) * TAU + f.t * 0.6; line(b, x + Math.cos(a1) * r * 0.86, y + Math.sin(a1) * r * 0.86, x + Math.cos(a2) * r * 0.86, y + Math.sin(a2) * r * 0.86, f.pal[3]!, a * 0.8); }
        for (let i = 0; i < 6; i++) { const an = (i / 6) * TAU - f.t; b.dot(x + Math.cos(an) * r * 1.05, y + Math.sin(an) * r * 1.05, f.pal[6]!, a); }
        break;
      }
      case 'eslash': { const arc = f.data?.arc ?? 1.6, sweep = easeOut(f.t / 0.07), lead = f.ang - arc / 2 + arc * sweep; crescent(b, x, y - 8, f.r * 0.92, f.r * 0.22, lead, arc * sweep * (1 - smooth(0.08, 0.28, f.t) * 0.85), 1, f.pal, smooth(0.04, 0.28, f.t) * 0.5); break; }
      case 'hitflash': { const r = f.r * (0.6 + k * 0.6); ring(b, x, y, r, 1, at(f.pal, 1 - k), 1.4 - k * 1.4); if (k < 0.5) sparkle(b, x, y, Math.round(f.r / 3), f.pal); break; }
      case 'shock': { // floor ring: eases out, cools down the ramp, dissolves through the dither
        const r = f.r * easeOut(k), a = 1.3 - k * 1.3;
        ring(b, x, y, r, 1, at(f.pal, 0.86 - k * 0.6), a, 0, 0, 0.2); if (k < 0.5) ring(b, x, y, r - PX, 1, at(f.pal, 0.6 - k * 0.5), a * 0.8);
        break;
      }
      case 'shout': { const r = f.r * easeOut(k); ring(b, x, y, r, 0.7, at(f.pal, 1 - k * 0.6), 1.4 - k * 1.4, 5, ph / 3, 0.2); break; }
      case 'pool': b.glow(x, y, f.r, f.pal[f.pal.length - 3]!, 0.35 * (1 - k)); break;
      case 'blast': { // hot core: white, collapsing as the fireball expands
        const r = f.r * 0.5 * (1 - k) ** 0.5;
        disc(b, x, y - 6, r, 0.85, (d, _x, _y, bx, by) => b.dotb(bx, by, at(f.pal, 1.05 - d * 0.4 - k * 0.6), 1.3 - k * 1.2));
        b.glow(x, y - 6, f.r * 1.6, f.pal[5]!, 0.8 * (1 - k) * (1 - k));
        break;
      }
      case 'scorch': { const a = Math.min(1, (1 - k) * 2); disc(b, x, y, f.r, 0.62, (d, _x, _y, bx, by) => { if (hash(bx * 13 + by * 7) < 0.3 + d * 0.5) return; b.dotb(bx, by, d > 0.7 ? PAL.smoke![1]! : PAL.smoke![0]!, a); if (d < 0.3 && k < 0.4) b.add(bx, by, f.pal[3]!, 0.4 * (1 - k * 2.5)); }); break; }
      case 'cracks': {
        const a = Math.min(1, (1 - k) * 2.5), rnd = rng(f.seed);
        for (let i = 0; i < 7; i++) { let cx = x, cy = y, an = (i / 7) * TAU + rnd(); const steps = (Math.min(1, k * 8) * f.r) / 6; for (let s = 0; s < steps; s++) { an += (rnd() - 0.5) * 0.7; const nx = cx + Math.cos(an) * 6, ny = cy + Math.sin(an) * 6 * 0.62; line(b, cx, cy, nx, ny, PAL.dust![0]!, a); b.dot(nx, ny + PX, PAL.dust![3]!, a * 0.7); cx = nx; cy = ny; } }
        break;
      }
      case 'pillar': { // column of light: white core, palette sides, dithered edges, rays streaming down
        const w = f.r * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) * 0.9), hgt = 260, a = k < 0.7 ? 1 : (1 - k) / 0.3;
        for (let yy = 0; yy < hgt; yy += PX) for (let xx = -w; xx <= w; xx += PX) {
          const e = Math.abs(xx) / Math.max(1, w), q = yy / hgt;
          const streak = (Math.floor(xx / PX) * 7 + Math.floor((yy + time * 400) / 10)) % 5 === 0;
          b.dot(x + xx, y - yy, e < 0.25 ? f.pal[f.pal.length - 1]! : at(f.pal, 0.95 - e * 0.5 + (streak ? 0.15 : 0)), a * (1.2 - e) * (1 - q * 0.6));
        }
        b.glow(x, y - 40, w * 3.5, f.pal[f.pal.length - 2]!, 0.5 * a);
        b.glow(x, y, w * 3, f.pal[f.pal.length - 3]!, 0.4 * a, 0.5);
        break;
      }
      case 'bolt': { // lightning from the sky: white core, coloured sheath, branches; re-strikes at 15 fps
        const rnd = rng(f.seed + Math.floor(time * 15)), a = k < 0.6 ? 1 : (1 - k) / 0.4;
        let bx = x + (rnd() - 0.5) * 40, by = y - 300;
        while (by < y) {
          const nx = bx + (rnd() - 0.5) * 26 + (x - bx) * 0.15, ny = Math.min(y, by + 14 + rnd() * 10);
          line(b, bx - PX, by, nx - PX, ny, f.pal[3]!, a); line(b, bx + PX, by, nx + PX, ny, f.pal[3]!, a); line(b, bx, by, nx, ny, f.pal[6]!, a, 0.5);
          if (rnd() < 0.18) jag(b, nx, ny, nx + (rnd() - 0.5) * 60, ny + 20 + rnd() * 20, f.pal, rnd, 4, a);
          bx = nx; by = ny;
        }
        if (k < 0.2) flare(b, x, y, 22, f.pal, 1);
        b.glow(x, y - 60, 120, f.pal[4]!, 0.5 * a * a);
        break;
      }
      case 'crystals': { // ice spikes punch up, hold with glints, then sink and drip
        const rnd = rng(f.seed), n = Math.min(11, 4 + Math.floor(f.r / 14)), grow = smooth(0, 0.12, f.t), sink = smooth(f.life - 0.45, f.life, f.t);
        const spikes: Array<[number, number, number, number]> = [];
        for (let i = 0; i < n; i++) { const an = rnd() * TAU, rr = (0.25 + rnd() * 0.7) * f.r; spikes.push([x + Math.cos(an) * rr, y + Math.sin(an) * rr * 0.62, 10 + rnd() * 18, 4 + rnd() * 4]); }
        spikes.push([x, y, 26 + f.r * 0.08, 8]);
        spikes.sort((p, q) => p[1] - q[1]);
        for (const [sx, sy, hh, ww] of spikes) {
          const h = hh * grow * (1 - sink);
          if (h < 2) continue;
          for (let yy = 0; yy < h; yy += PX) {
            const q = yy / h, half = ww * (1 - q);
            for (let xx = -half; xx <= half; xx += PX) {
              const edge = Math.abs(xx) > half - PX || yy < PX;
              b.px(sx + xx, sy - yy, edge ? PAL.ice![1]! : Math.abs(xx) < PX ? PAL.ice![7]! : xx < 0 ? PAL.ice![5]! : PAL.ice![3]!);
            }
          }
          const gl = (f.t * 2 + sx * 0.01) % 1; if (gl < 0.2 && sink === 0) sparkle(b, sx, sy - h * (1 - gl * 3), 2, PAL.ice!);
          if (sink > 0 && hash(Math.floor(sx) + ph) > 0.85) this.p('drip', sx, sy - 2, 0, 10, 0.3, PAL.ice!, { grav: 400, floor: sy + 4 });
        }
        b.glow(x, y - 10, f.r * 0.8, PAL.ice![4]!, 0.25 * (1 - sink));
        break;
      }
      case 'void': { // implodes, then bursts outward as a dark ring
        if (k < 0.35) { const q = k / 0.35, r = f.r * (1 - q); disc(b, x, y - 6, r * 0.6, 0.8, (d, _x, _y, bx, by) => b.pxb(bx, by, d > 0.8 ? f.pal[4]! : f.pal[0]!)); ring(b, x, y - 6, r, 0.62, f.pal[5]!, 1, 3, ph / 2, 0.2); }
        else { const q = (k - 0.35) / 0.65, r = f.r * easeOut(q); ring(b, x, y, r, 1, at(f.pal, 0.9 - q * 0.6), 1.3 - q * 1.3, 0, 0, 0.2); ring(b, x, y, r * 0.85, 1, f.pal[1]!, 1.2 - q * 1.2); }
        break;
      }
      case 'aura': { // bands rise up the body
        for (let i = 0; i < 2; i++) { const q = (k * 1.6 + i * 0.5) % 1, r = f.r * (1 - q * 0.4); ring(b, x, y - q * 40, r, 0.4, at(f.pal, 1 - q * 0.6), (1 - q) * (1 - k) * 2, 0, 0, 0.25); }
        b.glow(x, y - 16, f.r * 1.4, f.pal[f.pal.length - 3]!, 0.25 * (1 - k));
        break;
      }
      case 'zapaura': { const rnd = rng(f.seed + Math.floor(time * 20)); for (let i = 0; i < 3; i++) { const an = rnd() * TAU; jag(b, x + Math.cos(an) * 8, y - 20 + Math.sin(an) * 12, x + Math.cos(an) * f.r, y - 20 + Math.sin(an) * f.r, f.pal, rnd, 4, 1 - k); } b.glow(x, y - 20, 40, f.pal[4]!, 0.3 * (1 - k)); break; }
      case 'hexshield': { // hexagonal ward: dark under-edge + bright edge, a glint running round
        const yy = y - 18, a = k < 0.8 ? 1 : (1 - k) / 0.2, glint = (f.t * 1.5) % 1;
        for (let i = 0; i < 6; i++) {
          const a1 = (i / 6) * TAU + Math.PI / 6, a2 = ((i + 1) / 6) * TAU + Math.PI / 6;
          const x1 = x + Math.cos(a1) * f.r, y1 = yy + Math.sin(a1) * f.r * 1.15, x2 = x + Math.cos(a2) * f.r, y2 = yy + Math.sin(a2) * f.r * 1.15;
          line(b, x1, y1 + PX, x2, y2 + PX, f.pal[1]!, a); line(b, x1, y1, x2, y2, (q) => (Math.abs((i + q) / 6 - glint) < 0.05 ? f.pal[7]! : f.pal[4]!), a, 0.25);
        }
        disc(b, x, yy, f.r * 0.9, 1.15, (d, _x, _y, bx, by) => b.dotb(bx, by, f.pal[3]!, 0.12 * a * d));
        break;
      }
      case 'portal': { // summoning circle: swirling ellipses, dark centre, motes rising
        const r = f.r * smooth(0, 0.2, f.t) * (1 - smooth(f.life - 0.25, f.life, f.t));
        disc(b, x, y, r * 0.8, 0.45, (d, _x, _y, bx, by) => b.pxb(bx, by, d > 0.85 ? f.pal[3]! : f.pal[0]!));
        ring(b, x, y, r, 0.45, f.pal[5]!, 1, 4, -ph / 2, 0.3); ring(b, x, y, r * 1.15, 0.45, f.pal[3]!, 1, 3, ph / 2);
        if (ph % 2 === 0 && r > 4 && b === this.ground) this.p('mote', x + (Math.random() - 0.5) * r * 1.4, y, 0, -60, 0.6, f.pal);
        break;
      }
      case 'speedlines': for (let i = 0; i < 5; i++) { const off = (i - 2) * 7, ln = 16 + (i % 2) * 10, bx = x - Math.cos(f.ang) * 14 - Math.sin(f.ang) * off, by = y - 18 - Math.sin(f.ang) * 14 + Math.cos(f.ang) * off; line(b, bx, by, bx - Math.cos(f.ang) * ln, by - Math.sin(f.ang) * ln, (q) => at(f.pal, 0.9 - q * 0.6), (q) => (1 - k) * (1.2 - q)); } break;
      case 'clock': { // chronomancy dial: ticks and hands (they run backwards for rewinds)
        const r = f.r * easeOut(Math.min(1, f.t * 4)), a = (k < 0.75 ? 1 : (1 - k) / 0.25) * (f.r > 100 ? 0.75 : 1), dir = f.data?.rev ? -1 : 1;
        ring(b, x, y, r, 0.55, at(f.pal, 0.75), a, 0, 0, 0.2);
        for (let i = 0; i < 12; i++) { const an = (i / 12) * TAU; line(b, x + Math.cos(an) * r * 0.88, y + Math.sin(an) * r * 0.88 * 0.55, x + Math.cos(an) * r, y + Math.sin(an) * r * 0.55, i % 3 ? f.pal[4]! : f.pal[6]!, a); }
        const h1 = dir * f.t * 2, h2 = dir * f.t * 14;
        line(b, x, y, x + Math.cos(h1 - 1.57) * Math.min(r * 0.5, 40), y + Math.sin(h1 - 1.57) * Math.min(r * 0.5, 40) * 0.55, f.pal[6]!, a, 0.3); line(b, x, y, x + Math.cos(h2 - 1.57) * Math.min(r * 0.8, 60), y + Math.sin(h2 - 1.57) * Math.min(r * 0.8, 60) * 0.55, f.pal[5]!, a, 0.3);
        break;
      }
      case 'slashstorm': { const rnd = rng(f.seed + Math.floor(time * 15)); for (let i = 0; i < 3; i++) { const an = rnd() * TAU, rr = rnd() * f.r; crescent(b, x + Math.cos(an) * rr, y + Math.sin(an) * rr * 0.62 - 10, 22, 6, rnd() * TAU, 2.2, 1, f.pal, 0.1); } break; }
      case 'scope': { const r = f.r * (1.6 - k * 0.6); ring(b, x, y - 12, r, 1, f.pal[4]!, 1 - k, 4, ph / 3); line(b, x - r - 6, y - 12, x - r + 6, y - 12, f.pal[5]!, 1 - k); line(b, x + r - 6, y - 12, x + r + 6, y - 12, f.pal[5]!, 1 - k); break; }
      default: break;
    }
  }
}
/** Timed effects that lie on the floor (drawn under characters). */
const GROUND_FX = new Set(['shock', 'scorch', 'cracks', 'portal', 'void', 'eslash', 'hexsigil']);
const PLUS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const;

// ── extended skills: beam / trap drawing and recipe tables ──
const RECIPE_SHAPES = ['pillar', 'portal', 'flare', 'shock', 'hexsigil', 'clock', 'cracks', 'crystals', 'pool', 'blast'];
const RECIPE_PARTS: PK[] = ['spark', 'ember', 'mote', 'wisp', 'flake', 'smoke', 'streak', 'chunk', 'drip', 'bubble'];
const LAUNCH_SIGNATURES = new Set(['chr_u_stop', 'chr_rewind', 'chr_u_paradox', 'chr_haste', 'chr_u_accel', 'war_u_titan', 'pal_u_avatar', 'nec_u_lich', 'mag_u_overload', 'asn_u_massacre', 'asn_smoke', 'asn_u_clone', 'war_warcry', 'pal_taunt', 'rng_u_snipe', 'nec_drain', 'nec_curse', 'war_u_execution', 'pal_smite']);
/** Skill ids of each class in library order (stable), used to give every skill a distinct recipe. */
const SKILL_ORDER: Record<string, string[]> = (() => { const o: Record<string, string[]> = {}; for (const k of Object.values(SKILL_MAP)) (o[k.cls] ??= []).push(k.id); return o; })();
/** Palette step (packed ABGR) → CSS colour. */
const rgb = (p: Pal, i: number) => { const n = p[Math.min(i, p.length - 1)] ?? 0xffffffff; return `rgb(${n & 255},${(n >>> 8) & 255},${(n >>> 16) & 255})`; };
function drawBeam(ctx: CanvasRenderingContext2D, a: Area, pal: Pal, time: number) {
  const life = a.dur > 0.05 ? 1 : Math.max(0, 1 - a.age / 0.35);
  if (life <= 0) return;
  ctx.save(); ctx.translate(a.x, a.y - 10); ctx.rotate(a.ang);
  ctx.globalCompositeOperation = 'lighter';
  const w = a.arc * (0.7 + Math.sin(time * 30) * 0.08);
  const g = ctx.createLinearGradient(0, -w / 2, 0, w / 2);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, rgb(pal, 6)); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.75 * life; ctx.fillStyle = g; ctx.fillRect(0, -w / 2, a.r, w);
  ctx.globalAlpha = life; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, -Math.max(2, w * 0.12), a.r, Math.max(4, w * 0.24));
  for (let i = 0; i < 6; i++) { const x = ((time * 600 + i * a.r / 6) % a.r); ctx.fillStyle = rgb(pal, 7); ctx.fillRect(x, -w * 0.35, 6, w * 0.7); }
  ctx.restore();
}
function drawTrap(ctx: CanvasRenderingContext2D, a: Area, pal: Pal, time: number) {
  const pulse = 0.5 + Math.sin(time * 4 + a.id) * 0.3;
  ctx.save(); ctx.translate(a.x, a.y);
  ctx.strokeStyle = rgb(pal, 6); ctx.globalAlpha = 0.35 + pulse * 0.4; ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.ellipse(0, 0, a.r, a.r * 0.6, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  ctx.globalAlpha = 0.8; ctx.fillStyle = rgb(pal, 5); ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(9, 6); ctx.lineTo(-9, 6); ctx.closePath(); ctx.fill();
  ctx.restore();
}
