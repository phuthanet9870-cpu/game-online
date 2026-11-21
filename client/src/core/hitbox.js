// Hitbox / hurtbox geometry. Hurtboxes are circles; melee hitboxes are arcs (sector) or circles.
import { angleDiff } from './math.js';

/** Does a circular hurtbox (tx,ty,tr) overlap a sector centred at (ox,oy) facing `facing`? */
export function arcHitsCircle(ox, oy, facing, range, halfAngle, tx, ty, tr) {
  const dx = tx - ox, dy = ty - oy;
  const d = Math.hypot(dx, dy);
  if (d > range + tr) return false;
  if (d <= tr) return true; // target overlaps the attacker origin
  const a = Math.atan2(dy, dx);
  const off = Math.abs(angleDiff(facing, a));
  // widen the sector by the angular size of the target so edge hits feel fair
  const pad = Math.asin(Math.min(1, tr / d));
  return off <= halfAngle + pad;
}

export function circleHitsCircle(ax, ay, ar, bx, by, br) {
  return Math.hypot(bx - ax, by - ay) <= ar + br;
}

export function shapeHits(shape, ox, oy, facing, target) {
  if (shape.shape === 'arc') return arcHitsCircle(ox, oy, facing, shape.range, (shape.halfAngleDeg * Math.PI) / 180, target.x, target.y, target.hurtboxRadius);
  if (shape.shape === 'circle') return circleHitsCircle(ox, oy, shape.range, target.x, target.y, target.hurtboxRadius);
  throw new Error(`unknown hit shape ${shape.shape}`);
}
