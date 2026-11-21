// Standalone content validation (no build step): node tools/content-validation/validate-phase1.mjs
// Checks the Phase 1–2 subset of spec §21.4 against the JSON in game-data/ (the Go server re-validates on boot).
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

// Phase 2: items, drops, progression
const { items } = load('items/phase2-items.json');
const itemIds = new Set();
for (const it of items) {
  if (itemIds.has(it.id)) errors.push(`duplicate item ${it.id}`);
  itemIds.add(it.id);
  if (!/^(WPN|ARM|ACC|RUN|REL|MAT|TRD|CON|RIT|PWR|ADM|COS)-/.test(it.id)) errors.push(`item ${it.id}: unknown catalog prefix`);
  if (!(it.maxStack >= 1) || it.sellPriceGold < 0) errors.push(`item ${it.id}: invalid stack/price`);
  if (it.gmOnly && it.tradable) errors.push(`item ${it.id}: GM-only items must not be tradable`);
}
const drops = load('drops/phase2-drops.json');
for (const t of drops.tables) {
  if (!monsters.some((m) => m.id === t.monsterId)) errors.push(`drop ${t.id}: unknown monster ${t.monsterId}`);
  if (!(t.gold[0] <= t.gold[1])) errors.push(`drop ${t.id}: gold range`);
  for (const d of t.items) {
    if (!itemIds.has(d.itemId)) errors.push(`drop ${t.id}: unknown item ${d.itemId}`);
    if (!(d.chance > 0 && d.chance <= 1) || d.min > d.max) errors.push(`drop ${t.id}: bad entry ${d.itemId}`);
  }
}
const prog = load('progression/progression.json');
if (prog.maxLevel !== 100) errors.push('progression.maxLevel must be 100 [DESIGN]');
if (prog.inventorySlots !== 40) errors.push('progression.inventorySlots must be 40 [PROPOSED beginner inventory]');
if (prog.maxCharactersPerAccount !== 3) errors.push('progression.maxCharactersPerAccount must be 3 [DESIGN]');
for (const s of prog.starterItems) if (!itemIds.has(s.itemId)) errors.push(`starter item unknown ${s.itemId}`);

if (errors.length) {
  console.error(`Content validation FAILED (${errors.length}):\n - ${errors.join('\n - ')}`);
  process.exit(1);
}
console.log(
  `Content validation OK: ${weapons.length} weapons / ${ids.size} weapon skills, ${monsters.length} monsters, map ${map.width}x${map.height} with ${objs.length} objects, ${items.length} items, ${drops.tables.length} drop tables`,
);
