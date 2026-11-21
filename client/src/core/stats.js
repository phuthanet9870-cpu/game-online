// StatCalculationService (Phase 1 subset). Deterministic: same inputs → same outputs.
const PRIMARY = ['STR', 'DEX', 'INT', 'VIT', 'AGI', 'WIS'];

function evalFormula(f, primary) {
  let v = f.base ?? 0;
  for (const k of PRIMARY) if (f[k]) v += (primary[k] ?? 0) * f[k];
  if (f.cap !== undefined) v = Math.min(v, f.cap);
  return v;
}

export function computeSecondaryStats(primary, formula, weapon) {
  for (const k of PRIMARY) if (typeof primary[k] !== 'number') throw new Error(`missing primary stat ${k}`);
  const s = {
    maxHp: Math.round(evalFormula(formula.maxHp, primary)),
    physAtk: evalFormula(formula.physAtk, primary),
    physDef: evalFormula(formula.physDef, primary),
    critChance: evalFormula(formula.critChance, primary),
    critDamage: evalFormula(formula.critDamage, primary),
  };
  if (weapon) {
    s.weaponBaseDamage = weapon.baseDamage;
    s.weaponCoefficient = weapon.coefficient;
    s.weaponStrScaling = weapon.strScaling;
  }
  return s;
}
