import { describe, expect, it } from 'vitest';
import { computeDamage, DEFAULT_DAMAGE_CONFIG, type DamageInput } from '../../src/core/damage';
import { createRng } from '../../src/core/rng';

const base: DamageInput = {
  baseDamage: 20,
  weaponCoefficient: 1,
  statScaling: 1,
  skillModifier: 1,
  targetDefense: 0,
  defenseMultiplier: 1,
  critChance: 0,
  critMultiplier: 1.5,
  context: 'pve',
  absorb: 0,
};

describe('damage pipeline', () => {
  it('applies modifiers in order with zero defense', () => {
    const r = computeDamage({ ...base, skillModifier: 2, weaponCoefficient: 1.5 }, createRng(1));
    expect(r.amount).toBe(60);
    expect(r.isCrit).toBe(false);
  });
  it('defense mitigates with def/(def+K)', () => {
    const r = computeDamage({ ...base, targetDefense: 50 }, createRng(1));
    expect(r.breakdown.mitigation).toBeCloseTo(0.5);
    expect(r.amount).toBe(10);
  });
  it('Guard Break style defense multiplier increases damage', () => {
    const normal = computeDamage({ ...base, targetDefense: 50 }, createRng(1)).amount;
    const broken = computeDamage({ ...base, targetDefense: 50, defenseMultiplier: 0.5 }, createRng(1)).amount;
    expect(broken).toBeGreaterThan(normal);
  });
  it('crit chance 1 always crits and multiplies', () => {
    const r = computeDamage({ ...base, critChance: 1 }, createRng(1));
    expect(r.isCrit).toBe(true);
    expect(r.amount).toBe(30);
  });
  it('pvp context modifier is applied', () => {
    const r = computeDamage({ ...base, context: 'pvp' }, createRng(1));
    expect(r.amount).toBe(Math.round(20 * DEFAULT_DAMAGE_CONFIG.contextModifier.pvp));
  });
  it('clamps to [1, maxDamage] and absorb cannot heal', () => {
    expect(computeDamage({ ...base, baseDamage: 1, targetDefense: 1e9 }, createRng(1)).amount).toBe(1);
    expect(computeDamage({ ...base, baseDamage: 1e12 }, createRng(1)).amount).toBe(
      DEFAULT_DAMAGE_CONFIG.maxDamage,
    );
    const absorbed = computeDamage({ ...base, absorb: 1000 }, createRng(1));
    expect(absorbed.amount).toBe(1);
    expect(absorbed.absorbed).toBe(20);
  });
  it('is deterministic for the same seed', () => {
    const roll = (seed: number) => {
      const rng = createRng(seed);
      return Array.from({ length: 50 }, () => computeDamage({ ...base, critChance: 0.3 }, rng).isCrit);
    };
    expect(roll(7)).toEqual(roll(7));
    expect(roll(7).some(Boolean)).toBe(true);
  });
});
