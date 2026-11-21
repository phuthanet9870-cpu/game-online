import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, run, place, freeze } from './helpers.mjs';
import { arcHitsCircle } from '../../client/src/core/hitbox.js';
import { computeDamage } from '../../client/src/core/damage.js';
import { createRng } from '../../client/src/core/rng.js';

const BA = 'SKL-WPN-SWORD-BA', TRIPLE = 'SKL-WPN-SWORD-01', GB = 'SKL-WPN-SWORD-02', COUNTER = 'SKL-WPN-SWORD-03';
const setup = (dx = 20, dy = 0) => {
  const sim = makeSim({ keep: 1 }); const p = sim.player, m = sim.monsters[0];
  place(p, 26 * 16, 16 * 16); p.facing = Math.atan2(dy, dx); place(m, p.x + dx, p.y + dy); freeze(m);
  return { sim, p, m };
};
const damageEvents = (sim) => sim.drainEvents().filter((e) => e.type === 'damage');

test('arc hitbox geometry: in front hits, behind misses, out of range misses', () => {
  assert.equal(arcHitsCircle(0, 0, 0, 30, Math.PI / 3, 20, 0, 6), true);
  assert.equal(arcHitsCircle(0, 0, 0, 30, Math.PI / 3, -20, 0, 6), false);
  assert.equal(arcHitsCircle(0, 0, 0, 30, Math.PI / 3, 45, 0, 6), false);
  assert.equal(arcHitsCircle(0, 0, 0, 30, Math.PI / 3, 0, 20, 6), false);
});

test('basic attack hits exactly once per swing and reduces HP', () => {
  const { sim, p, m } = setup();
  assert.equal(sim.requestAction(p.id, { type: 'skill', skillId: BA }).ok, true);
  run(sim, 0.5);
  const d = damageEvents(sim);
  assert.equal(d.length, 1);
  assert.equal(m.health.hp, m.health.max - d[0].amount);
});

test('attack facing away from the target misses', () => {
  const { sim, p } = setup(); p.facing = Math.PI;
  sim.requestAction(p.id, { type: 'skill', skillId: BA }); run(sim, 0.5);
  assert.equal(damageEvents(sim).length, 0);
});

test('no hits through walls (line of sight)', () => {
  const sim = makeSim({ keep: 1 }); const p = sim.player, m = sim.monsters[0];
  // courtyard north wall is row y=4; player inside (row 5), monster outside (row 3)
  place(p, 6 * 16 + 8, 5 * 16 + 4); place(m, 6 * 16 + 8, 3 * 16 + 10); freeze(m); p.facing = -Math.PI / 2;
  assert.ok(Math.hypot(m.x - p.x, m.y - p.y) < 30 + m.hurtboxRadius, 'target is within raw range');
  sim.requestAction(p.id, { type: 'skill', skillId: BA }); run(sim, 0.5);
  assert.equal(damageEvents(sim).length, 0);
});

test('cooldown and stamina are enforced by the simulation', () => {
  const { sim, p } = setup();
  assert.equal(sim.requestAction(p.id, { type: 'skill', skillId: GB }).ok, true);
  run(sim, 0.8);
  const r = sim.requestAction(p.id, { type: 'skill', skillId: GB });
  assert.equal(r.reason, 'COOLDOWN'); assert.ok(r.remaining > 7);
  p.stamina.value = 5; p.stamina.sinceSpend = 0;
  assert.equal(sim.requestAction(p.id, { type: 'skill', skillId: TRIPLE }).reason, 'NO_STAMINA');
});

test('actions cannot overlap before the cancel window; can after', () => {
  const { sim, p } = setup();
  sim.requestAction(p.id, { type: 'skill', skillId: BA }); run(sim, 0.1);
  assert.equal(sim.requestAction(p.id, { type: 'skill', skillId: BA }).reason, 'BUSY');
  run(sim, 0.2);
  assert.equal(sim.requestAction(p.id, { type: 'dash' }).ok, true, 'dash cancels recovery');
});

test('invalid requests are rejected: other weapon skill, planned skill, NaN aim, unknown actor', () => {
  const { sim, p } = setup();
  assert.equal(sim.requestAction(p.id, { type: 'skill', skillId: 'SKL-WPN-BOW-01' }).reason, 'NOT_EQUIPPED');
  assert.equal(sim.requestAction(p.id, { type: 'skill', skillId: BA, aimAngle: NaN }).reason, 'BAD_REQUEST');
  assert.equal(sim.requestAction('CHR-HACKER', { type: 'skill', skillId: BA }).reason, 'UNKNOWN_ACTOR');
  assert.equal(sim.requestAction(p.id, { type: 'skill', skillId: 'NOPE' }).reason, 'BAD_REQUEST');
});

test('Triple Slash lands three separate hits', () => {
  const { sim, p } = setup(22);
  sim.requestAction(p.id, { type: 'skill', skillId: TRIPLE }); run(sim, 0.9);
  assert.equal(damageEvents(sim).length, 3);
});

test('Guard Break stuns, applies Guard Broken, and raises follow-up damage', () => {
  const a = setup(22), b = setup(22);
  // baseline basic attack (forced non-crit by zero crit chance)
  a.p.stats.critChance = 0; b.p.stats.critChance = 0;
  a.sim.requestAction(a.p.id, { type: 'skill', skillId: BA }); run(a.sim, 0.5);
  const base = damageEvents(a.sim)[0].amount;
  b.sim.requestAction(b.p.id, { type: 'skill', skillId: GB }); run(b.sim, 0.75);
  assert.ok(b.m.statuses.has('STUN') && b.m.statuses.has('GUARD_BROKEN'));
  assert.equal(b.sim.combatState(b.m), 'CC');
  b.sim.drainEvents();
  b.sim.requestAction(b.p.id, { type: 'skill', skillId: BA }); run(b.sim, 0.5);
  assert.ok(damageEvents(b.sim)[0].amount > base, 'more damage while guard is broken');
});

test('stun has diminishing returns', () => {
  const { sim, m } = setup();
  const d = [1, 2, 3, 4].map(() => { const v = m.statuses.apply('STUN', 1, 'x'); m.statuses.remove('STUN'); return v; });
  assert.deepEqual(d, [1, 0.5, 0.25, 0]);
});

test('Counter Slash blocks a hit and strikes back with a guaranteed crit', () => {
  const { sim, p, m } = setup(18);
  sim.requestAction(p.id, { type: 'skill', skillId: COUNTER }); run(sim, 0.1);
  assert.equal(p.counterStance, true);
  const hp = p.health.hp;
  assert.equal(sim.dealDamage(m, p, { sourceName: 'test bite' }), null);
  assert.equal(p.health.hp, hp, 'incoming hit negated');
  run(sim, 0.3);
  const d = damageEvents(sim);
  assert.equal(d.length, 1); assert.equal(d[0].crit, true); assert.equal(d[0].targetId, m.id);
});

test('Counter Slash with no incoming hit just ends', () => {
  const { sim, p } = setup();
  sim.requestAction(p.id, { type: 'skill', skillId: COUNTER }); run(sim, 1.2);
  assert.equal(p.action, null); assert.ok(!p.counterStance);
  assert.equal(damageEvents(sim).length, 0);
});

test('damage pipeline is deterministic, ordered, and clamped', () => {
  const cfg = { defenseConstant: 50, minDamage: 1, maxDamage: 99999, pveModifier: 1, pvpModifier: 0.7 };
  const atk = { stats: { weaponBaseDamage: 22, weaponCoefficient: 1, weaponStrScaling: 1, physAtk: 18, critChance: 0.5, critDamage: 1.5 } };
  const tgt = { stats: { physDef: 6 } };
  const r1 = computeDamage({ attacker: atk, target: tgt, rng: createRng(9), config: cfg });
  const r2 = computeDamage({ attacker: atk, target: tgt, rng: createRng(9), config: cfg });
  assert.deepEqual(r1, r2);
  assert.deepEqual(r1.trace.map((t) => t[0]).filter((k) => k !== 'critical'), ['base', 'weaponCoef', 'statScaling', 'skillModifier', 'defense', 'pve', 'absorb', 'final']);
  const weak = computeDamage({ attacker: { stats: { physAtk: 0.1, critChance: 0, critDamage: 1 } }, target: { stats: { physDef: 999 } }, rng: createRng(1), config: cfg });
  assert.equal(weak.amount, 1, 'min damage clamp');
  const pvp = computeDamage({ attacker: atk, target: tgt, rng: createRng(9), config: cfg, isPvp: true });
  assert.ok(pvp.amount < r1.amount, 'PvP modifier applied');
});

test('spawn protection makes the player immune and ends when the player acts', () => {
  const { sim, p, m } = setup();
  p.statuses.apply('SPAWN_PROTECTION', 2, p.id);
  assert.equal(sim.dealDamage(m, p), null);
  sim.requestAction(p.id, { type: 'skill', skillId: BA });
  assert.equal(p.statuses.has('SPAWN_PROTECTION'), false);
});
