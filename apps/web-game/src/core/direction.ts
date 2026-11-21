import type { Vec2 } from './math';

/** 8 directions, index order is also the spritesheet row order. */
export const DIR8 = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'] as const;
export type Dir8 = (typeof DIR8)[number];

const DIR_VECTORS: Record<Dir8, Vec2> = {
  S: { x: 0, y: 1 },
  SE: { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  E: { x: 1, y: 0 },
  NE: { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
  N: { x: 0, y: -1 },
  NW: { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
  W: { x: -1, y: 0 },
  SW: { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
};

export const dirToVector = (d: Dir8): Vec2 => DIR_VECTORS[d];
export const dirToAngle = (d: Dir8): number => Math.atan2(DIR_VECTORS[d].y, DIR_VECTORS[d].x);

/** Snap any non-zero vector to the nearest of 8 directions; returns fallback for zero vectors. */
export function vectorToDir8(v: Vec2, fallback: Dir8): Dir8 {
  if (Math.abs(v.x) < 1e-9 && Math.abs(v.y) < 1e-9) return fallback;
  const angle = Math.atan2(v.y, v.x); // 0 = east, +PI/2 = south (screen coords)
  const octant = Math.round(angle / (Math.PI / 4)); // -4..4
  const map: Record<number, Dir8> = {
    0: 'E',
    1: 'SE',
    2: 'S',
    3: 'SW',
    4: 'W',
    [-4]: 'W',
    [-3]: 'NW',
    [-2]: 'N',
    [-1]: 'NE',
  };
  return map[octant] ?? fallback;
}
