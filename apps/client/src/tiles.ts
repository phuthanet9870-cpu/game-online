// Pixel-art terrain: every 32-unit map tile is painted as 16×16 art pixels (1 art pixel = PX world units) so the
// ground shares the grid of the sprites and effects. Chunks are painted once into an ImageData and cached.
import type { GameMap } from '@astra/shared';
import { shade } from './sprites.js';

export const ART = 16; // art pixels per tile
type Pal = { floor: string[]; path: string[]; wall: string; wallTop: string; water: string; tree: string; bg: string };
const hx = (h: string): [number, number, number] => { const n = parseInt(h.slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const hash = (a: number, b: number, c = 0) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

class Px {
  data: Uint8ClampedArray<ArrayBuffer>;
  constructor(public w: number, public h: number) { this.data = new Uint8ClampedArray(new ArrayBuffer(w * h * 4)); }
  set(x: number, y: number, c: string, a = 255) { if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; const [r, g, b] = hx(c); const i = (y * this.w + x) * 4; this.data[i] = r; this.data[i + 1] = g; this.data[i + 2] = b; this.data[i + 3] = a; }
  rect(x: number, y: number, w: number, h: number, c: string) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
}

/** Paints one chunk (CH×CH tiles) at art resolution; returns a canvas CH*ART wide and (CH+1)*ART tall. */
export function paintChunk(m: GameMap, th: Pal, cx: number, cy: number, CH: number): HTMLCanvasElement {
  const W = CH * ART, H = (CH + 1) * ART, TOP = ART; // one tile of headroom above for trees/pillars
  const p = new Px(W, H + TOP);
  const theme = m.palette ?? m.theme;
  const tile = (tx: number, ty: number) => (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h ? 0 : m.tiles[ty * m.w + tx]!);
  const isPath = (t: number) => t === 2 || t === 6 || t === 7;
  const tall: Array<() => void> = [];
  for (let ty = cy * CH - 1; ty < cy * CH + CH + 1; ty++) for (let tx = cx * CH; tx < cx * CH + CH; tx++) {
    if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) continue;
    const inside = ty >= cy * CH && ty < cy * CH + CH;
    const t = tile(tx, ty), ox = (tx - cx * CH) * ART, oy = (ty - cy * CH) * ART + TOP;
    if (!inside) { if (t === 4) tall.push(() => obstacle(p, theme, th, ox, oy, tx, ty)); continue; }
    if (t === 0) { wall(p, theme, th, ox, oy, tx, ty, tile(tx, ty + 1) !== 0, tile(tx, ty - 1) !== 0); continue; }
    if (t === 3) { water(p, theme, th, ox, oy, tx, ty, tile(tx, ty - 1) !== 3); continue; }
    if (isPath(t)) path(p, theme, th, ox, oy, tx, ty, t);
    else ground(p, theme, th, ox, oy, tx, ty);
    // grass creeping over path edges keeps borders organic
    if (isPath(t) && theme !== 'dungeon' && theme !== 'house') for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
      const n = tile(tx + dx, ty + dy); if (n !== 1) continue;
      for (let k = 0; k < ART; k++) { const depth = Math.floor(hash(tx * 7 + k, ty * 5 + dx * 3 + dy) * 3); for (let d = 0; d < depth; d++) { const x = dx === 0 ? k : dx < 0 ? d : ART - 1 - d, y = dy === 0 ? k : dy < 0 ? d : ART - 1 - d; p.set(ox + x, oy + y, th.floor[(k + d) % 2]!); } }
    }
    if (t === 6) for (let j = 0; j < ART; j += 2) for (let i = (j / 2) % 2; i < ART; i += 2) if (hash(tx, ty, i * 31 + j) > 0.75) p.set(ox + i, oy + j, '#7a4ab8', 90);
    if (t === 4) tall.push(() => obstacle(p, theme, th, ox, oy, tx, ty));
  }
  for (const f of tall) f();
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H + TOP;
  cv.getContext('2d')!.putImageData(new ImageData(p.data, W, H + TOP), 0, 0);
  return cv;
}
export const CHUNK_TOP = ART; // art pixels of headroom at the top of each chunk canvas

function ground(p: Px, theme: string, th: Pal, ox: number, oy: number, tx: number, ty: number) {
  const f = th.floor;
  if (theme === 'dungeon') { // flagstones with grout, cracks and the odd rune
    const big = (tx + ty) % 2 === 0;
    for (let j = 0; j < ART; j++) for (let i = 0; i < ART; i++) {
      const grout = i === 0 || j === 0 || (big ? false : i === 8 || j === 8);
      const n = hash(tx * 16 + i, ty * 16 + j);
      p.set(ox + i, oy + j, grout ? shade(f[0]!, -0.35) : n > 0.93 ? shade(f[1]!, 0.12) : n < 0.06 ? shade(f[2]!, -0.12) : f[(i + j * 3) % 3 === 0 ? 1 : 0]!);
    }
    if (hash(tx, ty, 7) > 0.92) { const c = hash(tx, ty, 9) > 0.5 ? '#8a6aff' : '#5fe0d0'; for (const [x, y] of [[6, 7], [7, 6], [8, 7], [7, 8], [7, 7], [9, 9], [5, 5]]) p.set(ox + x!, oy + y!, c, 200); }
    if (hash(tx, ty, 3) > 0.8) { let x = 2 + Math.floor(hash(tx, ty, 4) * 10), y = 3; for (let k = 0; k < 7; k++) { p.set(ox + x, oy + y, shade(f[0]!, -0.4)); y++; if (hash(tx, ty, k) > 0.5) x++; } }
    return;
  }
  if (theme === 'house') { // wooden planks
    for (let j = 0; j < ART; j++) for (let i = 0; i < ART; i++) { const plank = Math.floor((j + (tx % 2) * 4) / 4); const seam = (j + (tx % 2) * 4) % 4 === 0; const knot = hash(tx * 3 + plank, ty, i) > 0.97; p.set(ox + i, oy + j, seam ? shade(f[0]!, -0.35) : knot ? shade(f[0]!, -0.25) : f[plank % 3]!); }
    return;
  }
  // grass / ash / sand: speckled base, tufts, flowers or pebbles
  for (let j = 0; j < ART; j++) for (let i = 0; i < ART; i++) {
    const n = hash(tx * 16 + i, ty * 16 + j), gx = (tx * 16 + i) / 6, gy = (ty * 16 + j) / 6, n2 = (hash(Math.floor(gx), Math.floor(gy), 5) * 0.6 + hash(Math.floor(gx + 0.5), Math.floor(gy + 0.5), 6) * 0.4);
    p.set(ox + i, oy + j, n2 > 0.62 ? f[1]! : n2 < 0.38 ? f[2]! : f[0]!);
    if (n > 0.985) p.set(ox + i, oy + j, shade(f[0]!, theme === 'ash' ? -0.25 : 0.14));
  }
  const tufts = theme === 'star' ? 1 : 3;
  for (let k = 0; k < tufts; k++) {
    if (hash(tx, ty, k + 11) < 0.45) continue;
    const x = 1 + Math.floor(hash(tx, ty, k + 21) * 13), y = 3 + Math.floor(hash(tx, ty, k + 31) * 11);
    if (theme === 'ash') { p.set(ox + x, oy + y, '#ff7a2e', 160); p.set(ox + x + 1, oy + y, shade('#ff7a2e', -0.4), 160); continue; } // ember crack
    if (theme === 'star') { p.set(ox + x, oy + y, '#bfe8ff'); p.set(ox + x, oy + y - 1, '#ffffff'); p.set(ox + x + 1, oy + y, '#7fb8d8'); continue; } // glass shard
    const dark = shade(f[0]!, -0.3), lite = shade(f[0]!, 0.22);
    p.set(ox + x, oy + y, dark); p.set(ox + x, oy + y - 1, f[1]!); p.set(ox + x - 1, oy + y - 1, lite); p.set(ox + x + 1, oy + y - 2, lite); p.set(ox + x + 1, oy + y, dark);
  }
  if ((theme === 'town' || theme === 'field') && hash(tx, ty, 41) > 0.9) { const x = 2 + Math.floor(hash(tx, ty, 42) * 11), y = 2 + Math.floor(hash(tx, ty, 43) * 11), c = ['#ff9ad5', '#ffe070', '#ffffff', '#b48aff'][Math.floor(hash(tx, ty, 44) * 4)]!; p.set(ox + x, oy + y, c); p.set(ox + x + 1, oy + y, c); p.set(ox + x, oy + y + 1, c); p.set(ox + x + 1, oy + y + 1, shade(c, -0.3)); p.set(ox + x + 2, oy + y + 2, shade(f[0]!, -0.3)); }
  if (hash(tx, ty, 51) > 0.94) { const x = 3 + Math.floor(hash(tx, ty, 52) * 9), y = 4 + Math.floor(hash(tx, ty, 53) * 9); p.set(ox + x, oy + y, '#a8a090'); p.set(ox + x + 1, oy + y, '#8a8070'); p.set(ox + x, oy + y + 1, '#6a6258'); }
}

function path(p: Px, theme: string, th: Pal, ox: number, oy: number, tx: number, ty: number, t: number) {
  const f = th.path;
  if (theme === 'town' || theme === 'dungeon' || t === 7) { // cobbles: rounded stones lit from the top-left
    for (let j = 0; j < ART; j++) for (let i = 0; i < ART; i++) {
      const row = Math.floor(j / 5), off = row % 2 ? 3 : 0, col = Math.floor((i + off) / 6);
      const ix = (i + off) % 6, iy = j % 5, edge = ix === 0 || iy === 0;
      const base = f[(col + row + tx + ty) % 3]!;
      p.set(ox + i, oy + j, edge ? shade(base, -0.38) : ix === 1 || iy === 1 ? shade(base, 0.14) : ix === 5 || iy === 4 ? shade(base, -0.14) : base);
    }
    return;
  }
  for (let j = 0; j < ART; j++) for (let i = 0; i < ART; i++) { // packed dirt with ruts and pebbles
    const n = hash(tx * 16 + i, ty * 16 + j);
    p.set(ox + i, oy + j, n > 0.92 ? shade(f[0]!, 0.15) : n < 0.08 ? shade(f[0]!, -0.2) : f[Math.floor(hash(Math.floor((tx * 16 + i) / 4), Math.floor((ty * 16 + j) / 4)) * 3)]!);
  }
  if (hash(tx, ty, 61) > 0.7) { const x = 2 + Math.floor(hash(tx, ty, 62) * 11), y = 2 + Math.floor(hash(tx, ty, 63) * 11); p.set(ox + x, oy + y, '#c8c0b0'); p.set(ox + x + 1, oy + y + 1, '#6a6258'); }
}

function water(p: Px, theme: string, th: Pal, ox: number, oy: number, tx: number, ty: number, shoreAbove: boolean) {
  const c = th.water, deep = shade(c, -0.3), lite = shade(c, 0.25);
  for (let j = 0; j < ART; j++) for (let i = 0; i < ART; i++) p.set(ox + i, oy + j, j < 2 && shoreAbove ? deep : hash(Math.floor((tx * 16 + i) / 4), ty * 16 + j) > 0.8 ? shade(c, 0.08) : c);
  for (let k = 0; k < 2; k++) { const y = 4 + Math.floor(hash(tx, ty, k + 71) * 10), x = Math.floor(hash(tx, ty, k + 72) * 10); for (let i = 0; i < 4; i++) p.set(ox + x + i, oy + y, theme === 'ash' ? '#ffd36a' : lite, theme === 'ash' ? 220 : 200); }
  if (shoreAbove) for (let i = 0; i < ART; i++) if (hash(tx * 16 + i, ty, 3) > 0.35) p.set(ox + i, oy + 2, theme === 'ash' ? '#ffb02e' : '#e8f4ff', 200); // foam / lava crust
}

function wall(p: Px, theme: string, th: Pal, ox: number, oy: number, tx: number, ty: number, faceBelow: boolean, _openAbove: boolean) {
  const top = th.wallTop, face = th.wall;
  if (!faceBelow) { // solid mass seen from above: cap stones
    for (let j = 0; j < ART; j++) for (let i = 0; i < ART; i++) { const n = hash(tx * 16 + i, ty * 16 + j); p.set(ox + i, oy + j, n > 0.9 ? shade(top, 0.1) : n < 0.1 ? shade(top, -0.18) : shade(top, -0.06)); }
    return;
  }
  // front face: cap on top, bricks (town/dungeon) or rock strata (outdoors), dark foot
  for (let j = 0; j < ART; j++) for (let i = 0; i < ART; i++) {
    let c: string;
    if (j < 5) c = j === 0 ? shade(top, 0.2) : j === 4 ? shade(top, -0.25) : top;
    else if (theme === 'town' || theme === 'dungeon' || theme === 'house') { const row = Math.floor((j - 5) / 4), off = row % 2 ? 4 : 0, mort = (j - 5) % 4 === 0 || (i + off) % 8 === 0; c = mort ? shade(face, -0.35) : (j - 5) % 4 === 1 ? shade(face, 0.1) : face; if (theme === 'dungeon' && !mort && hash(tx * 16 + i, ty * 16 + j) > 0.93) c = '#3a6a3a'; }
    else { const s = Math.floor(hash(tx, ty * 16 + j) * 3); c = s === 0 ? shade(face, 0.1) : s === 1 ? face : shade(face, -0.15); if (hash(tx * 16 + i, ty * 16 + j) > 0.9) c = shade(face, -0.3); }
    if (j >= ART - 2) c = shade(face, -0.45);
    p.set(ox + i, oy + j, c);
  }
}

function obstacle(p: Px, theme: string, th: Pal, ox: number, oy: number, tx: number, ty: number) {
  const INK = '#120c1a';
  if (theme === 'dungeon') { // carved pillar
    const col = '#4b4266', lite = '#6a5d8f';
    for (let j = -10; j < ART - 2; j++) for (let i = 3; i < 13; i++) p.set(ox + i, oy + j, i === 3 || i === 12 ? INK : j < -7 ? lite : i < 6 ? shade(col, 0.15) : i > 10 ? shade(col, -0.2) : col);
    for (let i = 2; i < 14; i++) { p.set(ox + i, oy - 11, INK); p.set(ox + i, oy + ART - 3, INK); }
    if (hash(tx, ty) > 0.5) for (let j = -4; j < 6; j += 3) p.set(ox + 8, oy + j, '#8a6aff');
    return;
  }
  if (theme === 'star') { // crystal spire
    for (let j = -12; j < ART - 2; j++) { const w = Math.max(1, Math.round((j + 12) / 4)); for (let i = -w; i <= w; i++) p.set(ox + 8 + i, oy + j, Math.abs(i) === w ? '#3a5a8a' : i < 0 ? '#e8f8ff' : '#7fc8f0'); }
    p.set(ox + 7, oy - 6, '#ffffff'); p.set(ox + 7, oy - 5, '#ffffff');
    return;
  }
  if (theme === 'ash') { // charred spire with ember veins
    for (let j = -10; j < ART - 2; j++) { const w = Math.max(1, Math.round((j + 10) / 4)); for (let i = -w; i <= w; i++) p.set(ox + 8 + i, oy + j, Math.abs(i) === w ? INK : i < 0 ? '#3a2a24' : '#1f1714'); }
    for (let j = -2; j < 8; j += 2) p.set(ox + 8, oy + j, '#ff7a2e');
    return;
  }
  // tree: shadow, trunk, layered canopy with highlight and ink outline
  const leaf = th.tree, lite = shade(leaf, 0.25), dark = shade(leaf, -0.35);
  for (let i = 2; i < 14; i++) p.set(ox + i, oy + ART - 3, '#00000055'.slice(0, 7), 90);
  for (let j = 6; j < ART - 2; j++) for (let i = 6; i < 10; i++) p.set(ox + i, oy + j, i === 6 ? '#3a2614' : i === 9 ? '#24160c' : '#5a3d25');
  const cxp = 8, cyp = -1;
  const inC = (i: number, j: number) => { const blobs: Array<[number, number, number]> = [[0, 0, 7.5], [-4, 3, 5], [4, 3, 5], [0, -5, 5]]; return blobs.some(([bx, by, r]) => (i - bx) ** 2 + (j - by) ** 2 <= r * r); };
  for (let j = -12; j < 10; j++) for (let i = -9; i < 10; i++) {
    if (!inC(i, j)) continue;
    const edge = !inC(i - 1, j) || !inC(i + 1, j) || !inC(i, j - 1) || !inC(i, j + 1);
    const l = i + j;
    p.set(ox + cxp + i, oy + cyp + j, edge ? INK : l < -6 ? lite : l > 6 ? dark : hash(tx * 31 + i, ty * 17 + j) > 0.8 ? shade(leaf, 0.1) : leaf);
  }
}
