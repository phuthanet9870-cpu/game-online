// Code-drawn pixel-art chibi characters (players and NPCs): no image files. A look (gender, hair, job, worn gear) becomes
// two sprite sheets in the same layout the actor code plays (animSprite.ts PC kind):
//   walk: 4 frames · act: stand, sit, hurt, dead, swing x4 · 5 rows = front, 3/4 front, side, 3/4 back, back (facing right;
//   the left-facing views are the same sheets mirrored).
// Every frame is drawn on a small pixel grid (CELL x CELL), then given a coloured outline (each outline pixel is a darker
// shade of the colour it borders) and shown scaled up without smoothing.
import { HAIR_COLORS, HAIR_STYLES, OUTFIT_BASE, OUTFIT_TINT, type Look } from "../../shared/look.ts";

export const CELL = 48; // sheet cell (px)
export const FEET = 2; // feet stand this many px above the cell's bottom edge
export const UNIT = 34; // standing height in px (the actor code scales this to the world height)
const STRIDE = 4; // px a planted foot travels per step in the side view
const BX = 24; // body centre x
const GROUND = CELL - FEET - 1; // last row the boots fill

type Expr = "normal" | "closed" | "dead" | "cheer" | "think";
type Pose = {
  row: number; bob: number; // facing row; body raised (+) / lowered (-) px
  legs: [number, number]; // per leg: + = forward (side view) / lifted (front views)
  armSwing: number; // -1..1 arm swing while walking
  weapon: number | null; // weapon angle in degrees, clockwise from straight up (null = resting pose)
  lean: number; sit: boolean; expr: Expr;
};

// ---------- colour helpers ----------
type RGB = [number, number, number];
const hex = (h: string): RGB => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const css = ([r, g, b]: RGB) => `#${((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1)}`;
const mix = (a: string, b: string, t: number) => { const x = hex(a), y = hex(b); return css([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]); };
const dark = (c: string, t = 0.28) => mix(c, "#24163a", t); // shadows lean toward a cool purple, not grey
const light = (c: string, t = 0.3) => mix(c, "#fff8e8", t);
function hueShift(c: string, deg: number, bright: boolean) {
  if (!deg && !bright) return c;
  let [r, g, b] = hex(c).map((v) => v / 255) as RGB;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  h = (h + deg + 360) % 360;
  if (bright) s = Math.min(1, s * 1.25 + 0.05);
  const l2 = bright ? Math.min(0.85, l * 1.08) : l, C = (1 - Math.abs(2 * l2 - 1)) * s, X = C * (1 - Math.abs(((h / 60) % 2) - 1)), m = l2 - C / 2;
  [r, g, b] = h < 60 ? [C, X, 0] : h < 120 ? [X, C, 0] : h < 180 ? [0, C, X] : h < 240 ? [0, X, C] : h < 300 ? [X, 0, C] : [C, 0, X];
  return css([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}

// ---------- outfits ----------
type Extra = "plate" | "quiver" | "scarf" | "apron" | "bag" | "collar" | "sash" | "vest" | "hood-up" | "satchel";
type Outfit = { main: string; sec: string; trim: string; pants: string; boots: string; belt: string; robe: boolean; extras: Extra[] };
const OUTFITS: Record<string, Outfit> = {
  Novice: { main: "#e9dcc0", sec: "#9b6b43", trim: "#c08a4f", pants: "#6f5643", boots: "#6b4a33", belt: "#5a3d2a", robe: false, extras: ["vest", "satchel"] },
  Swordman: { main: "#3f63b6", sec: "#b9c6d8", trim: "#e2b552", pants: "#3b3f58", boots: "#5a6378", belt: "#5a3d2a", robe: false, extras: ["plate"] },
  Archer: { main: "#5aa05a", sec: "#8a6440", trim: "#e3d08a", pants: "#6b5a3e", boots: "#6b4a33", belt: "#5a3d2a", robe: false, extras: ["quiver"] },
  Mage: { main: "#6c4bc4", sec: "#3b2d73", trim: "#f0c75e", pants: "#3b2d73", boots: "#3a2f52", belt: "#f0c75e", robe: true, extras: ["collar"] },
  Acolyte: { main: "#f1f0f6", sec: "#4f7fd4", trim: "#e9c15a", pants: "#cfd3e4", boots: "#6a6f8a", belt: "#4f7fd4", robe: true, extras: ["sash"] },
  Thief: { main: "#3f3656", sec: "#d24b4b", trim: "#a7a2bd", pants: "#2c2640", boots: "#2a2236", belt: "#6b4a33", robe: false, extras: ["scarf"] },
  Merchant: { main: "#e5873a", sec: "#f3e6c8", trim: "#7a4f2c", pants: "#5d4a3a", boots: "#6b4a33", belt: "#5a3d2a", robe: false, extras: ["apron", "bag"] },
  // NPC roles
  guide: { main: "#d9c7a0", sec: "#3d7a6a", trim: "#c08a4f", pants: "#5e5040", boots: "#6b4a33", belt: "#5a3d2a", robe: false, extras: ["scarf", "satchel"] },
  merchant: { main: "#c8673a", sec: "#f4ead2", trim: "#8a5a34", pants: "#5d4a3a", boots: "#6b4a33", belt: "#5a3d2a", robe: false, extras: ["apron"] },
  herbalist: { main: "#6f9e6a", sec: "#efe3c4", trim: "#b9814f", pants: "#4c6448", boots: "#5b4634", belt: "#8a5a34", robe: true, extras: ["collar", "satchel"] },
  warden: { main: "#5b4b3d", sec: "#a9b3c3", trim: "#d4a64c", pants: "#3a332e", boots: "#3f3a36", belt: "#2e2620", robe: false, extras: ["plate"] },
  ranger: { main: "#4d7e4f", sec: "#7b5638", trim: "#d9c58a", pants: "#4f4433", boots: "#5b4634", belt: "#4a3424", robe: false, extras: ["hood-up", "quiver"] },
};
function outfitOf(job: string): Outfit {
  if (OUTFITS[job]) return OUTFITS[job];
  const base = OUTFIT_BASE[job], o = OUTFITS[base ?? "Novice"] ?? OUTFITS.Novice;
  const plain = job.replace(/_High$/, "");
  const deg = OUTFIT_TINT[plain] ?? OUTFIT_TINT[job] ?? 0, bright = job.endsWith("_High") || /^(Lord_Knight|Paladin|High_Wizard|Professor|Sniper|Clown|Gypsy|High_Priest|Champion|Whitesmith|Creator|Assassin_Cross|Stalker|Rune_Knight|Royal_Guard|Warlock|Sorcerer|Ranger|Minstrel|Wanderer|Arch_Bishop|Sura|Mechanic|Genetic|Guillotine_Cross|Shadow_Chaser)$/.test(job);
  return { ...o, main: hueShift(o.main, deg, bright), sec: hueShift(o.sec, deg * 0.5, bright) };
}

const SKIN = "#ffd9b8", SKIN_SH = "#f0b28e", EYE = "#2b2747", BLUSH = "#ff9e9e", STEEL = "#d7deea", WOOD = "#8a5a34", GOLD = "#f0c75e";

// ---------- the pixel grid ----------
class Grid {
  c: (string | null)[] = new Array(CELL * CELL).fill(null);
  set(x: number, y: number, col: string) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < CELL && y < CELL) this.c[y * CELL + x] = col; }
  get(x: number, y: number) { return x >= 0 && y >= 0 && x < CELL && y < CELL ? this.c[y * CELL + x] : null; }
  rect(x: number, y: number, w: number, h: number, col: string) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, col); }
  /** filled rounded box: corners cut by r px (a pixel-art circle-ish corner) */
  box(x: number, y: number, w: number, h: number, col: string, r = 2) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const dx = Math.min(i, w - 1 - i), dy = Math.min(j, h - 1 - j);
      if (dx < r && dy < r && (r - dx) + (r - dy) > r + 1) continue;
      this.set(x + i, y + j, col);
    }
  }
  disc(cx: number, cy: number, rad: number, col: string) {
    for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) if (x * x + y * y <= rad * rad + rad * 0.6) this.set(cx + x, cy + y, col);
  }
  line(x0: number, y0: number, x1: number, y1: number, col: string) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) {
      this.set(x0, y0, col);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  }
  /** selective outline: every empty pixel touching a filled one takes a dark shade of it */
  outline() {
    const add: [number, number, string][] = [];
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
      if (this.get(x, y)) continue;
      const n = this.get(x, y + 1) ?? this.get(x, y - 1) ?? this.get(x - 1, y) ?? this.get(x + 1, y);
      if (n) add.push([x, y, mix(n, "#1b1028", 0.72)]);
    }
    for (const [x, y, c] of add) this.set(x, y, c);
  }
  paint(g: CanvasRenderingContext2D, ox: number, oy: number) {
    const img = g.createImageData(CELL, CELL), d = img.data;
    for (let i = 0; i < this.c.length; i++) {
      const c = this.c[i];
      if (!c) continue;
      const [r, gg, b] = hex(c);
      d[i * 4] = r; d[i * 4 + 1] = gg; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
    }
    g.putImageData(img, ox, oy);
  }
}

// ---------- one frame ----------
type Spec = { gender: "M" | "F"; hair: string; style: string; o: Outfit; weapon: string | null; shield: boolean; hat: boolean; cape: boolean };

function drawFrame(s: Spec, p: Pose): Grid {
  const g = new Grid();
  const row = p.row, front = row <= 1, back = row >= 3, side = row === 2;
  const sitDrop = p.sit ? 5 : 0;
  const y0 = -p.bob + sitDrop; // vertical shift of everything above the legs
  const lean = p.lean;
  // anchors (front view numbers; the side views narrow the body)
  const headW = side ? 17 : 19, headH = 17, headX = BX - Math.floor(headW / 2) + lean + (row === 1 ? 1 : row === 3 ? -1 : 0), headY = 13 + y0;
  const torsoW = side ? 8 : row === 0 || row === 4 ? 12 : 11, torsoX = BX - Math.floor(torsoW / 2) + Math.round(lean / 2), torsoY = 30 + y0, torsoH = 9;
  const legTop = torsoY + torsoH - 1;
  const hairC = s.hair, hairD = dark(hairC, 0.3), hairL = light(hairC, 0.35);
  const o = s.o;

  // --- back layer: things behind the body ---
  if (s.cape && !back) capeBehind(g, s, torsoX, torsoY, torsoW, row);
  if (!back) hairBack(g, s.style, row, headX, headY, headW, hairC, hairD, s.gender);
  if (o.extras.includes("quiver") && !back) { g.rect(torsoX + torsoW - 2 + (side ? -6 : 0), torsoY - 4, 3, 9, o.sec); g.rect(torsoX + torsoW - 2 + (side ? -6 : 0), torsoY - 6, 3, 2, "#e8e0c8"); }
  if (o.extras.includes("bag") && !back && !side) g.box(torsoX + torsoW - 1, torsoY + 1, 5, 6, dark(o.sec, 0.2), 1);
  // far arm (behind torso) in the turned views
  const swing = Math.round(p.armSwing);
  const weaponArmFront = !back; // the weapon hand is the one toward the viewer
  if (row === 1 || row === 2 || row === 3) {
    const ax = row === 3 ? torsoX + torsoW - 1 : torsoX - 1;
    if (!side) arm(g, ax, torsoY + 1 - swing, o, false);
  }

  // --- legs ---
  legs(g, s, p, row, legTop, torsoX, torsoW);

  // --- torso ---
  torso(g, s, row, torsoX, torsoY, torsoW, torsoH, legTop);

  // --- near arms ---
  const handY = torsoY + 6;
  let hand: { x: number; y: number };
  if (front || back) {
    const lx = torsoX - 2, rx = torsoX + torsoW;
    const restL = row === 4 ? -swing : swing, restR = -restL;
    const weaponRight = row !== 4;
    if (p.weapon !== null) {
      // the weapon arm reaches up/forward with the swing; the other arm stays down
      if (weaponRight) { arm(g, lx, torsoY + 1 + restL, o, true); hand = armRaised(g, rx, torsoY + 1, p.weapon, o, row === 0 ? 1 : 1); }
      else { arm(g, rx, torsoY + 1 + restR, o, true); hand = armRaised(g, lx, torsoY + 1, p.weapon, o, -1); }
    } else {
      arm(g, lx, torsoY + 1 + restL, o, true);
      arm(g, rx, torsoY + 1 + restR, o, true);
      hand = weaponRight ? { x: rx + 1, y: handY + restR } : { x: lx, y: handY + restL };
    }
  } else {
    // side / 3/4: one arm on the near side over the torso
    const ax = side ? torsoX + 2 + Math.round(swing * 1.5) : row === 1 ? torsoX + torsoW - 1 : torsoX - 1;
    if (p.weapon !== null) hand = armRaised(g, ax, torsoY + 1, p.weapon, o, row === 3 ? -1 : 1);
    else { arm(g, ax, torsoY + 1, o, true); hand = { x: ax + 1, y: handY }; }
  }

  // --- head ---
  head(g, s, p, row, headX, headY, headW, headH, hairC, hairD, hairL);
  if (back) hairBack(g, s.style, row, headX, headY, headW, hairC, hairD, s.gender);
  if (s.hat) hat(g, row, headX, headY, headW);
  if (o.extras.includes("hood-up")) hood(g, row, headX, headY, headW, o.main);
  if (s.cape && back) capeFront(g, torsoX, torsoY, torsoW);
  if (o.extras.includes("quiver") && back) { g.rect(torsoX + 2, torsoY - 3, 3, 10, o.sec); g.rect(torsoX + 2, torsoY - 5, 3, 2, "#e8e0c8"); g.set(torsoX + 3, torsoY - 6, "#d24b4b"); }
  if (o.extras.includes("bag") && back) g.box(torsoX + 2, torsoY + 1, torsoW - 4, 6, dark(o.sec, 0.2), 1);

  // --- shield on the off hand, weapon in the near hand ---
  if (s.shield && !back) shieldAt(g, row === 0 ? torsoX - 4 : side ? torsoX - 2 : torsoX - 3, torsoY + 3);
  if (s.weapon && (weaponArmFront || p.weapon !== null)) weaponAt(g, s.weapon, hand, p.weapon ?? (side ? 150 : 165), row);
  if (s.shield && back) shieldAt(g, torsoX + torsoW - 2, torsoY + 3);

  g.outline();
  return g;
}

function arm(g: Grid, x: number, y: number, o: Outfit, withHand: boolean) {
  g.rect(x, y, 2, 4, o.robe ? o.main : dark(o.main, 0.08));
  g.set(x, y, o.robe ? light(o.main, 0.15) : o.main);
  if (withHand) g.rect(x, y + 4, 2, 2, SKIN);
}
/** an arm lifted toward `deg` (clockwise from up); returns where the hand is */
function armRaised(g: Grid, sx: number, sy: number, deg: number, o: Outfit, dir: number) {
  const a = ((deg - 90) * Math.PI) / 180, hx = sx + Math.cos(a) * 4 * dir, hy = sy + 2 + Math.sin(a) * 4;
  g.line(sx, sy, hx, hy, o.main); g.line(sx + 1, sy, hx + 1, hy, dark(o.main, 0.1));
  g.rect(hx, hy, 2, 2, SKIN);
  return { x: hx + 1, y: hy + 1 };
}

function legs(g: Grid, s: Spec, p: Pose, row: number, top: number, tx: number, tw: number) {
  const o = s.o, side = row === 2;
  if (p.sit) { // knees forward: short stubs under the torso
    if (side) { g.rect(tx + 2, top, 7, 3, o.pants); g.rect(tx + 8, top, 2, 3, o.boots); }
    else { g.rect(tx + 1, top, 4, 3, o.pants); g.rect(tx + tw - 5, top, 4, 3, o.pants); g.rect(tx + 1, top + 2, 4, 1, o.boots); g.rect(tx + tw - 5, top + 2, 4, 1, o.boots); }
    return;
  }
  const h = GROUND - top + 1;
  if (side) {
    for (const [i, f] of p.legs.map((v, k) => [k, v] as const)) {
      const x = tx + 2 + Math.round(f), c = i === 0 ? dark(o.pants, 0.18) : o.pants;
      g.rect(x, top, 3, h - 2, c); g.rect(x, GROUND - 1, 4, 2, i === 0 ? dark(o.boots, 0.15) : o.boots);
    }
    return;
  }
  const lx = BX - 5 + Math.round((tx + tw / 2 - BX)), rx = lx + 6;
  [[lx, p.legs[0]], [rx, p.legs[1]]].forEach(([x, lift]) => {
    const l = Math.max(0, Math.round(lift));
    g.rect(x, top, 4, h - 3 - l, o.pants);
    g.rect(x + 3, top, 1, h - 3 - l, dark(o.pants, 0.18));
    g.rect(x, GROUND - 2 - l, 4, 3, o.boots);
    g.rect(x, GROUND - 2 - l, 3, 1, light(o.boots, 0.2));
  });
}

function torso(g: Grid, s: Spec, row: number, x: number, y: number, w: number, h: number, legTop: number) {
  const o = s.o, back = row >= 3, side = row === 2;
  const skirt = s.gender === "F" && !o.robe && !o.extras.includes("plate");
  if (o.robe) { // long robe down to the ankles, flared hem
    const hemY = GROUND - 2;
    for (let yy = y; yy <= hemY; yy++) {
      const t = (yy - y) / (hemY - y), grow = Math.round(t * 2);
      g.rect(x - grow, yy, w + grow * 2, 1, yy > hemY - 1 ? o.trim : o.main);
    }
    g.rect(x + w - 2, y + 2, 2, hemY - y - 2, dark(o.main, 0.15)); // shade side
    if (!back && !side) g.rect(x + Math.floor(w / 2) - 1, y + 3, 2, hemY - y - 3, o.sec); // front panel
  } else {
    g.box(x, y, w, h, o.main, 1);
    g.rect(x + w - 2, y + 1, 2, h - 2, dark(o.main, 0.15));
    g.rect(x + 1, y + 1, 1, h - 3, light(o.main, 0.2));
    if (skirt) for (let k = 0; k < 3; k++) g.rect(x - 1 - (k >> 1), legTop - 1 + k, w + 2 + (k >> 1) * 2, 1, k === 2 ? dark(o.main, 0.2) : o.main);
  }
  // belt
  const by = y + h - 3;
  if (!o.robe) { g.rect(x, by, w, 1, o.belt); if (!back) g.set(x + Math.floor(w / 2), by, GOLD); }
  for (const e of o.extras) {
    if (e === "plate") { // breastplate + shoulder pads
      if (!side) { g.box(x + 1, y, w - 2, 5, o.sec, 1); g.rect(x + 2, y + 1, 2, 2, light(o.sec, 0.5)); }
      else g.box(x + 1, y, w - 2, 5, o.sec, 1);
      g.box(x - 2, y - 1, 4, 3, o.sec, 1); g.box(x + w - 2, y - 1, 4, 3, o.sec, 1);
    } else if (e === "vest" && !back) { g.rect(x, y, 3, h - 3, o.sec); g.rect(x + w - 3, y, 3, h - 3, o.sec); }
    else if (e === "apron" && !back && !side) { g.rect(x + 2, y + 3, w - 4, h - 1, o.sec); g.rect(x + 2, y + 3, w - 4, 1, light(o.sec, 0.3)); }
    else if (e === "apron" && side) g.rect(x + w - 3, y + 3, 3, h - 1, o.sec);
    else if (e === "scarf") { g.rect(x - 1, y - 1, w + 2, 2, o.sec); if (!back) g.rect(x + (side ? w - 2 : 2), y + 1, 2, 4, o.sec); else g.rect(x + 3, y + 1, 2, 5, dark(o.sec, 0.15)); }
    else if (e === "collar") { g.rect(x - 1, y - 1, w + 2, 2, o.trim); if (!back && !side) g.set(x + Math.floor(w / 2), y + 1, o.sec); }
    else if (e === "sash" && !back) g.line(x + 1, y + 1, x + w - 2, y + h - 2, o.sec);
    else if (e === "satchel") { if (!back) g.line(x, y, x + w - 1, y + h - 4, o.belt); if (!side && !back) g.box(x + w - 1, y + h - 5, 4, 4, o.trim, 1); }
  }
  // neck
  if (!back) g.rect(BX - 1 + (side ? 1 : 0), y - 1, 3, 1, SKIN_SH);
}

function head(g: Grid, s: Spec, p: Pose, row: number, x: number, y: number, w: number, h: number, hc: string, hd: string, hl: string) {
  const back = row >= 3, side = row === 2;
  // skull
  g.box(x, y, w, h, SKIN, 5);
  g.rect(x + 2, y + h - 2, w - 4, 1, SKIN_SH); // jaw shade
  // hair cap: a rounded dome over the top and sides; bangs end in tufts
  const capH = back ? h - 1 : 5;
  g.box(x - 1, y - 3, w + 2, capH + 4, hc, 5);
  g.rect(x + w - 3, y, 2, capH, hd); // shaded side of the dome
  if (!back) {
    const bangsY = y + capH;
    for (let i = 0; i < w; i++) {
      const tuft = (i + (row === 1 ? 1 : 0)) % 4;
      const len = tuft === 0 ? 2 : tuft === 1 ? 3 : tuft === 2 ? 2 : 0;
      if (!side || i < w - 5) for (let k = 0; k < len; k++) g.set(x + i, bangsY + k, k === len - 1 ? hd : hc);
    }
    // side locks frame the face (front); the back of the head (side views)
    if (row === 0) { g.rect(x - 1, y + 3, 2, h - 4 + (s.gender === "F" ? 3 : 0), hc); g.rect(x + w - 1, y + 3, 2, h - 4 + (s.gender === "F" ? 3 : 0), hc); }
    if (row === 1) { g.rect(x - 1, y + 2, 4, h - 3 + (s.gender === "F" ? 2 : 0), hc); g.rect(x + w - 1, y + 3, 2, h - 5, hc); }
    if (side) { g.box(x - 1, y - 2, w - 5, h + 1 + (s.gender === "F" ? 2 : 0), hc, 4); g.set(x + w - 7, y + 7, hd); g.rect(x + 5, y + 8, 2, 3, SKIN_SH); /* ear */ }
    // shine
    g.rect(x + 3, y - 2, 5, 1, hl); g.rect(x + 2, y - 1, 2, 1, hl); g.set(x + 9, y - 2, hl);
    face(g, s, p.expr, row, x, y, w, h);
  } else {
    // back of the head: darker lower strands, a cheek showing on the 3/4 view
    g.rect(x, y + h - 4, w, 3, hc); for (let i = 1; i < w; i += 3) g.set(x + i, y + h - 1, hd);
    g.rect(x + 3, y + 1, 4, 1, hl);
    if (row === 3) g.rect(x + w - 2, y + 7, 2, 5, SKIN);
  }
}

function face(g: Grid, s: Spec, e: Expr, row: number, x: number, y: number, w: number, _h: number) {
  const side = row === 2, ey = y + 8;
  const eyes = side ? [x + w - 5] : row === 1 ? [x + 6, x + w - 6] : [x + 4, x + w - 7];
  for (const [i, ex] of eyes.entries()) {
    const narrow = row === 1 && i === 0;
    if (e === "closed" || e === "dead") {
      if (e === "dead") { g.set(ex, ey + 1, EYE); g.set(ex + 1, ey + 2, EYE); g.set(ex + 1, ey + 1 - 0, EYE); g.set(ex, ey + 2, EYE); }
      else { g.set(ex, ey + 1, EYE); g.set(ex + 1, ey + 2, EYE); g.set(ex, ey + 3, EYE); } // > <
    } else if (e === "cheer") { g.set(ex, ey + 2, EYE); g.set(ex + 1, ey + 1, EYE); g.set(ex + 2 - (narrow ? 1 : 0), ey + 2, EYE); }
    else {
      const ew = narrow || side ? 2 : 3;
      g.rect(ex, ey, ew, 5, EYE);
      g.rect(ex, ey + 3, ew, 2, "#5468c4"); // iris: lighter toward the bottom
      g.set(ex + ew - 1, ey + 4, "#8fa4ff");
      g.set(ex, ey + 1, "#ffffff"); // catch light
      if (e === "think" && i === eyes.length - 1) g.rect(ex, ey, ew, 1, SKIN_SH);
      if (s.gender === "F") { g.set(side ? ex + 2 : i === 0 ? ex - 1 : ex + ew, ey, EYE); g.rect(ex, ey - 1, ew, 1, EYE); }
    }
  }
  // blush + mouth
  if (!side) { g.rect(eyes[0] - 1, ey + 6, 2, 1, BLUSH); g.rect(eyes[eyes.length - 1] + 2, ey + 6, 2, 1, BLUSH); }
  else g.rect(x + w - 5, ey + 6, 2, 1, BLUSH);
  const mx = side ? x + w - 3 : row === 1 ? x + Math.floor(w / 2) + 1 : x + Math.floor(w / 2) - 1, my = ey + 7;
  if (e === "cheer") { g.rect(mx, my, 3, 1, "#b8475a"); g.set(mx + 1, my + 1, "#e0707f"); }
  else if (e === "think") g.rect(mx, my, 2, 1, "#a8656e");
  else if (e === "closed" || e === "dead") g.rect(mx, my, 2, 1, "#a8656e");
  else { g.set(mx, my, "#b8475a"); g.set(mx + 1, my, "#b8475a"); }
}

function hairBack(g: Grid, style: string, row: number, x: number, y: number, w: number, hc: string, hd: string, gender: "M" | "F") {
  const back = row >= 3, side = row === 2, cx = x + Math.floor(w / 2);
  const lowY = y + 14;
  if (style === "long" || (gender === "F" && style === "")) {
    const len = style === "long" ? 13 : 5;
    if (back) g.box(x - 1, y + 4, w + 2, 10 + len, hc, 3);
    else if (side) g.box(x - 2, y + 3, 9, 10 + len, hc, 3);
    else { g.rect(x - 2, y + 4, 4, 8 + len, hc); g.rect(x + w - 2, y + 4, 4, 8 + len, hc); }
    if (back) for (let i = 1; i < w; i += 3) g.line(x + i, y + 10, x + i, y + 12 + len, hd);
  }
  if (style === "ponytail") {
    if (back) { g.disc(cx, y + 3, 2, hd); g.box(cx - 2, y + 4, 5, 15, hc, 2); g.line(cx, y + 6, cx, y + 17, hd); }
    else if (side) { g.disc(x + 1, y + 4, 2, hd); g.box(x - 4, y + 4, 4, 14, hc, 2); }
    else if (row === 1) g.box(x - 3, y + 3, 3, 12, hc, 1);
  }
  if (style === "twintails") {
    const tails = side ? [x - 3] : back || row === 0 ? [x - 4, x + w] : [x - 4];
    for (const tx of tails) { g.disc(tx + 2, y + 3, 2, hd); g.box(tx, y + 4, 4, 15, hc, 2); g.line(tx + 1, y + 7, tx + 1, y + 17, hd); }
  }
  if (style === "topknot") {
    const bx = side ? x + 5 : cx;
    g.disc(bx, y - 4, 3, hc); g.rect(bx - 1, y - 6, 2, 1, light(hc, 0.35)); g.rect(bx - 2, y - 1, 5, 1, hd);
  }
  if (style === "braid") {
    const bx = back ? cx - 1 : side ? x - 1 : row === 1 ? x + w - 1 : x + w;
    for (let k = 0; k < 6; k++) { g.box(bx - (k % 2), lowY - 6 + k * 3, 3, 3, k % 2 ? hd : hc, 1); }
    g.rect(bx, lowY + 12, 2, 2, "#d24b4b");
  }
}

function hat(g: Grid, row: number, x: number, y: number, w: number) {
  const c = "#8a5a34", band = "#d24b4b";
  g.rect(x - 2, y + 1, w + 4, 2, c); // brim
  g.box(x + 2, y - 4, w - 4, 6, c, 2);
  g.rect(x + 2, y, w - 4, 1, band);
  if (row <= 2) { g.line(x + w - 4, y - 2, x + w + 1, y - 7, "#f2efe6"); g.set(x + w + 1, y - 8, "#f2efe6"); }
}
function hood(g: Grid, row: number, x: number, y: number, w: number, c: string) {
  g.box(x - 2, y - 3, w + 4, row >= 3 ? 16 : 8, c, 4);
  if (row < 3) { g.rect(x - 2, y + 4, 3, 9, c); g.rect(x + w - 1, y + 4, 3, 9, dark(c, 0.15)); }
  g.rect(x, y - 2, w - 2, 1, light(c, 0.2));
}
function capeBehind(g: Grid, _s: Spec, tx: number, ty: number, tw: number, row: number) {
  const c = "#a83d4f";
  if (row === 2) g.box(tx - 3, ty, 5, GROUND - ty - 2, c, 1);
  else { g.rect(tx - 2, ty + 2, 2, GROUND - ty - 5, dark(c, 0.15)); g.rect(tx + tw, ty + 2, 2, GROUND - ty - 5, dark(c, 0.15)); }
}
function capeFront(g: Grid, tx: number, ty: number, tw: number) {
  const c = "#a83d4f";
  for (let yy = ty - 1; yy < GROUND - 2; yy++) { const t = (yy - ty) / (GROUND - ty), grow = Math.round(t * 3); g.rect(tx - 1 - grow, yy, tw + 2 + grow * 2, 1, yy % 5 === 0 ? dark(c, 0.15) : c); }
  g.rect(tx - 1, ty - 1, tw + 2, 1, GOLD);
}
function shieldAt(g: Grid, x: number, y: number) {
  g.box(x, y, 6, 7, "#9aa7bd", 2); g.box(x + 1, y + 1, 4, 5, "#4f6fb3", 1); g.rect(x + 2, y + 2, 2, 3, GOLD);
}

function weaponAt(g: Grid, kind: string, hand: { x: number; y: number }, deg: number, row: number) {
  const back = row >= 3;
  const a = ((deg - 90) * Math.PI) / 180, dx = Math.cos(a), dy = Math.sin(a), px = -dy, py = dx;
  const at = (t: number, o = 0) => [hand.x + dx * t + px * o, hand.y + dy * t + py * o] as const;
  const seg = (t0: number, t1: number, col: string, o = 0) => { const [x0, y0] = at(t0, o), [x1, y1] = at(t1, o); g.line(x0, y0, x1, y1, col); };
  if (kind === "sword" || kind === "dagger" || kind === "knife") {
    const len = kind === "sword" ? 12 : 6;
    seg(-2, 0, WOOD); seg(1, len, STEEL); seg(1, len - 1, light(STEEL, 0.6), 0.6);
    const [gx, gy] = at(0.5); g.line(gx - px * 2, gy - py * 2, gx + px * 2, gy + py * 2, GOLD);
  } else if (kind === "axe") {
    seg(-2, 10, WOOD);
    for (let t = 7; t <= 10; t++) seg(t, t, STEEL, 0), seg(t, t, STEEL, 1), seg(t, t, STEEL, 2), seg(t, t, light(STEEL, 0.4), 3);
  } else if (kind === "mace") {
    seg(-2, 8, WOOD);
    const [mx, my] = at(10); g.disc(mx, my, 2, "#8d97ab"); g.set(mx, my - 3, STEEL); g.set(mx + 3, my, STEEL); g.set(mx - 3, my, STEEL);
  } else if (kind === "rod") {
    seg(-4, 12, WOOD); seg(-4, 12, light(WOOD, 0.25), 0.7);
    const [ox, oy] = at(13); g.disc(ox, oy, 2, "#62d6f2"); g.set(ox - 1, oy - 1, "#e6fbff");
  } else if (kind === "gun") {
    seg(-3, -1, WOOD, 0); seg(0, 7, "#4a4f5e"); seg(0, 7, "#6a7086", -0.6); seg(7, 8, STEEL);
    const [gx, gy] = at(-1); g.set(gx - px, gy - py + 1, "#2b2e3a");
  } else if (kind === "star") {
    const [sx, sy] = at(3); g.disc(sx, sy, 1, STEEL);
    for (const [ax, ay] of [[0, -3], [3, 0], [0, 3], [-3, 0]]) g.line(sx, sy, sx + ax, sy + ay, STEEL);
    g.set(sx, sy, "#b9c4dd");
  } else if (kind === "bow") {
    // the bow stands upright in the hand, string toward the body
    const h = 8, dir = back ? -1 : 1;
    for (let k = -h; k <= h; k++) { const bend = Math.round(Math.sqrt(Math.max(0, 1 - (k * k) / (h * h))) * 3); g.set(hand.x + bend * dir, hand.y + k, WOOD); }
    g.line(hand.x, hand.y - h, hand.x, hand.y + h, "#efe6d2");
  }
}

// ---------- poses ----------
const WALK: Omit<Pose, "row">[] = [
  { bob: 0, legs: [2, -2], armSwing: 1, weapon: null, lean: 0, sit: false, expr: "normal" },
  { bob: 1, legs: [0, 0], armSwing: 0, weapon: null, lean: 0, sit: false, expr: "normal" },
  { bob: 0, legs: [-2, 2], armSwing: -1, weapon: null, lean: 0, sit: false, expr: "normal" },
  { bob: 1, legs: [0, 0], armSwing: 0, weapon: null, lean: 0, sit: false, expr: "normal" },
];
const STAND: Omit<Pose, "row"> = { bob: 0, legs: [0, 0], armSwing: 0, weapon: null, lean: 0, sit: false, expr: "normal" };
const SWING = [-60, 20, 95, 140]; // wind-up, mid-swing, full extension (impact), recovery
function actPose(col: number): Omit<Pose, "row"> | "dead" {
  if (col === 0) return STAND;
  if (col === 1) return { ...STAND, sit: true };
  if (col === 2) return { ...STAND, lean: -1, bob: -1, expr: "closed" };
  if (col === 3) return "dead";
  return { ...STAND, weapon: SWING[col - 4], lean: col === 6 ? 1 : 0, bob: col === 5 ? 1 : 0, legs: col === 6 ? [1, -1] : [0, 0] };
}
/** front views show the legs lifting, the side view shows them striding */
function walkPose(i: number, row: number): Omit<Pose, "row"> {
  const w = WALK[i];
  if (row === 2) return { ...w, legs: [w.legs[0], w.legs[1]] };
  return { ...w, legs: [Math.max(0, w.legs[0]) / 2, Math.max(0, w.legs[1]) / 2] };
}

// ---------- sheets ----------
export type PixelSheet = { img: HTMLCanvasElement; meta: { rows: number; cols: number; cellW: number; cellH: number; unit: number; stride?: number } };
export type PixelLook = { walk: PixelSheet; act: PixelSheet };
const cache = new Map<string, PixelLook>();

function specOf(look: Look): Spec {
  const style = HAIR_STYLES[look.style ?? 0]?.key ?? "";
  const job = look.job ?? (look.outfit?.split("@")[0] || "Novice");
  return {
    gender: look.gender === "F" ? "F" : "M", hair: HAIR_COLORS[look.hair % HAIR_COLORS.length] ?? HAIR_COLORS[0], style,
    o: outfitOf(OUTFITS[job] ? job : job.charAt(0).toUpperCase() + job.slice(1)), weapon: look.weapon ?? null,
    shield: !!look.shield, hat: !!look.headgear, cape: !!look.garment,
  };
}

function sheet(cols: number, draw: (col: number, row: number) => Grid, stride?: number): PixelSheet {
  const img = document.createElement("canvas");
  img.width = cols * CELL; img.height = 5 * CELL;
  const g = img.getContext("2d")!;
  for (let row = 0; row < 5; row++) for (let col = 0; col < cols; col++) draw(col, row).paint(g, col * CELL, row * CELL);
  return { img, meta: { rows: 5, cols, cellW: CELL, cellH: CELL, unit: UNIT, ...(stride ? { stride } : {}) } };
}

/** lay a drawn standing frame on its back (rotated a quarter turn, feet to the right, resting on the ground line) */
function lying(stand: Grid): Grid {
  const out = new Grid();
  let top = CELL, bottom = 0, left = CELL, right = 0;
  for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) if (stand.get(x, y)) { top = Math.min(top, y); bottom = Math.max(bottom, y); left = Math.min(left, x); right = Math.max(right, x); }
  const h = bottom - top + 1, w = right - left + 1, ox = Math.round((CELL - h) / 2), oy = GROUND + 1 - w;
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    const c = stand.get(x, y);
    if (c) out.set(ox + (y - top), oy + (right - x), c);
  }
  return out;
}

/** The two sheets for a look; drawn once per distinct look. */
export function pixelLook(look: Look): PixelLook {
  const key = JSON.stringify([look.gender, look.hair, look.style ?? 0, look.job ?? look.outfit, look.weapon ?? null, look.shield ?? null, look.headgear ?? null, look.garment ?? null]);
  const hit = cache.get(key);
  if (hit) return hit;
  const s = specOf(look);
  const walk = sheet(4, (col, row) => drawFrame(s, { row, ...walkPose(col, row) }), STRIDE);
  const act = sheet(8, (col, row) => {
    const p = actPose(col);
    if (p === "dead") return lying(drawFrame(s, { row: 0, ...STAND, expr: "dead" }));
    return drawFrame(s, { row, ...p });
  });
  const out = { walk, act };
  cache.set(key, out);
  return out;
}

/** A head-and-shoulders portrait (dialog cut-ins): the front standing frame, cropped and scaled up crisply. */
export function pixelPortrait(look: Look, expr: Expr = "normal", size = 320): HTMLCanvasElement {
  const grid = drawFrame(specOf(look), { row: 0, ...STAND, expr });
  const small = document.createElement("canvas");
  small.width = small.height = CELL;
  grid.paint(small.getContext("2d")!, 0, 0);
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const g = cv.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  // crop: hair top to mid-torso (rows 4..36), centred
  const sx = 6, sy = 4, sw = 36, sh = 34, k = size / sw;
  g.drawImage(small, sx, sy, sw, sh, 0, size - sh * k, sw * k, sh * k);
  return cv;
}

// ---------- NPCs ----------
/** NPC look by its sprite role and name: the role picks the outfit, the name a stable hair / gender / style. */
const NPC_GENDER: Record<string, "M" | "F"> = {
  "Guide Lio": "M", "Mira the Merchant": "F", "Ranger Vessa": "F", "Herbalist Tamsin": "F", "Warden Orrin": "M",
  "Lamplighter Isolde": "F", "Sentinel Corwin": "M", "Sister Odile": "F", "Hearthkeeper Bren": "M", "Tilda's Sundries": "F",
  "Garrow's Arms": "M", "Forgemaster Brann": "M", "Drillmaster Kessa": "F", "Pella the Cook": "F", "Woodcutter Garr": "M",
  "Old Merrit": "M", "Keeper Wren": "F", "Vanguard Master Brannoc": "M", "Arcanist Master Ysolde": "F", "Fletcher Master Kestrel": "M",
  "Cleric Master Aurel": "M", "Peddler Master Tobin": "M", "Prowler Master Sable": "F", "Guild Grandmaster Aldric": "M", "Keeper of the Second Dawn": "F",
};
const NPC_WEAPON: Record<string, string> = { warden: "sword", ranger: "bow" };
function hash(s: string) { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }
export function npcLook(sprite: string, name: string): Look | null {
  const role = sprite.replace(/^npc_/, "");
  if (!OUTFITS[role]) return null; // not a person (the warp crystal / tomb keep their own sprite)
  const h = hash(name);
  const gender = NPC_GENDER[name] ?? (h & 1 ? "F" : "M");
  const style = gender === "F" ? [1, 2, 3, 5, 0][(h >> 3) % 5] : [0, 4, 0][(h >> 3) % 3];
  const hairs = gender === "F" ? [0, 1, 2, 3, 4, 5, 7, 8] : [0, 1, 2, 3, 5, 6, 7]; // no blossom pink on the men
  return { gender, hair: hairs[(h >> 7) % hairs.length], style, outfit: role, job: role, weapon: NPC_WEAPON[role] ?? null, headgear: role === "merchant" && h & 2 ? "hat" : null };
}
/** dialog cut-in names (shared/content `cutin`) -> the NPC they show, and the expression */
const CUTIN: Record<string, [sprite: string, name: string, expr: Expr]> = {
  guide_lio: ["npc_guide", "Guide Lio", "normal"], guide_lio_cheer: ["npc_guide", "Guide Lio", "cheer"], guide_lio_think: ["npc_guide", "Guide Lio", "think"],
  mira: ["npc_merchant", "Mira the Merchant", "normal"], ranger_vessa: ["npc_ranger", "Ranger Vessa", "normal"],
  herbalist_tamsin: ["npc_herbalist", "Herbalist Tamsin", "normal"], warden_orrin: ["npc_warden", "Warden Orrin", "normal"],
};
/** a data URL portrait for a dialog cut-in, or null for the illustrated tutorial cards */
export function cutinPortrait(image: string): string | null {
  const c = CUTIN[image];
  if (!c) return null;
  const look = npcLook(c[0], c[1]);
  return look ? pixelPortrait(look, c[2]).toDataURL() : null;
}

/** Make Character hair-style tile: the head and shoulders of a style in the chosen gender and colour, 3/4 view. */
export function drawPixelHead(cv: HTMLCanvasElement, gender: "M" | "F", style: number, hair: number, row = 1) {
  const grid = drawFrame(specOf({ gender, hair, style, outfit: "Novice", job: "Novice" }), { row, ...STAND });
  const small = document.createElement("canvas");
  small.width = small.height = CELL;
  grid.paint(small.getContext("2d")!, 0, 0);
  const g = cv.getContext("2d")!;
  g.clearRect(0, 0, cv.width, cv.height);
  g.imageSmoothingEnabled = false;
  const sx = 10, sy = 6, sw = 28, sh = 28, k = Math.max(1, Math.floor(Math.min(cv.width / sw, cv.height / sh)));
  g.drawImage(small, sx, sy, sw, sh, Math.round((cv.width - sw * k) / 2), Math.round((cv.height - sh * k) / 2), sw * k, sh * k);
}
