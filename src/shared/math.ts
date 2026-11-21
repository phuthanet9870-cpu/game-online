export interface Vec2 { x: number; y: number }

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const dist2 = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};
export const dist = (ax: number, ay: number, bx: number, by: number): number => Math.sqrt(dist2(ax, ay, bx, by));

/** Normalise a vector; returns zero vector for (near) zero input. */
export function normalize(x: number, y: number): Vec2 {
  const l = Math.hypot(x, y);
  if (l < 1e-6) return { x: 0, y: 0 };
  return { x: x / l, y: y / l };
}

/** Smallest absolute angle between two directions (radians). */
export function angleBetween(ax: number, ay: number, bx: number, by: number): number {
  const a = Math.atan2(ay, ax), b = Math.atan2(by, bx);
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
}

/** Distance from point P to segment AB. */
export function pointSegmentDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax, aby = by - ay;
  const l2 = abx * abx + aby * aby;
  let t = l2 > 0 ? ((px - ax) * abx + (py - ay) * aby) / l2 : 0;
  t = clamp(t, 0, 1);
  return dist(px, py, ax + abx * t, ay + aby * t);
}

export const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
