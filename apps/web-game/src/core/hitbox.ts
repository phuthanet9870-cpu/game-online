import { angleDiff, type Vec2 } from './math';

/** Arc (cone) vs circle hurtbox test. Arc centred on `facingAngle`, total width `arcDeg`. */
export function arcHitsCircle(
  origin: Vec2,
  facingAngle: number,
  radius: number,
  arcDeg: number,
  target: Vec2,
  targetRadius: number,
): boolean {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const d = Math.hypot(dx, dy);
  if (d > radius + targetRadius) return false;
  if (d <= targetRadius) return true; // overlapping origin
  const halfArc = (arcDeg * Math.PI) / 360;
  const toTarget = Math.atan2(dy, dx);
  // widen the arc by the angular size of the target so edge hits register
  const angularPad = Math.asin(Math.min(1, targetRadius / d));
  return Math.abs(angleDiff(toTarget, facingAngle)) <= halfArc + angularPad;
}

export function circlesOverlap(a: Vec2, ra: number, b: Vec2, rb: number): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= ra + rb;
}
