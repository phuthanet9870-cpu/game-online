import { DUNGEON_MODIFIERS, type RoomType } from './data/dungeon.js';
import { Rng } from './math.js';
import { FURNITURE, HOUSE, type HouseState } from './data/housing.js';

export const TILE = 32;
// Tile ids: 0 wall, 1 floor, 2 path/plaza, 3 water (solid), 4 tree/pillar (solid), 5 dark floor (dungeon), 6 rift floor (boss)
export const SOLID = new Set([0, 3, 4, 7]); // 7 = solid furniture (housing)

export type MapTheme = 'town' | 'field' | 'dungeon';

export interface Interactable {
  id: string;
  type: 'portal_dungeon' | 'npc_auction' | 'npc_alchemist' | 'npc_carpenter' | 'house_door' | 'house_exit' | 'furniture' | 'gate_highlands' | 'gate_meadow' | 'gate_wastes' | 'gate_ash' | 'ore' | 'fishing' | 'dig' | 'gate_field' | 'gate_town' | 'npc_smith' | 'npc_trainer' | 'npc_quartermaster' | 'npc_quests' | 'chest' | 'shrine' | 'fountain' | 'altar' | 'exit' | 'herb' | 'stash';
  x: number;
  y: number;
  name: string;
  room?: number;
  used?: boolean;
  res?: string;
  req?: number;
  /** Housing: furniture id, footprint and whether it is decoration only (not interactable). */
  furn?: string; fw?: number; fh?: number; deco?: boolean;
}

export interface SpawnPoint { enemy: string; x: number; y: number; room?: number; elite?: boolean; level?: number; group?: number }

export interface RoomInfo { id: number; type: RoomType; x: number; y: number; w: number; h: number; cx: number; cy: number; cell: [number, number] }

export interface GameMap {
  id: string;
  theme: MapTheme;
  palette?: 'ash' | 'star' | 'house';
  w: number;
  h: number;
  tiles: number[];
  spawn: { x: number; y: number };
  interactables: Interactable[];
  spawns: SpawnPoint[];
  rooms: RoomInfo[];
  edges: Array<[number, number]>;
  seed: number;
  modifiers: string[];
  level: number;
}

export function tileAt(m: GameMap, tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return 0;
  return m.tiles[ty * m.w + tx]!;
}
export function solidAt(m: GameMap, px: number, py: number): boolean {
  return SOLID.has(tileAt(m, Math.floor(px / TILE), Math.floor(py / TILE)));
}
/** Circle-vs-tile collision test. */
export function circleBlocked(m: GameMap, x: number, y: number, r: number): boolean {
  const x0 = Math.floor((x - r) / TILE), x1 = Math.floor((x + r) / TILE);
  const y0 = Math.floor((y - r) / TILE), y1 = Math.floor((y + r) / TILE);
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) {
      if (!SOLID.has(tileAt(m, tx, ty))) continue;
      const cx = Math.max(tx * TILE, Math.min(x, tx * TILE + TILE));
      const cy = Math.max(ty * TILE, Math.min(y, ty * TILE + TILE));
      if ((cx - x) ** 2 + (cy - y) ** 2 < r * r) return true;
    }
  return false;
}
/** Move with per-axis sliding. Returns new position. */
export function moveCircle(m: GameMap, x: number, y: number, r: number, dx: number, dy: number): [number, number] {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (r * 0.8)));
  const sx = dx / steps, sy = dy / steps;
  for (let i = 0; i < steps; i++) {
    if (!circleBlocked(m, x + sx, y, r)) x += sx;
    if (!circleBlocked(m, x, y + sy, r)) y += sy;
  }
  return [x, y];
}
export function lineOfSight(m: GameMap, ax: number, ay: number, bx: number, by: number): boolean {
  const d = Math.hypot(bx - ax, by - ay);
  const n = Math.ceil(d / (TILE / 3));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (solidAt(m, ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
  }
  return true;
}

/** True if a circle of radius r can travel the straight segment without touching a solid tile. */
export function clearPath(m: GameMap, ax: number, ay: number, bx: number, by: number, r: number): boolean {
  const d = Math.hypot(bx - ax, by - ay);
  const n = Math.ceil(d / (r * 0.75 + 1));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (circleBlocked(m, ax + (bx - ax) * t, ay + (by - ay) * t, r * 0.9)) return false;
  }
  return true;
}

/** A* on the tile grid. Returns waypoints in pixel coordinates (tile centers), excluding start. */
export function findPath(m: GameMap, sx: number, sy: number, gx: number, gy: number, maxNodes = 2500): Array<[number, number]> | null {
  const s = [Math.floor(sx / TILE), Math.floor(sy / TILE)] as const;
  const g = [Math.floor(gx / TILE), Math.floor(gy / TILE)] as const;
  if (SOLID.has(tileAt(m, g[0], g[1]))) return null;
  const key = (x: number, y: number) => y * m.w + x;
  const open: Array<{ k: number; f: number }> = [];
  const gs = new Map<number, number>();
  const came = new Map<number, number>();
  const sk = key(s[0], s[1]), gk = key(g[0], g[1]);
  gs.set(sk, 0);
  const h = (x: number, y: number) => Math.hypot(x - g[0], y - g[1]);
  const push = (k: number, f: number) => {
    open.push({ k, f });
    let i = open.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (open[p]!.f <= open[i]!.f) break; [open[p], open[i]] = [open[i]!, open[p]!]; i = p; }
  };
  const pop = () => {
    const top = open[0]!; const last = open.pop()!;
    if (open.length) { open[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let mi = i; if (l < open.length && open[l]!.f < open[mi]!.f) mi = l; if (r < open.length && open[r]!.f < open[mi]!.f) mi = r; if (mi === i) break; [open[mi], open[i]] = [open[i]!, open[mi]!]; i = mi; } }
    return top;
  };
  push(sk, h(s[0], s[1]));
  let expanded = 0;
  const closed = new Set<number>();
  while (open.length && expanded < maxNodes) {
    const { k } = pop();
    if (closed.has(k)) continue;
    closed.add(k);
    expanded++;
    if (k === gk) break;
    const x = k % m.w, y = Math.floor(k / m.w);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (SOLID.has(tileAt(m, nx, ny))) continue;
        if (dx && dy && (SOLID.has(tileAt(m, x + dx, y)) || SOLID.has(tileAt(m, x, y + dy)))) continue; // no corner cutting
        const nk = key(nx, ny);
        const ng = gs.get(k)! + (dx && dy ? 1.414 : 1);
        if (ng < (gs.get(nk) ?? Infinity)) { gs.set(nk, ng); came.set(nk, k); push(nk, ng + h(nx, ny)); }
      }
  }
  if (!came.has(gk) && sk !== gk) return null;
  const out: Array<[number, number]> = [];
  let c = gk;
  while (c !== sk) { out.push([(c % m.w) * TILE + TILE / 2, Math.floor(c / m.w) * TILE + TILE / 2]); c = came.get(c)!; if (c === undefined) break; }
  return out.reverse();
}

/** Flood fill reachability from a pixel position. */
export function reachableSet(m: GameMap, px: number, py: number): Set<number> {
  const seen = new Set<number>();
  const sx = Math.floor(px / TILE), sy = Math.floor(py / TILE);
  if (SOLID.has(tileAt(m, sx, sy))) return seen;
  const q = [sy * m.w + sx];
  seen.add(q[0]!);
  while (q.length) {
    const k = q.pop()!;
    const x = k % m.w, y = Math.floor(k / m.w);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      const nk = ny * m.w + nx;
      if (!seen.has(nk) && !SOLID.has(tileAt(m, nx, ny))) { seen.add(nk); q.push(nk); }
    }
  }
  return seen;
}

// ───────────────────────── TOWN ─────────────────────────
export function buildTown(): GameMap {
  const w = 56, h = 44;
  const tiles = new Array(w * h).fill(1);
  const set = (x: number, y: number, v: number) => { if (x >= 0 && y >= 0 && x < w && y < h) tiles[y * w + x] = v; };
  for (let x = 0; x < w; x++) { set(x, 0, 0); set(x, h - 1, 0); }
  for (let y = 0; y < h; y++) { set(0, y, 0); set(w - 1, y, 0); }
  // plaza
  for (let y = 12; y < 32; y++) for (let x = 16; x < 40; x++) set(x, y, 2);
  // fountain
  for (let y = 20; y < 24; y++) for (let x = 26; x < 30; x++) set(x, y, 3);
  // roads
  for (let x = 1; x < w - 1; x++) for (let y = 21; y < 23; y++) if (tiles[y * w + x] === 1) set(x, y, 2);
  for (let y = 1; y < h - 1; y++) for (let x = 27; x < 29; x++) if (tiles[y * w + x] === 1) set(x, y, 2);
  // buildings (solid blocks)
  const block = (x0: number, y0: number, bw: number, bh: number) => { for (let y = y0; y < y0 + bh; y++) for (let x = x0; x < x0 + bw; x++) set(x, y, 0); };
  block(6, 4, 8, 6); block(42, 4, 8, 6); block(6, 34, 8, 6); block(42, 34, 8, 6); block(18, 4, 6, 4); block(32, 4, 6, 4);
  // trees
  const rng = new Rng(77);
  for (let i = 0; i < 40; i++) {
    const x = rng.int(2, w - 3), y = rng.int(2, h - 3);
    if (tiles[y * w + x] === 1 && Math.abs(x - 28) > 3 && Math.abs(y - 22) > 3) set(x, y, 4);
  }
  const T = (tx: number, ty: number) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });
  const interactables: Interactable[] = [
    { id: 'portal', type: 'portal_dungeon', name: 'Rift Gate', ...T(28, 3) },
    { id: 'gate_field', type: 'gate_field', name: 'Duskmeadow Road', ...T(54, 22) },
    { id: 'smith', type: 'npc_smith', name: 'Brenna the Smith', ...T(10, 11) },
    { id: 'trainer', type: 'npc_trainer', name: 'Master Ilrin', ...T(46, 11) },
    { id: 'quartermaster', type: 'npc_quartermaster', name: 'Quartermaster Sol', ...T(10, 33) },
    { id: 'quests', type: 'npc_quests', name: 'Commander Aveline', ...T(34, 16) },
    { id: 'stash', type: 'stash', name: 'Astral Vault', ...T(46, 33) },
    { id: 'auction', type: 'npc_auction', name: 'Auctioneer Vell', ...T(20, 16) },
    { id: 'alchemist', type: 'npc_alchemist', name: 'Sister Maelis', ...T(36, 27) },
    { id: 'carpenter', type: 'npc_carpenter', name: 'Carpenter Odo', ...T(40, 18) },
    { id: 'house_door', type: 'house_door', name: 'Hearthstone Lane (your Hearth)', ...T(48, 22) },
  ];
  const spawns: SpawnPoint[] = [
    { enemy: 'dummy', ...T(4, 18), level: 1 }, { enemy: 'dummy', ...T(4, 22), level: 1 }, { enemy: 'dummy', ...T(4, 26), level: 1 },
  ];
  return { id: 'town', theme: 'town', w, h, tiles, spawn: T(28, 27), interactables, spawns, rooms: [], edges: [], seed: 0, modifiers: [], level: 1 };
}

// ───────────────────────── OPEN WORLD: DUSKMEADOW ─────────────────────────
interface OpenWorldCfg {
  id: string; seed: number; palette?: 'ash' | 'star'; levelMin: number; levelMax: number;
  pool: Array<[string, number, [number, number]]>; // enemy, weight, pack size
  nodes: Array<{ type: 'herb' | 'ore'; res: string; name: string; count: number; req?: number }>;
  fishing?: { res: string; name: string; count: number; req?: number };
  westGate: Interactable['type']; westName: string; eastGate?: Interactable['type']; eastName?: string; level: number;
}

function buildOpenWorld(cfg: OpenWorldCfg): GameMap {
  const w = 110, h = 80;
  const seed = cfg.seed;
  const rng = new Rng(seed);
  const tiles = new Array(w * h).fill(1);
  const set = (x: number, y: number, v: number) => { if (x >= 0 && y >= 0 && x < w && y < h) tiles[y * w + x] = v; };
  // value noise for forests/lakes (lava fields in the Highlands)
  const grid = 10;
  const gw = Math.ceil(w / grid) + 2, gh = Math.ceil(h / grid) + 2;
  const nv = Array.from({ length: gw * gh }, () => rng.next());
  const noise = (x: number, y: number) => {
    const gx = x / grid, gy = y / grid; const ix = Math.floor(gx), iy = Math.floor(gy); const fx = gx - ix, fy = gy - iy;
    const v = (a: number, b: number) => nv[b * gw + a]!;
    const sm = (t: number) => t * t * (3 - 2 * t);
    const a = v(ix, iy) + (v(ix + 1, iy) - v(ix, iy)) * sm(fx);
    const b = v(ix, iy + 1) + (v(ix + 1, iy + 1) - v(ix, iy + 1)) * sm(fx);
    return a + (b - a) * sm(fy);
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const n = noise(x, y);
      if (n > 0.74) set(x, y, 4);
      else if (n < 0.14) set(x, y, 3);
      else if (n > 0.66 && rng.chance(0.35)) set(x, y, 4);
    }
  // winding road from west gate to east
  let ry = 40;
  for (let x = 0; x < w; x++) {
    ry += rng.int(-1, 1);
    ry = Math.max(10, Math.min(h - 10, ry));
    if (x > w - 10) ry += Math.sign(40 - ry); // arrive at the east gate
    for (let dy = -2; dy <= 2; dy++) set(x, ry + dy, 2);
    if (x % 22 === 11) for (let yy = 4; yy < h - 4; yy++) { set(x, yy, tiles[yy * w + x] === 3 ? 2 : tiles[yy * w + x] === 4 ? 1 : tiles[yy * w + x]!); }
  }
  for (let x = 0; x < w; x++) { set(x, 0, 0); set(x, h - 1, 0); }
  for (let y = 0; y < h; y++) { set(0, y, 0); set(w - 1, y, 0); }
  for (let y = 36; y < 45; y++) for (let x = 1; x < 8; x++) set(x, y, 2);
  if (cfg.eastGate) for (let y = 36; y < 45; y++) for (let x = w - 8; x < w - 1; x++) set(x, y, 2);
  const T = (tx: number, ty: number) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });
  const map: GameMap = { id: cfg.id, theme: 'field', palette: cfg.palette, w, h, tiles, spawn: T(4, 40), interactables: [{ id: 'gate_w', type: cfg.westGate, name: cfg.westName, ...T(2, 40) }], spawns: [], rooms: [], edges: [], seed, modifiers: [], level: cfg.level };
  if (cfg.eastGate) map.interactables.push({ id: 'gate_e', type: cfg.eastGate, name: cfg.eastName ?? 'Road', ...T(w - 3, 40) });
  const reach = reachableSet(map, map.spawn.x, map.spawn.y);
  const freeTile = (minX: number, maxX: number): [number, number] => {
    for (let i = 0; i < 400; i++) {
      const tx = rng.int(minX, maxX), ty = rng.int(3, h - 4);
      if (reach.has(ty * w + tx) && !SOLID.has(tiles[ty * w + tx]!)) return [tx, ty];
    }
    return [10, 40];
  };
  // spawn groups: level band rises to the east
  let group = 0;
  for (let i = 0; i < 26; i++) {
    const [tx, ty] = freeTile(14, w - 10);
    const lvl = cfg.levelMin + Math.floor((tx / w) * (cfg.levelMax - cfg.levelMin + 1));
    const [kind, , [a, b]] = rng.weighted(cfg.pool, (p) => p[1]);
    const n = rng.int(a, b);
    group++;
    for (let j = 0; j < n; j++) map.spawns.push({ enemy: kind, x: tx * TILE + rng.range(-40, 40), y: ty * TILE + rng.range(-40, 40), level: lvl, group, elite: i % 9 === 8 && j === 0 });
  }
  let ni = 0;
  for (const nd of cfg.nodes) for (let i = 0; i < nd.count; i++) {
    const [tx, ty] = freeTile(8, w - 4);
    map.interactables.push({ id: `${nd.type}${ni++}`, type: nd.type, name: nd.name, res: nd.res, req: nd.req, ...T(tx, ty) });
  }
  if (cfg.fishing) {
    // fishing spots: reachable floor tiles next to water/lava
    const shore: Array<[number, number]> = [];
    for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
      if (!reach.has(y * w + x)) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => tiles[(y + dy!) * w + x + dx!] === 3)) shore.push([x, y]);
    }
    rng.shuffle(shore);
    const picked: Array<[number, number]> = [];
    for (const p of shore) { if (picked.length >= cfg.fishing.count) break; if (picked.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > 12)) picked.push(p); }
    picked.forEach(([tx, ty], i) => map.interactables.push({ id: `fish${i}`, type: 'fishing', name: cfg.fishing!.name, res: cfg.fishing!.res, req: cfg.fishing!.req, ...T(tx, ty) }));
  }
  return map;
}

export function buildField(seed = 1337): GameMap {
  return buildOpenWorld({ id: 'field', seed, levelMin: 2, levelMax: 9, level: 3, westGate: 'gate_town', westName: 'Road to Lumenhold', eastGate: 'gate_highlands', eastName: 'Pass to the Ashen Highlands',
    pool: [['gloomfang', 2, [2, 4]], ['thornback', 1, [1, 2]], ['wisp', 2, [2, 4]]], nodes: [{ type: 'herb', res: 'moonpetal', name: 'Moonpetal Bloom', count: 14 }], fishing: { res: 'fish', name: 'Moonlake Shore', count: 6 } });
}

export function buildWastes(seed = 9090): GameMap {
  return buildOpenWorld({ id: 'wastes', seed, palette: 'star', levelMin: 20, levelMax: 30, level: 22, westGate: 'gate_ash', westName: 'Back to the Ashen Highlands',
    pool: [['shard_stalker', 3, [2, 4]], ['prism_seer', 2, [1, 2]], ['glass_colossus', 1, [1, 1]], ['starling', 2, [3, 5]]],
    nodes: [{ type: 'ore', res: 'starglass', name: 'Starglass Cluster', count: 10, req: 6 }, { type: 'ore', res: 'starsteel', name: 'Starsteel Vein', count: 6, req: 4 }, { type: 'herb', res: 'starbloom', name: 'Starbloom', count: 10 }] });
}

export function buildHighlands(seed = 4242): GameMap {
  return buildOpenWorld({ id: 'highlands', seed, palette: 'ash', levelMin: 10, levelMax: 20, level: 12, westGate: 'gate_meadow', westName: 'Back to Duskmeadow', eastGate: 'gate_wastes', eastName: 'Trail to the Starfall Wastes',
    pool: [['ember_imp', 3, [2, 4]], ['flamecaller', 2, [1, 3]], ['magma_golem', 1, [1, 1]], ['cinder_drake', 2, [1, 2]]],
    nodes: [{ type: 'ore', res: 'iron_ore', name: 'Iron Vein', count: 14 }, { type: 'ore', res: 'starsteel', name: 'Starsteel Vein', count: 5, req: 4 }, { type: 'herb', res: 'emberbloom', name: 'Emberbloom', count: 10 }], fishing: { res: 'ember_eel', name: 'Lava Pool', count: 5, req: 3 } });
}

// ───────────────────────── PROCEDURAL DUNGEON ─────────────────────────
export interface DungeonOptions { seed: number; level: number; floor?: number; difficulty: string; layout?: 'rift' | 'tower'; boss?: string; modifiers?: string[]; eliteChance?: number; pool?: string[] }

export function generateDungeon(opts: DungeonOptions): GameMap {
  // Retry until a layout passes validation (bounded; generator is deterministic per seed+attempt).
  for (let attempt = 0; attempt < 20; attempt++) {
    const m = tryGenerate(opts, attempt);
    if (m && validateDungeon(m).ok) return m;
  }
  throw new Error('Dungeon generation failed validation for seed ' + opts.seed);
}

const GW = 5, GH = 5, CS = 20;

function tryGenerate(opts: DungeonOptions, attempt: number): GameMap | null {
  const rng = new Rng((opts.seed ^ (attempt * 0x9e3779b1)) >>> 0);
  const w = GW * CS + 2, h = GH * CS + 2;
  const tiles = new Array(w * h).fill(0);
  // main path random walk
  const tower = opts.layout === 'tower';
  const mainLen = tower ? rng.int(3, 4) : rng.int(6, 7);
  const occupied = new Map<string, number>();
  const cells: Array<[number, number]> = [];
  let cx = rng.int(0, GW - 1), cy = GH - 1;
  cells.push([cx, cy]); occupied.set(`${cx},${cy}`, 0);
  const dirs: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (cells.length < mainLen) {
    const options = dirs.map(([dx, dy]) => [cx + dx, cy + dy] as [number, number]).filter(([x, y]) => x >= 0 && y >= 0 && x < GW && y < GH && !occupied.has(`${x},${y}`));
    if (!options.length) return null;
    // bias upward so runs travel "deeper"
    const [nx, ny] = rng.weighted(options, ([, y]) => (y < cy ? 3 : 1));
    cx = nx; cy = ny;
    occupied.set(`${cx},${cy}`, cells.length);
    cells.push([cx, cy]);
  }
  const edges: Array<[number, number]> = [];
  for (let i = 1; i < cells.length; i++) edges.push([i - 1, i]);
  const types: RoomType[] = cells.map((_, i) => (i === 0 ? 'entry' : i === cells.length - 1 ? 'boss' : i === cells.length - 2 && !tower ? 'miniboss' : 'combat'));
  // upgrade one main combat room to elite
  const combatIdx = types.map((t, i) => (t === 'combat' ? i : -1)).filter((i) => i > 0);
  if (combatIdx.length) types[rng.pick(combatIdx)] = 'elite';
  // side branches
  const sideTypes: RoomType[] = tower ? ((opts.floor ?? 1) % 3 === 0 ? ['shrine', 'rest'] : []) : rng.shuffle(['treasure', 'shrine', 'rest', 'event', 'elite'] as RoomType[]).slice(0, rng.int(2, 4));
  for (const st of sideTypes) {
    const hosts = cells.map((c, i) => ({ c, i })).filter(({ i }) => types[i] !== 'boss' && types[i] !== 'entry');
    rng.shuffle(hosts);
    let placed = false;
    for (const { c, i } of hosts) {
      const opt = dirs.map(([dx, dy]) => [c[0] + dx, c[1] + dy] as [number, number]).filter(([x, y]) => x >= 0 && y >= 0 && x < GW && y < GH && !occupied.has(`${x},${y}`));
      if (!opt.length) continue;
      const p = rng.pick(opt);
      occupied.set(`${p[0]},${p[1]}`, cells.length);
      cells.push(p); types.push(st); edges.push([i, cells.length - 1]);
      placed = true; break;
    }
    if (!placed) break;
  }
  // carve rooms
  const rooms: RoomInfo[] = cells.map(([gx, gy], i) => {
    const big = types[i] === 'boss';
    const rw = big ? CS - 2 : rng.int(11, CS - 4), rh = big ? CS - 2 : rng.int(11, CS - 4);
    const x = 1 + gx * CS + Math.floor((CS - rw) / 2) + (big ? 0 : rng.int(-1, 1));
    const y = 1 + gy * CS + Math.floor((CS - rh) / 2) + (big ? 0 : rng.int(-1, 1));
    for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) tiles[yy * w + xx] = big ? 6 : 5;
    return { id: i, type: types[i]!, x, y, w: rw, h: rh, cx: x + Math.floor(rw / 2), cy: y + Math.floor(rh / 2), cell: [gx, gy] };
  });
  // pillars in larger combat rooms
  for (const r of rooms) {
    if ((r.type === 'combat' || r.type === 'elite') && r.w > 12 && r.h > 12 && rng.chance(0.6)) {
      for (const [ox, oy] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) tiles[(r.cy + oy!) * w + r.cx + ox!] = 4;
    }
  }
  // corridors (3 wide, L-shaped)
  const carve = (x: number, y: number) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const k = (y + dy) * w + x + dx; if (tiles[k] === 0) tiles[k] = 5; } };
  for (const [a, b] of edges) {
    const A = rooms[a]!, B = rooms[b]!;
    let x = A.cx, y = A.cy;
    const horizontalFirst = rng.chance(0.5);
    const stepX = () => { while (x !== B.cx) { carve(x, y); x += Math.sign(B.cx - x); } };
    const stepY = () => { while (y !== B.cy) { carve(x, y); y += Math.sign(B.cy - y); } };
    if (horizontalFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
    carve(x, y);
  }
  // re-clear pillars that ended up in corridors' paths: ensure room centers are floor
  for (const r of rooms) tiles[r.cy * w + r.cx] = r.type === 'boss' ? 6 : 5;

  const P = (tx: number, ty: number) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });
  const map: GameMap = {
    id: `dungeon_${opts.seed}`, theme: 'dungeon', w, h, tiles, spawn: P(rooms[0]!.cx, rooms[0]!.cy), interactables: [], spawns: [], rooms, edges, seed: opts.seed,
    modifiers: opts.modifiers ?? (tower ? [] : rng.shuffle(DUNGEON_MODIFIERS.map((d) => d.id)).slice(0, rng.int(1, 2))), level: opts.level,
  };
  // populate
  const roomFloor = (r: RoomInfo, margin = 2): [number, number] => {
    for (let i = 0; i < 60; i++) {
      const tx = rng.int(r.x + margin, r.x + r.w - 1 - margin), ty = rng.int(r.y + margin, r.y + r.h - 1 - margin);
      if (!SOLID.has(tiles[ty * w + tx]!)) return [tx, ty];
    }
    return [r.cx, r.cy];
  };
  const moreElites = map.modifiers.includes('elite_tide');
  const pack = (r: RoomInfo, n: number) => {
    for (let i = 0; i < n; i++) {
      const [tx, ty] = roomFloor(r);
      const e = opts.pool ? rng.pick(opts.pool) : rng.weighted(['hollow_grunt', 'hollow_archer', 'hollow_hexer'], (k) => (k === 'hollow_grunt' ? 3 : k === 'hollow_archer' ? 2 : 1));
      map.spawns.push({ enemy: e, ...P(tx, ty), room: r.id, elite: (moreElites && rng.chance(0.15)) || rng.chance(opts.eliteChance ?? 0) });
    }
  };
  for (const r of rooms) {
    switch (r.type) {
      case 'combat': pack(r, rng.int(4, 6)); break;
      case 'elite': { const [tx, ty] = roomFloor(r); map.spawns.push({ enemy: 'hollow_brute', ...P(tx, ty), room: r.id, elite: true }); pack(r, rng.int(3, 4)); break; }
      case 'miniboss': map.spawns.push({ enemy: 'hollow_captain', ...P(r.cx, r.cy), room: r.id }); pack(r, 2); break;
      case 'boss': map.spawns.push({ enemy: opts.boss ?? 'veyra', ...P(r.cx, r.cy - 2), room: r.id }); if (tower) pack(r, 2); break;
      case 'treasure': map.interactables.push({ id: `chest${r.id}`, type: 'chest', name: 'Eclipse Coffer', ...P(r.cx, r.cy), room: r.id }); pack(r, 2); break;
      case 'shrine': map.interactables.push({ id: `shrine${r.id}`, type: 'shrine', name: 'Astral Shrine', ...P(r.cx, r.cy), room: r.id }); break;
      case 'rest': map.interactables.push({ id: `fountain${r.id}`, type: 'fountain', name: 'Moonwell', ...P(r.cx, r.cy), room: r.id }); break;
      case 'event': map.interactables.push({ id: `altar${r.id}`, type: 'altar', name: 'Altar of Bargains', ...P(r.cx, r.cy), room: r.id }); pack(r, 3); break;
      default: break;
    }
  }
  return map;
}

// ───────────────────────── ANCIENT LABYRINTH (maze) ─────────────────────────
/** Recursive-backtracker maze with 3-tile corridors; the Warden waits in the cell farthest from the entry. */
export function generateLabyrinth(seed: number, level: number): GameMap {
  const rng = new Rng(seed ^ 0x4c414259);
  const CW = 11, CH = 9, CELL = 5; // each maze cell = 5 tiles (3 floor + 2 wall)
  const w = CW * CELL + 1, h = CH * CELL + 1;
  const tiles = new Array(w * h).fill(0);
  const open = (cx: number, cy: number) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) tiles[(cy * CELL + 1 + y) * w + cx * CELL + 1 + x] = 5; };
  const seen = new Set<number>([0]);
  const stack: Array<[number, number]> = [[0, CH - 1]];
  seen.clear(); seen.add((CH - 1) * CW);
  open(0, CH - 1);
  const depth = new Map<number, number>([[(CH - 1) * CW, 0]]);
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1]!;
    const nb = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).map(([dx, dy]) => [cx + dx, cy + dy] as [number, number]).filter(([x, y]) => x >= 0 && y >= 0 && x < CW && y < CH && !seen.has(y * CW + x));
    if (!nb.length) { stack.pop(); continue; }
    const [nx, ny] = rng.pick(nb);
    seen.add(ny * CW + nx);
    depth.set(ny * CW + nx, depth.get(cy * CW + cx)! + 1);
    open(nx, ny);
    // knock out the wall between cells (3 wide passage + corner)
    const x0 = Math.min(cx, nx) * CELL + 1, y0 = Math.min(cy, ny) * CELL + 1;
    if (nx !== cx) for (let y = 0; y < 4; y++) for (let x = 0; x < CELL + 4; x++) tiles[(y0 + y) * w + x0 + x] = 5;
    else for (let y = 0; y < CELL + 4; y++) for (let x = 0; x < 4; x++) tiles[(y0 + y) * w + x0 + x] = 5;
    stack.push([nx, ny]);
  }
  // a few loops so it is not a pure tree
  for (let i = 0; i < 8; i++) { const x = rng.int(1, CW - 2) * CELL, y = rng.int(1, CH - 2) * CELL + 1; for (let yy = 0; yy < 4; yy++) tiles[(y + yy) * w + x] = 5; }
  let far = 0, fd = -1;
  for (const [k, d] of depth) if (d > fd) { fd = d; far = k; }
  const P = (cx: number, cy: number) => ({ x: (cx * CELL + 3) * TILE, y: (cy * CELL + 3) * TILE });
  const bx = far % CW, by = Math.floor(far / CW);
  // widen the warden's chamber
  for (let y = -3; y <= 6; y++) for (let x = -3; x <= 6; x++) { const tx = bx * CELL + 1 + x, ty = by * CELL + 1 + y; if (tx > 0 && ty > 0 && tx < w - 1 && ty < h - 1) tiles[ty * w + tx] = 6; }
  const map: GameMap = { id: `labyrinth_${seed}`, theme: 'dungeon', w, h, tiles, spawn: P(0, CH - 1), interactables: [], spawns: [], rooms: [
    { id: 0, type: 'entry', x: 1, y: (CH - 1) * CELL + 1, w: 4, h: 4, cx: 3, cy: (CH - 1) * CELL + 3, cell: [0, CH - 1] },
    { id: 1, type: 'boss', x: bx * CELL - 2, y: by * CELL - 2, w: 10, h: 10, cx: bx * CELL + 3, cy: by * CELL + 3, cell: [bx, by] },
  ], edges: [[0, 1]], seed, modifiers: ['fortified'], level };
  map.spawns.push({ enemy: 'labyrinth_warden', ...P(bx, by), room: 1 });
  const cells = [...depth.keys()].filter((k) => k !== far && k !== (CH - 1) * CW);
  rng.shuffle(cells);
  cells.slice(0, 26).forEach((k, i) => {
    const cx = k % CW, cy = Math.floor(k / CW), p = P(cx, cy);
    if (i < 5) map.interactables.push({ id: `cache${i}`, type: 'chest', name: 'Ancient Cache', ...p });
    else if (i === 5) map.interactables.push({ id: 'lab_shrine', type: 'shrine', name: 'Astral Shrine', ...p });
    else map.spawns.push({ enemy: rng.weighted(['stone_sentry', 'hollow_grunt', 'hollow_hexer', 'hollow_archer'], (e) => (e === 'stone_sentry' ? 2 : 1)), x: p.x + rng.range(-20, 20), y: p.y + rng.range(-20, 20), elite: i % 7 === 0 });
  });
  return map;
}

// ───────────────────────── CHALLENGE ARENA / RAID ARENA ─────────────────────────
export function buildArena(kind: 'arena' | 'raid', seed: number, level: number): GameMap {
  const size = kind === 'raid' ? 34 : 26;
  const w = size, h = size;
  const tiles = new Array(w * h).fill(0);
  const c = size / 2;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (Math.hypot(x + 0.5 - c, y + 0.5 - c) < c - 1.2) tiles[y * w + x] = kind === 'raid' ? 6 : 5;
  if (kind === 'arena') for (const [dx, dy] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) tiles[(c + dy!) * w + c + dx!] = 4;
  const T = (tx: number, ty: number) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });
  const map: GameMap = { id: `${kind}_${seed}`, theme: 'dungeon', w, h, tiles, spawn: T(c, h - 4), interactables: [], spawns: [], rooms: [{ id: 0, type: kind === 'raid' ? 'boss' : 'combat', x: 1, y: 1, w: w - 2, h: h - 2, cx: c, cy: c, cell: [0, 0] }], edges: [], seed, modifiers: [], level };
  if (kind === 'raid') map.spawns.push({ enemy: 'sovereign', ...T(c, c - 3), room: 0 });
  return map;
}

// ───────────────────────── HEARTH (player housing) ─────────────────────────
const FURN_UTILITY_TYPE: Record<string, Interactable['type']> = { stash: 'stash', alchemy: 'npc_alchemist', anvil: 'npc_smith' };
export function buildHouse(ownerAccount: string, ownerName: string, house: HouseState): GameMap {
  const { w, h, doorX } = HOUSE;
  const tiles = new Array(w * h).fill(0);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) tiles[y * w + x] = 2;
  tiles[(h - 1) * w + doorX] = 2; // doorway
  const T = (tx: number, ty: number) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });
  const map: GameMap = { id: `house:${ownerAccount}`, theme: 'town', palette: 'house', w, h, tiles, spawn: T(doorX, h - 2), interactables: [{ id: 'exit', type: 'house_exit', name: `Leave ${ownerName}'s Hearth`, ...T(doorX, h - 1) }], spawns: [], rooms: [], edges: [], seed: 0, modifiers: [], level: 1 };
  house.placed.forEach((p, i) => {
    const f = FURNITURE[p.id];
    if (!f) return;
    if (f.solid) for (let y = p.y; y < p.y + f.h; y++) for (let x = p.x; x < p.x + f.w; x++) tiles[y * w + x] = 7;
    const cx = (p.x + f.w / 2) * TILE, cy = (p.y + f.h / 2) * TILE;
    if (f.utility === 'dummy') map.spawns.push({ enemy: 'dummy', x: cx, y: cy, level: 1 });
    const utilType = f.utility ? FURN_UTILITY_TYPE[f.utility] : undefined;
    map.interactables.push({ id: `f${i}`, type: utilType ?? 'furniture', name: f.name, x: cx, y: cy + (f.solid ? (f.h * TILE) / 2 + 8 : 0), furn: f.id, fw: f.w, fh: f.h, deco: !utilType });
  });
  return map;
}

/** Placement rules: inside the room, no overlap, doorway kept clear, and every utility still reachable. */
export function validatePlacement(house: HouseState, id: string, x: number, y: number): string | null {
  const f = FURNITURE[id];
  if (!f) return 'Unknown furniture';
  if (!Number.isInteger(x) || !Number.isInteger(y)) return 'Bad position';
  if (x < 1 || y < 1 || x + f.w > HOUSE.w - 1 || y + f.h > HOUSE.h - 1) return 'It does not fit there';
  if (house.placed.length >= HOUSE.maxPlaced) return `At most ${HOUSE.maxPlaced} pieces`;
  const placedOfId = house.placed.filter((p) => p.id === id).length;
  if ((house.owned[id] ?? 0) <= placedOfId) return 'You have none of that left to place';
  if (y + f.h >= HOUSE.h - 3 && x <= HOUSE.doorX + 1 && x + f.w >= HOUSE.doorX) return 'Keep the doorway clear';
  for (const p of house.placed) { const g = FURNITURE[p.id]!; if (x < p.x + g.w && x + f.w > p.x && y < p.y + g.h && y + f.h > p.y) return 'Overlaps other furniture'; }
  const next: HouseState = { ...house, placed: [...house.placed, { id, x, y }] };
  const m = buildHouse('check', 'check', next);
  const reach = reachableSet(m, m.spawn.x, m.spawn.y);
  for (const it of m.interactables) {
    if (it.deco) continue;
    const tx = Math.floor(it.x / TILE), ty = Math.floor(it.y / TILE);
    if (![[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => reach.has((ty + dy!) * m.w + tx + dx!))) return 'That would block access to something';
  }
  return null;
}

export function validateDungeon(m: GameMap): { ok: boolean; reason?: string } {
  const reach = reachableSet(m, m.spawn.x, m.spawn.y);
  for (const r of m.rooms) if (!reach.has(r.cy * m.w + r.cx)) return { ok: false, reason: `room ${r.id} unreachable` };
  for (const s of m.spawns) if (!reach.has(Math.floor(s.y / TILE) * m.w + Math.floor(s.x / TILE))) return { ok: false, reason: 'spawn unreachable' };
  for (const it of m.interactables) if (!reach.has(Math.floor(it.y / TILE) * m.w + Math.floor(it.x / TILE))) return { ok: false, reason: 'interactable unreachable' };
  if (!m.rooms.some((r) => r.type === 'boss')) return { ok: false, reason: 'no boss room' };
  return { ok: true };
}

export function roomAt(m: GameMap, px: number, py: number): RoomInfo | undefined {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  return m.rooms.find((r) => tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h);
}
