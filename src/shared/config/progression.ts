/** Character level, EXP, rested EXP and mastery configuration. */
export interface ProgressionConfig {
  maxLevel: number;
  /** expToNext(level) = round(expBase * level ^ expExponent) */
  expBase: number;
  expExponent: number;
  /** Level difference (monster - player) beyond which EXP is penalised. */
  levelDiffFreeRange: number;
  levelDiffPenaltyPerLevel: number;
  levelDiffMinMult: number;
  rested: {
    /** Fraction of the current level's requirement gained per offline hour. */
    perOfflineHour: number;
    /** Max rested pool as a fraction of the current level's requirement. */
    maxPoolFraction: number;
    /** Extra EXP multiplier while rested pool is available (1 = +100%). */
    bonusMult: number;
    minOfflineMinutes: number;
  };
  /** Fraction of current-level EXP lost on death (never de-levels). */
  deathExpLossFraction: number;
  weaponMastery: {
    maxLevel: number;
    /** xpToNext(level) = round(base * (level+1) ^ exponent) */
    base: number;
    exponent: number;
    xpPerHit: number;
    xpPerKill: number;
    /** Damage bonus per mastery level (fraction). */
    damageBonusPerLevel: number;
  };
  /** Anti-bot / anti-farm-abuse soft cap. */
  farming: {
    killsPerHourSoftCap: number;
    /** Reward multiplier applied once over the soft cap. */
    overCapRewardMult: number;
  };
}

export const PROGRESSION: ProgressionConfig = {
  maxLevel: 100,
  expBase: 60,
  expExponent: 1.75,
  levelDiffFreeRange: 5,
  levelDiffPenaltyPerLevel: 0.12,
  levelDiffMinMult: 0.1,
  rested: { perOfflineHour: 0.05, maxPoolFraction: 1.5, bonusMult: 1.0, minOfflineMinutes: 30 },
  deathExpLossFraction: 0.02,
  weaponMastery: { maxLevel: 20, base: 40, exponent: 1.6, xpPerHit: 1, xpPerKill: 4, damageBonusPerLevel: 0.01 },
  farming: { killsPerHourSoftCap: 900, overCapRewardMult: 0.25 },
};

export function expToNext(level: number, cfg: ProgressionConfig = PROGRESSION): number {
  if (level >= cfg.maxLevel) return Infinity;
  return Math.round(cfg.expBase * Math.pow(level, cfg.expExponent));
}

export function masteryToNext(level: number, cfg: ProgressionConfig = PROGRESSION): number {
  if (level >= cfg.weaponMastery.maxLevel) return Infinity;
  return Math.round(cfg.weaponMastery.base * Math.pow(level + 1, cfg.weaponMastery.exponent));
}

/** EXP multiplier from level difference: both farming far-lower and far-higher mobs is penalised. */
export function levelDiffMult(playerLevel: number, monsterLevel: number, cfg: ProgressionConfig = PROGRESSION): number {
  const diff = Math.abs(monsterLevel - playerLevel);
  if (diff <= cfg.levelDiffFreeRange) return 1;
  return Math.max(cfg.levelDiffMinMult, 1 - (diff - cfg.levelDiffFreeRange) * cfg.levelDiffPenaltyPerLevel);
}
