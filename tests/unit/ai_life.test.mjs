import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, run, place } from './helpers.mjs';
import { CharacterStateMachine } from '../../client/src/core/stateMachine.js';

const open = (sim) => { const p = sim.player, m = sim.monsters[0]; place(m, 26 * 16, 16 * 16); m.ai.idleFor = 999; return { p, m }; };

test('monster stays idle when the player is out of aggro range', () => {
  const sim = makeSim(); const { p, m } = open(sim); place(p, m.x + 150, m.y);
  run(sim, 1); assert.equal(m.ai.state, 'IDLE');
});

test('monster: ALERT → CHASE → ATTACK (telegraph) → damage', () => {
  const sim = makeSim(); const { p, m } = open(sim); place(p, m.x + 70, m.y);
  const seen = new Set();
  let firstDamage = null;
  for (let i = 0; i < 60 * 6 && !firstDamage; i++) {
    sim.step(); seen.add(m.ai.state);
    for (const e of sim.drainEvents()) {
      if (e.type === 'telegraph') seen.add('TELEGRAPH');
      if (e.type === 'damage' && e.targetId === p.id) firstDamage = e;
    }
  }
  for (const s of ['ALERT', 'CHASE', 'ATTACK', 'TELEGRAPH']) assert.ok(seen.has(s), `saw ${s}`);
  assert.ok(firstDamage && firstDamage.amount > 0);
  assert.ok(p.health.hp < p.health.max);
  assert.equal(p.life.state, 'IN_COMBAT');
});

test('monster does not aggro through a wall (line of sight)', () => {
  const sim = makeSim(); const p = sim.player, m = sim.monsters[0];
  place(m, 6 * 16 + 8, 2 * 16 + 8); m.ai.idleFor = 999; // north of courtyard wall row 4
  place(p, 6 * 16 + 8, 6 * 16 + 8);
  run(sim, 1.5);
  assert.equal(m.ai.state, 'IDLE');
});

test('dodging through a telegraphed bite avoids all damage (i-frames)', () => {
  const sim = makeSim(); const { p, m } = open(sim); place(p, m.x + 70, m.y);
  let dodged = false;
  for (let i = 0; i < 60 * 6; i++) {
    sim.step();
    if (m.ai.state === 'ATTACK' && m.ai.t > m.def.attack.windup - 0.05 && !dodged) { dodged = sim.requestAction(p.id, { type: 'dash' }).ok; }
    if (dodged) break;
  }
  run(sim, 0.12);
  const evs = sim.drainEvents();
  assert.ok(evs.some((e) => e.type === 'immune' && e.reason === 'DODGED') || p.health.hp === p.health.max);
  assert.equal(evs.filter((e) => e.type === 'damage' && e.targetId === p.id && e.time > evs.find((x) => x.type === 'dash').time).length, 0);
});

test('leash: monster resets to anchor and heals when pulled too far', () => {
  const sim = makeSim(); const { p, m } = open(sim);
  m.health.hp = 40; m.ai.targetId = p.id; m.ai.state = 'CHASE'; m.ai.lastSeen = sim.time;
  place(p, m.x + 400, m.y); m.x = m.anchor.x + m.def.leashRadius + 5;
  run(sim, 0.1); assert.equal(m.ai.state, 'RESET');
  assert.equal(sim.dealDamage(p, m), null, 'immune (evade) while resetting');
  run(sim, 8);
  assert.equal(m.ai.state === 'IDLE' || m.ai.state === 'PATROL', true);
  assert.equal(m.health.hp, m.health.max);
});

test('monster death → respawn at anchor after respawnTime with full HP', () => {
  const sim = makeSim(); const { p, m } = open(sim); place(p, m.x + 150, m.y);
  m.health.hp = 1; sim.dealDamage(p, m, { multiplier: 3 });
  assert.equal(m.ai.state, 'DEAD'); assert.equal(sim.stats.kills, 1);
  m.x += 30;
  run(sim, m.def.respawnTime - 0.1); assert.equal(m.ai.state, 'DEAD');
  run(sim, 0.2); assert.equal(m.ai.state, 'RESPAWN');
  assert.equal(m.health.hp, m.health.max); assert.equal(m.x, m.anchor.x);
  run(sim, 0.7); assert.notEqual(m.ai.state, 'RESPAWN');
});

test('character state machine rejects illegal transitions', () => {
  const sm = new CharacterStateMachine();
  assert.throws(() => sm.transition('DEAD'));
  sm.transition('IN_WORLD'); sm.transition('DEAD');
  assert.throws(() => sm.transition('IN_WORLD'), /illegal/);
  sm.transition('RESPAWNING'); sm.transition('IN_WORLD');
});

test('player death → DEAD (recap) → RESPAWNING → IN_WORLD with spawn protection', () => {
  const sim = makeSim(); const { p, m } = open(sim); place(p, m.x + 20, m.y);
  p.health.hp = 10;
  sim.dealDamage(m, p, { multiplier: 5, sourceName: 'Test Bite' });
  assert.equal(p.life.state, 'DEAD');
  assert.equal(p.deathRecap.killer, m.name); assert.ok(p.deathRecap.hits.length >= 1);
  assert.equal(sim.requestAction(p.id, { type: 'skill', skillId: 'SKL-WPN-SWORD-BA' }).reason, 'DEAD');
  assert.equal(sim.dealDamage(m, p), null, 'no damage to a corpse');
  run(sim, sim.cfg.player.respawnDelay + 0.05);
  assert.equal(p.life.state, 'RESPAWNING');
  assert.deepEqual([p.x, p.y], [sim.map.playerSpawn.x, sim.map.playerSpawn.y]);
  run(sim, sim.cfg.player.respawningDuration + 0.05);
  assert.equal(p.life.state, 'IN_WORLD');
  assert.equal(p.health.hp, p.health.max);
  assert.ok(p.statuses.has('SPAWN_PROTECTION'));
  assert.deepEqual(p.life.history.slice(-4), ['IN_COMBAT', 'DEAD', 'RESPAWNING', 'IN_WORLD']);
});

test('IN_COMBAT drops back to IN_WORLD after the combat timeout', () => {
  const sim = makeSim(); const { p, m } = open(sim); place(p, m.x + 200, m.y);
  sim.dealDamage(p, m); assert.equal(p.life.state, 'IN_COMBAT');
  m.health.hp = m.health.max; m.ai.state = 'IDLE'; m.ai.targetId = null; m.def = { ...m.def, aggroRadius: 0 };
  run(sim, sim.cfg.player.inCombatTimeout + 0.1);
  assert.equal(p.life.state, 'IN_WORLD');
});
