// Damage pipeline (Master Prompt §5.2). Returns the final number AND a step-by-step trace
// so the debug HUD / future Death Recap can show exactly where damage came from.
//
// base damage → weapon coefficient → stat scaling → skill modifier → target defense
// → critical → PvE/PvP modifier → mitigation/absorb → final clamped damage
export function computeDamage({ attacker, target, multiplier = 1, forceCrit = false, isPvp = false, rng, config, defenseMultiplier = 1 }) {
  const a = attacker.stats, t = target.stats;
  const trace = [];
  let dmg;
  if (a.weaponBaseDamage !== undefined) {
    dmg = a.weaponBaseDamage; trace.push(['base', dmg]);
    dmg *= a.weaponCoefficient; trace.push(['weaponCoef', dmg]);
    dmg += a.physAtk * a.weaponStrScaling; trace.push(['statScaling', dmg]);
  } else {
    dmg = a.physAtk; trace.push(['base', dmg]);
  }
  dmg *= multiplier; trace.push(['skillModifier', dmg]);
  const def = Math.max(0, t.physDef * defenseMultiplier);
  const reduction = def / (def + config.defenseConstant);
  dmg *= 1 - reduction; trace.push(['defense', dmg]);
  const crit = forceCrit || rng.chance(a.critChance);
  if (crit) { dmg *= a.critDamage; trace.push(['critical', dmg]); }
  dmg *= isPvp ? config.pvpModifier : config.pveModifier; trace.push([isPvp ? 'pvp' : 'pve', dmg]);
  const absorbed = Math.min(target.shield ?? 0, dmg);
  dmg -= absorbed; trace.push(['absorb', dmg]);
  const final = Math.round(Math.min(config.maxDamage, Math.max(absorbed > 0 && dmg <= 0 ? 0 : config.minDamage, dmg)));
  trace.push(['final', final]);
  return { amount: final, crit, absorbed, trace };
}
