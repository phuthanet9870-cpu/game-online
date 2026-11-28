// Monsters drawn in code: ten body types (slime, quadruped, insect, worm, winged, biped, plant, fish/frog, dragon, snail) bent to
// each species by colours, size and a few features. A monster gets two sheets in the layout the actor code plays (animSprite.ts
// MOB kind): `move` = 4 walk frames, `act` = wind-up, strike, hurt, dead; 3 rows = front (toward the camera), side (facing right,
// mirrored for left) and back. Every frame is drawn 1:1 with a dark outline and shown with nearest-neighbour filtering.
import type { Mob } from "../../shared/rules/data.ts";
import { D, E, L, P, R, darker, hash, hex, lighter, mixc, mk, outline, rgb, type Canvas, type Ctx } from "./pix.ts";

type Arche = "slime" | "quad" | "insect" | "worm" | "winged" | "biped" | "plant" | "fish" | "dragon" | "snail";
type Pal = [main: string, shade: string, light: string, accent: string];
type Opt = {
  spots?: boolean; cap?: boolean; crown?: boolean; egg?: boolean; // slime
  ears?: "round" | "tall" | "point"; horns?: "short" | "curl" | "big"; tusks?: boolean; shell?: boolean; tail?: "none" | "short" | "long" | "bush"; stripes?: boolean; // quad
  wings?: boolean; stinger?: boolean; tailArc?: boolean; beetle?: boolean; legs?: number; // insect
  n?: number; legsOut?: boolean; coil?: boolean; // worm
  bat?: boolean; longLegs?: boolean; // winged
  skel?: boolean; zombie?: boolean; imp?: boolean; armor?: boolean; // biped
  treant?: boolean; fire?: boolean; // plant
  frog?: boolean; // fish
};
type Spec = { a: Arche; pal: Pal; o?: Opt };
type Frame = { v: 0 | 1 | 2; t: number; bob: number; sq: number; dx: number; atk: 0 | 1 | 2; dead: boolean };

// ---------- palettes ----------
const pal = (base: string, accent = "#ffffff"): Pal => [base, darker(base, 0.32), lighter(base, 0.3), accent];
const C = {
  green: pal("#6bbf4f", "#ffe36e"), leaf: pal("#4f9a3c", "#ffd24a"), moss: pal("#6f8f4a", "#e6e29a"), pink: pal("#f08fb3", "#ffe0ec"), yellow: pal("#f2cf4a", "#fff3b0"),
  brown: pal("#a0764a", "#e8d3a8"), tan: pal("#c9a56e", "#f6e7c0"), grey: pal("#8e909c", "#e0e2ea"), stone: pal("#7d7a86", "#d6c9a2"), red: pal("#d8523f", "#ffd35e"), orange: pal("#ee8a3a", "#ffe08a"),
  blue: pal("#4f8fd8", "#cfeaff"), teal: pal("#3fb3a6", "#d2fff6"), purple: pal("#8a5fc4", "#ffd6f5"), white: pal("#ece8dd", "#ffcf5e"), bone: pal("#dcd6c0", "#2a2230"),
  black: pal("#4a4458", "#ff6a5e"), ash: pal("#9a8d92", "#ff8a5a"), ember: pal("#c9532e", "#ffd24a"), gold: pal("#f0c04a", "#fff1b0"), swamp: pal("#6a7a43", "#d8e07a"),
  sand: pal("#d9bb78", "#fff0c0"), night: pal("#5a4f78", "#e0d4ff"), cream: pal("#f4ead0", "#e08a6a"),
};

/** Per species: body type, colours and features. Species not listed fall back by race (specFor). */
const SPECS: Record<number, Spec> = {
  1002: { a: "plant", pal: C.pink }, 1113: { a: "slime", pal: C.black, o: { cap: true, spots: true } }, 1063: { a: "quad", pal: C.brown, o: { ears: "point", tusks: true, tail: "short" } },
  1008: { a: "worm", pal: C.cream, o: { n: 4 } }, 1011: { a: "winged", pal: C.teal }, 1007: { a: "worm", pal: C.green, o: { n: 5, legsOut: true } },
  1047: { a: "slime", pal: C.cream, o: { egg: true, spots: true } }, 1010: { a: "plant", pal: C.yellow }, 1049: { a: "quad", pal: C.ember, o: { ears: "point", tail: "bush" } },
  1004: { a: "insect", pal: C.yellow, o: { wings: true, stinger: true } }, 1009: { a: "quad", pal: C.blue, o: { ears: "round", tail: "short" } },
  1012: { a: "fish", pal: C.teal }, 1020: { a: "plant", pal: C.leaf, o: { treant: true } }, 1107: { a: "quad", pal: C.stone, o: { ears: "round", tail: "short" } },
  1167: { a: "quad", pal: C.moss, o: { ears: "point", tail: "long" } }, 1052: { a: "insect", pal: C.green, o: { legs: 6 } }, 1001: { a: "insect", pal: C.orange, o: { tailArc: true, stinger: true } },
  1015: { a: "biped", pal: C.swamp, o: { zombie: true } }, 1024: { a: "worm", pal: C.leaf, o: { n: 7 } }, 1014: { a: "slime", pal: C.swamp, o: { cap: true } },
  1025: { a: "worm", pal: C.sand, o: { n: 7, coil: true } }, 1094: { a: "snail", pal: C.swamp }, 1051: { a: "insect", pal: C.night, o: { beetle: true } },
  1174: { a: "worm", pal: C.stone, o: { n: 8, legsOut: true } }, 1175: { a: "quad", pal: C.night, o: { ears: "point", tail: "long" } }, 1005: { a: "winged", pal: C.night, o: { bat: true } },
  1019: { a: "winged", pal: C.tan, o: { longLegs: true } }, 1076: { a: "biped", pal: C.bone, o: { skel: true } }, 1089: { a: "fish", pal: C.green, o: { frog: true } },
  1093: { a: "quad", pal: C.white, o: { ears: "tall", tail: "bush" } }, 1128: { a: "insect", pal: C.ash, o: { beetle: true } }, 1028: { a: "biped", pal: C.ash, o: { armor: true, skel: true } },
  1033: { a: "plant", pal: C.ember, o: { treant: true, fire: true } }, 1176: { a: "insect", pal: C.ember, o: { legs: 8 } }, 3810: { a: "slime", pal: C.green, o: { crown: true, spots: true } },
  1090: { a: "plant", pal: C.brown, o: { treant: true } }, 1250: { a: "biped", pal: C.ember, o: { armor: true } }, 1123: { a: "biped", pal: C.red, o: { imp: true } },
  1013: { a: "quad", pal: C.ash, o: { ears: "point", tail: "long", stripes: true } }, 1391: { a: "quad", pal: C.stone, o: { shell: true, tail: "short" } },
  3999: { a: "quad", pal: C.red, o: { horns: "big", tail: "short", ears: "point" } }, 1091: { a: "winged", pal: C.sand }, 1155: { a: "dragon", pal: C.gold },
};
const RACE_FALLBACK: Record<string, Arche> = { Plant: "plant", Brute: "quad", Insect: "insect", Formless: "slime", Fish: "fish", Undead: "biped", Demihuman: "biped", Dragon: "dragon", Demon: "biped", Angel: "winged" };
const ELEMENT_PAL: Record<string, Pal> = { Water: C.blue, Fire: C.ember, Earth: C.brown, Wind: C.teal, Poison: C.purple, Holy: C.gold, Dark: C.night, Ghost: C.white, Undead: C.bone, Neutral: C.grey };
export function specFor(def: Mob): Spec {
  return SPECS[def.id] ?? { a: RACE_FALLBACK[def.race] ?? "slime", pal: ELEMENT_PAL[def.element] ?? C.grey, o: def.race === "Undead" ? { skel: true } : undefined };
}

/** Standing height of the monster in art pixels, by size class and rank. */
export function mobPx(def: Mob): number {
  const base = def.size === "Small" ? 20 : def.size === "Large" ? 40 : 28;
  return Math.round(base * (def.bossType === "Mvp" ? 1.5 : def.bossType === "Boss" ? 1.25 : 1));
}

// ---------- drawing helpers ----------
const eye = (g: Ctx, x: number, y: number, s = 2, col = "#1d1830") => { R(g, x, y, s, s + 1, col); P(g, x, y, "#fff"); };
/** a shaded ellipse: dark underside, main, lit top-left */
function blob(g: Ctx, cx: number, cy: number, rx: number, ry: number, p: Pal) {
  E(g, cx, cy + 1, rx, ry, p[1]); E(g, cx, cy, rx, ry, p[0]); E(g, cx - rx * 0.28, cy - ry * 0.32, Math.max(1, rx * 0.5), Math.max(1, ry * 0.4), p[2]);
}

// ---------- the ten body types ----------
type Draw = (g: Ctx, cx: number, base: number, S: number, f: Frame, sp: Spec) => void;
const walk = (f: Frame) => [0, 1, 0, -1][f.t & 3];
const squash = (f: Frame) => (f.dead ? 0.55 : f.sq);

const slime: Draw = (g, cx, base, S, f, sp) => {
  const o = sp.o ?? {}, p = sp.pal, sq = squash(f), w = S * 1.1 * (1 + sq * 0.22), h = S * 0.85 * (1 - sq * 0.3) - f.bob;
  if (o.cap) { // mushroom: a pale stalk and a wide cap
    R(g, cx - S * 0.18, base - h * 0.55, S * 0.36, h * 0.55, "#efe6cf"); R(g, cx + S * 0.05, base - h * 0.55, S * 0.12, h * 0.55, "#d8cdb0");
    E(g, cx, base - h * 0.62, w * 0.62, h * 0.4, p[1]); E(g, cx, base - h * 0.66, w * 0.6, h * 0.38, p[0]); E(g, cx - w * 0.2, base - h * 0.78, w * 0.2, h * 0.12, p[2]);
    if (o.spots) for (const [dx, dy] of [[-0.3, 0.62], [0.1, 0.78], [0.32, 0.6]]) D(g, cx + w * dx, base - h * dy, 2, p[3]);
    if (f.v !== 2) { eye(g, cx - 4, base - h * 0.34); eye(g, cx + 2, base - h * 0.34); }
    return;
  }
  if (o.egg) { E(g, cx, base - h * 0.5, w * 0.42, h * 0.52, p[1]); E(g, cx, base - h * 0.52, w * 0.4, h * 0.5, p[0]); E(g, cx - 3, base - h * 0.7, w * 0.14, h * 0.18, p[2]); }
  else blob(g, cx, base - h * 0.5, w * 0.5, h * 0.5, p);
  if (o.spots) for (const [dx, dy] of [[-0.25, 0.5], [0.18, 0.65], [0.28, 0.35]]) D(g, cx + w * dx, base - h * dy, 2, p[3] === "#ffffff" ? p[2] : p[3]);
  if (f.v !== 2) {
    const sx = f.v === 1 ? 2 : 0, ey = base - h * 0.52;
    eye(g, cx - 4 + sx, ey); eye(g, cx + 2 + sx, ey);
    R(g, cx - 1 + sx, ey + 4, 3, 1, p[1]);
  }
  if (o.crown) { const y = base - h - 2; R(g, cx - 7, y, 14, 4, "#f2c744"); for (const dx of [-7, -2, 3, 6]) R(g, cx + dx, y - 3, 2, 3, "#f2c744"); P(g, cx - 1, y + 1, "#e0505a"); R(g, cx - 7, y + 3, 14, 1, "#b88a1e"); }
};

const quad: Draw = (g, cx, base, S, f, sp) => {
  const o = sp.o ?? {}, p = sp.pal, sq = squash(f), lift = f.bob + (f.dead ? 0 : 0);
  const legH = Math.max(3, Math.round(S * 0.2)), bodyY = base - legH - S * 0.28 * (1 - sq * 0.4) - lift;
  const shell = (x: number, y: number, rx: number, ry: number) => { E(g, x, y, rx, ry, "#7b7684"); E(g, x - 1, y - 1, rx - 1, ry - 1, "#a39eae"); for (let i = -2; i <= 2; i++) R(g, x + i * 3, y - ry + 1, 1, ry, "#7b7684"); };
  if (f.v === 1) { // side view, facing right
    const rx = S * 0.5, ry = S * 0.3 * (1 - sq * 0.4);
    const ph = walk(f);
    for (const [i, lx] of [-0.32, -0.12, 0.2, 0.38].entries()) { const off = f.dead ? 0 : (i % 2 ? ph : -ph) * 2; R(g, cx + rx * lx - 1 + off, bodyY + ry - 1, 3, legH + 1 + (f.dead ? -2 : 0), i < 2 ? p[1] : p[0]); R(g, cx + rx * lx - 1 + off, base - 1, 4, 1, darker(p[1], 0.3)); }
    if (o.tail !== "none") { const t = o.tail === "long" ? 9 : o.tail === "bush" ? 7 : 4; L(g, cx - rx, bodyY - 1, cx - rx - t, bodyY - 5 - (f.atk === 1 ? 2 : 0), p[0]); if (o.tail === "bush") D(g, cx - rx - t, bodyY - 5, 3, p[2]); }
    blob(g, cx - 1, bodyY, rx, ry, p);
    if (o.shell) shell(cx - 2, bodyY - 2, rx * 0.8, ry * 0.8);
    if (o.stripes) for (let i = -2; i <= 1; i++) R(g, cx + i * 4, bodyY - ry + 2, 2, ry, p[1]);
    const hx = cx + rx * 0.85, hy = bodyY - ry * 0.45 + (f.atk === 2 ? 1 : 0), hr = Math.round(S * 0.27);
    blob(g, hx, hy, hr + 1, hr, p);
    E(g, hx + hr - 1, hy + 2, Math.round(hr * 0.5), Math.round(hr * 0.4), p[2]); P(g, hx + hr + Math.round(hr * 0.3), hy + 1, "#2a2230");
    eye(g, hx + 1, hy - 2, 2);
    if (o.tusks) { R(g, hx + hr - 1, hy + 4, 1, 3, "#fff6dc"); R(g, hx + hr + 1, hy + 3, 1, 2, "#fff6dc"); }
    ears(g, hx - 1, hy - hr + 1, p, o.ears, 1);
    horns(g, hx, hy - hr, p, o.horns, 1);
  } else { // front / back
    const back = f.v === 2, bw = S * 0.56, bh = S * 0.34 * (1 - sq * 0.4), ph = walk(f);
    for (const [i, lx] of [-0.36, 0.36].entries()) { R(g, cx + bw * lx - 2 + (i ? ph : -ph), bodyY + bh - 2, 4, legH + 2, p[1]); R(g, cx + bw * lx - 2 + (i ? ph : -ph), base - 1, 5, 1, darker(p[1], 0.3)); }
    if (back && o.tail !== "none") { L(g, cx, bodyY, cx + 2, bodyY - bh - (o.tail === "long" ? 8 : 4), p[0]); if (o.tail === "bush") D(g, cx + 2, bodyY - bh - 4, 3, p[2]); }
    blob(g, cx, bodyY, bw, bh, p);
    if (o.shell) shell(cx, bodyY - 1, bw * 0.85, bh * 0.85);
    if (!back) {
      const hr = Math.round(S * 0.3), hy = bodyY - bh * 0.6 + (f.atk === 2 ? 2 : 0);
      blob(g, cx, hy, hr + 2, hr, p);
      E(g, cx, hy + 3, Math.round(hr * 0.5), Math.round(hr * 0.35), p[2]); P(g, cx - 1, hy + 3, "#2a2230"); P(g, cx + 1, hy + 3, "#2a2230");
      eye(g, cx - hr * 0.55 - 1, hy - 3); eye(g, cx + hr * 0.55 - 1, hy - 3);
      if (o.tusks) { R(g, cx - hr * 0.5, hy + 5, 1, 3, "#fff6dc"); R(g, cx + hr * 0.5, hy + 5, 1, 3, "#fff6dc"); }
      ears(g, cx, hy - hr + 1, p, o.ears, 0); horns(g, cx, hy - hr, p, o.horns, 0);
    } else { ears(g, cx, bodyY - bh + 2, p, o.ears, 0); horns(g, cx, bodyY - bh, p, o.horns, 0); }
  }
};
function ears(g: Ctx, x: number, y: number, p: Pal, kind: Opt["ears"], side: 0 | 1) {
  if (!kind) return;
  const h = kind === "tall" ? 9 : kind === "point" ? 5 : 3, w = kind === "tall" ? 3 : 3;
  for (const s of side ? [-3] : [-6, 5]) { R(g, x + s, y - h, w, h, p[0]); R(g, x + s + 1, y - h + 1, 1, Math.max(1, h - 2), p[3] === "#ffffff" ? "#f4b0c0" : lighter(p[2], 0.2)); if (kind === "point") P(g, x + s + 1, y - h - 1, p[0]); }
}
function horns(g: Ctx, x: number, y: number, p: Pal, kind: Opt["horns"], side: 0 | 1) {
  if (!kind) return;
  const big = kind === "big" || kind === "curl", h = big ? 9 : 4;
  for (const s of side ? [-2, 1] : [-6, 5]) { for (let i = 0; i < h; i++) R(g, x + s + (s < 0 ? -1 : 1) * Math.floor(i * 0.4), y - i, 2, 1, i < 2 ? "#e8dcc0" : "#f6efd8"); P(g, x + s + (s < 0 ? -1 : 1) * Math.floor(h * 0.4), y - h, "#fff"); }
}

const insect: Draw = (g, cx, base, S, f, sp) => {
  const o = sp.o ?? {}, p = sp.pal, ph = walk(f), n = o.legs ?? 6, lift = f.bob + (o.wings ? 3 + (f.t & 1) : 0);
  const by = base - S * 0.32 - lift, side = f.v === 1;
  if (o.wings) for (const s of [-1, 1]) { const flap = f.t & 1 ? 0 : 3; E(g, cx + s * S * 0.45, by - S * 0.3 - flap, S * 0.3, S * 0.12, "rgba(230,245,255,0.8)"); }
  for (let i = 0; i < n; i++) {
    const t = n === 6 ? [-0.3, 0, 0.3][i % 3] : (i % (n / 2) - (n / 4 - 0.5)) * 0.22, s = i < n / 2 ? -1 : 1, wob = (i % 2 ? ph : -ph);
    if (f.dead) { L(g, cx + s * 3, by + 4, cx + s * (S * 0.5), by + 6 + (i % 2), darker(p[1], 0.3)); continue; }
    L(g, cx + (side ? t * S : s * 3), by + 3, cx + (side ? t * S + wob * 2 : s * (S * 0.42 + wob)), base - 1, darker(p[1], 0.25));
  }
  if (side) { // abdomen left, head right
    blob(g, cx - S * 0.18, by, S * 0.38, S * 0.28, p); blob(g, cx + S * 0.28, by - 1, S * 0.2, S * 0.2, p);
    if (o.beetle) { L(g, cx - S * 0.2, by - S * 0.26, cx - S * 0.2, by + S * 0.2, p[1]); E(g, cx - S * 0.2, by - S * 0.12, S * 0.3, S * 0.1, p[2]); }
    if (o.stinger) { R(g, cx - S * 0.58, by, 4, 2, "#2a2230"); }
    if (o.tailArc) { for (let i = 0; i < 7; i++) D(g, cx - S * 0.45 - i * 0.5, by - 2 - Math.sin(i / 6 * Math.PI) * S * 0.5, 1, i > 5 ? p[3] : p[1]); D(g, cx - S * 0.4, by - S * 0.62, 2, p[3]); }
    eye(g, cx + S * 0.34, by - 3, 2); L(g, cx + S * 0.4, by - 5, cx + S * 0.55, by - 9, p[1]);
    if (o.legs === 8 || !o.stinger) { R(g, cx + S * 0.45, by + 1, 3, 2, p[1]); }
  } else {
    const back = f.v === 2;
    blob(g, cx, by + (back ? -1 : 1), S * 0.34, S * 0.3, p);
    if (o.beetle) { R(g, cx, by - S * 0.28, 1, S * 0.5, p[1]); E(g, cx - S * 0.12, by - S * 0.1, S * 0.12, S * 0.09, p[2]); E(g, cx + S * 0.12, by - S * 0.1, S * 0.12, S * 0.09, p[2]); }
    if (!back) { blob(g, cx, by - S * 0.18, S * 0.2, S * 0.17, p); eye(g, cx - 4, by - S * 0.24); eye(g, cx + 2, by - S * 0.24); L(g, cx - 3, by - S * 0.36, cx - 7, by - S * 0.5, p[1]); L(g, cx + 3, by - S * 0.36, cx + 7, by - S * 0.5, p[1]); if (o.stinger) R(g, cx - 1, by + S * 0.28, 3, 3, "#2a2230"); }
    if (back && o.tailArc) { for (let i = 0; i < 6; i++) D(g, cx + 1, by - S * 0.2 - i * 2, 1, p[1]); D(g, cx + 1, by - S * 0.5, 2, p[3]); }
  }
};

const worm: Draw = (g, cx, base, S, f, sp) => {
  const o = sp.o ?? {}, p = sp.pal, n = o.n ?? 5, seg = Math.max(3, Math.round(S * 0.22)), ph = f.t * 1.57;
  const squashF = 1 - squash(f) * 0.35;
  if (f.v === 1) { // laid out left to right, head right
    const len = n * seg * 0.8, x0 = cx - len / 2;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * seg * 0.8, wob = f.dead ? 0 : Math.sin(ph + i * 0.9) * 2, r = seg * (i === n - 1 ? 1.15 : 1 - Math.abs(i - n / 2) * 0.04) * squashF;
      if (o.coil) { D(g, x, base - r - 1 - wob - Math.abs(Math.sin(i * 0.8)) * 3, Math.round(r), i % 2 ? p[1] : p[0]); } else D(g, x, base - r - 1 - wob, Math.round(r), i % 2 ? p[0] : p[1]);
      if (!o.coil && o.legsOut) for (const dx of [-1, 1]) L(g, x + dx, base - 2 - wob, x + dx * 2, base - 1, darker(p[1], 0.2));
    }
    const hx = x0 + (n - 1) * seg * 0.8, hy = base - seg * 1.15 - 1;
    D(g, hx, hy + 1 - (o.coil ? 4 : 0), Math.round(seg * 1.15), p[0]); D(g, hx - 1, hy - 1 - (o.coil ? 4 : 0), Math.round(seg * 0.7), p[2]);
    eye(g, hx + 1, hy - 1 - (o.coil ? 4 : 0), 2);
    if (o.coil) { P(g, hx + seg + 1, hy + 2 - 4, "#e0505a"); P(g, hx + seg + 2, hy + 3 - 4, "#e0505a"); }
    if (o.legsOut && n > 7) for (let i = 0; i < n; i++) R(g, x0 + i * seg * 0.8 - 1, base - 1, 1, 1, "#2a2230");
  } else { // toward / away: a column of rounded segments rising
    for (let i = n - 1; i >= 0; i--) {
      const y = base - seg - i * Math.max(2, seg * 0.55) * squashF, wob = f.dead ? 0 : Math.sin(ph + i * 0.9) * 2, r = Math.round(seg * (1.15 - i * 0.05));
      D(g, cx + wob, y, r, i % 2 ? p[1] : p[0]); if (i === n - 1) D(g, cx + wob - 1, y - 1, Math.max(1, r - 2), p[2]);
    }
    if (f.v === 0) { const y = base - seg - (n - 1) * Math.max(2, seg * 0.55) * squashF; eye(g, cx - 3, y - 1); eye(g, cx + 2, y - 1); }
  }
};

const winged: Draw = (g, cx, base, S, f, sp) => {
  const o = sp.o ?? {}, p = sp.pal, flap = f.dead ? 0 : [-3, 0, 3, 0][f.t & 3], lift = f.dead ? 0 : (o.longLegs ? 0 : 5 + f.bob);
  if (o.bat) {
    const by = base - S * 0.45 - lift;
    for (const s of [-1, 1]) {
      const span = S * 0.95;
      for (let i = 0; i < span; i++) { const x = cx + s * (3 + i), top = by - 2 - Math.round(Math.sin(i / span * 2.2) * S * 0.3) - (flap * (i / span)), bot = by + 2 + Math.round(i / span * 3); R(g, x, top, 1, Math.max(1, bot - top), i % 5 === 4 ? p[1] : p[0]); }
      for (let i = 1; i < 4; i++) L(g, cx + s * 3, by, cx + s * (S * 0.95), by - 2 - flap + i * 3 - 3, p[1]);
    }
    blob(g, cx, by, S * 0.2, S * 0.24, p);
    if (f.v !== 2) { eye(g, cx - 3, by - 2, 2, "#ff7a6a"); eye(g, cx + 1, by - 2, 2, "#ff7a6a"); R(g, cx - 3, by - S * 0.3, 2, 3, p[1]); R(g, cx + 1, by - S * 0.3, 2, 3, p[1]); R(g, cx - 1, by + 3, 1, 1, "#fff"); }
    return;
  }
  const by = base - S * (o.longLegs ? 0.62 : 0.4) - lift;
  if (f.v === 1) {
    if (o.longLegs) for (const s of [-1, 1]) { const ph = walk(f) * s; L(g, cx + s * 2, by + S * 0.2, cx + s * 2 + ph * 2, base - 1, "#d6a452"); R(g, cx + s * 2 + ph * 2, base - 1, 4, 1, "#d6a452"); }
    for (const s of [-1]) E(g, cx + s * 2, by - 2 - flap * 2, S * 0.4, S * 0.12, f.dead ? p[1] : p[2]);
    blob(g, cx - 1, by, S * 0.34, S * 0.26, p); blob(g, cx + S * 0.34, by - S * 0.18, S * 0.17, S * 0.15, p);
    R(g, cx + S * 0.46, by - S * 0.18, 5, 2, p[3] === "#ffffff" ? "#f0b04a" : p[3]); eye(g, cx + S * 0.36, by - S * 0.26, 2);
    L(g, cx - S * 0.3, by, cx - S * 0.5, by + 2 - flap, p[1]);
  } else {
    if (o.longLegs) for (const s of [-1, 1]) { const ph = walk(f) * s; L(g, cx + s * 3, by + S * 0.2, cx + s * 3 + ph, base - 1, "#d6a452"); R(g, cx + s * 3 + ph - 1, base - 1, 4, 1, "#d6a452"); }
    for (const s of [-1, 1]) E(g, cx + s * S * 0.42, by - flap * 2 - 2, S * 0.34, S * 0.12 + (f.t & 1), p[2]);
    blob(g, cx, by, S * 0.3, S * 0.3, p);
    if (f.v === 0) { blob(g, cx, by - S * 0.28, S * 0.17, S * 0.16, p); eye(g, cx - 4, by - S * 0.32); eye(g, cx + 2, by - S * 0.32); R(g, cx - 1, by - S * 0.22, 3, 3, p[3] === "#ffffff" ? "#f0b04a" : p[3]); }
  }
};

const biped: Draw = (g, cx, base, S, f, sp) => {
  const o = sp.o ?? {}, p = sp.pal, ph = walk(f), sq = squash(f);
  const legH = Math.round(S * 0.28), bodyH = Math.round(S * 0.34 * (1 - sq * 0.3)), headR = Math.round(S * 0.19), top = base - legH - bodyH - f.bob;
  const skin = o.skel ? p[0] : o.zombie ? "#8fae78" : o.imp ? "#d04a4a" : "#e8c9a0";
  const arm = f.atk === 2 ? 4 : f.atk === 1 ? -3 : 0;
  if (o.imp) for (const s of [-1, 1]) { L(g, cx + s * 4, top + 3, cx + s * 11, top - 4 - (f.t & 1) * 2, "#7a2a3a"); L(g, cx + s * 4, top + 6, cx + s * 11, top - 1 - (f.t & 1), "#7a2a3a"); }
  for (const s of [-1, 1]) { R(g, cx + s * 3 - 1 + (s > 0 ? -ph : ph), top + bodyH, 3, legH, o.skel ? p[1] : "#4a3f55"); R(g, cx + s * 3 - 2 + (s > 0 ? -ph : ph), base - 1, 5, 1, "#2a2230"); }
  if (o.imp) { L(g, cx - 4, top + bodyH - 2, cx - 10, top + bodyH + 2, "#7a2a3a"); P(g, cx - 10, top + bodyH + 1, "#7a2a3a"); }
  const bc = o.armor ? p[0] : o.zombie ? "#6a5a48" : o.skel ? p[0] : o.imp ? "#b83a42" : p[0];
  R(g, cx - 5, top, 10, bodyH, bc); R(g, cx - 5, top, 2, bodyH, lighter(bc, 0.25)); R(g, cx + 3, top, 2, bodyH, darker(bc, 0.3));
  if (o.skel) for (let i = 0; i < 3; i++) R(g, cx - 3, top + 2 + i * 3, 6, 1, p[1]);
  if (o.armor) { R(g, cx - 7, top - 1, 4, 4, p[2]); R(g, cx + 3, top - 1, 4, 4, p[2]); R(g, cx - 5, top + bodyH - 3, 10, 2, "#3a3345"); P(g, cx, top + 4, p[3]); }
  for (const s of [-1, 1]) { const aw = o.zombie ? -3 : s > 0 ? -arm : 0; R(g, cx + s * 7 - 1, top + 1, 3, bodyH - 2 + (o.zombie ? 0 : 1), o.armor ? p[2] : skin); R(g, cx + s * 7 - 1 + (o.zombie ? 0 : 0), top + bodyH - 1 + (o.zombie ? -5 : 0) + (aw > 0 ? 0 : 0), 3, 2, skin); }
  if (f.atk === 2 && (o.armor || o.imp)) { R(g, cx + 8, top - 4, 2, bodyH + 6, "#cfd6e0"); R(g, cx + 6, top + bodyH, 6, 2, "#8a6a3a"); }
  const hy = top - headR + 1;
  D(g, cx, hy, headR, skin); D(g, cx - 1, hy - 1, Math.max(1, headR - 2), lighter(skin, 0.2));
  if (o.armor) { R(g, cx - headR, hy - headR, headR * 2 + 1, headR + 1, p[0]); R(g, cx - headR, hy - headR, headR * 2 + 1, 1, p[2]); }
  if (o.imp) { R(g, cx - headR, hy - headR - 3, 2, 4, "#f0e2c0"); R(g, cx + headR - 1, hy - headR - 3, 2, 4, "#f0e2c0"); }
  if (f.v !== 2) {
    if (o.skel) { R(g, cx - 4, hy - 1, 3, 3, "#1a1422"); R(g, cx + 1, hy - 1, 3, 3, "#1a1422"); P(g, cx - 3, hy, "#ff6a5e"); P(g, cx + 2, hy, "#ff6a5e"); R(g, cx - 3, hy + 3, 7, 1, "#1a1422"); for (let i = 0; i < 4; i++) P(g, cx - 3 + i * 2, hy + 4, "#1a1422"); }
    else { eye(g, cx - 3, hy - 1, 2, o.zombie ? "#d8e060" : o.armor ? "#ff8a5a" : "#1d1830"); eye(g, cx + 1, hy - 1, 2, o.zombie ? "#d8e060" : o.armor ? "#ff8a5a" : "#1d1830"); if (o.imp) { R(g, cx - 2, hy + 3, 5, 1, "#fff6dc"); } else if (o.zombie) R(g, cx - 2, hy + 3, 5, 1, "#3a2a2a"); }
  }
};

const plant: Draw = (g, cx, base, S, f, sp) => {
  const o = sp.o ?? {}, p = sp.pal, sq = squash(f), sway = f.dead ? 0 : [0, 1, 0, -1][f.t & 3];
  if (o.treant) {
    const th = S * 0.62 * (1 - sq * 0.3), tw = S * 0.34, ty = base - th - f.bob;
    for (const s of [-1, 1]) { L(g, cx + s * tw * 0.6, ty + th * 0.4, cx + s * (tw + 6), ty + th * 0.15 - (f.atk === 2 ? -5 : 0) - sway * s, "#4a3020"); L(g, cx + s * (tw + 6), ty + th * 0.15, cx + s * (tw + 9), ty + th * 0.05, "#4a3020"); }
    R(g, cx - tw / 2, ty, tw, th, "#6a4a2e"); R(g, cx - tw / 2, ty, 3, th, "#8a6440"); R(g, cx + tw / 2 - 3, ty, 3, th, "#4a3020"); R(g, cx - tw / 2 - 2, base - 3, tw + 4, 3, "#4a3020");
    if (o.fire) for (let i = 0; i < 5; i++) { E(g, cx - 8 + i * 4, ty - 4 - (i % 2) * 3 - (f.t & 1), 3, 6, i % 2 ? "#ff7a1c" : "#ffb23a"); }
    else { blob(g, cx, ty - 3, S * 0.5, S * 0.26, p); blob(g, cx - S * 0.3, ty + 2, S * 0.2, S * 0.15, p); blob(g, cx + S * 0.3, ty + 1, S * 0.2, S * 0.15, p); }
    if (f.v !== 2) { R(g, cx - 4, ty + th * 0.28, 3, 4, "#1d1830"); R(g, cx + 1, ty + th * 0.28, 3, 4, "#1d1830"); P(g, cx - 4, ty + th * 0.28, o.fire ? "#ffb23a" : "#fff"); P(g, cx + 1, ty + th * 0.28, o.fire ? "#ffb23a" : "#fff"); R(g, cx - 3, ty + th * 0.28 + 6, 7, 1, "#1d1830"); }
    return;
  }
  // a flower on a stalk with leaves
  const sh = S * 0.5 * (1 - sq * 0.3), sy = base - sh - f.bob;
  R(g, cx, sy, 2, sh, "#4f9a3c"); for (const s of [-1, 1]) { E(g, cx + s * 5, base - sh * 0.35 - (f.t & 1), 5, 2, "#5fb04a"); E(g, cx + s * 5 + s, base - sh * 0.35 - 1 - (f.t & 1), 3, 1, "#7ed060"); }
  const hr = Math.round(S * 0.3);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283 + sway * 0.1; D(g, cx + 1 + Math.cos(a) * hr * 0.85, sy - 2 + Math.sin(a) * hr * 0.85, Math.max(2, Math.round(hr * 0.4)), i % 2 ? p[0] : p[2]); }
  D(g, cx + 1, sy - 2, Math.round(hr * 0.62), p[3] === "#ffffff" ? "#fff2a8" : p[3]); D(g, cx, sy - 3, Math.max(1, Math.round(hr * 0.3)), "#fff6c8");
  if (f.v !== 2) { eye(g, cx - 2, sy - 3, 2); eye(g, cx + 2, sy - 3, 2); R(g, cx - 1, sy + 1, 3, 1, "#c8453d"); }
};

const fish: Draw = (g, cx, base, S, f, sp) => {
  const o = sp.o ?? {}, p = sp.pal, ph = walk(f);
  if (o.frog) {
    const sq = squash(f), by = base - S * 0.3 * (1 - sq * 0.3) - (f.t & 1 ? 2 : 0) - f.bob;
    if (f.v === 1) { E(g, cx - S * 0.2, base - 3, S * 0.3, 3, p[1]); blob(g, cx, by, S * 0.45, S * 0.28, p); blob(g, cx + S * 0.3, by - 2, S * 0.2, S * 0.17, p); D(g, cx + S * 0.34, by - S * 0.22, 3, p[2]); eye(g, cx + S * 0.34, by - S * 0.26, 2); R(g, cx + S * 0.32, by + 2, 6, 1, p[1]); }
    else { for (const s of [-1, 1]) E(g, cx + s * S * 0.38, base - 4, S * 0.16, 4, p[1]); blob(g, cx, by, S * 0.48, S * 0.3, p); if (f.v === 0) { for (const s of [-1, 1]) { D(g, cx + s * S * 0.22, by - S * 0.26, 4, p[2]); eye(g, cx + s * S * 0.22 - 1, by - S * 0.3, 2); } R(g, cx - S * 0.2, by + 3, S * 0.4, 1, p[1]); E(g, cx, by + 6, S * 0.28, 3, p[2]); } }
    return;
  }
  const by = base - S * 0.42 - f.bob - (f.dead ? -3 : 0), flip = f.dead ? 1 : 0;
  if (f.v === 1) {
    const tail = f.dead ? 0 : [-2, 0, 2, 0][f.t & 3];
    L(g, cx - S * 0.45, by, cx - S * 0.7, by - S * 0.22 + tail, p[1]); L(g, cx - S * 0.45, by, cx - S * 0.7, by + S * 0.22 + tail, p[1]); D(g, cx - S * 0.62, by + tail, 3, p[1]);
    blob(g, cx, by, S * 0.5, S * 0.28, p); L(g, cx - 2, by - S * 0.26, cx - 7, by - S * 0.46, p[1]); L(g, cx - 2, by + S * 0.2, cx + 3, by + S * 0.38, p[1]);
    E(g, cx + 2, by + 3, S * 0.3, 2, p[2]); eye(g, cx + S * 0.3, by - 3, 2); R(g, cx + S * 0.45, by + 1, 3, 1, "#2a2230");
  } else {
    L(g, cx - S * 0.38, by, cx - S * 0.62, by - 3 + ph, p[1]); L(g, cx + S * 0.38, by, cx + S * 0.62, by - 3 - ph, p[1]);
    blob(g, cx, by, S * 0.36, S * 0.34, p); if (f.v === 0) { eye(g, cx - 5, by - 4, 2); eye(g, cx + 3, by - 4, 2); R(g, cx - 2, by + 2, 5, 1, "#2a2230"); E(g, cx, by + 6, S * 0.2, 3, p[2]); } else L(g, cx, by - S * 0.34, cx, by - S * 0.55, p[1]);
  }
  void flip;
};

const dragon: Draw = (g, cx, base, S, f, sp) => {
  const p = sp.pal, ph = walk(f), flap = f.dead ? 0 : [-2, 0, 2, 0][f.t & 3], by = base - S * 0.34 - f.bob;
  if (f.v === 1) {
    for (let i = 0; i < 9; i++) D(g, cx - S * 0.3 - i * 2.2, by + 3 - Math.sin(i * 0.5) * 3 - i * 0.3, Math.max(1, 4 - Math.round(i / 3)), i % 2 ? p[1] : p[0]);
    E(g, cx - 2, by - S * 0.3 - flap * 2, S * 0.34, S * 0.2, p[2]);
    for (const [i, lx] of [-0.25, 0.2].entries()) { R(g, cx + S * lx - 2 + (i ? ph : -ph), by + S * 0.15, 4, S * 0.22, p[1]); R(g, cx + S * lx - 2 + (i ? ph : -ph), base - 1, 5, 1, "#3a2a30"); }
    blob(g, cx, by, S * 0.42, S * 0.26, p); E(g, cx + 1, by + 4, S * 0.32, 3, lighter(p[0], 0.4));
    blob(g, cx + S * 0.4, by - S * 0.14, S * 0.2, S * 0.15, p); E(g, cx + S * 0.55, by - S * 0.08, S * 0.12, S * 0.08, p[2]); eye(g, cx + S * 0.42, by - S * 0.22, 2, "#ff5a3a");
    R(g, cx + S * 0.34, by - S * 0.34, 2, 3, "#f0e2c0"); R(g, cx + S * 0.42, by - S * 0.36, 2, 3, "#f0e2c0");
  } else {
    for (const s of [-1, 1]) { E(g, cx + s * S * 0.5, by - S * 0.18 - flap * 2, S * 0.3, S * 0.2, p[2]); E(g, cx + s * S * 0.5, by - S * 0.18 - flap * 2 + 2, S * 0.28, S * 0.14, p[1]); }
    for (const s of [-1, 1]) R(g, cx + s * S * 0.2 - 2 + s * ph, by + S * 0.12, 4, S * 0.22, p[1]);
    blob(g, cx, by, S * 0.34, S * 0.3, p); E(g, cx, by + 4, S * 0.2, 4, lighter(p[0], 0.4));
    if (f.v === 0) { blob(g, cx, by - S * 0.26, S * 0.2, S * 0.17, p); eye(g, cx - 5, by - S * 0.32, 2, "#ff5a3a"); eye(g, cx + 3, by - S * 0.32, 2, "#ff5a3a"); R(g, cx - 3, by - S * 0.2, 7, 2, p[2]); R(g, cx - 7, by - S * 0.42, 2, 3, "#f0e2c0"); R(g, cx + 6, by - S * 0.42, 2, 3, "#f0e2c0"); }
    else for (let i = 0; i < 6; i++) D(g, cx + Math.sin(i) * 2, by + S * 0.3 + i * 1.5, Math.max(1, 3 - Math.round(i / 3)), p[1]);
  }
};

const snail: Draw = (g, cx, base, S, f, sp) => {
  const p = sp.pal, sq = squash(f), sl = f.dead ? 0 : [0, 1, 2, 1][f.t & 3];
  const bodyY = base - 3 - f.bob;
  if (f.v === 1) {
    E(g, cx + 1, bodyY, S * 0.55 + sl, 3 + Math.round(sq * -1), p[2]); E(g, cx + S * 0.45 + sl, bodyY - 3, S * 0.14, 5, p[2]);
    L(g, cx + S * 0.5 + sl, bodyY - 7, cx + S * 0.56 + sl, bodyY - 11, p[1]); L(g, cx + S * 0.44 + sl, bodyY - 7, cx + S * 0.42 + sl, bodyY - 11, p[1]); eye(g, cx + S * 0.55 + sl, bodyY - 12, 2); eye(g, cx + S * 0.41 + sl, bodyY - 12, 2);
    D(g, cx - S * 0.1, bodyY - S * 0.3, Math.round(S * 0.36), p[1]); D(g, cx - S * 0.12, bodyY - S * 0.32, Math.round(S * 0.32), p[0]); D(g, cx - S * 0.12, bodyY - S * 0.32, Math.round(S * 0.18), p[1]); D(g, cx - S * 0.1, bodyY - S * 0.32, Math.round(S * 0.08), p[2]); D(g, cx - S * 0.22, bodyY - S * 0.46, 3, p[2]);
  } else {
    E(g, cx, bodyY, S * 0.34, 3, p[2]);
    D(g, cx, bodyY - S * 0.32, Math.round(S * 0.34), p[1]); D(g, cx, bodyY - S * 0.34, Math.round(S * 0.3), p[0]); D(g, cx + (f.v === 0 ? 0 : 1), bodyY - S * 0.34, Math.round(S * 0.16), p[1]);
    if (f.v === 0) { L(g, cx - 4, bodyY - 3, cx - 6, bodyY - 9, p[1]); L(g, cx + 4, bodyY - 3, cx + 6, bodyY - 9, p[1]); eye(g, cx - 7, bodyY - 11, 2); eye(g, cx + 5, bodyY - 11, 2); }
  }
};

const DRAW: Record<Arche, Draw> = { slime, quad, insect, worm, winged, biped, plant, fish, dragon, snail };

// ---------- sheets ----------
export type MobSheet = { img: Canvas; meta: { rows: number; cols: number; cellW: number; cellH: number; unit: number } };
export type MobLook = { move: MobSheet; act: MobSheet; unit: number; cell: number };
const cache = new Map<number, MobLook>();

function frame(def: Mob, sp: Spec, S: number, cell: number, f: Frame, hurt: boolean): Canvas {
  const inner = cell - 2, { c, g } = mk(inner, inner);
  const cx = (inner >> 1) + f.dx, base = inner - 2;
  DRAW[sp.a](g, cx, base, S, f, sp);
  if (f.dead) { // x-ed eyes and a darker, desaturated body
    g.globalCompositeOperation = "source-atop"; g.fillStyle = "rgba(20, 16, 30, 0.35)"; g.fillRect(0, 0, inner, inner); g.globalCompositeOperation = "source-over";
  }
  if (hurt) { g.globalCompositeOperation = "source-atop"; g.fillStyle = "rgba(255, 255, 255, 0.7)"; g.fillRect(0, 0, inner, inner); g.globalCompositeOperation = "source-over"; }
  return outline(c);
}

/** The two sheets of a species, drawn once. */
export function mobLook(def: Mob): MobLook {
  const hit = cache.get(def.id);
  if (hit) return hit;
  const sp = specFor(def), S = mobPx(def), cell = Math.round(S * 2.1) + 10;
  const mkSheet = (cols: number, draw: (col: number, row: number) => Canvas): MobSheet => {
    const { c, g } = mk(cols * cell, 3 * cell);
    for (let row = 0; row < 3; row++) for (let col = 0; col < cols; col++) g.drawImage(draw(col, row), col * cell, row * cell);
    return { img: c, meta: { rows: 3, cols, cellW: cell, cellH: cell, unit: S } };
  };
  const base = (v: 0 | 1 | 2, t: number): Frame => ({ v, t, bob: [0, 1, 0, 1][t & 3] * 0, sq: 0, dx: 0, atk: 0, dead: false });
  const move = mkSheet(4, (t, row) => frame(def, sp, S, cell, { ...base(row as 0 | 1 | 2, t), bob: [0, 1, 0, 1][t] , sq: [0, 0.15, 0, 0.15][t] }, false));
  const act = mkSheet(4, (col, row) => {
    const v = row as 0 | 1 | 2;
    if (col === 0) return frame(def, sp, S, cell, { ...base(v, 0), atk: 1, sq: 0.25, dx: v === 1 ? -2 : 0 }, false); // wind-up: crouch back
    if (col === 1) return frame(def, sp, S, cell, { ...base(v, 1), atk: 2, sq: -0.1, bob: 1, dx: v === 1 ? 3 : 0 }, false); // strike: lunge
    if (col === 2) return frame(def, sp, S, cell, { ...base(v, 0), sq: 0.2, dx: v === 1 ? -2 : 1 }, true); // hurt: flash
    return frame(def, sp, S, cell, { ...base(v, 0), dead: true, sq: 0.5 }, false); // dead
  });
  const out = { move, act, unit: S, cell };
  cache.set(def.id, out);
  void hash; void hex; void rgb; void mixc;
  return out;
}
