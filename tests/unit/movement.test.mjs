import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, run, place } from './helpers.mjs';
import { normalizeInput, dir8FromAngle } from '../../client/src/core/math.js';

test('diagonal input is normalised (no faster diagonals)', () => {
  const d = normalizeInput(1, 1);
  assert.ok(Math.abs(Math.hypot(d.x, d.y) - 1) < 1e-9);
});

test('all 8 directions move at the same speed', () => {
  const dirs = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  const seen = new Set();
  for (const [x, y] of dirs) {
    const sim = makeSim({ keep: 0 });
    const p = sim.player; place(p, 19 * 16 + 8, 24 * 16 + 8); // clear area: no obstacle within 2 tiles
    const x0 = p.x, y0 = p.y;
    sim.setMoveInput(p.id, x, y); run(sim, 0.5);
    const moved = Math.hypot(p.x - x0, p.y - y0);
    assert.ok(Math.abs(moved - p.speed * 0.5) < 0.5, `dir ${x},${y} moved ${moved}`);
    seen.add(dir8FromAngle(p.facing));
  }
  assert.equal(seen.size, 8, 'facing covers 8 distinct directions');
});

test('movement per tick never exceeds the speed cap', () => {
  const sim = makeSim({ keep: 0 }); const p = sim.player;
  sim.setMoveInput(p.id, 1, 1);
  for (let i = 0; i < 300; i++) {
    const x = p.x, y = p.y; sim.step();
    assert.ok(Math.hypot(p.x - x, p.y - y) <= p.speed * sim.dt + 1e-6);
  }
});

test('walls block movement (slides, never enters a solid tile)', () => {
  const sim = makeSim({ keep: 0 }); const p = sim.player; // spawn is inside a walled courtyard; west wall is tile x=3
  sim.setMoveInput(p.id, -1, 0); run(sim, 2);
  assert.ok(Math.abs(p.x - (4 * 16 + p.collisionRadius)) < 0.6, `stopped at x=${p.x}`);
  assert.equal(sim.map.overlapsSolid(p.x, p.y, p.collisionRadius), false);
});

test('garbage move input is ignored / clamped', () => {
  const sim = makeSim({ keep: 0 }); const p = sim.player;
  sim.setMoveInput(p.id, NaN, 5); assert.deepEqual(p.moveInput, { x: 0, y: 0 });
  sim.setMoveInput(p.id, 50, 0); assert.equal(p.moveInput.x, 1);
});

test('dash spends stamina, moves ~distance, and cannot tunnel through a wall', () => {
  const sim = makeSim({ keep: 0 }); const p = sim.player;
  place(p, 26 * 16, 16 * 16);
  sim.setMoveInput(p.id, 1, 0);
  const x0 = p.x;
  assert.equal(sim.requestAction(p.id, { type: 'dash' }).ok, true);
  assert.equal(p.stamina.value, 100 - sim.cfg.dash.staminaCost);
  run(sim, sim.cfg.dash.duration + 0.02); sim.setMoveInput(p.id, 0, 0);
  assert.ok(Math.abs(p.x - x0 - sim.cfg.dash.distance - p.speed * 0.02) < 3, `dash moved ${p.x - x0}`);

  const sim2 = makeSim({ keep: 0 }); const q = sim2.player; // 1 tile from the west courtyard wall
  place(q, 5 * 16 + 8, 8 * 16 + 8);
  sim2.setMoveInput(q.id, -1, 0); sim2.requestAction(q.id, { type: 'dash' }); sim2.setMoveInput(q.id, 0, 0);
  run(sim2, 0.3);
  assert.ok(q.x >= 4 * 16 + q.collisionRadius - 1e-6, `dash tunnelled to x=${q.x}`);
});

test('dash is rejected without stamina and while on cooldown', () => {
  const sim = makeSim({ keep: 0 }); const p = sim.player;
  assert.equal(sim.requestAction(p.id, { type: 'dash' }).ok, true);
  run(sim, 0.2);
  assert.equal(sim.requestAction(p.id, { type: 'dash' }).reason, 'COOLDOWN');
  p.stamina.value = 10; run(sim, 0.5); p.stamina.value = 10;
  assert.equal(sim.requestAction(p.id, { type: 'dash' }).reason, 'NO_STAMINA');
});

test('stamina regenerates only after the regen delay', () => {
  const sim = makeSim({ keep: 0 }); const p = sim.player;
  sim.requestAction(p.id, { type: 'dash' });
  const after = p.stamina.value;
  run(sim, sim.cfg.player.staminaRegenDelay - 0.05);
  assert.equal(p.stamina.value, after);
  run(sim, 1);
  assert.ok(p.stamina.value > after);
});

test('movement is locked during an attack animation', () => {
  const sim = makeSim({ keep: 0 }); const p = sim.player; place(p, 26 * 16, 16 * 16);
  sim.setMoveInput(p.id, 1, 0);
  sim.requestAction(p.id, { type: 'skill', skillId: 'SKL-WPN-SWORD-BA' });
  const x0 = p.x; run(sim, 0.2);
  assert.equal(p.x, x0);
});
