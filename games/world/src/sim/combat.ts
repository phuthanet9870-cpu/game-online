/** Anything that can hit or be hit. Players get these from PLAYER_BASE until MVP 3 adds stats. */
export interface CombatStats {
  atk: readonly [number, number];
  def: number;
  hit: number;
  flee: number;
}

export type Rng = () => number;

export interface HitResult {
  hit: boolean;
  damage: number;
}

/** Chance to hit, as a fraction: 80% at equal HIT and FLEE, clamped to 5%–95%. */
export function hitChance(attacker: CombatStats, defender: CombatStats): number {
  return Math.min(95, Math.max(5, 80 + attacker.hit - defender.flee)) / 100;
}

/** One basic attack. Damage is a roll in the ATK range minus DEF, at least 1. */
export function rollAttack(attacker: CombatStats, defender: CombatStats, rng: Rng): HitResult {
  if (rng() >= hitChance(attacker, defender)) return { hit: false, damage: 0 };
  const [lo, hi] = attacker.atk;
  const raw = lo + Math.floor(rng() * (hi - lo + 1));
  return { hit: true, damage: Math.max(1, raw - defender.def) };
}

/** Chebyshev distance in cells between two positions (cell units). */
export function cellDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(Math.abs(Math.round(a.x) - Math.round(b.x)), Math.abs(Math.round(a.y) - Math.round(b.y)));
}

/** Deterministic PRNG for tests and replays (mulberry32). */
export function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
