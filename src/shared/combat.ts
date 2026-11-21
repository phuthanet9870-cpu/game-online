/**
 * Pure combat math. Server-only callers pass a server RNG; the client uses
 * these only for UI previews (e.g. tooltip damage ranges).
 */
import { STAT_CONFIG, type StatConfig } from './config/stats.ts';
import type { Element, HitShape } from './config/skills.ts';
import { angleBetween, dist, pointSegmentDist } from './math.ts';

export type CombatContext = 'pve' | 'pvp';

export interface AttackerStats { atk: number; critRate: number; critDmg: number; accuracy: number; armorPen: number; bossDmg?: number }
export interface DefenderStats { def: number; evasion: number; damageReduction?: number; resist?: Partial<Record<Element, number>>; pvpDR?: number; isBoss?: boolean }

export interface DamageRoll { amount: number; crit: boolean; miss: boolean }

export function mitigation(def: number, armorPen: number, cfg: StatConfig = STAT_CONFIG): number {
  const eff = Math.max(0, def * (1 - armorPen));
  return cfg.defenseConstant / (cfg.defenseConstant + eff);
}

export function hitChance(accuracy: number, evasion: number, cfg: StatConfig = STAT_CONFIG): number {
  return Math.max(cfg.minHitChance, Math.min(1, accuracy - evasion));
}

export function rollDamage(
  a: AttackerStats, d: DefenderStats, mult: number, flat: number, element: Element, ctx: CombatContext,
  rng: () => number, cfg: StatConfig = STAT_CONFIG,
): DamageRoll {
  if (rng() > hitChance(a.accuracy, d.evasion, cfg)) return { amount: 0, crit: false, miss: true };
  let dmg = a.atk * mult + flat;
  // +-8% variance
  dmg *= 0.92 + rng() * 0.16;
  const crit = rng() < a.critRate;
  if (crit) dmg *= a.critDmg;
  dmg *= mitigation(d.def, a.armorPen, cfg);
  const res = d.resist?.[element] ?? 0;
  dmg *= 1 - Math.max(-1, Math.min(0.9, res));
  if (d.isBoss && a.bossDmg) dmg *= 1 + a.bossDmg;
  let reduction = d.damageReduction ?? 0;
  if (ctx === 'pvp') {
    dmg *= cfg.pvp.damageMult;
    reduction += d.pvpDR ?? 0;
  } else dmg *= cfg.pve.damageMult;
  dmg *= 1 - Math.min(cfg.damageReductionCap, reduction);
  return { amount: Math.max(1, Math.round(dmg)), crit, miss: false };
}

/** Does a hit shape originating at (ox,oy) aimed at (ax,ay) touch a circle target? */
export function shapeHits(shape: HitShape, ox: number, oy: number, ax: number, ay: number, tx: number, ty: number, tr: number): boolean {
  switch (shape.kind) {
    case 'arc': {
      const d = dist(ox, oy, tx, ty);
      if (d > shape.range + tr) return false;
      if (d < tr + 0.2) return true;
      return angleBetween(ax, ay, tx - ox, ty - oy) <= (shape.arcDeg * Math.PI) / 360 + Math.atan2(tr, d);
    }
    case 'circle': {
      const cx = ox + ax * shape.forward, cy = oy + ay * shape.forward;
      return dist(cx, cy, tx, ty) <= shape.radius + tr;
    }
    case 'line': {
      return pointSegmentDist(tx, ty, ox, oy, ox + ax * shape.length, oy + ay * shape.length) <= shape.width / 2 + tr;
    }
    default:
      return false;
  }
}

/** Distance band [min, max] at which a basic attack of this shape connects with a target of radius r. */
export function attackBand(shape: HitShape, r = 0.35): [number, number] {
  switch (shape.kind) {
    case 'projectile': return [0, shape.range * 0.75];
    case 'arc': return [0, shape.range * 0.8 + r];
    case 'circle': return [Math.max(0, shape.forward - shape.radius * 0.7), shape.forward + shape.radius * 0.7];
    case 'line': return [0, shape.length * 0.8];
    default: return [0, 1.4];
  }
}
