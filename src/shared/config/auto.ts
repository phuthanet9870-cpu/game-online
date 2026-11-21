/** Auto Farm rules (PART 22). All limits are enforced on the server. */
export const AUTO_CONFIG = {
  /** Monster tiers auto combat may target. Bosses/dungeon/world bosses are never allowed. */
  allowedTiers: ['normal', 'elite'] as const,
  /** Rewards from elites killed by auto are reduced (elites are meant to be fought manually). */
  eliteRewardMult: 0.5,
  minRadius: 4,
  maxRadius: 30,
  /** Hard cap on auto kills per rolling hour; auto stops when reached. */
  hourlyKillCap: 600,
  maxSessionMinutes: 240,
  /** Re-plan path to target at most this often (seconds). */
  repathSec: 0.5,
  lootRadius: 8,
};

export type AutoLootFilter = { gold: boolean; materials: boolean; consumables: boolean; equipmentMinRarity: 'none' | 'common' | 'uncommon' | 'rare' | 'epic' };

export interface AutoSettings {
  /** Monster def ids to hunt; empty = any allowed monster. */
  targets: string[];
  radius: number;
  allowElite: boolean;
  /** Use weapon skill slots 1-3 and heavy attack in rotation. */
  useSkills: [boolean, boolean, boolean];
  useHeavy: boolean;
  /** Potion thresholds in percent (0 = never). */
  hpPotionPct: number;
  enPotionPct: number;
  loot: AutoLootFilter;
  stop: { minutes: number; kills: number; whenBagFull: boolean; whenOutOfPotions: boolean };
}

export const DEFAULT_AUTO: AutoSettings = {
  targets: [], radius: 12, allowElite: false, useSkills: [true, true, false], useHeavy: true,
  hpPotionPct: 40, enPotionPct: 20,
  loot: { gold: true, materials: true, consumables: true, equipmentMinRarity: 'common' },
  stop: { minutes: 0, kills: 0, whenBagFull: true, whenOutOfPotions: false },
};

/** Validate and clamp client-provided settings. Returns null if malformed. */
export function sanitizeAuto(raw: unknown): AutoSettings | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  const targets = Array.isArray(o.targets) ? o.targets.filter((t): t is string => typeof t === 'string' && t.length <= 64).slice(0, 20) : [];
  const us = Array.isArray(o.useSkills) ? o.useSkills : [];
  const loot = (o.loot && typeof o.loot === 'object' ? o.loot : {}) as Record<string, unknown>;
  const stop = (o.stop && typeof o.stop === 'object' ? o.stop : {}) as Record<string, unknown>;
  const rar = ['none', 'common', 'uncommon', 'rare', 'epic'].includes(String(loot.equipmentMinRarity)) ? (loot.equipmentMinRarity as AutoLootFilter['equipmentMinRarity']) : 'common';
  return {
    targets,
    radius: num(o.radius, AUTO_CONFIG.minRadius, AUTO_CONFIG.maxRadius, DEFAULT_AUTO.radius),
    allowElite: bool(o.allowElite, false),
    useSkills: [bool(us[0], true), bool(us[1], true), bool(us[2], false)],
    useHeavy: bool(o.useHeavy, true),
    hpPotionPct: num(o.hpPotionPct, 0, 90, 40),
    enPotionPct: num(o.enPotionPct, 0, 90, 20),
    loot: { gold: bool(loot.gold, true), materials: bool(loot.materials, true), consumables: bool(loot.consumables, true), equipmentMinRarity: rar },
    stop: {
      minutes: num(stop.minutes, 0, AUTO_CONFIG.maxSessionMinutes, 0),
      kills: Math.floor(num(stop.kills, 0, 100000, 0)),
      whenBagFull: bool(stop.whenBagFull, true),
      whenOutOfPotions: bool(stop.whenOutOfPotions, false),
    },
  };
}
