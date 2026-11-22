// Boss balance harness: simulates real fights in the authoritative World with bot players (gear at their level),
// mechanic-aware movement (stand in the light during Total Eclipse, step out of telegraphs) and skill usage.
// Usage: npx tsx packages/shared/scripts/balance.ts [runs]
import {
  CLASS_IDS, EQUIP_SLOTS, clearPath, findPath, Rng, World, buildArena, classSkills, createCharacter, generateDungeon, generateItem, generateLabyrinth, setLoadout, grantXp, xpToNext,
  type CharacterData, type ClassId, type DifficultyId, type GameMap, type WorldOptions, type Ent,
} from '../src/index.js';

const runs = Number(process.argv[2] ?? 6);

function geared(cls: ClassId, level: number, rng: Rng, starter = false): CharacterData {
  const r = createCharacter('bal', 'Bal' + cls.slice(0, 4) + Math.floor(rng.next() * 1e5), cls, false);
  if (!r.ok) throw new Error(r.reason);
  const ch = r.value;
  while (ch.level < level) grantXp(ch, xpToNext(ch.level));
  for (const slot of starter ? [] : EQUIP_SLOTS) {
    const s = slot.startsWith('ring') ? 'ring' : slot;
    const it = generateItem({ rng, ilvl: level, rarity: rng.chance(0.3) ? 'epic' : 'rare', cls, baseId: undefined });
    if (it.slot !== s) { const tries = 40; for (let i = 0; i < tries; i++) { const x = generateItem({ rng, ilvl: level, rarity: 'rare', cls }); if (x.slot === s && (s !== 'weapon' || x.baseId.startsWith('w_'))) { ch.equipment[slot] = x; break; } } }
    else ch.equipment[slot] = it;
  }
  const act = classSkills(cls, 'active').filter((s) => s.unlockLevel <= level).slice(0, 8).map((s) => s.id);
  const ult = classSkills(cls, 'ultimate').filter((s) => s.unlockLevel <= level).slice(0, 4).map((s) => s.id);
  while (act.length < 8) act.push(null as unknown as string);
  while (ult.length < 4) ult.push(null as unknown as string);
  setLoadout(ch, act, ult);
  return ch;
}

const RANGED = new Set(['mage', 'ranger', 'necromancer']);
function botStep(w: World, p: Ent, boss: Ent, t: number) {
  if (p.dead) return;
  const safe = w.areas.find((a) => a.shape === 'outside' && a.delay > 0);
  let tx = boss.x, ty = boss.y;
  const d = Math.hypot(boss.x - p.x, boss.y - p.y);
  const want = RANGED.has(p.p!.char.cls) ? 260 : 60;
  let mx = 0, my = 0;
  if (safe) { tx = safe.x; ty = safe.y; const dd = Math.hypot(tx - p.x, ty - p.y); if (dd > safe.r * 0.5) { mx = (tx - p.x) / dd; my = (ty - p.y) / dd; } }
  else {
    // step out of a hostile telegraph that is about to land
    const danger = w.areas.find((a) => a.team === 1 && a.delay > 0 && a.delay < 0.7 && a.shape !== 'outside' && w.inArea(a, p));
    if (danger) { const dx = p.x - danger.x, dy = p.y - danger.y, l = Math.hypot(dx, dy) || 1; mx = dx / l; my = dy / l; }
    else if (d > want) {
      if (clearPath(w.map, p.x, p.y, boss.x, boss.y, p.r)) { mx = (boss.x - p.x) / d; my = (boss.y - p.y) / d; }
      else { const path = findPath(w.map, p.x, p.y, boss.x, boss.y, 20000); const wp = path?.find((q) => Math.hypot(q[0] - p.x, q[1] - p.y) > 20); if (wp) { const l = Math.hypot(wp[0] - p.x, wp[1] - p.y) || 1; mx = (wp[0] - p.x) / l; my = (wp[1] - p.y) / l; } }
    }
  }
  w.setInput(p.id, { mx, my, ax: boss.x, ay: boss.y, attack: !safe });
  if (!safe) {
    for (let s = 0; s < 8; s++) if (p.p!.char.loadout.active[s]) w.castSkill(p.id, 'active', s, boss.x, boss.y, boss.id);
    for (let s = 0; s < 4; s++) if (p.p!.char.loadout.ultimate[s]) w.castSkill(p.id, 'ultimate', s, boss.x, boss.y, boss.id);
  }
  if (p.hp < p.maxHp * 0.4) w.usePotion(p.id);
  void t;
}

interface Scenario { starter?: boolean; name: string; boss: string; level: number; players: number; diff: DifficultyId; map: (seed: number) => GameMap; opts?: Partial<WorldOptions>; target: [number, number] }
const scenarios: Scenario[] = [
  { name: 'Veyra solo, starter gear (Normal, lv 3)', starter: true, boss: 'veyra', level: 3, players: 1, diff: 'normal', map: (s) => generateDungeon({ seed: s, level: 3, difficulty: 'normal' }), target: [60, 300] },
  { name: 'Veyra solo, starter gear (Story, lv 2)', starter: true, boss: 'veyra', level: 2, players: 1, diff: 'story', map: (s) => generateDungeon({ seed: s, level: 2, difficulty: 'story' }), target: [40, 240] },
  { name: 'Veyra solo (Rift Normal, lv 6)', boss: 'veyra', level: 6, players: 1, diff: 'normal', map: (s) => generateDungeon({ seed: s, level: 6, difficulty: 'normal' }), target: [40, 180] },
  { name: 'Veyra party of 3 (Rift Hard, lv 12)', boss: 'veyra', level: 12, players: 3, diff: 'hard', map: (s) => generateDungeon({ seed: s, level: 12, difficulty: 'hard' }), target: [40, 180] },
  { name: 'Oruk solo (Labyrinth Normal, lv 10)', boss: 'labyrinth_warden', level: 10, players: 1, diff: 'normal', map: (s) => generateLabyrinth(s, 11), target: [60, 200] },
  { name: 'Nyx raid of 4 (Normal, lv 15)', boss: 'sovereign', level: 15, players: 4, diff: 'normal', map: (s) => buildArena('raid', s, 17), opts: { noRespawn: true }, target: [120, 420] },
  { name: 'Nyx raid of 6 (Hard, lv 22)', boss: 'sovereign', level: 22, players: 6, diff: 'hard', map: (s) => buildArena('raid', s, 24), opts: { noRespawn: true }, target: [120, 420] },
];

function fight(sc: Scenario, seed: number) {
  const rng = new Rng(seed);
  const map = sc.map(seed);
  map.spawns = map.spawns.filter((s) => s.enemy === sc.boss);
  const w = new World(map, { difficulty: sc.diff, partySize: sc.players, seed, kind: 'dungeon', ...sc.opts });
  const boss = [...w.ents.values()].find((e) => e.e?.def.id === sc.boss)!;
  const players: Ent[] = [];
  for (let i = 0; i < sc.players; i++) {
    const cls = CLASS_IDS[(seed + i) % CLASS_IDS.length]!;
    const p = w.addPlayer(geared(cls, sc.level, rng, sc.starter), 's' + i, { x: boss.x + Math.cos(i) * 200, y: boss.y + 220 + Math.sin(i) * 40 });
    p.hp = p.maxHp;
    players.push(p);
  }
  boss.e!.awake = true;
  let t = 0, deaths = 0;
  const dt = 1 / 30;
  const canRespawn = !sc.opts?.noRespawn;
  while (t < 900 && w.ents.has(boss.id) && (canRespawn || !players.every((p) => p.dead))) {
    for (const p of players) botStep(w, p, boss, t);
    w.tick(dt);
    for (const ev of w.events) if (ev.t === 'player_death') deaths++;
    w.events = [];
    t += dt;
  }
  if (process.env.BAL_DEBUG) console.log('   ', sc.boss, players.map((p) => p.p!.char.cls).join('+'), 'won', !w.ents.has(boss.id), 't', t.toFixed(0), 'deaths', deaths, 'bossHp', Math.round(boss.hp / boss.maxHp * 100) + '%');
  return { time: t, won: !w.ents.has(boss.id), deaths, wiped: players.every((p) => p.dead) };
}

for (const sc of scenarios.filter((x) => !process.env.BAL_ONLY || x.boss === process.env.BAL_ONLY)) {
  const res = Array.from({ length: runs }, (_, i) => fight(sc, 1000 + i * 17));
  const wins = res.filter((r) => r.won);
  const avg = wins.length ? wins.reduce((a, r) => a + r.time, 0) / wins.length : NaN;
  const verdict = wins.length < runs * 0.5 ? 'TOO HARD' : avg < sc.target[0] ? 'TOO EASY' : avg > sc.target[1] ? 'TOO LONG' : 'OK';
  console.log(`${sc.name.padEnd(40)} win ${wins.length}/${runs}  avg kill ${isNaN(avg) ? '-' : avg.toFixed(0) + 's'}  deaths/run ${(res.reduce((a, r) => a + r.deaths, 0) / runs).toFixed(1)}  target ${sc.target[0]}-${sc.target[1]}s  → ${verdict}`);
}
