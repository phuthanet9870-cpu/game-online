import { describe, expect, it } from 'vitest';
import { axesToVector, CollisionGrid, moveWithCollision } from '../../src/core/movement';
import { vectorToDir8, DIR8, dirToVector } from '../../src/core/direction';
import { arenaMap, makeSim, run } from './helpers';

describe('8-direction input', () => {
  it('normalizes diagonals so diagonal speed equals straight speed', () => {
    const v = axesToVector({ up: true, down: false, left: false, right: true });
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 6);
    expect(v.x).toBeCloseTo(Math.SQRT1_2);
    expect(v.y).toBeCloseTo(-Math.SQRT1_2);
  });
  it('opposite keys cancel out', () => {
    expect(axesToVector({ up: true, down: true, left: true, right: true })).toEqual({ x: 0, y: 0 });
  });
  it('maps every direction vector back to itself', () => {
    for (const d of DIR8) expect(vectorToDir8(dirToVector(d), 'S')).toBe(d);
  });
  it('keeps fallback facing on zero vector', () => {
    expect(vectorToDir8({ x: 0, y: 0 }, 'NW')).toBe('NW');
  });
});

describe('collision', () => {
  const grid = new CollisionGrid(4, 4, 16, [1, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 1, 1, 1]);
  it('treats out-of-bounds as solid', () => {
    expect(grid.isSolidTile(-1, 0)).toBe(true);
    expect(grid.isSolidTile(4, 1)).toBe(true);
  });
  it('blocks movement into walls and slides along the free axis', () => {
    const r = moveWithCollision({ x: 24, y: 24 }, { x: 40, y: 3 }, 5, grid);
    expect(r.blockedX).toBe(true);
    expect(r.pos.x).toBeLessThanOrEqual(48 - 5);
    expect(r.pos.y).toBeCloseTo(27);
  });
  it('does not tunnel through a 1-tile wall with a large delta', () => {
    const map = arenaMap([], [[6, 6]]);
    const g = new CollisionGrid(map.width, map.height, 16, map.collision);
    const r = moveWithCollision({ x: 5 * 16 + 8, y: 6 * 16 + 8 }, { x: 64, y: 0 }, 5, g);
    expect(r.pos.x).toBeLessThan(6 * 16);
    expect(r.blockedX).toBe(true);
  });
  it('line of sight is blocked by walls', () => {
    const map = arenaMap([], [[6, 6]]);
    const g = new CollisionGrid(map.width, map.height, 16, map.collision);
    expect(g.hasLineOfSight({ x: 72, y: 104 }, { x: 136, y: 104 })).toBe(false);
    expect(g.hasLineOfSight({ x: 72, y: 72 }, { x: 136, y: 72 })).toBe(true);
  });
});

describe('deterministic player movement', () => {
  it('moves at moveSpeed and identical inputs give identical results', () => {
    const a = makeSim();
    const b = makeSim();
    const start = { ...a.player.pos };
    run(a, 500, { move: { x: 1, y: 0 } });
    run(b, 500, { move: { x: 1, y: 0 } });
    expect(a.player.pos).toEqual(b.player.pos);
    const moved = a.player.pos.x - start.x;
    expect(moved).toBeGreaterThan(a.player.base.moveSpeed * 0.5 - 2);
    expect(moved).toBeLessThan(a.player.base.moveSpeed * 0.5 + 2);
    expect(a.player.facing).toBe('E');
  });
  it('stops at the arena wall and records collision telemetry', () => {
    const sim = makeSim();
    run(sim, 5000, { move: { x: -1, y: 0 } });
    expect(sim.player.pos.x).toBeGreaterThanOrEqual(16 + sim.player.base.radius - 0.01);
    expect(sim.telemetry.collisionBlocks).toBeGreaterThan(0);
  });
});
