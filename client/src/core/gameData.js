// Loads the data-driven definitions from /game-data and indexes them by ID.
import config from '../../../game-data/config/phase1_combat.json' with { type: 'json' };
import weapons from '../../../game-data/weapons/weapons.json' with { type: 'json' };
import weaponSkills from '../../../game-data/skills/weapon_skills.json' with { type: 'json' };
import statusEffects from '../../../game-data/skills/status_effects.json' with { type: 'json' };
import monsters from '../../../game-data/monsters/monsters.json' with { type: 'json' };
import testMap from '../../../game-data/maps/test_map_p1.json' with { type: 'json' };

export const RAW = { config, weapons, weaponSkills, statusEffects, monsters, testMap };

const byId = (arr, key) => Object.fromEntries(arr.map((o) => [o[key], o]));

export function buildRegistry(raw = RAW) {
  const reg = {
    config: raw.config,
    weapons: byId(raw.weapons.weapons, 'weapon_type_id'),
    skills: byId(raw.weaponSkills.skills, 'skill_id'),
    statusDefs: byId(raw.statusEffects.statusEffects, 'status_id'),
    monsters: byId(raw.monsters.monsters, 'monster_id'),
    map: raw.testMap,
  };
  const starter = reg.weapons[reg.config.player.starterWeapon];
  if (!starter?.implemented) throw new Error(`starter weapon ${reg.config.player.starterWeapon} is not implemented`);
  for (const id of [starter.basicAttack, ...starter.skills]) {
    const s = reg.skills[id];
    if (!s) throw new Error(`skill ${id} missing`);
    if (s.status) throw new Error(`skill ${id} is ${s.status}`);
  }
  return reg;
}
