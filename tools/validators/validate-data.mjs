// Content integrity checks for /game-data (Master Prompt §21.3). Exit code 1 on any failure.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const load = async (p) => JSON.parse(await readFile(path.join(root, 'game-data', p), 'utf8'));
const errors = [], passes = [];
const check = (cond, msg) => (cond ? passes.push(msg) : errors.push(msg));

export async function validate() {
  const weapons = (await load('weapons/weapons.json')).weapons;
  const skills = (await load('skills/weapon_skills.json')).skills;
  const powersDoc = await load('powers/powers.json');
  const maps = (await load('maps/core_maps.json')).maps;
  const testMap = await load('maps/test_map_p1.json');
  const monsters = (await load('monsters/monsters.json')).monsters;
  const statuses = (await load('skills/status_effects.json')).statusEffects;
  const config = await load('config/phase1_combat.json');

  // weapons: exactly 6 LOCKED types, 3 unique active skills each
  const LOCKED_WEAPONS = ['Staff', 'Sword', 'Dagger', 'Bow', 'Grimoire', 'Gauntlet'];
  check(weapons.length === 6, `weapon types = 6 (got ${weapons.length})`);
  check(JSON.stringify(weapons.map((w) => w.name).sort()) === JSON.stringify([...LOCKED_WEAPONS].sort()), 'weapon names match LOCKED list');
  const skillIds = new Set(skills.map((s) => s.skill_id));
  check(skillIds.size === skills.length, 'skill IDs unique');
  for (const w of weapons) {
    const act = skills.filter((s) => s.weaponType === w.weapon_type_id && s.slot === 'active');
    check(act.length === 3, `${w.name}: exactly 3 active skills (got ${act.length})`);
    check(w.skills.length === 3 && w.skills.every((id) => act.some((s) => s.skill_id === id)), `${w.name}: weapon skill refs resolve`);
    if (w.implemented) {
      check(!!w.basicAttack && skillIds.has(w.basicAttack), `${w.name}: basic attack defined`);
      for (const id of w.skills) { const s = skills.find((x) => x.skill_id === id); check(!s.status && Array.isArray(s.hits), `${w.name}: ${s.name} has runtime definition`); }
    }
  }
  check(skills.filter((s) => s.slot === 'active').length === 18, 'total weapon active skills = 18');

  // powers: 15/5/5, no awakening/evolution, valid weapon compatibility
  const wNames = new Set(LOCKED_WEAPONS);
  check(powersDoc.powers.length === 6, `starting powers = 6 (got ${powersDoc.powers.length})`);
  const lim = powersDoc.loadoutLimits;
  check(lim.active === 5 && lim.ultimate === 1 && lim.passive === 2, 'power loadout limits = 5/1/2');
  let powerSkillTotal = 0;
  const allPowerSkillIds = new Set();
  for (const p of powersDoc.powers) {
    check(p.activeSkills.length === 15 && p.ultimateSkills.length === 5 && p.passiveSkills.length === 5, `${p.name}: 15/5/5 skills`);
    check(p.awakening === false && p.evolution === false, `${p.name}: no awakening / evolution`);
    check(p.allowedWeapons.length > 0 && p.allowedWeapons.every((w) => wNames.has(w)), `${p.name}: weapon compatibility valid`);
    for (const s of [...p.activeSkills, ...p.ultimateSkills, ...p.passiveSkills]) { allPowerSkillIds.add(s.skill_id); powerSkillTotal++; }
  }
  check(powerSkillTotal === 150 && allPowerSkillIds.size === 150, `power skills = 150 unique (got ${allPowerSkillIds.size})`);
  check(JSON.stringify(powersDoc.powers.find((p) => p.name === 'Abyss Shadow').allowedWeapons) === '["Dagger"]', 'Abyss Shadow is Dagger-only');

  // core world: exactly 32 = 30 farms + 2 cities
  check(maps.length === 32, `core maps = 32 (got ${maps.length})`);
  check(maps.filter((m) => m.type === 'FARM').length === 30, 'farm maps = 30');
  check(maps.filter((m) => m.type === 'CITY').length === 2, 'cities = 2');
  check(new Set(maps.map((m) => m.map_id)).size === 32, 'core map IDs unique');
  check(maps.filter((m) => m.worldBossPortalEligible).every((m) => m.type === 'FARM'), 'world boss portals only eligible on farm maps');
  check(maps.filter((m) => m.type === 'CITY').every((m) => m.pvpPolicy === 'OFF'), 'cities are PvP OFF');
  const farm = (n) => maps.find((m) => m.farm_code === `FARM-${String(n).padStart(2, '0')}`);
  check([1, 2, 3, 4, 5].every((n) => farm(n).pvpPolicy === 'SAFE_FARM'), 'FARM-01..05 SAFE_FARM');
  check(Array.from({ length: 20 }, (_, i) => i + 6).every((n) => farm(n).pvpPolicy === 'CONTESTED'), 'FARM-06..25 CONTESTED');
  check([26, 27, 28, 29, 30].every((n) => farm(n).pvpPolicy === 'WAR_ZONE'), 'FARM-26..30 WAR_ZONE');
  check(testMap.isCoreMap === false && !maps.some((m) => m.map_id === testMap.map_id), 'Phase 1 test map is NOT a core map');

  // test map integrity
  check(testMap.layout.length === testMap.height && testMap.layout.every((r) => r.length === testMap.width), 'test map dimensions consistent');
  const flat = testMap.layout.join('');
  check([...flat].every((c) => testMap.legend[c]), 'test map uses only legend tiles');
  check((flat.match(/P/g) ?? []).length === 1, 'test map has exactly 1 player spawn');
  const monsterIds = new Set(monsters.map((m) => m.monster_id));
  check(Object.values(testMap.legend).filter((l) => l.monsterId).every((l) => monsterIds.has(l.monsterId)), 'monster anchors reference defined monsters');
  check(testMap.layout[0].split('').every((c) => testMap.legend[c].solid) && testMap.layout.at(-1).split('').every((c) => testMap.legend[c].solid), 'test map border is solid');

  // statuses referenced by skills exist
  const statusIds = new Set(statuses.map((s) => s.status_id));
  for (const s of skills) for (const h of s.hits ?? []) for (const a of h.applyStatus ?? []) check(statusIds.has(a.status), `${s.name}: status ${a.status} defined`);
  check(monsters.length === 1, 'Phase 1 scope: exactly 1 monster type');
  check(weapons.find((w) => w.weapon_type_id === config.player.starterWeapon)?.implemented === true, 'starter weapon is implemented');
  return { errors, passes };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { errors, passes } = await validate();
  console.log(`data validation: ${passes.length} passed, ${errors.length} failed`);
  for (const e of errors) console.log(`  FAIL ${e}`);
  process.exit(errors.length ? 1 : 0);
}
