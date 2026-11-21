/**
 * Character stat definitions and balance configuration.
 * Every number that affects balance lives here (or in other config files),
 * never inline in gameplay code. Server validates the config at boot.
 */

export const STAT_KEYS = [
  'hp', 'energy', 'stamina',
  'patk', 'matk', 'pdef', 'mdef',
  'critRate', 'critDmg', 'atkSpd', 'moveSpeed',
  'accuracy', 'evasion', 'armorPen', 'cdr', 'ccRes', 'elemRes',
  'healPower', 'bossDmg', 'pvpDR',
] as const;
export type StatKey = typeof STAT_KEYS[number];
export type Stats = Record<StatKey, number>;

export const STAT_LABELS: Record<StatKey, string> = {
  hp: 'HP', energy: 'Energy', stamina: 'Stamina',
  patk: 'Physical Attack', matk: 'Magic Attack', pdef: 'Physical Defense', mdef: 'Magic Defense',
  critRate: 'Critical Rate', critDmg: 'Critical Damage', atkSpd: 'Attack Speed', moveSpeed: 'Movement Speed',
  accuracy: 'Accuracy', evasion: 'Evasion', armorPen: 'Armor Penetration', cdr: 'Cooldown Reduction',
  ccRes: 'Crowd Control Resistance', elemRes: 'Elemental Resistance', healPower: 'Healing Power',
  bossDmg: 'Boss Damage', pvpDR: 'PvP Damage Reduction',
};

/** Stats displayed as percentages. */
export const PERCENT_STATS: ReadonlySet<StatKey> = new Set<StatKey>([
  'critRate', 'critDmg', 'accuracy', 'evasion', 'armorPen', 'cdr', 'ccRes', 'elemRes', 'bossDmg', 'pvpDR',
]);

export interface StatConfig {
  base: Stats;
  perLevel: Partial<Stats>;
  /** Hard caps (applied after all bonuses). Undefined = uncapped. */
  caps: Partial<Stats>;
  /** Defense mitigation: damage * K / (K + effectiveDef). */
  defenseConstant: number;
  /** Lowest possible hit chance after accuracy vs evasion. */
  minHitChance: number;
  /** Total damage reduction cap (block + shields excluded). */
  damageReductionCap: number;
  pve: { damageMult: number; healingMult: number };
  pvp: { damageMult: number; healingMult: number; ccDurationMult: number };
  regen: {
    energyPerSec: number;
    staminaPerSec: number;
    staminaDelayAfterUse: number;
    /** Fraction of max HP regenerated per second when out of combat. */
    hpOutOfCombatPerSec: number;
    outOfCombatAfterSec: number;
  };
  /** Collision radius of characters in tiles. */
  playerRadius: number;
}

export const STAT_CONFIG: StatConfig = {
  base: {
    hp: 220, energy: 100, stamina: 100,
    patk: 18, matk: 18, pdef: 8, mdef: 8,
    critRate: 0.05, critDmg: 1.5, atkSpd: 1.0, moveSpeed: 4.2,
    accuracy: 0.97, evasion: 0.03, armorPen: 0, cdr: 0, ccRes: 0, elemRes: 0,
    healPower: 1.0, bossDmg: 0, pvpDR: 0,
  },
  perLevel: { hp: 22, energy: 1.5, patk: 2.4, matk: 2.4, pdef: 1.3, mdef: 1.3 },
  caps: {
    critRate: 0.6, critDmg: 3.0, atkSpd: 1.8, moveSpeed: 6.5,
    evasion: 0.35, armorPen: 0.5, cdr: 0.4, ccRes: 0.6, elemRes: 0.6, pvpDR: 0.4,
  },
  defenseConstant: 120,
  minHitChance: 0.6,
  damageReductionCap: 0.75,
  pve: { damageMult: 1.0, healingMult: 1.0 },
  pvp: { damageMult: 0.55, healingMult: 0.6, ccDurationMult: 0.6 },
  regen: {
    energyPerSec: 7,
    staminaPerSec: 28,
    staminaDelayAfterUse: 0.8,
    hpOutOfCombatPerSec: 0.03,
    outOfCombatAfterSec: 6,
  },
  playerRadius: 0.3,
};
