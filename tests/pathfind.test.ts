import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPath, lineClear } from '../src/shared/pathfind.ts';
import { generateMap, isBlocked } from '../src/shared/mapgen.ts';
import { ZONES } from '../src/shared/config/zones.ts';
import { newMoveState, stepMove } from '../src/shared/movement.ts';

test('click-to-move pathfinding routes around buildings and the result is walkable by the real movement sim', () => {
  const map = generateMap(ZONES.aether_capital);
  // from the plaza to behind the General Store (blocked straight line)
  const sx = 28, sy = 33, gx = 21.5, gy = 16.5;
  assert.equal(lineClear(map, sx, sy, gx, gy), false);
  const path = findPath(map, sx, sy, gx, gy);
  assert.ok(path && path.length >= 2, 'path found');
  for (let i = 0; i < path!.length; i++) {
    const a = i === 0 ? { x: sx, y: sy } : path![i - 1];
    assert.ok(lineClear(map, a.x, a.y, path![i].x, path![i].y), `segment ${i} clear`);
  }
  // follow it with the shared movement code (what the server will do)
  const s = newMoveState(sx, sy, 100);
  const params = { speed: 4.2, maxStamina: 100, staminaRegen: 28, staminaDelayAfterUse: 0.8, radius: 0.3,
    dodge: { distance: 3, duration: 0.25, staminaCost: 30, cooldown: 0.5 }, block: { moveMult: 0.5, staminaPerSec: 12 } };
  const wps = [...path!];
  for (let t = 0; t < 400 && wps.length; t++) {
    while (wps.length && Math.hypot(wps[0].x - s.x, wps[0].y - s.y) < 0.18) wps.shift();
    if (!wps.length) break;
    const dx = wps[0].x - s.x, dy = wps[0].y - s.y, d = Math.hypot(dx, dy);
    stepMove(s, { mx: dx / d, my: dy / d, dodge: false, block: false }, params, map);
  }
  assert.ok(Math.hypot(s.x - gx, s.y - gy) < 0.5, `arrived at (${s.x.toFixed(2)}, ${s.y.toFixed(2)})`);
});

test('pathfinding into a wall snaps to nearest walkable tile; unreachable returns null', () => {
  const map = generateMap(ZONES.aether_capital);
  const p = findPath(map, 28, 33, 0.5, 0.5); // inside the city wall corner
  assert.ok(p && !isBlocked(map, p[p.length - 1].x, p[p.length - 1].y));
  const sealed = { ...map, tiles: new Uint8Array(map.tiles) };
  for (let x = 20; x < 37; x++) for (let y = 20; y < 37; y++) if (x === 20 || x === 36 || y === 20 || y === 36) sealed.tiles[y * map.w + x] = 7;
  assert.equal(findPath(sealed, 28, 33, 45, 45), null);
});
