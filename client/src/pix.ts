// Tiny pixel-drawing helpers shared by the code-drawn world art (world.ts tiles, props, buildings). Everything is drawn on small
// canvases at 1 art pixel = 1 canvas pixel and shown scaled up without smoothing.
export type Ctx = CanvasRenderingContext2D;
export type Canvas = HTMLCanvasElement;

export function mk(w: number, h: number): { c: Canvas; g: Ctx } {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.imageSmoothingEnabled = false;
  return { c, g };
}

/** deterministic hash -> [0, 1) */
export function hash(x: number, y: number, s = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2147483647)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export type RGB = [number, number, number];
export const rgb = (h: string): RGB => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const hex = ([r, g, b]: RGB) => `#${((1 << 24) | (clamp(r) << 16) | (clamp(g) << 8) | clamp(b)).toString(16).slice(1)}`;
const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
export const mixc = (a: string, b: string, t: number) => { const x = rgb(a), y = rgb(b); return hex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]); };
export const darker = (c: string, t = 0.25) => mixc(c, "#10131f", t);
export const lighter = (c: string, t = 0.25) => mixc(c, "#fffbe8", t);
export const tint = (c: string, m: RGB) => { const x = rgb(c); return hex([x[0] * m[0], x[1] * m[1], x[2] * m[2]]); };

export const R = (g: Ctx, x: number, y: number, w: number, h: number, c: string) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
export const P = (g: Ctx, x: number, y: number, c: string) => R(g, x, y, 1, 1, c);
/** filled disc as pixel rows */
export function D(g: Ctx, cx: number, cy: number, r: number, c: string) {
  g.fillStyle = c;
  for (let y = -r; y <= r; y++) { const w = Math.round(Math.sqrt(Math.max(0, r * r + r * 0.4 - y * y))); g.fillRect(Math.round(cx) - w, Math.round(cy) + y, w * 2 + 1, 1); }
}
/** filled ellipse as pixel rows */
export function E(g: Ctx, cx: number, cy: number, rx: number, ry: number, c: string) {
  g.fillStyle = c;
  for (let y = -ry; y <= ry; y++) { const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + 0.3)))); g.fillRect(Math.round(cx) - w, Math.round(cy) + y, w * 2 + 1, 1); }
}
export function L(g: Ctx, x0: number, y0: number, x1: number, y1: number, c: string) {
  g.fillStyle = c;
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  for (;;) {
    g.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x0 += sx; }
    if (e2 <= dx) { e += dx; y0 += sy; }
  }
}

/** Dark selective outline around every opaque pixel (each outline pixel is a dark shade of the colour it touches). */
export function outline(src: Canvas, strength = 0.7): Canvas {
  const w = src.width + 2, h = src.height + 2, { c, g } = mk(w, h);
  g.drawImage(src, 1, 1);
  const img = g.getImageData(0, 0, w, h), d = img.data, out = new Uint8ClampedArray(d);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : (y * w + x) * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (d[i + 3] > 40) continue;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const j = at(x + dx, y + dy);
      if (j >= 0 && d[j + 3] > 200) {
        out[i] = d[j] * (1 - strength) + 16 * strength; out[i + 1] = d[j + 1] * (1 - strength) + 14 * strength; out[i + 2] = d[j + 2] * (1 - strength) + 28 * strength; out[i + 3] = 255;
        break;
      }
    }
  }
  g.putImageData(new ImageData(out, w, h), 0, 0);
  return c;
}
