// The ground of every map as one pixel-art picture, drawn in code. Each map cell is a TILE_PX square picked from a few
// variants per kind (grass, dirt, water, rocky ground, cobble) in the map theme's colours, then the edges between kinds get a
// ragged grass fringe, a bank and foam at the water, and a curb along paving. Walls (blocked rocky cells without a prop: the cave
// walls and the town wall) are drawn as a lit top with a dark south face. A border of PAD cells of woodland floor surrounds the map.
import { TILE, type GameMap } from "../../shared/map.ts";
import { lookOf } from "./themes.ts";
import { D, R, P, darker, hash, lighter, mixc, mk, tint, type Canvas, type Ctx, type RGB } from "./pix.ts";

export const TILE_PX = 24;
export const PAD = 12;
const T = TILE_PX;

export type Palette = {
  grass: [string, string, string, string]; dirt: [string, string, string, string]; water: [string, string, string, string];
  rock: [string, string, string, string]; cobble: [string, string, string, string]; wall: [string, string, string, string];
  flower: string[]; bg: string;
};
const GRASS = ["#5fa84b", "#70b95a", "#4a8a3b", "#8fd070"], DIRT = ["#a67f4f", "#b78e5b", "#8b6840", "#6d5033"], WATER = ["#3d7fc6", "#4c92d8", "#2f68aa", "#a8d8f5"];
const ROCK = ["#8e8f99", "#9e9fa9", "#757680", "#b9bac4"], COBBLE = ["#b6ac9d", "#c5bcad", "#978d7f", "#6f665b"], WALL = ["#9a9aa8", "#aeaebc", "#6c6c7a", "#4a4a58"];

export function paletteOf(m: GameMap): Palette {
  const look = lookOf(m.theme);
  const dark = look.cave?.dark ?? 1;
  const mul = (base: string[], k: RGB, extra = 1): [string, string, string, string] =>
    base.map((c) => tint(c, [k[0] * extra, k[1] * extra, k[2] * extra])) as [string, string, string, string];
  const ck: RGB = [1, 1, 1];
  return {
    grass: mul(GRASS, look.grass, dark), dirt: mul(DIRT, look.dirt, dark), water: mul(WATER, look.water, dark),
    rock: mul(ROCK, ck, m.theme === "ash" ? 0.8 : dark), cobble: mul(COBBLE, look.dirt, dark), wall: mul(WALL, ck, m.theme === "cave" ? 0.75 : 1),
    flower: look.flowers > 0.4 ? ["#ffe27a", "#ff9ec4", "#ffffff", "#b79bff"] : [],
    bg: darker(mul(GRASS, look.grass, dark)[2], 0.35),
  };
}

type Variants = Canvas[];
const cache = new Map<string, { grass: Variants; dirt: Variants; water: Variants; rock: Variants; cobble: Variants; wall: Variants }>();

function noiseTile(pal: [string, string, string, string], seed: number, n: number, dither = 0.1): Variants {
  const out: Variants = [];
  for (let v = 0; v < n; v++) {
    const { c, g } = mk(T, T);
    R(g, 0, 0, T, T, pal[0]);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const r = hash(x, y, seed + v * 31);
      if (r < dither) P(g, x, y, pal[2]); else if (r > 1 - dither * 0.8) P(g, x, y, pal[1]);
    }
    out.push(c);
  }
  return out;
}

function build(m: GameMap) {
  const pal = paletteOf(m), look = lookOf(m.theme);
  // grass: noise + short blades + the odd flower
  const grass = noiseTile(pal.grass, 11, 8, 0.12);
  grass.forEach((c, v) => {
    const g = c.getContext("2d")!;
    for (let i = 0; i < 5; i++) {
      const x = 1 + Math.floor(hash(i, v, 5) * (T - 3)), y = 2 + Math.floor(hash(i, v, 6) * (T - 4));
      P(g, x, y, pal.grass[3]); P(g, x, y - 1, pal.grass[1]); P(g, x + 1, y, pal.grass[2]);
    }
    if (pal.flower.length && hash(v, 3, 9) < 0.45 * look.flowers) {
      const x = 3 + Math.floor(hash(v, 1, 7) * (T - 7)), y = 4 + Math.floor(hash(v, 2, 7) * (T - 8)), col = pal.flower[v % pal.flower.length];
      P(g, x, y, col); P(g, x + 1, y, col); P(g, x, y + 1, col); P(g, x + 1, y + 1, "#f4d35e");
      P(g, x, y + 2, pal.grass[2]);
    }
  });
  // dirt: noise + pebbles
  const dirt = noiseTile(pal.dirt, 23, 6, 0.14);
  dirt.forEach((c, v) => {
    const g = c.getContext("2d")!;
    for (let i = 0; i < 3; i++) {
      const x = 2 + Math.floor(hash(i, v, 15) * (T - 5)), y = 2 + Math.floor(hash(i, v, 16) * (T - 5));
      R(g, x, y, 2, 1, pal.dirt[3]); P(g, x, y + 1, darker(pal.dirt[3], 0.3)); P(g, x + 1, y - 1, pal.dirt[1]);
    }
  });
  // water: base + wave dashes
  const water = noiseTile(pal.water, 37, 4, 0.06);
  water.forEach((c, v) => {
    const g = c.getContext("2d")!;
    for (let i = 0; i < 4; i++) {
      const x = 1 + Math.floor(hash(i, v, 25) * (T - 7)), y = 2 + Math.floor(hash(i, v, 26) * (T - 4));
      R(g, x, y, 4 + (i % 2), 1, pal.water[1]); R(g, x + 1, y + 1, 3, 1, pal.water[2]);
      if (i === 1) { P(g, x + 2, y - 1, pal.water[3]); }
    }
  });
  // rocky ground: noise + cracks
  const rock = noiseTile(pal.rock, 41, 5, 0.12);
  rock.forEach((c, v) => {
    const g = c.getContext("2d")!;
    const x = 2 + Math.floor(hash(v, 1, 35) * 10), y = 3 + Math.floor(hash(v, 2, 35) * 14);
    R(g, x, y, 5, 1, pal.rock[2]); R(g, x + 4, y + 1, 4, 1, pal.rock[2]); P(g, x + 2, y - 1, pal.rock[3]);
    D(g, 17 + (v % 3), 6 + (v % 4) * 3, 1, pal.rock[1]);
  });
  // cobble: 8x6 stones in offset rows with mortar
  const cobble: Variants = [];
  for (let v = 0; v < 5; v++) {
    const { c, g } = mk(T, T);
    R(g, 0, 0, T, T, mixc(pal.cobble[2], pal.cobble[3], 0.45));
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 4 : 0;
      for (let col = -1; col < 4; col++) {
        const x = col * 8 + off, y = row * 6, r = hash(col + 7, row, 45 + v);
        const base = r < 0.3 ? pal.cobble[2] : r > 0.75 ? pal.cobble[1] : pal.cobble[0];
        R(g, x + 1, y + 1, 7, 5, base);
        R(g, x + 1, y + 1, 7, 1, lighter(base, 0.1)); R(g, x + 1, y + 5, 7, 1, darker(base, 0.08));
      }
    }
    cobble.push(c);
  }
  // wall top (lit), same noise family
  const wall = noiseTile([pal.wall[1], pal.wall[1], pal.wall[2], pal.wall[0]], 53, 4, 0.1);
  wall.forEach((c, v) => {
    const g = c.getContext("2d")!;
    for (let row = 0; row < 3; row++) R(g, 0, row * 8 + 7, T, 1, pal.wall[2]);
    for (let row = 0; row < 3; row++) { const x = (row % 2 ? 6 : 14) + (v % 2) * 2; R(g, x, row * 8, 1, 7, pal.wall[2]); }
  });
  return { grass, dirt, water, rock, cobble, wall };
}

const KIND_PRIORITY: Record<number, number> = { [TILE.water]: 0, [TILE.dirt]: 1, [TILE.stone]: 2, [TILE.cobble]: 3, [TILE.grass]: 4 };

export type Ground = { canvas: Canvas; pal: Palette; wallAt: (x: number, y: number) => boolean };

export function drawGround(m: GameMap): Ground {
  const key = `${m.theme ?? "town"}:${m.w}x${m.h}`;
  const pal = paletteOf(m);
  let tiles = cache.get(key);
  if (!tiles) { tiles = build(m); cache.set(key, tiles); }
  const W = m.w + PAD * 2, H = m.h + PAD * 2;
  const { c, g } = mk(W * T, H * T);
  const cave = lookOf(m.theme).ring.length === 0;
  const propAt = new Set(m.props.map((p) => p.y * m.w + p.x));
  const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h;
  const kindAt = (x: number, y: number) => (inMap(x, y) ? m.kind[y * m.w + x] : TILE.grass);
  const wallAt = (x: number, y: number) => inMap(x, y) && !!m.blocked[y * m.w + x] && m.kind[y * m.w + x] === TILE.stone && !propAt.has(y * m.w + x);
  const pick = (v: Variants, x: number, y: number) => v[Math.floor(hash(x, y, 3) * v.length)];

  for (let y = -PAD; y < m.h + PAD; y++) for (let x = -PAD; x < m.w + PAD; x++) {
    const ox = (x + PAD) * T, oy = (y + PAD) * T;
    if (!inMap(x, y)) { // woodland floor around the map: darker grass (a cave is walled in by rock)
      g.drawImage(pick(cave ? tiles.wall : tiles.grass, x, y), ox, oy);
      g.fillStyle = cave ? "rgba(5, 5, 12, 0.5)" : "rgba(10, 20, 10, 0.32)"; g.fillRect(ox, oy, T, T);
      continue;
    }
    const k = m.kind[y * m.w + x];
    if (wallAt(x, y)) {
      g.drawImage(pick(tiles.wall, x, y), ox, oy);
      if (!wallAt(x, y + 1)) { // the south face: darker, with a lit lip above it
        R(g, ox, oy + T - 9, T, 9, pal.wall[2]); R(g, ox, oy + T - 9, T, 1, pal.wall[0]);
        for (let i = 0; i < T; i += 6) R(g, ox + i + ((y % 2) * 3), oy + T - 8, 1, 8, pal.wall[3]);
        R(g, ox, oy + T - 1, T, 1, pal.wall[3]);
      }
      continue;
    }
    const v = k === TILE.water ? tiles.water : k === TILE.dirt ? tiles.dirt : k === TILE.stone ? tiles.rock : k === TILE.cobble ? tiles.cobble : tiles.grass;
    g.drawImage(pick(v, x, y), ox, oy);
  }

  // edges between kinds
  const DIRS: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    if (wallAt(x, y)) continue;
    const k = m.kind[y * m.w + x], ox = (x + PAD) * T, oy = (y + PAD) * T;
    for (const [di, [dx, dy]] of DIRS.entries()) {
      const nx = x + dx, ny = y + dy, nk = inMap(nx, ny) ? kindAt(nx, ny) : TILE.grass, nWall = wallAt(nx, ny);
      if (nk === k && !nWall) continue;
      const edge = (i: number, depth: number, col: string) => { // `depth` pixels deep from the shared edge, at position i along it
        if (di === 0) R(g, ox + i, oy, 1, depth, col); else if (di === 2) R(g, ox + i, oy + T - depth, 1, depth, col);
        else if (di === 3) R(g, ox, oy + i, depth, 1, col); else R(g, ox + T - depth, oy + i, depth, 1, col);
      };
      if (k === TILE.water && nk !== TILE.water) { // foam along the shore
        for (let i = 0; i < T; i++) { const r = hash(x * T + i, y * T + di, 61); edge(i, r < 0.55 ? 2 : 1, r < 0.2 ? pal.water[3] : lighter(pal.water[1], 0.35)); }
      } else if (nk === TILE.water && k !== TILE.water) { // the bank: a dark rim on the land
        for (let i = 0; i < T; i++) edge(i, 1 + (hash(x * T + i, y * T + di, 62) < 0.4 ? 1 : 0), darker(k === TILE.grass ? pal.grass[2] : pal.dirt[2], 0.3));
      } else if ((k === TILE.dirt || k === TILE.stone) && nk === TILE.grass) { // grass creeps over the path
        for (let i = 0; i < T; i++) { const r = hash(x * T + i, y * T + di, 63); edge(i, 1 + Math.floor(r * 3), r < 0.5 ? pal.grass[0] : pal.grass[2]); }
      } else if (k === TILE.cobble && nk !== TILE.cobble && !nWall) { // a paving curb
        for (let i = 0; i < T; i++) edge(i, 1, pal.cobble[3]);
      } else if (k === TILE.grass && nk === TILE.dirt && KIND_PRIORITY[nk] < KIND_PRIORITY[k]) {
        for (let i = 0; i < T; i += 3) if (hash(x * T + i, y * T + di, 64) < 0.6) edge(i, 1, pal.grass[1]);
      }
    }
  }
  return { canvas: c, pal, wallAt };
}
