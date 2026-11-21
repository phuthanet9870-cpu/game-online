import type { GameMap } from "./map";

export interface Cell {
  x: number;
  y: number;
}

const DIRS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/** Octile distance: exact cost on an empty 8-direction grid. */
function heuristic(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}

/**
 * A* over the map's cells with 8-direction movement. Diagonal steps are not
 * allowed to cut the corner of a blocked cell.
 *
 * Returns the cells to walk through, excluding `from` and ending at `to`;
 * an empty array when already there; null when unreachable or when the path
 * would be longer than `maxLength` steps.
 */
export function findPath(map: GameMap, from: Cell, to: Cell, maxLength = Infinity): Cell[] | null {
  if (!map.isWalkable(to.x, to.y) || !map.inBounds(from.x, from.y)) return null;
  if (from.x === to.x && from.y === to.y) return [];

  const w = map.width;
  const key = (x: number, y: number) => y * w + x;
  const start = key(from.x, from.y);
  const goal = key(to.x, to.y);

  const g = new Map<number, number>([[start, 0]]);
  const steps = new Map<number, number>([[start, 0]]);
  const parent = new Map<number, number>();
  const closed = new Set<number>();
  // Binary heap of [f, key].
  const open: Array<[number, number]> = [[heuristic(from.x, from.y, to.x, to.y), start]];

  const push = (item: [number, number]) => {
    open.push(item);
    let i = open.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (open[p][0] <= open[i][0]) break;
      [open[p], open[i]] = [open[i], open[p]];
      i = p;
    }
  };
  const pop = (): [number, number] => {
    const top = open[0];
    const last = open.pop()!;
    if (open.length > 0) {
      open[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < open.length && open[l][0] < open[m][0]) m = l;
        if (r < open.length && open[r][0] < open[m][0]) m = r;
        if (m === i) break;
        [open[m], open[i]] = [open[i], open[m]];
        i = m;
      }
    }
    return top;
  };

  while (open.length > 0) {
    const [, current] = pop();
    if (current === goal) break;
    if (closed.has(current)) continue;
    closed.add(current);

    const cx = current % w;
    const cy = (current - cx) / w;
    const currentSteps = steps.get(current)!;
    if (currentSteps >= maxLength) continue;

    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!map.isWalkable(nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (!map.isWalkable(cx + dx, cy) || !map.isWalkable(cx, cy + dy))) continue;
      const next = key(nx, ny);
      if (closed.has(next)) continue;
      const tentative = g.get(current)! + cost;
      if (tentative < (g.get(next) ?? Infinity)) {
        g.set(next, tentative);
        steps.set(next, currentSteps + 1);
        parent.set(next, current);
        push([tentative + heuristic(nx, ny, to.x, to.y), next]);
      }
    }
  }

  if (!parent.has(goal)) return null;
  const path: Cell[] = [];
  for (let k = goal; k !== start; k = parent.get(k)!) {
    path.push({ x: k % w, y: Math.floor(k / w) });
  }
  return path.reverse();
}
