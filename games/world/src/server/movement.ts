import type { Cell } from "../shared";

/** Server-only walking state for one player; never synchronised. */
export interface Walker {
  x: number;
  y: number;
  path: Cell[];
}

/** RO sprite direction for a step: 0 = south, then clockwise (SW, W, NW, N, NE, E, SE). */
export function directionOf(dx: number, dy: number): number {
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const table: Record<string, number> = {
    "0,1": 0, "-1,1": 1, "-1,0": 2, "-1,-1": 3, "0,-1": 4, "1,-1": 5, "1,0": 6, "1,1": 7,
  };
  return table[`${sx},${sy}`] ?? 0;
}

/**
 * Advance a walker along its path by `distance` cells. Consumes waypoints as
 * they are reached and returns the facing of the last step taken, or null
 * when the walker did not move.
 */
export function advance(walker: Walker, distance: number): number | null {
  let dir: number | null = null;
  let remaining = distance;
  while (remaining > 0 && walker.path.length > 0) {
    const target = walker.path[0];
    const dx = target.x - walker.x;
    const dy = target.y - walker.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0) dir = directionOf(dx, dy);
    if (dist <= remaining) {
      walker.x = target.x;
      walker.y = target.y;
      walker.path.shift();
      remaining -= dist;
    } else {
      walker.x += (dx / dist) * remaining;
      walker.y += (dy / dist) * remaining;
      remaining = 0;
    }
  }
  return dir;
}
