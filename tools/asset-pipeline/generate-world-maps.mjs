// Generates the Phase 4 world maps (Tiled-compatible JSON, deterministic):
//   CITY-AETHERIA (Aetheria Capital), FARM-01 Greenfield Plains, FARM-02 Whispering Forest, FARM-03 Wolf Fang Valley
// plus maps/maps.json (index + start map). Run: node tools/asset-pipeline/generate-world-maps.mjs
import { writeFileSync } from 'node:fs';

const W = 64, H = 40, TS = 16;
const T = { GRASS: 0, GRASS2: 1, FLOWERS: 2, PATH: 3, WATER: 4, WALL: 5, TREE: 6, DARKGRASS: 7, SAND: 8 };
const px = (t) => t * TS + 8;

function makeMap(seed) {
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const ground = new Array(W * H).fill(T.GRASS);
  const collision = new Array(W * H).fill(0);
  const set = (x, y, t, solid = 0) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    ground[y * W + x] = t;
    collision[y * W + x] = solid;
  };
  return { rnd, ground, collision, set };
}

function border(m, keepOpen = []) {
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) {
        if (keepOpen.some(([ox, oy0, oy1]) => (x === ox || x === ox + (ox === 0 ? 1 : -1)) && y >= oy0 && y <= oy1)) m.set(x, y, T.PATH);
        else m.set(x, y, T.TREE, 1);
      }
}

const portal = (id, name, tx, ty, targetMap, targetTx, targetTy, label) => ({
  id, name, type: 'portal', x: tx * TS, y: ty * TS, width: TS * 2, height: TS * 3,
  properties: [
    { name: 'targetMap', type: 'string', value: targetMap },
    { name: 'targetX', type: 'float', value: px(targetTx) },
    { name: 'targetY', type: 'float', value: px(targetTy) },
    { name: 'label', type: 'string', value: label },
  ],
});
const npc = (id, npcId, name, tx, ty) => ({
  id, name: `npc_${npcId}`, type: 'npc', x: px(tx), y: px(ty),
  properties: [{ name: 'npcId', type: 'string', value: npcId }, { name: 'displayName', type: 'string', value: name }],
});
const spawn = (id, monsterId, tx, ty) => ({
  id, name: `${monsterId.toLowerCase()}_${id}`, type: 'monster_spawn', x: px(tx), y: px(ty),
  properties: [{ name: 'monsterId', type: 'string', value: monsterId }],
});

function write(file, mapId, displayName, props, m, objects) {
  const map = {
    type: 'map', version: '1.10', orientation: 'orthogonal', renderorder: 'right-down',
    width: W, height: H, tilewidth: TS, tileheight: TS, infinite: false,
    properties: [
      { name: 'mapId', type: 'string', value: mapId },
      { name: 'displayName', type: 'string', value: displayName },
      ...Object.entries(props).map(([name, value]) => ({ name, type: typeof value === 'number' ? 'int' : 'string', value })),
    ],
    tilesets: [{ firstgid: 1, name: 'placeholder-tiles', tilewidth: TS, tileheight: TS, tilecount: 9, columns: 9 }],
    layers: [
      { id: 1, name: 'ground', type: 'tilelayer', width: W, height: H, data: m.ground.map((t) => t + 1) },
      { id: 2, name: 'collision', type: 'tilelayer', width: W, height: H, visible: false, data: m.collision },
      { id: 3, name: 'objects', type: 'objectgroup', objects },
    ],
  };
  writeFileSync(new URL(`../../game-data/maps/${file}`, import.meta.url), JSON.stringify(map));
  console.log('wrote', file);
}

/* ------------------------------------------------------------ Aetheria */
{
  const m = makeMap(4242);
  for (let i = 0; i < W * H; i++) m.ground[i] = m.rnd() < 0.15 ? T.GRASS2 : T.GRASS;
  border(m, [[W - 1, 18, 21]]);
  // plaza (sand cobble) + roads
  for (let y = 12; y < 28; y++) for (let x = 20; x < 44; x++) m.set(x, y, T.SAND);
  for (let x = 2; x < W; x++) for (let y = 19; y <= 20; y++) m.set(x, y, T.PATH);
  for (let y = 2; y < H - 2; y++) for (let x = 31; x <= 32; x++) m.set(x, y, T.PATH);
  // fountain
  for (let y = 18; y <= 21; y++) for (let x = 30; x <= 33; x++) m.set(x, y, T.WATER, 1);
  // buildings (walls) with doors facing the plaza
  const building = (x0, y0, w, h) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) m.set(x, y, T.WALL, 1);
  };
  building(6, 5, 9, 6); // merchant hall
  building(22, 4, 8, 5); // storage
  building(36, 4, 8, 5); // blacksmith
  building(6, 28, 9, 6); // temple of the severer
  building(48, 5, 9, 7); // dungeon gate house
  building(48, 28, 9, 6); // power trial hall
  for (const [cx, cy] of [[16, 32], [44, 34], [58, 16], [4, 16]])
    for (let i = 0; i < 5; i++) m.set(cx + Math.floor(m.rnd() * 4) - 2, cy + Math.floor(m.rnd() * 4) - 2, T.TREE, 1);
  const objects = [
    { id: 1, name: 'player_spawn', type: 'player_spawn', x: px(28), y: px(23) },
    npc(2, 'merchant', 'Merchant', 10, 12),
    npc(3, 'storage', 'Storage Keeper', 26, 10),
    npc(4, 'blacksmith', 'Blacksmith', 40, 10),
    npc(5, 'severer', 'The Severer', 10, 27),
    npc(6, 'gatekeeper', 'Dungeon Gatekeeper', 52, 13),
    npc(7, 'trial', 'Power Trial Warden', 52, 27),
    npc(8, 'questboard', 'Quest Board', 35, 15),
    npc(9, 'arena', 'Arena Master', 24, 26),
    portal(20, 'to_farm01', W - 2, 18, 'FARM-01', 4, 20, 'Greenfield Plains →'),
    portal(21, 'to_training', 30, H - 2, 'DEV-TRAINING-01', 7, 19, 'Training Ground (dev) ↓'),
  ];
  // open the south road for the training-ground portal
  for (let x = 30; x <= 33; x++) for (let y = H - 2; y < H; y++) m.set(x, y, T.PATH);
  write('aetheria-capital.json', 'CITY-AETHERIA', 'Aetheria Capital', { kind: 'city', pvpPolicy: 'off', levelMin: 1, levelMax: 100 }, m, objects);
}

/* -------------------------------------------------------- farm builder */
function farm(file, mapId, name, seed, biome, westTarget, eastTarget, spawns, levelMin, levelMax) {
  const m = makeMap(seed);
  for (let i = 0; i < W * H; i++) {
    const r = m.rnd();
    m.ground[i] = biome === 'forest' ? (r < 0.35 ? T.DARKGRASS : r < 0.5 ? T.GRASS2 : T.GRASS) : biome === 'valley' ? (r < 0.25 ? T.SAND : r < 0.4 ? T.GRASS2 : T.GRASS) : r < 0.2 ? T.GRASS2 : r < 0.27 ? T.FLOWERS : T.GRASS;
  }
  border(m, [[0, 18, 21], ...(eastTarget ? [[W - 1, 18, 21]] : [])]);
  for (let x = 2; x < W - 2; x++) {
    const y = 19 + Math.round(Math.sin(x / 6 + seed) * 2);
    m.set(x, y, T.PATH);
    m.set(x, y + 1, T.PATH);
  }
  const clusters = biome === 'forest' ? 18 : biome === 'valley' ? 10 : 7;
  for (let c = 0; c < clusters; c++) {
    const cx = 6 + Math.floor(m.rnd() * (W - 12)), cy = 4 + Math.floor(m.rnd() * (H - 8));
    if (Math.abs(cy - 20) < 4) continue;
    for (let i = 0; i < 8; i++) {
      const x = cx + Math.floor(m.rnd() * 5) - 2, y = cy + Math.floor(m.rnd() * 5) - 2;
      m.set(x, y, biome === 'valley' ? T.WALL : T.TREE, 1);
    }
  }
  if (biome === 'plains') for (let y = 6; y < 12; y++) for (let x = 40; x < 50; x++) if (((x - 45) / 5) ** 2 + ((y - 9) / 3) ** 2 < 1) m.set(x, y, T.WATER, 1);
  // keep spawn tiles walkable
  for (const [, , tx, ty] of spawns) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) m.set(tx + dx, ty + dy, m.ground[(ty + dy) * W + tx + dx] === T.WALL || m.ground[(ty + dy) * W + tx + dx] === T.TREE || m.ground[(ty + dy) * W + tx + dx] === T.WATER ? T.GRASS : m.ground[(ty + dy) * W + tx + dx]);
  const objects = [
    { id: 1, name: 'player_spawn', type: 'player_spawn', x: px(4), y: px(20) },
    portal(20, 'to_west', 0, 18, westTarget[0], westTarget[1], westTarget[2], westTarget[3]),
    ...(eastTarget ? [portal(21, 'to_east', W - 2, 18, eastTarget[0], eastTarget[1], eastTarget[2], eastTarget[3])] : []),
    ...spawns.map(([id, mon, tx, ty]) => spawn(id, mon, tx, ty)),
  ];
  write(file, mapId, name, { kind: 'farm', pvpPolicy: 'off', levelMin, levelMax }, m, objects);
}

farm('farm-01.json', 'FARM-01', 'Greenfield Plains', 101, 'plains', ['CITY-AETHERIA', 60, 20, '← Aetheria Capital'], ['FARM-02', 4, 20, 'Whispering Forest →'],
  [[30, 'MON-SLIME-001', 14, 14], [31, 'MON-SLIME-001', 20, 26], [32, 'MON-SLIME-001', 26, 12], [33, 'MON-RABBIT-001', 34, 25], [34, 'MON-RABBIT-001', 40, 15], [35, 'MON-SLIME-001', 46, 27], [36, 'MON-RABBIT-001', 52, 13], [37, 'MON-SLIME-001', 56, 25]], 1, 5);
farm('farm-02.json', 'FARM-02', 'Whispering Forest', 202, 'forest', ['FARM-01', 60, 20, '← Greenfield Plains'], ['FARM-03', 4, 20, 'Wolf Fang Valley →'],
  [[30, 'MON-SPRITE-001', 14, 13], [31, 'MON-SPRITE-001', 18, 27], [32, 'MON-WOLF-001', 28, 14], [33, 'MON-SPRITE-001', 34, 26], [34, 'MON-WOLF-001', 42, 12], [35, 'MON-SPRITE-001', 48, 27], [36, 'MON-WOLF-001', 55, 15]], 4, 9);
farm('farm-03.json', 'FARM-03', 'Wolf Fang Valley', 303, 'valley', ['FARM-02', 60, 20, '← Whispering Forest'], null,
  [[30, 'MON-WOLF-001', 14, 13], [31, 'MON-WOLF-002', 20, 27], [32, 'MON-WOLF-001', 28, 12], [33, 'MON-WOLF-002', 36, 27], [34, 'MON-WOLF-001', 44, 13], [35, 'MON-WOLF-002', 50, 26], [36, 'MON-BOSS-FANG', 56, 20]], 8, 14);

writeFileSync(
  new URL('../../game-data/maps/maps.json', import.meta.url),
  JSON.stringify(
    {
      _note: 'Core world maps (count toward the LOCKED 32 = 30 farm + 2 city) plus dev/instance maps (separateInstance, not counted).',
      startMap: 'CITY-AETHERIA',
      maps: [
        { id: 'CITY-AETHERIA', file: 'aetheria-capital.json', core: true, kind: 'city' },
        { id: 'FARM-01', file: 'farm-01.json', core: true, kind: 'farm' },
        { id: 'FARM-02', file: 'farm-02.json', core: true, kind: 'farm' },
        { id: 'FARM-03', file: 'farm-03.json', core: true, kind: 'farm' },
        { id: 'DEV-TRAINING-01', file: 'training-ground.json', core: false, kind: 'dev' },
      ],
    },
    null,
    1,
  ),
);
console.log('wrote maps.json');
