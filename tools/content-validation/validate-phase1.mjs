// Standalone content validation (no build step): node tools/content-validation/validate-phase1.mjs
// Checks the Phase 1 subset of spec §21.4 against the JSON in game-data/.
import { readFileSync } from 'node:fs';

const load = (p) => JSON.parse(readFileSync(new URL(`../../game-data/${p}`, import.meta.url), 'utf8'));
const errors = [];
const LOCKED_WEAPONS = ['bow', 'dagger', 'gauntlet', 'grimoire', 'staff', 'sword'];

const { weapons } = load('weapons/weapons.json');
const types = weapons.map((w) => w.id).sort();
if (JSON.stringify(types) !== JSON.stringify(LOCKED_WEAPONS))
  errors.push(`weapon types ${types} != ${LOCKED_WEAPONS}`);
const ids = new Set();
for (const w of weapons) {
  if (w.skills.length !== 3) errors.push(`${w.id}: ${w.skills.length} skills (must be 3)`);
  for (const s of w.skills) {
    if (ids.has(s.id)) errors.push(`duplicate skill id ${s.id}`);
    ids.add(s.id);
  }
  if (w.implemented && !w.basicAttack) errors.push(`${w.id}: implemented without basicAttack`);
}
if (ids.size !== 18) errors.push(`weapon skills total ${ids.size} != 18`);

const { monsters } = load('monsters/phase1-monsters.json');
for (const m of monsters)
  if (!(m.maxHp > 0) || !(m.leashRadius > m.aggroRadius)) errors.push(`${m.id}: invalid stats`);

const map = load('maps/training-ground.json');
const layer = (n) => map.layers.find((l) => l.name === n);
for (const n of ['ground', 'collision'])
  if (layer(n)?.data?.length !== map.width * map.height) errors.push(`map layer ${n} size`);
const objs = layer('objects')?.objects ?? [];
if (!objs.some((o) => o.type === 'player_spawn')) errors.push('map: no player_spawn');
for (const o of objs.filter((o) => o.type === 'monster_spawn')) {
  const id = o.properties?.find((p) => p.name === 'monsterId')?.value;
  if (!monsters.some((m) => m.id === id)) errors.push(`spawn ${o.name}: unknown monster ${id}`);
  const tx = Math.floor(o.x / map.tilewidth),
    ty = Math.floor(o.y / map.tileheight);
  if (layer('collision').data[ty * map.width + tx]) errors.push(`spawn ${o.name} inside a solid tile`);
}

if (errors.length) {
  console.error(`Content validation FAILED (${errors.length}):\n - ${errors.join('\n - ')}`);
  process.exit(1);
}
console.log(
  `Content validation OK: ${weapons.length} weapons / ${ids.size} weapon skills, ${monsters.length} monsters, map ${map.width}x${map.height} with ${objs.length} objects`,
);
