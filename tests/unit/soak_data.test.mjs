import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../../client/src/core/simulation.js';
import { validate } from '../../tools/validators/validate-data.mjs';
import { createRng } from '../../client/src/core/rng.js';

test('game-data passes all content integrity checks', async () => {
  const { errors, passes } = await validate();
  assert.deepEqual(errors, []);
  assert.ok(passes.length > 50);
});

test('soak: 10 simulated minutes of scripted play keep every invariant', (t) => {
  const sim = new Simulation({ seed: 42 });
  const bot = createRng(7);
  const p = sim.player;
  const skills = ['SKL-WPN-SWORD-BA', 'SKL-WPN-SWORD-BA', 'SKL-WPN-SWORD-01', 'SKL-WPN-SWORD-02', 'SKL-WPN-SWORD-03'];
  let deadSince = null, maxDead = 0, sawStates = new Set();
  const TICKS = 60 * 600;
  for (let i = 0; i < TICKS; i++) {
    // bot: walk toward nearest living wolf, attack in range, sometimes dash, sometimes idle (so it can die)
    const target = sim.monsters.filter((m) => m.life.alive).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    const phase = Math.floor(i / (60 * 40)) % 3; // aggressive, aggressive, passive
    if (target && phase < 2) {
      const dx = target.x - p.x, dy = target.y - p.y, d = Math.hypot(dx, dy);
      sim.setMoveInput(p.id, d > 22 ? Math.sign(Math.round(dx / d * 2)) : 0, d > 22 ? Math.sign(Math.round(dy / d * 2)) : 0);
      if (d < 34 && i % 7 === 0) sim.requestAction(p.id, { type: 'skill', skillId: skills[Math.floor(bot.next() * skills.length)], aimAngle: Math.atan2(dy, dx) });
      if (bot.chance(0.004)) sim.requestAction(p.id, { type: 'dash' });
    } else sim.setMoveInput(p.id, 0, 0);
    sim.step();
    sim.drainEvents();

    for (const e of sim.entities.values()) {
      assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y), 'finite position');
      assert.ok(e.health.hp >= 0 && e.health.hp <= e.health.max, 'hp bounds');
      if (e.life.alive) assert.equal(sim.map.overlapsSolid(e.x, e.y, e.collisionRadius), false, `${e.id} inside a wall at tick ${i}`);
    }
    assert.ok(p.stamina.value >= 0 && p.stamina.value <= p.stamina.max);
    sawStates.add(p.life.state);
    if (p.life.state === 'DEAD' || p.life.state === 'RESPAWNING') { deadSince ??= sim.time; maxDead = Math.max(maxDead, sim.time - deadSince); }
    else deadSince = null;
  }
  t.diagnostic(`soak stats: ${JSON.stringify(sim.stats)} · max time dead ${maxDead.toFixed(2)}s`);
  const limit = sim.cfg.player.respawnDelay + sim.cfg.player.respawningDuration + 0.1;
  assert.ok(maxDead <= limit, `never stuck dead (max ${maxDead.toFixed(2)}s)`);
  assert.ok(sim.stats.kills >= 10, `bot kills: ${sim.stats.kills}`);
  assert.ok(sim.stats.deaths >= 1, `bot deaths: ${sim.stats.deaths}`);
  for (const s of ['IN_WORLD', 'IN_COMBAT', 'DEAD', 'RESPAWNING']) assert.ok(sawStates.has(s), `visited ${s}`);
});
