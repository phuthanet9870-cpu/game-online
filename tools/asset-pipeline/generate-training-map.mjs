// Generates the Phase 1 PLACEHOLDER training map in a Tiled-compatible JSON shape.
// Deterministic (seeded) so the committed output is reproducible:
//   node tools/asset-pipeline/generate-training-map.mjs
import { writeFileSync } from 'node:fs';

const W = 64,
  H = 40,
  TS = 16;
// Tile ids (ground layer). Collision is a separate layer.
const T = { GRASS: 0, GRASS2: 1, FLOWERS: 2, PATH: 3, WATER: 4, WALL: 5, TREE: 6, DARKGRASS: 7, SAND: 8 };

let s = 1337;
const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;

const ground = new Array(W * H).fill(T.GRASS);
const collision = new Array(W * H).fill(0);
const idx = (x, y) => y * W + x;
const set = (x, y, t, solid = 0) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  ground[idx(x, y)] = t;
  collision[idx(x, y)] = solid;
};

// base variation
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const r = rnd();
    ground[idx(x, y)] = r < 0.18 ? T.GRASS2 : r < 0.23 ? T.FLOWERS : r < 0.3 ? T.DARKGRASS : T.GRASS;
  }
// border of trees (2 thick)
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) set(x, y, T.TREE, 1);
// main path west -> east
for (let x = 2; x < W - 2; x++) {
  const y = 20 + Math.round(Math.sin(x / 7) * 2);
  for (let dy = -1; dy <= 0; dy++) set(x, y + dy, T.PATH);
}
// pond (north-west)
for (let y = 5; y < 13; y++)
  for (let x = 12; x < 24; x++) {
    const d = ((x - 18) / 6) ** 2 + ((y - 9) / 4) ** 2;
    if (d < 1) set(x, y, T.WATER, 1);
    else if (d < 1.35) set(x, y, T.SAND);
  }
// ruins wall chunks (center) with gaps so collision is testable
for (let x = 28; x < 38; x++) if (x !== 32 && x !== 33) set(x, 12, T.WALL, 1);
for (let y = 12; y < 17; y++) set(28, y, T.WALL, 1);
for (let x = 30; x < 40; x++) if (x !== 35) set(x, 28, T.WALL, 1);
for (let y = 25; y < 29; y++) set(40, y, T.WALL, 1);
// tree clusters
const clusters = [
  [8, 30],
  [46, 8],
  [52, 32],
  [22, 32],
  [56, 16],
];
for (const [cx, cy] of clusters)
  for (let i = 0; i < 9; i++) {
    const x = cx + Math.floor(rnd() * 5) - 2,
      y = cy + Math.floor(rnd() * 5) - 2;
    if (Math.abs(y - 20) > 2) set(x, y, T.TREE, 1);
  }
// a wall right next to the player spawn for the collision acceptance check
for (let y = 15; y < 19; y++) set(11, y, T.WALL, 1);

const objects = [
  { id: 1, name: 'player_spawn', type: 'player_spawn', x: 7 * TS + 8, y: 19 * TS + 8 },
  ...[
    [20, 18],
    [24, 23],
    [27, 19],
    [22, 26],
  ].map(([x, y], i) => ({
    id: 10 + i,
    name: `slime_${i + 1}`,
    type: 'monster_spawn',
    x: x * TS + 8,
    y: y * TS + 8,
    properties: [{ name: 'monsterId', type: 'string', value: 'MON-SLIME-001' }],
  })),
  ...[
    [44, 18],
    [48, 24],
  ].map(([x, y], i) => ({
    id: 20 + i,
    name: `wolf_${i + 1}`,
    type: 'monster_spawn',
    x: x * TS + 8,
    y: y * TS + 8,
    properties: [{ name: 'monsterId', type: 'string', value: 'MON-WOLF-001' }],
  })),
];

const map = {
  type: 'map',
  version: '1.10',
  orientation: 'orthogonal',
  renderorder: 'right-down',
  width: W,
  height: H,
  tilewidth: TS,
  tileheight: TS,
  infinite: false,
  properties: [
    { name: 'mapId', type: 'string', value: 'DEV-TRAINING-01' },
    { name: 'displayName', type: 'string', value: 'Training Ground (PLACEHOLDER)' },
    { name: 'placeholder', type: 'bool', value: true },
    { name: 'pvpPolicy', type: 'string', value: 'off' },
  ],
  tilesets: [
    { firstgid: 1, name: 'placeholder-tiles', tilewidth: TS, tileheight: TS, tilecount: 9, columns: 9 },
  ],
  layers: [
    { id: 1, name: 'ground', type: 'tilelayer', width: W, height: H, data: ground.map((t) => t + 1) },
    { id: 2, name: 'collision', type: 'tilelayer', width: W, height: H, visible: false, data: collision },
    { id: 3, name: 'objects', type: 'objectgroup', objects },
  ],
};
writeFileSync(new URL('../../game-data/maps/training-ground.json', import.meta.url), JSON.stringify(map));
console.log('wrote game-data/maps/training-ground.json', W, 'x', H);
