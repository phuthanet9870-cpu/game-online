// Seasons, weekly events and weekly objectives. Seasonal progress lives on the account and is archived at season end;
// characters, items, levels, titles and cosmetics are permanent. No seasonal reward grants combat power.

export interface SeasonReward { tier: number; kind: 'title' | 'aura' | 'dust' | 'gold' | 'respec' | 'shards'; value: string | number; label: string }
export interface SeasonDef { id: string; name: string; theme: string; mechanic: string; start: string; end: string; rewards: SeasonReward[]; permanent: string[]; resets: string[] }

export const SEASON_XP_PER_TIER = 1000;

export const SEASONS: SeasonDef[] = [
  {
    id: 's1', name: 'Season 1: The Ember Tithe', theme: 'The Cinderkin answer a call from beneath the Highlands. Every Rift now bleeds Ember Shards.',
    mechanic: 'Ember Shards drop from Rift clears, tower floors, arena waves and the world boss. Shards and Season XP advance the reward track.',
    start: '2026-11-15', end: '2027-02-15',
    rewards: [
      { tier: 1, kind: 'dust', value: 20, label: '20 Astral Dust' },
      { tier: 2, kind: 'gold', value: 300, label: '300 gold' },
      { tier: 3, kind: 'aura', value: 'ember', label: 'Aura: Ember Halo (cosmetic)' },
      { tier: 4, kind: 'respec', value: 1, label: 'Respec token' },
      { tier: 5, kind: 'title', value: 'Ember-Tithed', label: 'Title: Ember-Tithed' },
      { tier: 6, kind: 'dust', value: 40, label: '40 Astral Dust' },
      { tier: 7, kind: 'gold', value: 800, label: '800 gold' },
      { tier: 8, kind: 'aura', value: 'starlight', label: 'Aura: Starlight Ring (cosmetic)' },
      { tier: 9, kind: 'respec', value: 1, label: 'Respec token' },
      { tier: 10, kind: 'title', value: 'Keeper of the Tithe', label: 'Title: Keeper of the Tithe' },
      { tier: 12, kind: 'dust', value: 80, label: '80 Astral Dust' },
      { tier: 15, kind: 'aura', value: 'eclipse', label: 'Aura: Eclipse Corona (cosmetic)' },
      { tier: 20, kind: 'title', value: 'Sunbearer of Season One', label: 'Title: Sunbearer of Season One' },
    ],
    permanent: ['Characters, levels, mastery, items, gold and materials', 'Titles and auras earned on the track', 'Achievements and codex'],
    resets: ['Season XP and reward-track progress', 'Unspent Ember Shards', 'Weekly objective progress (resets every week)'],
  },
  {
    id: 's2', name: 'Season 2: The Glass Throne', theme: 'Shards of Nyx Aurelion\'s throne scatter across Astraea.', mechanic: 'Announced later.', start: '2027-02-15', end: '2027-05-15',
    rewards: [{ tier: 1, kind: 'dust', value: 20, label: '20 Astral Dust' }], permanent: [], resets: [],
  },
];

export function currentSeason(now: number): SeasonDef | null {
  return SEASONS.find((s) => Date.parse(s.start) <= now && now < Date.parse(s.end)) ?? null;
}

/** ISO-like week index (weeks since 2026-01-05, a Monday). Deterministic for every server and client. */
export function weekIndex(now: number): number {
  return Math.floor((now - Date.parse('2026-01-05T00:00:00Z')) / (7 * 86400_000));
}

export interface WeeklyEventDef { id: string; name: string; desc: string; effects: { shardMul?: number; goldMul?: number; xpMul?: number; eliteBonus?: number; lootBonus?: number } }
export const WEEKLY_EVENTS: WeeklyEventDef[] = [
  { id: 'ember_tide', name: 'Ember Tide', desc: 'Double Ember Shards from every source.', effects: { shardMul: 2 } },
  { id: 'golden_rifts', name: 'Golden Rifts', desc: '+50% gold from enemies and chests.', effects: { goldMul: 1.5 } },
  { id: 'elite_surge', name: 'Elite Surge', desc: 'More elites spawn in Rifts; +25% item rarity.', effects: { eliteBonus: 0.15, lootBonus: 0.25 } },
  { id: 'scholars_week', name: "Scholar's Week", desc: '+25% experience everywhere.', effects: { xpMul: 1.25 } },
];
export function weeklyEvent(now: number, override?: string | null): WeeklyEventDef {
  if (override) { const o = WEEKLY_EVENTS.find((e) => e.id === override); if (o) return o; }
  return WEEKLY_EVENTS[((weekIndex(now) % WEEKLY_EVENTS.length) + WEEKLY_EVENTS.length) % WEEKLY_EVENTS.length]!;
}

export interface WeeklyObjectiveDef { id: string; name: string; kind: 'rift_clear' | 'kills' | 'world_boss' | 'tower_floor' | 'arena_wave' | 'craft' | 'gather'; count: number; xp: number; shards: number }
const OBJECTIVE_POOL: WeeklyObjectiveDef[] = [
  { id: 'w_rifts', name: 'Clear 5 Rifts (any activity)', kind: 'rift_clear', count: 5, xp: 1500, shards: 30 },
  { id: 'w_kills', name: 'Defeat 300 enemies', kind: 'kills', count: 300, xp: 1000, shards: 20 },
  { id: 'w_boss', name: 'Help defeat the world boss', kind: 'world_boss', count: 1, xp: 1200, shards: 25 },
  { id: 'w_tower', name: 'Reach Endless Tower floor 6', kind: 'tower_floor', count: 6, xp: 1500, shards: 30 },
  { id: 'w_arena', name: 'Survive 8 arena waves', kind: 'arena_wave', count: 8, xp: 1200, shards: 25 },
  { id: 'w_craft', name: 'Craft 5 times', kind: 'craft', count: 5, xp: 800, shards: 15 },
  { id: 'w_gather', name: 'Gather 15 herbs or ore', kind: 'gather', count: 15, xp: 800, shards: 15 },
];
/** Three objectives per week, rotated deterministically. */
export function weeklyObjectives(now: number): WeeklyObjectiveDef[] {
  const w = weekIndex(now);
  const out: WeeklyObjectiveDef[] = [];
  for (let i = 0; out.length < 3; i++) { const o = OBJECTIVE_POOL[(w * 3 + i * 2) % OBJECTIVE_POOL.length]!; if (!out.includes(o)) out.push(o); }
  return out;
}

export const SHARD_SOURCES = { riftClear: 10, perTierBonus: 4, towerFloor: 3, arenaWave: 2, worldBoss: 15, raid: 60 };

export const AURAS: Record<string, { name: string; color: string }> = {
  ember: { name: 'Ember Halo', color: '#ff7a2e' }, starlight: { name: 'Starlight Ring', color: '#9fd8ff' }, eclipse: { name: 'Eclipse Corona', color: '#f2c46b' },
};

/** Live-ops configuration, editable by staff with history + rollback. Values are validated before activation. */
export interface LiveConfig {
  flags: { worldBoss: boolean; auction: boolean; trade: boolean; tower: boolean; raid: boolean; guilds: boolean };
  xpMul: number; goldMul: number; lootBonus: number;
  weeklyOverride: string | null;
  maintenance: boolean;
  motd: string;
}
export const DEFAULT_LIVE: LiveConfig = { flags: { worldBoss: true, auction: true, trade: true, tower: true, raid: true, guilds: true }, xpMul: 1, goldMul: 1, lootBonus: 0, weeklyOverride: null, maintenance: false, motd: '' };

export function validateLiveConfig(raw: unknown): { ok: true; value: LiveConfig } | { ok: false; reason: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'Config must be an object' };
  const r = raw as Record<string, any>;
  const num = (k: string, lo: number, hi: number) => { const v = r[k]; if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw new Error(`${k} must be a number between ${lo} and ${hi}`); return v; };
  try {
    const f = r.flags ?? {};
    const flags = { ...DEFAULT_LIVE.flags };
    for (const k of Object.keys(flags) as Array<keyof typeof flags>) { if (k in f) { if (typeof f[k] !== 'boolean') throw new Error(`flags.${k} must be true/false`); flags[k] = f[k]; } }
    const weekly = r.weeklyOverride ?? null;
    if (weekly !== null && !WEEKLY_EVENTS.some((e) => e.id === weekly)) throw new Error(`weeklyOverride must be null or one of ${WEEKLY_EVENTS.map((e) => e.id).join(', ')}`);
    if (typeof r.maintenance !== 'boolean') throw new Error('maintenance must be true/false');
    const motd = String(r.motd ?? '').slice(0, 300);
    return { ok: true, value: { flags, xpMul: num('xpMul', 0.5, 3), goldMul: num('goldMul', 0.5, 3), lootBonus: num('lootBonus', 0, 1), weeklyOverride: weekly, maintenance: r.maintenance, motd } };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}
