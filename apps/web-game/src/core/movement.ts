import { normalize, type Vec2 } from './math';

export interface MoveAxes {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

/** Converts digital input to a unit vector (diagonals are normalized: no faster diagonal movement). */
export function axesToVector(a: MoveAxes): Vec2 {
  const x = (a.right ? 1 : 0) - (a.left ? 1 : 0);
  const y = (a.down ? 1 : 0) - (a.up ? 1 : 0);
  return normalize({ x, y });
}

/** Tile collision grid. Out-of-bounds counts as solid. */
export class CollisionGrid {
  readonly width: number;
  readonly height: number;
  readonly tileSize: number;
  private readonly solid: Uint8Array;

  constructor(width: number, height: number, tileSize: number, solid: ArrayLike<number>) {
    if (solid.length !== width * height)
      throw new Error(`collision data length ${solid.length} != ${width * height}`);
    this.width = width;
    this.height = height;
    this.tileSize = tileSize;
    this.solid = Uint8Array.from(solid, (v) => (v ? 1 : 0));
  }

  get pixelWidth(): number {
    return this.width * this.tileSize;
  }
  get pixelHeight(): number {
    return this.height * this.tileSize;
  }

  isSolidTile(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return true;
    return this.solid[ty * this.width + tx] === 1;
  }

  /** True if an axis-aligned box centered at (cx, cy) with half extent `half` overlaps any solid tile. */
  boxCollides(cx: number, cy: number, half: number): boolean {
    const ts = this.tileSize;
    const x0 = Math.floor((cx - half) / ts);
    const x1 = Math.floor((cx + half - 1e-6) / ts);
    const y0 = Math.floor((cy - half) / ts);
    const y1 = Math.floor((cy + half - 1e-6) / ts);
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) if (this.isSolidTile(tx, ty)) return true;
    return false;
  }

  /** Line-of-sight check by sampling (good enough for the prototype; server gets a DDA version). */
  hasLineOfSight(a: Vec2, b: Vec2): boolean {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(d / (this.tileSize / 2)));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      if (this.isSolidTile(Math.floor(x / this.tileSize), Math.floor(y / this.tileSize))) return false;
    }
    return true;
  }
}

export interface MoveResult {
  pos: Vec2;
  blockedX: boolean;
  blockedY: boolean;
}

/**
 * Deterministic axis-separated movement with collision. Sub-steps so that no single step exceeds
 * a quarter tile (prevents tunnelling through 1-tile walls even during dash).
 */
export function moveWithCollision(pos: Vec2, delta: Vec2, half: number, grid: CollisionGrid): MoveResult {
  const maxStep = grid.tileSize / 4;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(delta.x), Math.abs(delta.y)) / maxStep));
  const sx = delta.x / steps;
  const sy = delta.y / steps;
  let x = pos.x;
  let y = pos.y;
  let blockedX = false;
  let blockedY = false;
  for (let i = 0; i < steps; i++) {
    if (!blockedX && sx !== 0) {
      if (grid.boxCollides(x + sx, y, half)) blockedX = true;
      else x += sx;
    }
    if (!blockedY && sy !== 0) {
      if (grid.boxCollides(x, y + sy, half)) blockedY = true;
      else y += sy;
    }
  }
  return { pos: { x, y }, blockedX, blockedY };
}
