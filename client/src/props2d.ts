// Everything that stands on the ground, drawn in code: trees, pines, rocks, ruins, torches, the village pieces of floor 3, the
// town's buildings and street furniture. Each is a small canvas (1 art px = 1 canvas px) with a dark outline; `foot` is the
// row (from the top) where it meets the ground, which is the sprite's anchor, so a unit standing one cell lower is drawn in front.
import type { Building, PropType, TownDecor } from "../../shared/map.ts";
import { D, E, L, P, R, darker, hash, lighter, mixc, mk, outline, tint, type Canvas, type Ctx } from "./pix.ts";
import { TILE_PX, type Palette } from "./tiles.ts";
import { lookOf } from "./themes.ts";
import type { ThemeKey } from "../../shared/map.ts";

export type Art = { canvas: Canvas; foot: number };
const done = (c: Canvas, foot: number): Art => { const o = outline(c); return { canvas: o, foot: foot + 1 }; };
const T = TILE_PX;

const LEAF = ["#3f8a3a", "#52a345", "#6fbf55", "#93d870"];
const BARK = ["#5b3d27", "#7a5436", "#4a2f1d"];

/** a ragged blob of leaves: overlapping discs from dark (below) to light (above) */
function canopy(g: Ctx, cx: number, cy: number, r: number, leaf: string[], seed: number) {
  const blobs = [[0, 0, r], [-r * 0.55, r * 0.25, r * 0.7], [r * 0.55, r * 0.2, r * 0.72], [-r * 0.2, -r * 0.45, r * 0.6], [r * 0.3, -r * 0.35, r * 0.55]];
  for (const [i, c] of [leaf[0], leaf[1]].entries()) for (const [dx, dy, rr] of blobs) D(g, cx + dx, cy + dy + (1 - i) * 2, Math.round(rr), c);
  for (const [dx, dy, rr] of blobs.slice(3)) D(g, cx + dx - 1, cy + dy - 2, Math.max(2, Math.round(rr * 0.7)), leaf[2]);
  for (let i = 0; i < 9; i++) { const a = hash(i, seed, 3) * 6.28, d = hash(i, seed, 4) * r * 0.8; P(g, cx + Math.cos(a) * d - 2, cy + Math.sin(a) * d - r * 0.3, leaf[3]); R(g, cx + Math.cos(a) * d - 2, cy + Math.sin(a) * d - r * 0.3, 2, 1, leaf[3]); }
  for (let i = 0; i < 7; i++) { const a = hash(i, seed, 8) * 6.28, d = hash(i, seed, 9) * r * 0.9; P(g, cx + Math.cos(a) * d + 1, cy + Math.sin(a) * d + r * 0.35, leaf[0]); }
}

export function tree(R0: number, seed: number, leaf = LEAF): Art {
  const r = Math.round(R0 * 9 + 5); // canopy radius px
  const w = r * 2 + 8, h = r * 2 + 18, { c, g } = mk(w, h), cx = w >> 1;
  const base = h - 3;
  E(g, cx, base, 7, 3, "rgba(0,0,0,0.0)");
  R(g, cx - 3, base - 12, 6, 12, BARK[1]); R(g, cx + 1, base - 12, 2, 12, BARK[2]); R(g, cx - 3, base - 12, 1, 12, BARK[0]);
  R(g, cx - 5, base - 2, 10, 2, BARK[1]); P(g, cx - 5, base - 2, BARK[2]);
  canopy(g, cx, base - 12 - r + 2, r, leaf, seed);
  return done(c, base);
}

export function pine(R0: number, seed: number): Art {
  const tiers = 4, w = 34, h = 60, { c, g } = mk(w, h), cx = w >> 1, base = h - 3;
  R(g, cx - 2, base - 8, 5, 8, BARK[1]); R(g, cx + 1, base - 8, 2, 8, BARK[2]);
  const greens = ["#2f6b42", "#3d8450", "#58a265", "#7ec27f"];
  for (let t = 0; t < tiers; t++) {
    const y = base - 10 - t * 11, half = 14 - t * 3;
    for (let row = 0; row < 14; row++) {
      const hw = Math.round((half * (row + 1)) / 14);
      R(g, cx - hw, y - 12 + row, hw * 2 + 1, 1, row > 9 ? greens[0] : greens[1]);
      R(g, cx - hw, y - 12 + row, Math.max(1, Math.round(hw * 0.5)), 1, greens[2]);
      if (row % 4 === 1) P(g, cx + hw - 1 - (hash(row, t, seed) < 0.5 ? 1 : 0), y - 12 + row, greens[0]);
    }
    R(g, cx - 1, y - 13, 3, 2, greens[3]);
  }
  return done(c, base);
}

export function deadtree(seed: number): Art {
  const w = 40, h = 52, { c, g } = mk(w, h), cx = w >> 1, base = h - 3;
  const dark = "#4b3a35", mid = "#6a5348", light = "#85685a";
  R(g, cx - 2, base - 22, 5, 22, mid); R(g, cx + 1, base - 22, 2, 22, dark); R(g, cx - 2, base - 22, 1, 22, light);
  R(g, cx - 4, base - 2, 9, 2, mid);
  const limbs: [number, number, number][] = [[-1, 16, 11], [1, 20, 12], [-1, 28, 9], [1, 12, 8], [-1, 36, 6]];
  for (const [d, y, len] of limbs) {
    for (let i = 0; i < len; i++) { P(g, cx + d * (2 + i), base - y - Math.round(i * 0.8), i % 3 ? mid : dark); P(g, cx + d * (2 + i), base - y - Math.round(i * 0.8) + 1, dark); }
    if (len > 8) for (let i = 0; i < 4; i++) P(g, cx + d * (2 + len - 2) + d * i, base - y - Math.round(len * 0.8) - i, mid);
  }
  return done(c, base);
}

export function rock(size: number, seed: number, pal: string[]): Art {
  const s = Math.round(size * 12), w = s + 10, h = Math.round(s * 0.8) + 10, { c, g } = mk(w, h), cx = w >> 1, base = h - 3;
  E(g, cx, base - s * 0.28, s * 0.5, s * 0.34, pal[2]);
  E(g, cx - 1, base - s * 0.34, s * 0.46, s * 0.3, pal[0]);
  E(g, cx - s * 0.12, base - s * 0.42, s * 0.28, s * 0.17, pal[1]);
  for (let i = 0; i < 4; i++) P(g, cx - s * 0.3 + hash(i, seed, 1) * s * 0.5, base - s * 0.5 + hash(i, seed, 2) * s * 0.3, pal[3]);
  L(g, cx + 2, base - s * 0.3, cx + 4, base - s * 0.1, pal[2]);
  return done(c, base);
}

export function stump(): Art {
  const { c, g } = mk(18, 16); E(g, 9, 11, 7, 4, BARK[2]); R(g, 3, 6, 12, 6, BARK[1]); E(g, 9, 6, 6, 3, "#c79a64"); E(g, 9, 6, 3, 1, "#a87a48"); R(g, 3, 6, 2, 6, BARK[0]);
  return done(c, 13);
}

export function ruin(seed: number, pal: string[]): Art {
  const { c, g } = mk(34, 44), base = 41;
  R(g, 4, base - 24, 9, 24, pal[1]); R(g, 4, base - 24, 2, 24, pal[3]); R(g, 11, base - 24, 2, 24, pal[2]);
  R(g, 14, base - 14, 14, 14, pal[0]); R(g, 14, base - 14, 14, 2, pal[3]); R(g, 24, base - 14, 4, 14, pal[2]);
  for (let i = 0; i < 4; i++) R(g, 4, base - 6 - i * 6, 9, 1, pal[2]);
  R(g, 8, base - 28, 5, 4, pal[1]); P(g, 9, base - 29, pal[0]);
  for (let i = 0; i < 5; i++) P(g, 4 + hash(i, seed, 2) * 22, base - hash(i, seed, 3) * 12, "#4f7a3c");
  return done(c, base);
}

export function stair(pal: string[]): Art {
  const { c, g } = mk(T + 4, T + 2);
  R(g, 2, 2, T, T - 2, "#15121a");
  for (let i = 0; i < 4; i++) { R(g, 2, 2 + i * 5, T, 5, mixc(pal[2], "#0b0a10", i / 4)); R(g, 2, 2 + i * 5, T, 1, mixc(pal[3], "#0b0a10", i / 4)); }
  R(g, 0, 0, 3, T + 2, pal[2]); R(g, T + 1, 0, 3, T + 2, pal[2]);
  return done(c, T + 1);
}

export function stalagmite(pal: string[]): Art {
  const { c, g } = mk(22, 30), base = 27;
  for (let row = 0; row < 22; row++) { const hw = Math.round(8 * (row / 22)) + 1; R(g, 11 - hw, base - 22 + row, hw * 2, 1, row % 5 === 0 ? pal[3] : pal[0]); R(g, 11 - hw, base - 22 + row, Math.max(1, hw - 1), 1, pal[1]); }
  return done(c, base);
}

export function torchArt(): Art { // a bracket on the wall with a flame
  const { c, g } = mk(12, 26);
  R(g, 5, 12, 2, 12, "#5a3a22"); R(g, 3, 10, 6, 3, "#3a3a44"); R(g, 4, 9, 4, 1, "#3a3a44");
  E(g, 6, 6, 3, 5, "#ff7a1c"); E(g, 6, 7, 2, 3, "#ffc83a"); P(g, 6, 8, "#fff3b0"); P(g, 6, 2, "#ff7a1c");
  return done(c, 24);
}
export function glow(color = "255, 170, 80"): Canvas { // a soft light pool (drawn additively)
  const S = 96, { c, g } = mk(S, S);
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, `rgba(${color}, 0.55)`); gr.addColorStop(0.5, `rgba(${color}, 0.2)`); gr.addColorStop(1, `rgba(${color}, 0)`);
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return c;
}

// ---------- floor 3's ruined village ----------
export function house(big: boolean, seed: number): Art {
  const w = big ? 92 : 76, h = big ? 84 : 70, { c, g } = mk(w, h), base = h - 3;
  const wall = "#7c6a55", wallD = "#5d4e3d", roof = "#4a3a3a", roofL = "#6a5252";
  R(g, 6, base - 30, w - 12, 30, wall); R(g, 6, base - 6, w - 12, 6, wallD); R(g, 6, base - 30, w - 12, 2, lighter(wall, 0.2));
  R(g, w / 2 - 6, base - 20, 12, 20, "#2b2018"); R(g, w / 2 - 6, base - 20, 12, 2, "#1a130e");
  R(g, 14, base - 22, 9, 9, "#2a3140"); R(g, w - 23, base - 22, 9, 9, "#2a3140"); R(g, 14, base - 22, 9, 1, "#5d4e3d"); R(g, w - 23, base - 22, 9, 1, "#5d4e3d");
  for (let row = 0; row < 8; row++) { const inset = Math.round(row * 1.6) - 0; R(g, 2 + inset, base - 32 - row * 4, w - 4 - inset * 2, 4, row % 2 ? roof : roofL); }
  R(g, w / 2 - 3, base - 66, 6, 8, "#463a36"); // a chimney
  for (let i = 0; i < 6; i++) R(g, 10 + hash(i, seed, 1) * (w - 30), base - 50 + hash(i, seed, 2) * 14, 7, 3, "#2f2a2a"); // missing shingles
  return done(c, base);
}

export function wreck(): Art { const { c, g } = mk(26, 20); R(g, 2, 12, 22, 5, "#5d4e3d"); R(g, 5, 7, 4, 10, "#6b5a46"); R(g, 15, 5, 3, 12, "#6b5a46"); L(g, 5, 7, 22, 14, "#4a3d30"); return done(c, 17); }
export function fenceArt(): Art { const { c, g } = mk(26, 18); for (let i = 0; i < 3; i++) R(g, 3 + i * 9, 3, 3, 12, "#7a5a3a"); R(g, 2, 6, 24, 2, "#8b6944"); R(g, 2, 11, 24, 2, "#6b4d31"); return done(c, 15); }
export function wellArt(): Art { const { c, g } = mk(28, 34); E(g, 14, 24, 11, 6, "#8b8b95"); E(g, 14, 22, 9, 4, "#1c2a44"); R(g, 4, 23, 20, 4, "#6e6e78"); R(g, 5, 7, 2, 16, "#6b4d31"); R(g, 21, 7, 2, 16, "#6b4d31"); R(g, 3, 5, 22, 3, "#8a3f35"); return done(c, 30); }
export function crates(): Art { const { c, g } = mk(26, 24); R(g, 2, 10, 13, 12, "#8b6a3d"); R(g, 12, 6, 12, 14, "#9a7745"); for (const [x, y, w, h] of [[2, 10, 13, 12], [12, 6, 12, 14]]) { R(g, x, y, w, 1, "#c19a62"); R(g, x, y + h - 1, w, 1, "#5d4527"); R(g, x + (w >> 1), y, 1, h, "#5d4527"); } return done(c, 22); }
export function lamppost(): Art { const { c, g } = mk(14, 46); R(g, 6, 12, 3, 32, "#3a3a46"); R(g, 4, 41, 7, 3, "#2b2b36"); R(g, 3, 4, 9, 10, "#ffe9a0"); R(g, 3, 4, 9, 1, "#3a3a46"); R(g, 3, 13, 9, 1, "#3a3a46"); R(g, 5, 6, 2, 5, "#fff7d1"); return done(c, 44); }
export function gravestone(): Art { const { c, g } = mk(18, 24); R(g, 3, 9, 12, 12, "#8e8f99"); E(g, 9, 9, 6, 4, "#8e8f99"); R(g, 3, 9, 2, 12, "#a9aab4"); R(g, 8, 8, 2, 7, "#5f606a"); R(g, 6, 10, 6, 2, "#5f606a"); return done(c, 21); }
export function cauldron(): Art { const { c, g } = mk(26, 26); E(g, 13, 17, 10, 7, "#2e2f36"); E(g, 13, 13, 9, 4, "#6dd66b"); E(g, 13, 13, 6, 2, "#a8f5a2"); R(g, 4, 18, 18, 2, "#222"); R(g, 6, 22, 3, 3, "#222"); R(g, 17, 22, 3, 3, "#222"); return done(c, 24); }

// ---------- the town ----------
const ROOFS = ["#b8503f", "#4f7fb5", "#6b9b4f", "#c99a3e", "#8a5fb0", "#3f9a96", "#c46f9a", "#7a7a85"];
export function building(b: Building): Art {
  const cw = b.x1 - b.x0 + 1, ch = b.y1 - b.y0 + 1, w = cw * T + 8, wallH = Math.min(30, 16 + b.floors * 8), h = ch * T + wallH + 8, { c, g } = mk(w, h);
  const roof = ROOFS[b.roof % ROOFS.length], roofD = darker(roof, 0.3), roofL = lighter(roof, 0.25);
  const base = h - 4, wallTop = base - wallH;
  const wallC = b.kind === "smithy" ? "#8d8d98" : b.kind === "chapel" ? "#e6e1d6" : b.kind === "guild" ? "#c9b48a" : "#e3d3b0";
  // roof: the footprint seen from above, with a ridge and shingle rows
  const roofH = ch * T - 6;
  R(g, 2, wallTop - roofH + 6, w - 4, roofH, roof);
  for (let row = 0; row < roofH / 6; row++) { const y = wallTop - roofH + 6 + row * 6; R(g, 2, y, w - 4, 1, roofD); for (let i = row % 2 ? 4 : 0; i < w - 4; i += 8) R(g, 2 + i, y + 1, 1, 5, roofD); }
  R(g, 2, wallTop - roofH + 6, w - 4, 3, roofL); R(g, 2, wallTop - 3, w - 4, 3, roofD);
  R(g, 2, wallTop - roofH + 6, 1, roofH, roofD); R(g, w - 3, wallTop - roofH + 6, 1, roofH, roofD);
  // the front wall
  R(g, 4, wallTop, w - 8, wallH, wallC); R(g, 4, wallTop, w - 8, 2, darker(wallC, 0.2)); R(g, 4, base - 3, w - 8, 3, darker(wallC, 0.25));
  const doorX = b.face === "S" ? 4 + (b.door - b.x0) * T + (T >> 1) - 5 : (w >> 1) - 5;
  R(g, doorX, base - 18, 10, 18, "#5a3a22"); R(g, doorX, base - 18, 10, 2, "#3d2616"); P(g, doorX + 7, base - 9, "#e8c46a");
  for (let i = 0; i < cw; i++) {
    const wx = 4 + i * T + 5;
    if (Math.abs(wx - doorX) < 12) continue;
    R(g, wx, wallTop + 6, 9, 9, "#34506f"); R(g, wx, wallTop + 6, 9, 1, "#e8dcc0"); R(g, wx + 4, wallTop + 6, 1, 9, "#e8dcc0"); R(g, wx - 1, wallTop + 15, 11, 2, "#7a5a3a");
  }
  if (b.kind === "smithy") { R(g, w - 18, wallTop - roofH - 4, 7, 14, "#4a4a55"); R(g, w - 17, wallTop - roofH - 8, 5, 4, "#9a9aa5"); }
  if (b.kind === "chapel") { R(g, (w >> 1) - 2, wallTop - roofH - 14, 4, 16, "#e6e1d6"); R(g, (w >> 1) - 6, wallTop - roofH - 10, 12, 3, "#e6e1d6"); }
  if (b.sign) { R(g, doorX - 4, base - 28, 18, 7, "#7a5a3a"); R(g, doorX - 3, base - 27, 16, 5, "#e3c98a"); }
  return done(c, base);
}

export function decor(d: TownDecor, seed: number, pal: Palette): Art | undefined {
  switch (d.type) {
    case "fountain": {
      const { c, g } = mk(78, 70); E(g, 39, 52, 34, 15, "#a2a2ad"); E(g, 39, 49, 31, 12, "#7c7c88"); E(g, 39, 47, 28, 10, "#4f9be0"); E(g, 39, 46, 22, 7, "#7fc2f2");
      R(g, 36, 22, 6, 24, "#b9b9c4"); E(g, 39, 22, 9, 4, "#b9b9c4"); E(g, 39, 21, 7, 3, "#8fd0ff");
      for (let i = 0; i < 6; i++) { P(g, 39 + Math.round(Math.sin(i) * 10), 22 + (i % 3) * 3, "#cdeaff"); P(g, 39 - Math.round(Math.cos(i) * 12), 30 + (i % 3) * 4, "#cdeaff"); }
      return done(c, 62);
    }
    case "lamp": return lamppost();
    case "stall": {
      const col = ROOFS[(d.tint ?? 0) % ROOFS.length], { c, g } = mk(36, 40);
      R(g, 4, 18, 28, 14, "#7a5a3a"); R(g, 4, 18, 28, 3, "#9a7448"); R(g, 6, 22, 24, 10, "#5d4527");
      for (let i = 0; i < 6; i++) R(g, 3 + i * 5, 4, 5, 15, i % 2 ? "#f4efe0" : col);
      R(g, 3, 17, 30, 2, darker(col, 0.25)); R(g, 3, 4, 30, 1, lighter(col, 0.3)); R(g, 4, 19, 2, 14, "#5d4527"); R(g, 30, 19, 2, 14, "#5d4527");
      for (let i = 0; i < 4; i++) D(g, 10 + i * 6, 22, 2, ["#d9534f", "#f0ad4e", "#7bc267", "#e8e0c0"][i]);
      return done(c, 34);
    }
    case "signpost": { const { c, g } = mk(26, 36); R(g, 11, 6, 4, 28, "#6b4d31"); R(g, 2, 7, 22, 8, "#8b6944"); R(g, 3, 8, 20, 6, "#e3c98a"); for (let i = 0; i < 3; i++) R(g, 5 + i * 6, 10, 4, 1, "#7a5a3a"); R(g, 22, 10, 3, 2, "#7a5a3a"); return done(c, 34); }
    case "bed": { const { c, g } = mk(24, 22); R(g, 2, 6, 20, 13, "#8b6944"); R(g, 3, 7, 18, 10, "#e8e0d0"); R(g, 3, 7, 7, 10, "#d95f5f"); R(g, 3, 7, 18, 1, "#fff"); return done(c, 19); }
    case "brazier": { const { c, g } = mk(20, 32); R(g, 9, 14, 3, 14, "#3a3a46"); E(g, 10, 14, 6, 3, "#2b2b36"); E(g, 10, 10, 4, 6, "#ff7a1c"); E(g, 10, 11, 2, 3, "#ffd76a"); R(g, 6, 27, 9, 2, "#2b2b36"); return done(c, 29); }
    case "well": return wellArt();
    case "anvil": { const { c, g } = mk(24, 20); R(g, 6, 12, 12, 5, "#3a3a46"); R(g, 3, 7, 19, 5, "#5a5a68"); R(g, 3, 7, 19, 1, "#9a9aa8"); R(g, 20, 8, 4, 2, "#5a5a68"); return done(c, 17); }
    case "dummy": { const { c, g } = mk(22, 36); R(g, 10, 12, 3, 22, "#7a5a3a"); E(g, 11, 12, 7, 8, "#c9a86a"); R(g, 4, 14, 14, 3, "#8b6944"); D(g, 11, 6, 4, "#d6b87a"); R(g, 5, 22, 12, 2, "#8b6944"); L(g, 5, 14, 17, 20, "#a07a4f"); return done(c, 34); }
    case "barrels": { const { c, g } = mk(30, 28); for (const [x, y] of [[3, 8], [15, 6], [9, 14]]) { E(g, x + 6, y + 8, 6, 8, "#8b5a2f"); R(g, x, y + 4, 12, 2, "#5d3a1a"); R(g, x, y + 10, 12, 2, "#5d3a1a"); R(g, x + 2, y + 1, 3, 12, "#a87140"); } return done(c, 25); }
    case "crates": return crates();
    case "woodpile": { const { c, g } = mk(32, 22); for (let r = 0; r < 3; r++) for (let i = 0; i < 4 - (r > 1 ? 1 : 0); i++) { E(g, 6 + i * 7 + (r % 2) * 3, 16 - r * 5, 3, 3, "#9a7448"); E(g, 6 + i * 7 + (r % 2) * 3, 16 - r * 5, 1, 1, "#c79a64"); } R(g, 2, 17, 28, 2, "#6b4d31"); return done(c, 19); }
    case "bench": { const { c, g } = mk(34, 20); R(g, 3, 8, 28, 4, "#9a7448"); R(g, 3, 8, 28, 1, "#c79a64"); R(g, 5, 12, 3, 6, "#6b4d31"); R(g, 26, 12, 3, 6, "#6b4d31"); return done(c, 17); }
    case "fence": return fenceArt();
    case "tree": return tree(1.2, seed, tintedLeaf(pal));
    case "tower": { const { c, g } = mk(40, 70); R(g, 6, 14, 28, 52, "#9a9aa8"); R(g, 6, 14, 6, 52, "#b8b8c4"); R(g, 28, 14, 6, 52, "#767684"); for (let i = 0; i < 6; i++) R(g, 6, 22 + i * 8, 28, 1, "#767684"); for (let i = 0; i < 4; i++) R(g, 5 + i * 9, 6, 7, 9, "#9a9aa8"); R(g, 17, 36, 6, 10, "#1a1a26"); return done(c, 66); }
  }
  return undefined;
}

const tintedLeaf = (pal: Palette) => [pal.grass[2], pal.grass[0], pal.grass[1], pal.grass[3]].map((c) => darker(c, 0.12));

/** The art of a map prop by type. `theme` tints leaves; `seed` varies size / detail. */
export function propArt(type: PropType, u: number, seed: number, pal: Palette, theme?: ThemeKey): Art | undefined {
  const look = lookOf(theme), leaf = LEAF.map((c) => tint(c, look.leaves));
  switch (type) {
    case "tree": return tree(u < 0.3 ? 1.05 + u : u < 0.75 ? 1.4 + (u - 0.3) * 0.9 : 1.85 + (u - 0.75) * 1.6, seed, leaf);
    case "pine": return pine(u, seed);
    case "deadtree": return deadtree(seed);
    case "rock": return rock(1.5 + u, seed, pal.rock);
    case "stump": return stump();
    case "ruin": return ruin(seed, pal.rock);
    case "stair": return stair(pal.rock);
    case "stalagmite": return stalagmite(pal.rock);
    case "torch": return torchArt();
    case "house": return house(false, seed);
    case "housebig": return house(true, seed);
    case "wreck": return wreck();
    case "fence": return fenceArt();
    case "well": return wellArt();
    case "crates": return crates();
    case "lamppost": return lamppost();
    case "gravestone": return gravestone();
    case "cauldron": return cauldron();
  }
  return undefined;
}
