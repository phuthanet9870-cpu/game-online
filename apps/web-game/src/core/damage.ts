import type { Rng } from './rng';

export type DamageContext = 'pve' | 'pvp';

export interface DamageInput {
  baseDamage: number; // attacker base attack
  weaponCoefficient: number;
  statScaling: number; // Phase 1 = 1.0 (no main stats yet)
  skillModifier: number;
  targetDefense: number;
  defenseMultiplier: number; // debuffs such as Guard Break (0.5)
  critChance: number; // 0..1
  critMultiplier: number;
  context: DamageContext;
  absorb: number; // shields (Phase 1 = 0)
}

export interface DamageConfig {
  defenseK: number; // mitigation = def / (def + K)
  maxDamage: number;
  contextModifier: Record<DamageContext, number>;
}

export const DEFAULT_DAMAGE_CONFIG: DamageConfig = {
  defenseK: 50,
  maxDamage: 999_999,
  contextModifier: { pve: 1, pvp: 0.6 }, // [TUNING]
};

export interface DamageResult {
  amount: number;
  isCrit: boolean;
  absorbed: number;
  breakdown: {
    raw: number;
    mitigation: number;
    afterDefense: number;
    afterCrit: number;
    afterContext: number;
  };
}

/**
 * Damage pipeline (spec §5.2):
 * base → weapon coefficient → stat scaling → skill modifier → target defense → critical
 * → PvE/PvP modifier → absorb → final clamped damage.
 * Pure + deterministic for a given RNG state. Server-authoritative from Phase 2.
 */
export function computeDamage(
  input: DamageInput,
  rng: Rng,
  cfg: DamageConfig = DEFAULT_DAMAGE_CONFIG,
): DamageResult {
  const raw =
    Math.max(0, input.baseDamage) * input.weaponCoefficient * input.statScaling * input.skillModifier;
  const def = Math.max(0, input.targetDefense * input.defenseMultiplier);
  const mitigation = def / (def + cfg.defenseK);
  const afterDefense = raw * (1 - mitigation);
  const isCrit = rng.next() < Math.min(1, Math.max(0, input.critChance));
  const afterCrit = isCrit ? afterDefense * input.critMultiplier : afterDefense;
  const afterContext = afterCrit * cfg.contextModifier[input.context];
  const rounded = Math.round(afterContext);
  const absorbed = Math.min(Math.max(0, input.absorb), rounded);
  const minHit = raw > 0 ? 1 : 0;
  const amount = Math.min(cfg.maxDamage, Math.max(minHit, rounded - absorbed));
  return { amount, isCrit, absorbed, breakdown: { raw, mitigation, afterDefense, afterCrit, afterContext } };
}
