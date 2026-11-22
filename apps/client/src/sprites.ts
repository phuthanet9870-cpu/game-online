// ASTRA pixel sprites — characters, enemies, minions and NPCs drawn as pixel art on the same grid as the VFX
// (1 art pixel = PX world units). Everything is generated in code from a few body builders, coloured per class /
// enemy, shaded with light from the top-left, wrapped in one dark ink outline and cached per pose frame.
// Poses step at 12 fps: idle breathing, 4-frame walk, and wind-up → strike → follow-through from the swing timer.
import { PX } from './vfx.js';

const INK = '#150f1e';
const SKIN = ['#f6c8a8', '#ffe2cc', '#d8a080'] as const; // mid, light, dark
let T = 0;
/** The renderer advances the shared animation clock once per frame. */
export function setAnimTime(t: number) { T = t; }

// ── colour helpers ─────────────────────────────────────────
function hex2(h: string) { const n = parseInt(h.slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const; }
function toHex(r: number, g: number, b: number) { return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
/** Lighten (f > 0, toward warm white) or darken (f < 0, toward cool purple — hue-shifted shadows). */
export function shade(h: string, f: number) {
  const [r, g, b] = hex2(h);
  if (f >= 0) return toHex(r + (255 - r) * f, g + (244 - g) * f, b + (224 - b) * f);
  const k = -f; return toHex(r + (26 - r) * k, g + (16 - g) * k, b + (48 - b) * k);
}

// ── pixel painter ──────────────────────────────────────────
class Pix {
  px: (string | null)[];
  constructor(public w: number, public h: number) { this.px = new Array(w * h).fill(null); }
  set(x: number, y: number, c: string | null) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c; }
  get(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.px[y * this.w + x] : null; }
  rect(x: number, y: number, w: number, h: number, c: string) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  /** Volume-shaded rectangle: lit top/left edge, dark bottom/right edge. */
  box(x: number, y: number, w: number, h: number, c: string) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, j === 0 || i === 0 ? shade(c, 0.22) : j === h - 1 || i === w - 1 ? shade(c, -0.28) : c);
  }
  /** Volume-shaded ellipse (light from the top-left). */
  ball(cx: number, cy: number, rx: number, ry: number, c: string, flat = false) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = dx * dx + dy * dy;
      if (d > 1) continue;
      const l = dx + dy;
      this.set(x, y, flat ? c : l < -0.75 ? shade(c, 0.25) : l > 0.7 && d > 0.45 ? shade(c, -0.3) : c);
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: string | ((q: number) => string), th = 1) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) { const q = i / n, x = x0 + (x1 - x0) * q, y = y0 + (y1 - y0) * q, col = typeof c === 'string' ? c : c(q); this.set(x, y, col); if (th > 1) { this.set(x + 1, y, col); this.set(x, y + 1, col); } }
  }
  /** One clean ink line around everything (4-neighbourhood). */
  outline(c = INK) {
    const add: number[] = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.get(x, y)) continue;
      if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) add.push(y * this.w + x);
    }
    for (const i of add) this.px[i] = c;
  }
  canvas(white = false): HTMLCanvasElement {
    const cv = document.createElement('canvas'); cv.width = this.w; cv.height = this.h;
    const x = cv.getContext('2d')!, img = x.createImageData(this.w, this.h);
    for (let i = 0; i < this.px.length; i++) { const c = this.px[i]; if (!c) continue; const [r, g, b] = white ? [255, 255, 255] : hex2(c); img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255; }
    x.putImageData(img, 0, 0);
    return cv;
  }
}

const cache = new Map<string, { cv: HTMLCanvasElement; ax: number; ay: number }>();
function cached(key: string, build: () => { p: Pix; ax: number; ay: number }, white: boolean) {
  const k = key + (white ? '|w' : '');
  let s = cache.get(k);
  if (!s) { const b = build(); s = { cv: b.p.canvas(white), ax: b.ax, ay: b.ay }; if (cache.size > 2500) cache.clear(); cache.set(k, s); }
  return s;
}
function blit(ctx: CanvasRenderingContext2D, s: { cv: HTMLCanvasElement; ax: number; ay: number }, x: number, y: number, scale: number, flip: boolean, alpha = 1) {
  const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  const k = PX * scale, ga = ctx.globalAlpha; ctx.globalAlpha = ga * alpha;
  ctx.save(); ctx.translate(Math.round(x / PX) * PX, Math.round(y / PX) * PX); if (flip) ctx.scale(-1, 1);
  ctx.drawImage(s.cv, -s.ax * k, -s.ay * k, s.cv.width * k, s.cv.height * k);
  ctx.restore(); ctx.globalAlpha = ga; ctx.imageSmoothingEnabled = sm;
}
/** Pixel ground shadow (dithered ellipse). */
export function pixShadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  ctx.fillStyle = 'rgba(10,6,20,0.32)';
  const R = Math.max(1, Math.round(rx / PX)), Ry = Math.max(1, Math.round(ry / PX)), bx = Math.round(x / PX) * PX, by = Math.round(y / PX) * PX;
  for (let j = -Ry; j <= Ry; j++) { const w = Math.round(R * Math.sqrt(1 - (j / (Ry + 0.5)) ** 2)); ctx.fillRect(bx - w * PX, by + j * PX, w * 2 * PX, PX); }
}

// ── poses ──────────────────────────────────────────────────
type View = 'side' | 'front' | 'back';
interface Pose { view: View; flip: boolean; walk: number; breathe: number; atk: number /* 0 none, 1 wind-up, 2 strike, 3 follow-through */ }
function pose(facing: number, moving: boolean, swing: number, seed: number): Pose {
  const fx = Math.cos(facing), fy = Math.sin(facing);
  const view: View = fy > 0.6 ? 'front' : fy < -0.6 ? 'back' : 'side';
  const f12 = Math.floor(T * 12 + seed * 0.37);
  return { view, flip: view === 'side' ? fx < 0 : false, walk: moving ? (f12 % 4) + 1 : 0, breathe: moving ? 0 : Math.floor(T * 2 + seed) % 2, atk: swing > 0.18 ? 1 : swing > 0.08 ? 2 : swing > 0 ? 3 : 0 };
}

// ── player classes / NPCs ──────────────────────────────────
const CW = 40, CH = 46, FX = 20, FY = 42; // canvas and feet anchor (art px)
interface Look { body: string; hair: string; accent: string; cls: string }

function weaponAngle(cls: string, p: Pose): number {
  const caster = cls === 'mage' || cls === 'necromancer' || cls === 'chronomancer';
  if (cls === 'ranger') return p.view === 'side' ? 0 : -1.57;
  const front = p.view !== 'side';
  if (p.atk === 1) return caster ? -1.9 : front ? -2.6 : -2.5;
  if (p.atk === 2) return caster ? -0.25 : front ? -0.2 : 0.35;
  if (p.atk === 3) return caster ? -0.5 : front ? 0.3 : 0.95;
  return caster ? -1.35 : front ? -1.95 : -1.15;
}
function drawWeapon(p: Pix, cls: string, hx: number, hy: number, a: number, accent: string, pz: Pose) {
  const c = Math.cos(a), s = Math.sin(a);
  const tip = (L: number) => [hx + c * L, hy + s * L] as const;
  switch (cls) {
    case 'warrior': { // greatsword: bright edge, darker flat, accent guard, leather grip
      const [ex, ey] = tip(13);
      p.line(hx - c * 2, hy - s * 2, hx, hy, '#5a3a24');
      p.line(hx + c * 2, hy + s * 2, ex, ey, (q) => (q > 0.85 ? '#ffffff' : '#dfe6f2'));
      p.line(hx + c * 2 - s, hy + s * 2 + c, ex - s, ey + c, '#8a94ae');
      p.line(hx + c * 1.5 - s * 2, hy + s * 1.5 + c * 2, hx + c * 1.5 + s * 2, hy + s * 1.5 - c * 2, accent);
      break;
    }
    case 'mage': { const [ex, ey] = tip(12); p.line(hx - c * 4, hy - s * 4, ex, ey, '#7a5a3a'); p.ball(ex, ey, 1.8, 1.8, accent); p.set(ex - 1, ey - 1, '#ffffff'); break; }
    case 'necromancer': { // scythe-staff
      const [ex, ey] = tip(13); p.line(hx - c * 4, hy - s * 4, ex, ey, '#3a3040');
      for (let i = 0; i < 6; i++) { const q = i / 5, bx = ex + (-s) * (q * 6) - c * q * q * 3, by = ey + c * (q * 6) - s * q * q * 3; p.set(bx, by, i < 2 ? '#e8e8f8' : accent); }
      break;
    }
    case 'chronomancer': { // hourglass staff
      const [ex, ey] = tip(11); p.line(hx - c * 3, hy - s * 3, ex, ey, '#d8b25f');
      p.rect(ex - 1, ey - 3, 3, 1, '#d8b25f'); p.rect(ex - 1, ey + 2, 3, 1, '#d8b25f');
      p.set(ex - 1, ey - 2, accent); p.set(ex, ey - 2, accent); p.set(ex + 1, ey - 2, accent); p.set(ex, ey - 1, accent); p.set(ex, ey, '#c8fff6'); p.set(ex, ey + 1, accent);
      break;
    }
    case 'assassin': { const [ex, ey] = tip(6); p.line(hx, hy, ex, ey, (q) => (q > 0.7 ? '#ffffff' : '#d0d4e4')); p.set(hx - s, hy + c, accent); break; }
    case 'paladin': { // mace with gold head
      const [ex, ey] = tip(9); p.line(hx - c * 2, hy - s * 2, ex, ey, '#a8a8bc'); p.ball(ex, ey, 1.8, 1.8, accent); break;
    }
    case 'ranger': { // bow held forward; string pulls back while attacking
      const r = 6, pull = pz.atk === 1 || pz.atk === 2 ? 3 : 0;
      for (let i = -6; i <= 6; i++) { const t = (i / 6) * 1.25; p.set(hx + Math.cos(a) * Math.cos(t) * r * 0.55 - Math.sin(a) * Math.sin(t) * r, hy + Math.sin(a) * Math.cos(t) * r * 0.55 + Math.cos(a) * Math.sin(t) * r, '#8a5a2b'); }
      const t0x = hx - Math.sin(a) * -r * 0.95 + Math.cos(a) * 1, t0y = hy + Math.cos(a) * -r * 0.95 + Math.sin(a) * 1, t1x = hx - Math.sin(a) * r * 0.95 + Math.cos(a) * 1, t1y = hy + Math.cos(a) * r * 0.95 + Math.sin(a);
      const mx = hx - Math.cos(a) * pull, my = hy - Math.sin(a) * pull;
      p.line(t0x, t0y, mx, my, '#efe8d8'); p.line(mx, my, t1x, t1y, '#efe8d8');
      if (pull) p.line(mx, my, hx + Math.cos(a) * 6, hy + Math.sin(a) * 6, (q) => (q > 0.8 ? '#ffffff' : '#c8a070'));
      break;
    }
    default: break;
  }
}
function buildHumanoid(l: Look, pz: Pose) {
  const p = new Pix(CW, CH);
  const { body, hair, accent, cls } = l;
  const pants = shade(body, -0.55), boots = '#2a2030';
  const bob = pz.walk === 2 || pz.walk === 4 ? -1 : pz.breathe ? 0 : 0;
  const by = FY + bob; // feet line
  const lean = pz.atk === 2 ? 1 : pz.atk === 1 ? -1 : 0;
  const side = pz.view === 'side', back = pz.view === 'back';
  const a = weaponAngle(cls, pz);
  // legs
  const stride = pz.walk === 1 ? 2 : pz.walk === 3 ? -2 : 0;
  if (side) {
    p.rect(FX - 3 - stride, FY - 6, 2, 5, shade(pants, -0.2)); p.rect(FX - 3 - stride, FY - 1, 3, 1, boots);
    p.rect(FX + 1 + stride, FY - 6, 2, 5, pants); p.rect(FX + 1 + stride, FY - 1, 3, 1, boots);
  } else {
    const l = pz.walk === 1 ? -1 : 0, r = pz.walk === 3 ? -1 : 0;
    p.rect(FX - 3, FY - 6 + l, 2, 5, pants); p.rect(FX - 3, FY - 1 + l, 2, 1, boots);
    p.rect(FX + 1, FY - 6 + r, 2, 5, pants); p.rect(FX + 1, FY - 1 + r, 2, 1, boots);
  }
  // weapon behind the body when seen from the back / or the back-hand items
  const shoulder = { x: FX + (side ? 2 : 4) + lean, y: by - 13 };
  const hand = { x: shoulder.x + Math.cos(a) * 3.5, y: shoulder.y + Math.sin(a) * 3.5 + 2 };
  if (back) drawWeapon(p, cls, hand.x, hand.y, a, accent, pz);
  if (cls === 'ranger' && !back) { p.rect(side ? FX - 6 : FX + 3, by - 17, 2, 7, '#6a4020'); p.set(side ? FX - 6 : FX + 3, by - 18, '#efe8d8'); p.set(side ? FX - 5 : FX + 4, by - 18, '#d03030'); } // quiver
  // torso
  const tw = side ? 7 : 8, tx = FX - (side ? 3 : 4) + lean;
  p.box(tx, by - 14, tw, 8, body);
  p.rect(tx, by - 9, tw, 1, accent); // belt
  if (cls === 'necromancer' || cls === 'mage' || cls === 'chronomancer') { p.rect(tx - 1, by - 7, tw + 2, 2, shade(body, -0.15)); } // robe hem
  if (cls === 'paladin') { p.rect(tx + 1, by - 13, tw - 2, 1, accent); p.set(FX + lean, by - 12, accent); p.set(FX + lean, by - 11, accent); } // tabard cross
  if (cls === 'warrior') p.box(tx + tw - 3, by - 15, 3, 2, '#a8b0c4'); // pauldron
  // back arm (+ shield / off-hand dagger)
  const bax = side ? tx - 1 : tx - 1;
  p.rect(bax, by - 13, 2, 5, shade(body, -0.3)); p.set(bax, by - 8, SKIN[2]); p.set(bax + 1, by - 8, SKIN[2]);
  if (cls === 'paladin' && !back) { p.ball(side ? tx - 1 : tx - 1, by - 10, 3, 3.5, '#c8cad8'); p.set(side ? tx - 1 : tx - 1, by - 11, accent); p.set(side ? tx - 1 : tx - 1, by - 10, accent); p.set(side ? tx - 2 : tx - 2, by - 10, accent); p.set(side ? tx : tx, by - 10, accent); }
  if (cls === 'assassin' && !back) p.line(bax, by - 8, bax - 2, by - 4, '#c0c4d4');
  // head
  const hx = FX + (side ? 1 : 0) + lean, hy = by - 21;
  p.ball(hx, hy, 6, 5.6, SKIN[0]);
  // hair
  const hl = shade(hair, 0.25), hd = shade(hair, -0.3);
  for (let y = Math.floor(hy - 7); y <= hy + 6; y++) for (let x = Math.floor(hx - 7); x <= hx + 7; x++) {
    const dx = (x + 0.5 - hx) / 6.6, dy = (y + 0.5 - hy) / 6.2; if (dx * dx + dy * dy > 1) continue;
    let isHair = false;
    if (back) isHair = true;
    else if (side) isHair = y < hy - 2 || x < hx - 2 || (y < hy && x < hx);
    else isHair = y < hy - 1 || Math.abs(x + 0.5 - hx) > 4.6;
    if (!isHair) continue;
    p.set(x, y, dy < -0.55 && dx < 0.2 ? hl : dx > 0.55 || dy > 0.4 ? hd : hair);
  }
  if (!back) { // bangs + eyes
    if (side) { for (let x = 0; x < 4; x++) if (x % 2 === 0) p.set(hx + 1 + x, hy - 1, hair); p.set(hx + 4, hy, '#2b2440'); p.set(hx + 4, hy + 1, '#2b2440'); p.set(hx + 3, hy + 2, '#f0a0a0'); }
    else { for (let x = -4; x <= 4; x += 2) p.set(hx + x, hy - 1, hair); p.set(hx - 2, hy, '#2b2440'); p.set(hx - 2, hy + 1, '#2b2440'); p.set(hx + 2, hy, '#2b2440'); p.set(hx + 2, hy + 1, '#2b2440'); p.set(hx - 2, hy, '#ffffff'); p.set(hx + 2, hy, '#ffffff'); }
  }
  // class headgear
  switch (cls) {
    case 'mage': { // pointed hat with a bent tip
      p.rect(hx - 7, hy - 5, 15, 1, shade(body, -0.2)); p.rect(hx - 6, hy - 6, 13, 1, body);
      for (let i = 0; i < 8; i++) { const w = Math.max(0, 5 - Math.floor(i * 0.65)); p.rect(hx - w + Math.floor(i / 3) * (side ? -1 : 0), hy - 7 - i, w * 2 + 1, 1, i === 2 ? accent : i < 2 ? shade(body, 0.1) : body); }
      p.set(hx - 4, hy - 15, body); p.set(hx - 5, hy - 14, body);
      break;
    }
    case 'assassin': { // hood + face mask
      for (let y = hy - 7; y <= hy + 1; y++) for (let x = hx - 7; x <= hx + 7; x++) { const dx = (x + 0.5 - hx) / 7, dy = (y + 0.5 - hy) / 6.8; if (dx * dx + dy * dy <= 1 && (y < hy - 1 || Math.abs(x + 0.5 - hx) > 4.5 || back)) p.set(x, y, dy < -0.6 ? '#3a3a4c' : '#24242e'); }
      if (!back) { p.rect(hx - (side ? 0 : 4), hy + 2, side ? 6 : 9, 2, '#1b1b24'); p.set(side ? hx + 4 : hx - 2, hy, accent); if (!side) p.set(hx + 2, hy, accent); }
      p.line(hx - 6, hy + 3, hx - 9 - (pz.walk ? 1 : 0), hy + 6, accent); // scarf tail
      break;
    }
    case 'ranger': for (let x = hx - 6; x <= hx + 6; x++) { p.set(x, hy - 5, body); p.set(x, hy - 6, shade(body, 0.15)); } p.rect(hx - 4, hy - 8, 8, 2, body); if (side) p.rect(hx + 4, hy - 4, 3, 1, body); p.set(hx - 5, hy - 8, accent); break;
    case 'paladin': p.rect(hx - 6, hy - 6, 13, 3, '#c8cad8'); p.rect(hx - 6, hy - 6, 13, 1, '#eef0fa'); p.rect(hx - 1, hy - 9, 2, 3, accent); p.set(hx, hy - 10, '#ffffff'); break;
    case 'warrior': p.rect(hx - 6, hy - 3, 13, 1, accent); if (side) p.line(hx - 6, hy - 3, hx - 9, hy - 1 + (pz.walk % 2), accent); break;
    case 'necromancer': // deep hood with glowing eyes
      for (let y = hy - 8; y <= hy + 3; y++) for (let x = hx - 8; x <= hx + 7; x++) { const dx = (x + 0.5 - hx) / 7.4, dy = (y + 0.5 - hy) / 7.4; if (dx * dx + dy * dy <= 1 && (back || y < hy - 2 || Math.abs(x + 0.5 - hx + (side ? 1.5 : 0)) > 4)) p.set(x, y, dy < -0.6 ? shade(body, 0.2) : body); }
      if (!back) { for (let y = hy - 2; y <= hy + 2; y++) for (let x = hx - (side ? 1 : 3); x <= hx + (side ? 4 : 3); x++) p.set(x, y, '#120c18'); p.set(side ? hx + 3 : hx - 2, hy, accent); p.set(side ? hx + 3 : hx + 2, hy, accent); p.set(hx, hy + 4, '#e8e2cf'); }
      break;
    case 'chronomancer': for (let i = 0; i < 9; i++) { const an = Math.PI * (1.1 + i * 0.1) + (T * 0.5) % 0.1; p.set(hx + Math.cos(an) * 9, hy - 2 + Math.sin(an) * 7, i % 2 ? accent : '#d8b25f'); } break;
    default: break;
  }
  // front arm + weapon
  if (!back) { p.line(shoulder.x, shoulder.y, hand.x, hand.y, body, 1); p.set(hand.x, hand.y, SKIN[0]); drawWeapon(p, cls, hand.x, hand.y, a, accent, pz); }
  p.outline();
  return { p, ax: FX, ay: FY };
}
/** Draws a class character / NPC. Signature kept from the old procedural renderer (bob > 1.2 means walking). */
export function drawChibi(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, facing: number, body: string, hair: string, accent: string, swing: number, bob: number, cls: string, seed = 0, flash = 0) {
  const pz = pose(facing, Math.abs(bob) > 1.2, swing, seed);
  const key = `h|${cls}|${body}|${hair}|${accent}|${pz.view}|${pz.walk}|${pz.atk}`;
  pixShadow(ctx, x, y + 6 * s, 13 * s, 4 * s);
  const build = () => buildHumanoid({ body, hair, accent, cls }, pz);
  blit(ctx, cached(key, build, false), x, y + 6 * s, s, pz.flip);
  if (flash > 0) blit(ctx, cached(key, build, true), x, y + 6 * s, s, pz.flip, Math.min(1, flash * 3));
}

// ── enemies ────────────────────────────────────────────────
interface EnemyLook { def: string; family: string; color: string; r: number; boss: boolean; elite: boolean; eye: string }
function buildHollow(l: EnemyLook, pz: Pose) {
  const r = Math.max(6, Math.round(l.r / PX)), H = Math.round(r * 2.6), W = r * 4 + 18, Hc = H + 14 + (l.def === 'sovereign' ? r : 0);
  const p = new Pix(W, Hc), cx = Math.floor(W / 2), foot = Hc - 3;
  const c = l.color, lit = shade(c, 0.2), dk = shade(c, -0.35);
  const big = l.def === 'veyra' || l.def === 'sovereign';
  if (big) { // umbral wings / eclipse halo behind
    if (l.def === 'veyra') { // umbral wings: feathered fans on both sides, beating while she moves
      const flap = pz.walk % 2 ? 2 : 0, sy = foot - H * 0.72;
      for (const dir of [-1, 1]) for (let i = 0; i < 7; i++) {
        const an = -0.35 - i * 0.22 - flap * 0.05, L = r * (1.5 - i * 0.12);
        p.line(cx + dir * r * 0.3, sy, cx + dir * (r * 0.3 + Math.cos(an) * L), sy + Math.sin(an) * L * -1 * -1 + i * 2 - r * 0.6, (q) => (q > 0.8 ? '#6a3aa0' : '#2a1440'), 2);
      }
    } else { // eclipse halo: black sun with a burning gold corona
      const hy = foot - H - 1, R = r * 0.95;
      p.ball(cx, hy, R * 0.9, R * 0.9, '#0c0812', true);
      for (let i = 0; i < 48; i++) { const an = (i / 48) * Math.PI * 2, rr = R + (i % 4 === 0 ? 2 : 0); p.set(cx + Math.cos(an) * rr, hy + Math.sin(an) * rr, i % 4 === 0 ? '#fff0b0' : '#d8a840'); }
    }
  }
  const sway = pz.walk ? (pz.walk % 2 ? 1 : -1) : 0;
  for (let y = 0; y < H; y++) { // cloak silhouette: rounded hood narrowing, then flaring hem
    const q = y / H, hood = q < 0.3 ? Math.sqrt(1 - ((0.3 - q) / 0.3) ** 2) * r * 0.62 : 0, body = r * (0.62 + (q - 0.3) * 0.55);
    const half = q < 0.3 ? hood : body, yy = foot - H + y;
    for (let x = -Math.round(half); x <= Math.round(half); x++) {
      if (y === H - 1 && (x + sway + 20) % 3 === 0) continue; // tattered hem
      const e = x / Math.max(1, half);
      p.set(cx + x + (q > 0.85 ? sway : 0), yy, e < -0.55 ? lit : e > 0.5 ? dk : c);
    }
  }
  // face cavity + glowing eyes
  const fy = foot - Math.round(H * 0.8), side = pz.view === 'side', off = side ? 2 : 0;
  if (pz.view !== 'back') {
    p.ball(cx + off, fy, r * 0.42, r * 0.32, '#0a0610', true);
    const ex = side ? [cx + off + 1, cx + off + 3] : [cx - 2, cx + 2];
    for (const x of ex) p.set(x, fy, l.eye);
  }
  // props
  const hx = cx + r * 0.7 + (side ? 2 : 0), hy = foot - H * 0.45, atk = pz.atk === 2 ? 0.4 : pz.atk === 1 ? -2.2 : -0.9;
  switch (l.def) {
    case 'hollow_archer': for (let i = -5; i <= 5; i++) { const t = (i / 5) * 1.2; p.set(hx + Math.cos(t) * 3, hy + Math.sin(t) * 6, '#a0907a'); } p.line(hx + Math.cos(-1.2) * 3, hy - 5.6, hx + Math.cos(1.2) * 3, hy + 5.6, '#d8d0c0'); break;
    case 'hollow_hexer': p.ball(hx + 1, hy - 2 + Math.round(Math.sin(T * 4) * 1.5), 2, 2, '#ff6ad5'); p.set(hx, hy - 3, '#ffffff'); break;
    case 'hollow_grunt': case 'hollow_brute': case 'hollow_captain': case 'veyra': {
      const L = l.def === 'hollow_grunt' ? 8 : l.def === 'veyra' ? 14 : 11;
      p.line(hx, hy, hx + Math.cos(atk) * L, hy + Math.sin(atk) * L, (q) => (q > 0.8 ? '#e8eaf2' : '#9a9aa8'), l.def === 'hollow_grunt' ? 1 : 2);
      if (l.def === 'hollow_captain') { p.box(cx - r * 0.7, foot - H * 0.68, 4, 3, '#7a7488'); p.box(cx + r * 0.7 - 3, foot - H * 0.68, 4, 3, '#7a7488'); }
      break;
    }
    case 'sovereign': p.line(hx, hy, hx + Math.cos(atk) * 15, hy + Math.sin(atk) * 15, (q) => (q > 0.75 ? '#fff0b0' : '#d8a840'), 2); break;
    default: break;
  }
  if (l.boss) { const cy = foot - H - 1; for (let x = -3; x <= 3; x++) p.set(cx + x, cy, '#ffd27a'); p.set(cx - 3, cy - 1, '#ffd27a'); p.set(cx, cy - 2, '#ffd27a'); p.set(cx + 3, cy - 1, '#ffd27a'); p.set(cx, cy - 1, '#ff4f9a'); }
  p.outline();
  return { p, ax: cx, ay: foot };
}
function buildBeast(l: EnemyLook, pz: Pose) {
  const r = Math.max(5, Math.round(l.r / PX)), W = r * 4 + 12, H = r * 3 + 8, p = new Pix(W, H), cx = Math.floor(W / 2) - 2, foot = H - 3;
  const c = l.color, by = foot - Math.round(r * 0.9), bob = pz.walk === 2 || pz.walk === 4 ? -1 : 0;
  const wings = l.def === 'cinder_drake';
  if (wings) { const flap = pz.walk % 2 ? -3 : 0; for (let i = 0; i < r + 2; i++) p.line(cx - 2 + i * 0.3, by - 2 + bob, cx - r * 0.6 + i * 0.6, by - r - 3 + flap + i * 0.4, shade(c, -0.25)); }
  // legs (4), stepping in pairs
  const st = pz.walk === 1 ? 1 : pz.walk === 3 ? -1 : 0, legC = shade(c, -0.35);
  for (const [lx, ph] of [[-r * 0.7, 1], [-r * 0.3, -1], [r * 0.35, -1], [r * 0.75, 1]] as const) p.rect(cx + lx + st * ph, by + 2, 2, foot - by - 1, legC);
  p.ball(cx, by + bob, r * 1.15, r * 0.68, c);
  // head
  const hx = cx + r * 1.05, hy = by - r * 0.35 + bob + (pz.atk === 2 ? 2 : pz.atk === 1 ? -1 : 0);
  p.ball(hx, hy, r * 0.55, r * 0.48, c);
  p.set(hx + r * 0.25, hy - 1, l.eye); p.set(hx + r * 0.25 + 1, hy - 1, l.eye);
  if (l.def === 'gloomfang' || l.def === 'shard_stalker') { p.set(hx - 1, hy - r * 0.5, c); p.set(hx - 1, hy - r * 0.5 - 1, c); p.set(hx + 1, hy - r * 0.5, c); } // ears
  if (l.def === 'thornback') { for (let i = -2; i <= 2; i++) p.line(cx + i * 3, by - r * 0.6, cx + i * 3 + 1, by - r * 0.6 - 4, '#d8c8a0'); p.line(hx + r * 0.4, hy + 1, hx + r * 0.4 + 2, hy - 2, '#f0e8d0'); }
  if (l.def === 'shard_stalker') for (let i = -2; i <= 2; i++) p.line(cx + i * 3, by - r * 0.55, cx + i * 3 + 2, by - r * 0.55 - 5, (q) => (q > 0.6 ? '#e8ffff' : '#7fd8ff'));
  if (l.def === 'cinder_drake') { p.set(hx + r * 0.6, hy + 1, '#ffd36a'); }
  p.line(cx - r * 1.1, by + bob, cx - r * 1.6, by - 3 + (pz.walk % 2), shade(c, -0.2)); // tail
  p.outline();
  return { p, ax: cx, ay: foot };
}
function buildGolem(l: EnemyLook, pz: Pose) {
  const r = Math.max(7, Math.round(l.r / PX)), W = r * 3 + 10, H = Math.round(r * 2.6) + 8, p = new Pix(W, H), cx = Math.floor(W / 2), foot = H - 3;
  const c = l.color, crystal = l.family === 'shardborn', magma = l.def === 'magma_golem';
  const st = pz.walk === 1 ? 1 : pz.walk === 3 ? -1 : 0;
  p.box(cx - r * 0.55, foot - r * 0.7 + st, r * 0.45, r * 0.7 - st, shade(c, -0.2)); p.box(cx + r * 0.1, foot - r * 0.7 - st, r * 0.45, r * 0.7 + st, shade(c, -0.2));
  const ty = foot - r * 2, raise = pz.atk === 1 ? -4 : pz.atk === 2 ? 3 : 0;
  p.box(cx - r * 0.8, ty, r * 1.6, r * 1.35, c);
  p.box(cx - r * 0.35, ty - r * 0.55, r * 0.7, r * 0.6, shade(c, 0.05)); // head
  p.box(cx - r * 1.25, ty + 1 + raise, r * 0.45, r * 1.1, shade(c, -0.1)); p.box(cx + r * 0.8, ty + 1 + raise, r * 0.45, r * 1.1, shade(c, -0.1)); // arms
  p.set(cx + r * 0.1, ty - r * 0.3, l.eye); p.set(cx + r * 0.1 + 1, ty - r * 0.3, l.eye);
  const rnd = (i: number) => ((Math.sin(i * 91.7 + r) * 43758.5) % 1 + 1) % 1;
  if (magma) for (let i = 0; i < 10; i++) { const x = cx - r * 0.6 + rnd(i) * r * 1.2, y = ty + 2 + rnd(i + 9) * r; p.line(x, y, x + 2, y + 1, (Math.floor(T * 6) + i) % 4 ? '#ff9230' : '#ffe98a'); }
  else if (crystal) for (let i = 0; i < 5; i++) { const x = cx - r * 0.7 + i * r * 0.35; p.line(x, ty, x + 1, ty - 4 - (i % 2) * 2, (q) => (q > 0.5 ? '#ffffff' : '#a8e0ea')); }
  else for (let i = 0; i < 5; i++) { const x = cx - r * 0.5 + rnd(i) * r, y = ty + 3 + rnd(i + 3) * r; p.line(x, y, x + 2, y + 2, shade(c, -0.45)); }
  if (l.def === 'labyrinth_warden') { p.rect(cx - 2, ty + r * 0.4, 5, 1, '#5fe0d0'); p.rect(cx, ty + r * 0.4 - 2, 1, 5, '#5fe0d0'); }
  p.outline();
  return { p, ax: cx, ay: foot };
}
function buildCaster(l: EnemyLook, pz: Pose) { // floating crystal seer / imp
  const r = Math.max(5, Math.round(l.r / PX)), W = r * 3 + 8, H = r * 4 + 8, p = new Pix(W, H), cx = Math.floor(W / 2), foot = H - 2;
  if (l.def === 'prism_seer') {
    const cy = foot - r * 2.2 + Math.round(Math.sin(T * 3) * 1.5);
    for (let y = -r * 1.4; y <= r * 1.4; y++) { const w = Math.round(r * 0.8 * (1 - Math.abs(y) / (r * 1.4))); for (let x = -w; x <= w; x++) p.set(cx + x, cy + y, x < 0 ? (y < 0 ? '#ffffff' : '#e8d6ff') : y < 0 ? '#c8a8ff' : '#8a6ac8'); }
    p.set(cx, cy, l.eye); p.set(cx + 1, cy, l.eye);
  } else { // ember imp: small horned body, flame crest, tail
    const by = foot - r * 1.3 + (pz.walk % 2 ? -1 : 0);
    p.rect(cx - 2, foot - 4, 2, 4, shade(l.color, -0.3)); p.rect(cx + 1, foot - 4, 2, 4, shade(l.color, -0.3));
    p.ball(cx, by, r * 0.75, r * 0.8, l.color); p.ball(cx + 1, by - r * 0.9, r * 0.6, r * 0.55, l.color);
    p.set(cx - 2, by - r * 1.5, '#3a1010'); p.set(cx + 3, by - r * 1.5, '#3a1010');
    p.set(cx + 2, by - r * 0.9, l.eye); p.set(cx + 3, by - r * 0.9, l.eye);
    for (let i = 0; i < 3; i++) p.set(cx - 1 + i, by - r * 1.5 - 1 - ((Math.floor(T * 12) + i) % 2), i === 1 ? '#ffe98a' : '#ff9230');
    p.line(cx - r * 0.7, by + 2, cx - r * 1.4, by - 1, shade(l.color, -0.2));
  }
  p.outline();
  return { p, ax: cx, ay: foot };
}
function buildTree(l: EnemyLook, pz: Pose) { // Gloomheart: a walking eclipsed grove
  const r = Math.round(l.r / PX), W = r * 3 + 8, H = r * 3 + 10, p = new Pix(W, H), cx = Math.floor(W / 2), foot = H - 3;
  const sw = pz.walk % 2 ? 1 : 0;
  for (let i = -2; i <= 2; i++) p.line(cx + i * 3, foot, cx + i * 2 + sw, foot - r * 0.6, '#3a2a20', 2); // roots
  p.box(cx - r * 0.35, foot - r * 1.5, r * 0.7, r * 1.0, '#4a3424');
  p.ball(cx, foot - r * 1.8, r * 1.2, r * 0.9, l.color);
  for (let i = 0; i < 7; i++) p.ball(cx - r + i * r * 0.33, foot - r * 2.3 + (i % 2) * 3, r * 0.35, r * 0.3, shade(l.color, i % 2 ? 0.15 : -0.15));
  p.ball(cx, foot - r * 1.2, 2.5, 2.5, '#0a0610', true); p.set(cx, foot - r * 1.2, l.eye); p.set(cx + 1, foot - r * 1.2, l.eye);
  p.outline();
  return { p, ax: cx, ay: foot };
}
function buildDummy() {
  const p = new Pix(20, 30);
  p.rect(9, 14, 2, 15, '#7a5a34'); p.rect(4, 26, 12, 2, '#5a3a24');
  p.ball(10, 10, 6, 8, '#c8a46a'); p.line(5, 7, 15, 7, '#a8875a'); p.line(5, 13, 15, 13, '#a8875a');
  p.ball(10, 10, 2.5, 2.5, '#b03030', true); p.set(10, 10, '#ffe0e0');
  p.outline();
  return { p, ax: 10, ay: 28 };
}
function buildOrb(l: EnemyLook) { // wisp / starling: glow core, flickering rim (light comes from the renderer)
  const r = Math.max(3, Math.round(l.r / PX * 0.7)), W = r * 4 + 8, p = new Pix(W, W), c = Math.floor(W / 2), f = Math.floor(T * 12);
  if (l.def === 'starling') { for (let i = 0; i < 5; i++) { const an = T * 4 + i * 1.26, x = c + Math.cos(an) * r * 1.4, y = c + Math.sin(an) * r * 0.9, w = (f + i) % 2 ? -1 : 1; p.rect(x - 1, y - 1, 2, 2, '#fff4b8'); p.set(x - 2, y + w, '#d8c880'); p.set(x + 2, y + w, '#d8c880'); p.set(x - 3, y + w * 2, '#a89858'); p.set(x + 3, y + w * 2, '#a89858'); } p.outline('#3a3420'); }
  else { p.ball(c, c, r, r, l.color); p.ball(c - 1, c - 1, r * 0.45, r * 0.45, '#ffffff', true); for (let i = 1; i < 4; i++) p.set(c - r - i, c + (i + f) % 2, shade(l.color, -0.2 * i)); p.outline(shade(l.color, -0.6)); }
  return { p, ax: c, ay: W - 1 };
}
/** Draws an enemy sprite. Returns the sprite's approximate height (world units) for bars/labels. */
export function drawEnemySprite(ctx: CanvasRenderingContext2D, e: { id: number; def: string; f: number; moving: number; windup: number; flash: number; rx: number; ry: number }, def: { family: string; color: string; radius: number; look?: string } | undefined, elite: boolean, boss: boolean, scale: number) {
  const fam = def?.family ?? 'hollowborn', col = def?.color ?? '#666', r = (def?.radius ?? 15) * (elite ? 1.15 : 1);
  const swing = e.windup > 0 ? 0.25 : 0;
  const pz = pose(e.f, e.moving > 0.2, swing, e.id);
  if (fam !== 'hollowborn' && fam !== 'construct' && def?.look !== 'hollow' && def?.look !== 'golem') pz.view = 'side';
  const l: EnemyLook = { def: e.def, family: fam, color: col, r, boss, elite, eye: boss ? '#ff4f9a' : elite ? '#ffb347' : fam === 'cinderkin' ? '#ffe98a' : fam === 'shardborn' ? '#ffffff' : '#c8a0ff' };
  const kind = def?.look ? def.look : e.def === 'dummy' ? 'dummy' : e.def === 'gloomheart' ? 'tree' : e.def === 'wisp' || e.def === 'starling' ? 'orb' : e.def === 'prism_seer' || e.def === 'ember_imp' ? 'caster'
    : fam === 'construct' || e.def === 'magma_golem' || e.def === 'glass_colossus' ? 'golem' : fam === 'wildlife' || e.def === 'cinder_drake' || e.def === 'shard_stalker' ? 'beast' : 'hollow';
  const animated = kind === 'orb' || kind === 'caster' || e.def === 'magma_golem';
  if (def?.look) l.eye = boss ? '#ff4f9a' : elite ? '#ffb347' : shade(col, 0.7);
  const key = `e|${e.def}|${elite ? 1 : 0}|${boss ? 1 : 0}|${pz.view}|${pz.flip ? 1 : 0}|${pz.walk}|${pz.atk}${animated ? '|' + Math.floor(T * 12) % 24 : ''}`;
  const build = () => kind === 'dummy' ? buildDummy() : kind === 'tree' ? buildTree(l, pz) : kind === 'orb' ? buildOrb(l) : kind === 'caster' ? buildCaster(l, pz) : kind === 'golem' ? buildGolem(l, pz) : kind === 'beast' ? buildBeast(l, pz) : buildHollow(l, pz);
  const flip = kind === 'beast' || kind === 'caster' ? Math.cos(e.f) < 0 : pz.flip;
  const s = cached(key, build, false);
  const y = e.ry + 6;
  pixShadow(ctx, e.rx, y, r * 1.1 * scale, r * 0.4 * scale);
  blit(ctx, s, e.rx, kind === 'orb' ? y - 14 : y, scale, flip);
  if (e.flash > 0) blit(ctx, cached(key, build, true), e.rx, kind === 'orb' ? y - 14 : y, scale, flip, Math.min(1, e.flash * 3));
  return s.ay * PX * scale;
}

// ── minions ────────────────────────────────────────────────
export function drawMinionSprite(ctx: CanvasRenderingContext2D, e: { id: number; def: string; f: number; moving: number; swingT: number; flash: number; rx: number; ry: number }, color: string, radius: number) {
  const pz = pose(e.f, e.moving > 0.2, e.swingT, e.id);
  if (e.def === 'golem') { // Bone Colossus: a golem built from bone
    const pz2 = pose(e.f, e.moving > 0.2, e.swingT, e.id), l: EnemyLook = { def: 'bone_golem', family: 'construct', color, r: radius * 1.3, boss: false, elite: false, eye: '#7be0b5' };
    const s = cached(`m|golem|${pz2.walk}|${pz2.atk}`, () => buildGolem(l, pz2), false);
    pixShadow(ctx, e.rx, e.ry + 5, radius * 1.3, radius * 0.5); blit(ctx, s, e.rx, e.ry + 5, 1, Math.cos(e.f) < 0);
    if (e.flash > 0) blit(ctx, cached(`m|golem|${pz2.walk}|${pz2.atk}`, () => buildGolem(l, pz2), true), e.rx, e.ry + 5, 1, Math.cos(e.f) < 0, Math.min(1, e.flash * 3));
    return;
  }
  if (e.def === 'skeleton' || e.def === 'sentinel') { // reuse the humanoid builder with bone / light colours
    const look = e.def === 'sentinel' ? { body: '#e8d8a0', hair: '#fff4c0', accent: '#ffd85a', cls: 'paladin' } : { body: color, hair: shade(color, -0.1), accent: shade(color, -0.4), cls: 'warrior' };
    drawChibi(ctx, e.rx, e.ry, 0.8, e.f, look.body, look.hair, look.accent, e.swingT, e.moving > 0.2 ? 2 : 0, look.cls, e.id, e.flash);
    return;
  }
  const key = `m|${e.def}|${pz.flip ? 1 : 0}|${Math.floor(T * 12) % 4}`;
  const s = cached(key, () => {
    const p = new Pix(24, 24), f = Math.floor(T * 12) % 4;
    if (e.def === 'hawk') { const w = f < 2 ? -3 : 2; p.ball(12, 12, 3, 2, color); p.line(10, 12, 4, 12 + w, shade(color, -0.2)); p.line(14, 12, 20, 12 + w, shade(color, -0.2)); p.set(15, 11, '#ffd36a'); }
    else if (e.def === 'turret') { p.box(7, 13, 10, 9, '#5a6b3a'); p.line(12, 15, 20, 13, color, 2); }
    else { p.ball(12, 10, 4, 5, color); for (let i = 0; i < 4; i++) p.set(9 + i * 2, 15 + ((i + f) % 2), shade(color, -0.2)); p.set(11, 9, '#102030'); p.set(13, 9, '#102030'); } // wraith
    p.outline();
    return { p, ax: 12, ay: 22 };
  }, false);
  pixShadow(ctx, e.rx, e.ry + 5, radius, radius * 0.4);
  blit(ctx, s, e.rx, e.def === 'hawk' || e.def === 'wraith' ? e.ry - 14 : e.ry + 5, 1, pz.flip);
}

/** Mount drawn under its rider: a beast body (wings for the drake), galloping while moving. */
export function drawMountSprite(ctx: CanvasRenderingContext2D, id: string, color: string, facing: number, moving: boolean, _t: number) {
  const pz = pose(facing, moving, 0, 7);
  const l: EnemyLook = { def: id === 'mount_eclipse' ? 'cinder_drake' : id === 'mount_ashwolf' ? 'gloomfang' : 'mount', family: 'wildlife', color, r: 26, boss: false, elite: false, eye: id === 'mount_eclipse' ? '#ffd36a' : '#2a2440' };
  const key = `mt|${id}|${pz.walk}|${Math.cos(facing) < 0 ? 1 : 0}`;
  const s = cached(key, () => buildBeast(l, pz), false);
  pixShadow(ctx, 0, 8, 30, 8);
  blit(ctx, s, 0, 10, 1, Math.cos(facing) < 0);
}
