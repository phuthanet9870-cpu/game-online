import { STAT_CONFIG, STAT_KEYS, type StatConfig, type Stats } from './config/stats.ts';
import { itemStats, type ItemInstance } from './config/items.ts';

export function emptyStats(): Stats {
  const s = {} as Stats;
  for (const k of STAT_KEYS) s[k] = 0;
  return s;
}

/** Final stats for a character: base + level growth + equipment, then caps. */
export function computeStats(level: number, equipped: ItemInstance[], cfg: StatConfig = STAT_CONFIG): Stats {
  const s = { ...cfg.base };
  const l = Math.max(0, level - 1);
  for (const [k, v] of Object.entries(cfg.perLevel) as [keyof Stats, number][]) s[k] += v * l;
  for (const it of equipped) {
    for (const [k, v] of Object.entries(itemStats(it)) as [keyof Stats, number][]) s[k] += v;
  }
  return applyCaps(s, cfg);
}

export function applyCaps(s: Stats, cfg: StatConfig = STAT_CONFIG): Stats {
  for (const [k, cap] of Object.entries(cfg.caps) as [keyof Stats, number][]) {
    if (s[k] > cap) s[k] = cap;
  }
  for (const k of STAT_KEYS) if (s[k] < 0) s[k] = 0;
  s.hp = Math.round(s.hp);
  s.energy = Math.round(s.energy);
  s.stamina = Math.round(s.stamina);
  return s;
}
