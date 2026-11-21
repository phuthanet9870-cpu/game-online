/**
 * Grid A* (8-directional, no corner cutting) + line-of-sight smoothing.
 * Used by the client for click-to-move; the server still validates every step
 * through the normal movement simulation.
 */
import { BLOCKING, type TileMap } from './mapgen.ts';

function walkable(m: TileMap, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < m.w && y < m.h && !BLOCKING.has(m.tiles[y * m.w + x]);
}

/** True if a circle of radius r can travel straight from a to b. */
export function lineClear(m: TileMap, ax: number, ay: number, bx: number, by: number, r = 0.3): boolean {
  const d = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.ceil(d / 0.2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
    for (const [ox, oy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
      if (!walkable(m, Math.floor(x + ox), Math.floor(y + oy))) return false;
    }
  }
  return true;
}

/** Nearest walkable tile centre to (x,y) within a small radius. */
export function nearestWalkable(m: TileMap, x: number, y: number, maxR = 4): { x: number; y: number } | null {
  const cx = Math.floor(x), cy = Math.floor(y);
  if (walkable(m, cx, cy)) return { x, y };
  for (let r = 1; r <= maxR; r++) {
    let best: { x: number; y: number } | null = null, bd = Infinity;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !walkable(m, cx + dx, cy + dy)) continue;
      const px = cx + dx + 0.5, py = cy + dy + 0.5, d = (px - x) ** 2 + (py - y) ** 2;
      if (d < bd) { bd = d; best = { x: px, y: py }; }
    }
    if (best) return best;
  }
  return null;
}

/**
 * Returns waypoints from start to goal (excluding start), or null if unreachable
 * within maxExpand node expansions.
 */
export function findPath(m: TileMap, sx: number, sy: number, gx: number, gy: number, maxExpand = 6000): { x: number; y: number }[] | null {
  if (lineClear(m, sx, sy, gx, gy)) return [{ x: gx, y: gy }];
  const goal = nearestWalkable(m, gx, gy);
  if (!goal) return null;
  const s = Math.floor(sx) + Math.floor(sy) * m.w;
  const g = Math.floor(goal.x) + Math.floor(goal.y) * m.w;
  const N = m.w * m.h;
  const gScore = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const gxI = g % m.w, gyI = (g / m.w) | 0;
  const h = (i: number) => { const dx = Math.abs((i % m.w) - gxI), dy = Math.abs(((i / m.w) | 0) - gyI); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
  // binary heap of [f, idx]
  const heap: [number, number][] = [];
  const push = (f: number, i: number) => {
    heap.push([f, i]);
    let c = heap.length - 1;
    while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; }
  };
  const pop = (): number => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let c = 0;
      for (;;) {
        const l = c * 2 + 1, r = l + 1;
        let s2 = c;
        if (l < heap.length && heap[l][0] < heap[s2][0]) s2 = l;
        if (r < heap.length && heap[r][0] < heap[s2][0]) s2 = r;
        if (s2 === c) break;
        [heap[s2], heap[c]] = [heap[c], heap[s2]];
        c = s2;
      }
    }
    return top[1];
  };
  gScore[s] = 0;
  push(h(s), s);
  let expanded = 0;
  while (heap.length && expanded < maxExpand) {
    const cur = pop();
    if (closed[cur]) continue;
    if (cur === g) break;
    closed[cur] = 1;
    expanded++;
    const cx = cur % m.w, cy = (cur / m.w) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy;
      if (!walkable(m, nx, ny)) continue;
      if (dx && dy && (!walkable(m, cx + dx, cy) || !walkable(m, cx, cy + dy))) continue; // no corner cutting
      const ni = nx + ny * m.w;
      const ng = gScore[cur] + (dx && dy ? 1.414 : 1);
      if (ng < gScore[ni]) { gScore[ni] = ng; came[ni] = cur; push(ng + h(ni), ni); }
    }
  }
  if (came[g] === -1 && g !== s) return null;
  const raw: { x: number; y: number }[] = [];
  for (let i = g; i !== s && i !== -1; i = came[i]) raw.push({ x: (i % m.w) + 0.5, y: ((i / m.w) | 0) + 0.5 });
  raw.reverse();
  if (raw.length) raw[raw.length - 1] = { x: goal.x, y: goal.y };
  // string-pulling: skip waypoints that are directly visible
  const out: { x: number; y: number }[] = [];
  let ax = sx, ay = sy, i = 0;
  while (i < raw.length) {
    let j = raw.length - 1;
    while (j > i && !lineClear(m, ax, ay, raw[j].x, raw[j].y)) j--;
    out.push(raw[j]);
    ax = raw[j].x; ay = raw[j].y;
    i = j + 1;
  }
  return out;
}
