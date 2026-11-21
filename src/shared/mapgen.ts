/**
 * Deterministic tile-map generation from a ZoneDef. Both client and server run
 * this with the same seed so maps never need to be downloaded; the server's
 * copy is authoritative for collision.
 */
import { fbm, hash2 } from './rng.ts';
import type { ZoneDef } from './config/zones.ts';

export const T = {
  GRASS: 0, GRASS2: 1, DIRT: 2, STONE: 3, WATER: 4, TREE: 5, ROCK: 6, WALL: 7, FLOWERS: 8,
  HOUSE: 9, SAND: 10, FOREST: 11, BUSH: 12, FOUNTAIN: 13, ROOF_SHOP: 14, ROOF_SMITH: 15, ROOF_HALL: 16, PINE: 17,
} as const;

export const BLOCKING: ReadonlySet<number> = new Set([T.WATER, T.TREE, T.ROCK, T.WALL, T.HOUSE, T.FOUNTAIN, T.ROOF_SHOP, T.ROOF_SMITH, T.ROOF_HALL, T.PINE]);

export interface TileMap {
  w: number;
  h: number;
  tiles: Uint8Array;
  /** Movement multiplier per hazard circle lookup. */
  hazards: ZoneDef['hazards'];
}

export function tileAt(m: TileMap, x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= m.w || iy >= m.h) return T.WALL;
  return m.tiles[iy * m.w + ix];
}

export function isBlocked(m: TileMap, x: number, y: number): boolean {
  return BLOCKING.has(tileAt(m, x, y));
}

export function speedMultAt(m: TileMap, x: number, y: number): number {
  let mult = 1;
  for (const h of m.hazards) {
    const dx = x - h.x, dy = y - h.y;
    if (dx * dx + dy * dy <= h.radius * h.radius) mult = Math.min(mult, h.slowMult);
  }
  return mult;
}

function carveDisc(tiles: Uint8Array, w: number, h: number, cx: number, cy: number, r: number, tile: number | null) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy > r * r) continue;
      const i = y * w + x;
      if (tile !== null) tiles[i] = tile;
      else if (BLOCKING.has(tiles[i])) tiles[i] = T.GRASS;
    }
  }
}

function carveLine(tiles: Uint8Array, w: number, h: number, ax: number, ay: number, bx: number, by: number, r: number, tile: number) {
  const steps = Math.ceil(Math.hypot(bx - ax, by - ay) * 2);
  for (let i = 0; i <= steps; i++) {
    const t = steps ? i / steps : 0;
    carveDisc(tiles, w, h, ax + (bx - ax) * t, ay + (by - ay) * t, r, tile);
  }
}

function genCity(z: ZoneDef, tiles: Uint8Array) {
  const { width: w, height: h, seed } = z;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = hash2(x, y, seed);
    tiles[y * w + x] = n < 0.08 ? T.FLOWERS : n < 0.5 ? T.GRASS : T.GRASS2;
  }
  // stone plaza + roads
  carveDisc(tiles, w, h, 28.5, 28.5, 9, T.STONE);
  carveLine(tiles, w, h, 28.5, 28.5, 55, 28, 1.6, T.STONE);
  carveLine(tiles, w, h, 28.5, 28.5, 28.5, 50, 1.4, T.STONE);
  carveLine(tiles, w, h, 28.5, 28.5, 5, 28.5, 1.4, T.STONE);
  for (const s of z.structures) {
    const tile = s.kind === 'wall' ? T.WALL : s.kind === 'fountain' ? T.FOUNTAIN : s.kind === 'shop' ? T.ROOF_SHOP
      : s.kind === 'smithy' ? T.ROOF_SMITH : s.kind === 'hall' ? T.ROOF_HALL : T.HOUSE;
    for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) {
      if (x >= 0 && y >= 0 && x < w && y < h) tiles[y * w + x] = tile;
    }
  }
}

function genField(z: ZoneDef, tiles: Uint8Array) {
  const { width: w, height: h, seed } = z;
  const forest = z.biome === 'forest';
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const water = fbm(x / 14, y / 14, seed, 3);
    const veg = fbm(x / 7, y / 7, seed + 77, 3);
    const r = hash2(x, y, seed + 5);
    let t: number = forest ? (r < 0.5 ? T.FOREST : T.GRASS2) : (r < 0.55 ? T.GRASS : T.GRASS2);
    if (water < 0.27) t = T.WATER;
    else if (water < 0.31) t = forest ? T.DIRT : T.SAND;
    else if (forest ? veg > 0.52 && r < 0.62 : veg > 0.66 && r < 0.45) t = forest && r < 0.3 ? T.PINE : T.TREE;
    else if (r > 0.992) t = T.ROCK;
    else if (r > 0.95) t = forest ? T.BUSH : T.FLOWERS;
    // dense border
    const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
    if (edge < 2) t = forest ? T.PINE : T.TREE;
    tiles[i] = t;
  }
  // routes (safe paths) from spawn to portals and through spawn groups
  const dirt = T.DIRT;
  for (const route of z.routes) {
    for (let i = 1; i < route.length; i++) carveLine(tiles, w, h, route[i - 1].x, route[i - 1].y, route[i].x, route[i].y, 1.3, dirt);
  }
  for (const g of z.spawnGroups) {
    carveDisc(tiles, w, h, g.x, g.y, g.radius * 0.85 + 1, null);
    carveLine(tiles, w, h, z.spawnPoint.x, z.spawnPoint.y, g.x, g.y, 0.9, dirt);
  }
  // boss arenas: open ground + a path from the zone entrance
  for (const b of z.bosses ?? []) for (const sp of b.spawnPoints) {
    carveDisc(tiles, w, h, sp.x, sp.y, 4, null);
    carveLine(tiles, w, h, z.spawnPoint.x, z.spawnPoint.y, sp.x, sp.y, 0.9, dirt);
  }
  for (const n of z.resourceNodes) carveDisc(tiles, w, h, n.x, n.y, 1.6, null);
  for (const n of z.npcs) carveDisc(tiles, w, h, n.x, n.y, 2, null);
  carveDisc(tiles, w, h, z.spawnPoint.x, z.spawnPoint.y, 3, null);
  for (const p of z.portals) {
    for (let y = p.y - 1; y < p.y + p.h + 1; y++) for (let x = p.x - 1; x < p.x + p.w + 1; x++) {
      if (x >= 0 && y >= 0 && x < w && y < h) tiles[y * w + x] = T.DIRT;
    }
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    carveLine(tiles, w, h, cx, cy, clampIn(cx, 6, w - 6), clampIn(cy, 6, h - 6), 1.5, T.DIRT);
  }
}

const clampIn = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function generateMap(z: ZoneDef): TileMap {
  const tiles = new Uint8Array(z.width * z.height);
  if (z.biome === 'city') genCity(z, tiles);
  else genField(z, tiles);
  return { w: z.width, h: z.height, tiles, hazards: z.hazards };
}

/** Flood-fill reachability from (sx,sy). Used by tests and the config validator. */
export function reachable(m: TileMap, sx: number, sy: number): Uint8Array {
  const seen = new Uint8Array(m.w * m.h);
  const stack = [Math.floor(sy) * m.w + Math.floor(sx)];
  while (stack.length) {
    const i = stack.pop()!;
    if (seen[i] || BLOCKING.has(m.tiles[i])) continue;
    seen[i] = 1;
    const x = i % m.w, y = (i / m.w) | 0;
    if (x > 0) stack.push(i - 1);
    if (x < m.w - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - m.w);
    if (y < m.h - 1) stack.push(i + m.w);
  }
  return seen;
}
