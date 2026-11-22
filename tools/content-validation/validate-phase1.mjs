// Standalone content validation (no build step): node tools/content-validation/validate-phase1.mjs
// Checks the Phase 1–3 subset of spec §21.4 against the JSON in game-data/ (the Go server re-validates on boot).
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
  if (!/^(WPN|ARM|ACC|RUN|REL|MAT|TRD|CON|RIT|PWR|ADM|COS)-/.test(it.id))
    errors.push(`item ${it.id}: unknown catalog prefix`);
  if (!(it.maxStack >= 1) || it.sellPriceGold < 0) errors.push(`item ${it.id}: invalid stack/price`);
  if (it.gmOnly && it.tradable) errors.push(`item ${it.id}: GM-only items must not be tradable`);
}
const drops = load('drops/phase2-drops.json');
for (const t of drops.tables) {
  if (!monsters.some((m) => m.id === t.monsterId))
    errors.push(`drop ${t.id}: unknown monster ${t.monsterId}`);
  if (!(t.gold[0] <= t.gold[1])) errors.push(`drop ${t.id}: gold range`);
  for (const d of t.items) {
    if (!itemIds.has(d.itemId)) errors.push(`drop ${t.id}: unknown item ${d.itemId}`);
    if (!(d.chance > 0 && d.chance <= 1) || d.min > d.max) errors.push(`drop ${t.id}: bad entry ${d.itemId}`);
  }
}
const prog = load('progression/progression.json');
if (prog.maxLevel !== 100) errors.push('progression.maxLevel must be 100 [DESIGN]');
if (prog.inventorySlots !== 40)
  errors.push('progression.inventorySlots must be 40 [PROPOSED beginner inventory]');
if (prog.maxCharactersPerAccount !== 3) errors.push('progression.maxCharactersPerAccount must be 3 [DESIGN]');
for (const s of prog.starterItems)
  if (!itemIds.has(s.itemId)) errors.push(`starter item unknown ${s.itemId}`);

// Phase 3: Powers (LOCKED 15/5/5 each, 6 initial), weapon restriction, fruit items, recipes, NPCs
const powers = load('powers/powers.json');
if (powers.powers.length !== 6) errors.push(`expected 6 initial powers, got ${powers.powers.length}`);
const skillIds = new Set();
for (const p of powers.powers) {
  if (p.active.length !== 15 || p.ultimate.length !== 5 || p.passive.length !== 5)
    errors.push(
      `power ${p.id}: ${p.active.length}/${p.ultimate.length}/${p.passive.length} (must be 15/5/5)`,
    );
  for (const sk of [...p.active, ...p.ultimate, ...p.passive]) {
    if (skillIds.has(sk.id)) errors.push(`duplicate power skill ${sk.id}`);
    skillIds.add(sk.id);
  }
  if (!itemIds.has(p.fruitItemId)) errors.push(`power ${p.id}: fruit ${p.fruitItemId} missing`);
}
if (skillIds.size !== 150) errors.push(`power skills total ${skillIds.size} != 150`);
const abyss = powers.powers.find((p) => p.id === 'abyss_shadow');
if (JSON.stringify(abyss?.allowedWeapons) !== '["dagger"]')
  errors.push('Abyss Shadow must be Dagger-only (LOCKED §7.2)');
const L = powers.loadout;
if (L.active !== 5 || L.ultimate !== 1 || L.passive !== 2) errors.push('loadout must be 5/1/2 (LOCKED)');
if (powers.proficiency.ranks.length !== 3) errors.push('proficiency must have exactly 3 ranks');
for (const r of drops.recipes ?? [])
  for (const id of [...r.inputs.map((i) => i.itemId), r.output.itemId])
    if (!itemIds.has(id)) errors.push(`recipe ${r.id}: unknown ${id}`);
for (const n of objs.filter((o) => o.type === 'npc')) {
  const tx = Math.floor(n.x / map.tilewidth),
    ty = Math.floor(n.y / map.tileheight);
  if (layer('collision').data[ty * map.width + tx]) errors.push(`npc ${n.name} inside a solid tile`);
}

// Phase 4: Trade Loot — exactly 12 sellable TRD templates per farm map that exists (LOCKED target 360 = 12 x 30)
const index = load('maps/maps.json');
const farmIds = index.maps.filter((m) => m.core && m.kind === 'farm').map((m) => m.id);
for (const f of farmIds) {
  const trd = items.filter((i) => i.category === 'TRD' && i.sourceMap === f);
  if (trd.length !== 12) errors.push(`${f}: ${trd.length} trade loot templates (must be 12)`);
  if (trd.some((i) => !(i.sellPriceGold > 0))) errors.push(`${f}: trade loot must have an NPC sell price`);
  const ml = (drops.mapLoot ?? []).find((x) => x.mapId === f);
  if (!ml || new Set(ml.items.map((x) => x.itemId)).size !== 12) errors.push(`${f}: mapLoot must roll its 12 trade loot items`);
}
for (const i of items.filter((x) => x.slot)) if (!i.stats) errors.push(`equipment ${i.id} has no stats`);
// Phase 4: quests reference real monsters/items/NPCs and existing prerequisite quests
const { quests } = load('quests/quests.json');
const qids = new Set(quests.map((q) => q.id));
const npcIds = new Set();
for (const m of index.maps) for (const o of load(`maps/${m.file}`).layers.find((l) => l.name === 'objects').objects) if (o.type === 'npc') npcIds.add(o.properties.find((p) => p.name === 'npcId').value);
for (const q of quests) {
  for (const r of q.requires) if (!qids.has(r)) errors.push(`quest ${q.id}: unknown prerequisite ${r}`);
  if (!npcIds.has(q.giver) || !npcIds.has(q.turnIn)) errors.push(`quest ${q.id}: giver/turn-in NPC missing`);
  for (const o of q.objectives) {
    if (o.type === 'kill' && o.targets.some((t) => !monsters.some((m) => m.id === t))) errors.push(`quest ${q.id}: unknown kill target`);
    if (o.type === 'collect' && !itemIds.has(o.itemId)) errors.push(`quest ${q.id}: unknown item ${o.itemId}`);
    if (o.type === 'talk' && !npcIds.has(o.npc)) errors.push(`quest ${q.id}: unknown npc ${o.npc}`);
    if (!(o.count > 0)) errors.push(`quest ${q.id}: objective count must be > 0`);
  }
  for (const it of q.rewards.items) if (!itemIds.has(it.itemId)) errors.push(`quest ${q.id}: unknown reward ${it.itemId}`);
}

if (errors.length) {
  console.error(`Content validation FAILED (${errors.length}):\n - ${errors.join('\n - ')}`);
  process.exit(1);
}
console.log(
  `Content validation OK: ${weapons.length} weapons / ${ids.size} weapon skills, ${monsters.length} monsters, map ${map.width}x${map.height} with ${objs.length} objects, ${items.length} items, ${drops.tables.length} drop tables, ${powers.powers.length} powers / ${skillIds.size} power skills, ${farmIds.length} farm maps x 12 trade loot, ${quests.length} quests`,
);
