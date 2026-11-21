import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from '../src/server/validateConfig.ts';
import { ZONES } from '../src/shared/config/zones.ts';
import { generateMap, isBlocked } from '../src/shared/mapgen.ts';
import { newMoveState, stepMove, type MoveParams } from '../src/shared/movement.ts';
import { mulberry32 } from '../src/shared/rng.ts';
import { computeStats } from '../src/shared/stats.ts';
import { STAT_CONFIG } from '../src/shared/config/stats.ts';
import { rollDamage, shapeHits, mitigation } from '../src/shared/combat.ts';
import { levelDiffMult, expToNext } from '../src/shared/config/progression.ts';
import { parseClientMessage } from '../src/shared/protocol.ts';
import { createItem, Inventory } from '../src/server/inventory.ts';
import { grantExp, accrueRested } from '../src/server/progression.ts';
import { rollLoot } from '../src/server/loot.ts';
import { MONSTERS } from '../src/shared/config/monsters.ts';
import { WEAPONS } from '../src/shared/config/weapons.ts';

test('game config validates (references, reachability, prices)', () => {
  assert.deepEqual(validateConfig(), []);
});

test('map generation is deterministic', () => {
  for (const z of Object.values(ZONES)) {
    const a = generateMap(z), b = generateMap(z);
    assert.deepEqual(a.tiles, b.tiles);
    assert.equal(isBlocked(a, z.spawnPoint.x, z.spawnPoint.y), false);
  }
});

const params: MoveParams = {
  speed: 4.2, maxStamina: 100, staminaRegen: 28, staminaDelayAfterUse: 0.8, radius: 0.3,
  dodge: { distance: 3, duration: 0.25, staminaCost: 30, cooldown: 0.5 }, block: { moveMult: 0.45, staminaPerSec: 12 },
};

test('movement: client prediction replay reproduces server state exactly', () => {
  const map = generateMap(ZONES.greenfall_plains);
  const rng = mulberry32(7);
  const inputs = Array.from({ length: 300 }, () => ({ mx: rng() * 2 - 1, my: rng() * 2 - 1, dodge: rng() < 0.05, block: rng() < 0.1 }));
  const server = newMoveState(20, 50, 100);
  const client = newMoveState(20, 50, 100);
  for (const i of inputs) stepMove(server, i, params, map);
  for (const i of inputs) stepMove(client, i, params, map);
  assert.deepEqual(client, server);
});

test('movement: walls block, dodge costs stamina and has cooldown', () => {
  const map = generateMap(ZONES.aether_capital);
  const s = newMoveState(3, 28.5, 100); // near the west wall (x<2 is wall)
  for (let i = 0; i < 40; i++) stepMove(s, { mx: -1, my: 0, dodge: false, block: false }, params, map);
  assert.ok(s.x >= 2 + 0.3 - 1e-9, `x=${s.x}`);
  const d = newMoveState(28, 33, 100);
  stepMove(d, { mx: 1, my: 0, dodge: true, block: false }, params, map);
  assert.equal(d.stamina, 70);
  const st = d.stamina;
  stepMove(d, { mx: 1, my: 0, dodge: true, block: false }, params, map); // still in cooldown
  assert.ok(d.stamina <= st);
  const tired = newMoveState(28, 33, 10);
  tired.staminaDelay = 5;
  stepMove(tired, { mx: 1, my: 0, dodge: true, block: false }, params, map);
  assert.equal(tired.dodgeT, 0, 'no dodge without stamina');
});

test('stats: level growth, equipment, caps', () => {
  const s1 = computeStats(1, []);
  const s10 = computeStats(10, []);
  assert.ok(s10.hp > s1.hp && s10.patk > s1.patk);
  const ring = createItem('acc_copper_ring', 1, { rarity: 'mythic', ilvl: 100 });
  ring.equip = 'accessory1';
  const many = Array.from({ length: 40 }, () => ({ ...ring, uid: crypto.randomUUID() }));
  const capped = computeStats(50, many);
  assert.equal(capped.critRate, STAT_CONFIG.caps.critRate);
});

test('damage: defense mitigation, pvp multiplier, crit, damage reduction cap', () => {
  assert.ok(mitigation(0, 0) === 1 && mitigation(120, 0) === 0.5);
  const a = { atk: 100, critRate: 0, critDmg: 1.5, accuracy: 1, armorPen: 0 };
  const d = { def: 0, evasion: 0 };
  const fixed = () => 0.5; // no variance, no crit
  const pve = rollDamage(a, d, 1, 0, 'none', 'pve', fixed).amount;
  const pvp = rollDamage(a, d, 1, 0, 'none', 'pvp', fixed).amount;
  assert.equal(pve, 100);
  assert.equal(pvp, Math.round(100 * STAT_CONFIG.pvp.damageMult));
  const capped = rollDamage(a, { ...d, damageReduction: 5 }, 1, 0, 'none', 'pve', fixed).amount;
  assert.equal(capped, Math.round(100 * (1 - STAT_CONFIG.damageReductionCap)));
  const crit = rollDamage({ ...a, critRate: 1 }, d, 1, 0, 'none', 'pve', fixed);
  assert.ok(crit.crit && crit.amount === 150);
});

test('hit shapes: arc respects range and angle; line hits along path', () => {
  const arc = WEAPONS.sword!.normal.shape;
  assert.ok(shapeHits(arc, 0, 0, 1, 0, 1.2, 0, 0.35));
  assert.ok(!shapeHits(arc, 0, 0, 1, 0, -1.2, 0, 0.35), 'behind');
  assert.ok(!shapeHits(arc, 0, 0, 1, 0, 4, 0, 0.35), 'too far');
  assert.ok(shapeHits({ kind: 'line', length: 4, width: 1 }, 0, 0, 1, 0, 3, 0.4, 0.3));
});

test('progression: level-diff penalty, level ups, rested EXP', () => {
  assert.equal(levelDiffMult(10, 12), 1);
  assert.ok(levelDiffMult(30, 1) < 0.5);
  const rec = { level: 1, exp: 0, restedExp: 0, lastSeen: 0 } as Parameters<typeof grantExp>[0];
  grantExp(rec, expToNext(1) + expToNext(2));
  assert.equal(rec.level, 3);
  rec.lastSeen = Date.now() - 10 * 3600_000;
  assert.ok(accrueRested(rec, Date.now()) > 0);
  const before = rec.exp;
  const r = grantExp(rec, 10);
  assert.ok(r.restedUsed === 10 && rec.exp === before + 20);
});

test('protocol: malformed messages are rejected', () => {
  assert.equal(parseClientMessage('{bad'), null);
  assert.equal(parseClientMessage({ t: 'in', s: 1, mx: 1e9, my: 0, ax: 0, ay: 0, b: 0, vt: 0 }), null);
  assert.equal(parseClientMessage({ t: 'in', s: 1, mx: NaN, my: 0, ax: 0, ay: 0, b: 0, vt: 0 }), null);
  assert.equal(parseClientMessage({ t: 'shop_buy', npc: 1, item: 'x', qty: -5 }), null);
  assert.equal(parseClientMessage({ t: 'nope' }), null);
  assert.equal(parseClientMessage('x'.repeat(5000)), null);
  assert.ok(parseClientMessage({ t: 'ping', c: 1 }));
});

test('inventory: stacking, all-or-nothing add, equip/unequip, integrity', () => {
  const inv = new Inventory([], 3);
  assert.ok(inv.addInstance(createItem('mat_iron_ore', 500)));
  assert.ok(inv.addInstance(createItem('mat_iron_ore', 600))); // 999 + 101 -> 2 stacks
  assert.equal(inv.count('mat_iron_ore'), 1100);
  assert.equal(inv.bagItems().length, 2);
  assert.ok(inv.addInstance(createItem('wpn_iron_sword', 1)));
  assert.ok(!inv.addInstance(createItem('wpn_oak_staff', 1)), 'full');
  assert.equal(inv.items.length, 3);
  assert.ok(!inv.addInstance(createItem('mat_iron_ore', 999)), 'not enough room for whole stack -> nothing added');
  assert.equal(inv.count('mat_iron_ore'), 1100);
  const sword = inv.bagItems().find((i) => i.defId === 'wpn_iron_sword')!;
  assert.equal(inv.equip(sword.uid, 1).ok, false, 'level req');
  assert.equal(inv.equip(sword.uid, 5).ok, true);
  assert.ok(sword.bound, 'bind on equip');
  assert.deepEqual(inv.validate(), []);
  assert.ok(inv.removeDef('mat_iron_ore', 1050));
  assert.equal(inv.count('mat_iron_ore'), 50);
  assert.ok(!inv.removeDef('mat_iron_ore', 51));
  assert.equal(inv.unequip('weapon').ok, true);
  assert.deepEqual(inv.validate(), []);
});

test('loot: server rolls follow configured rates (statistical)', () => {
  const rng = mulberry32(123);
  const slime = MONSTERS.green_slime;
  let gel = 0, frag = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) {
    const l = rollLoot(slime, 1, rng);
    if (l.items.some((x) => x.defId === 'mat_slime_gel')) gel++;
    if (l.items.some((x) => x.defId === 'mat_power_fragment')) frag++;
  }
  assert.ok(Math.abs(gel / N - 0.55) < 0.02, `gel rate ${gel / N}`);
  assert.ok(frag / N > 0.005 && frag / N < 0.02, `fragment rate ${frag / N} within 0.5-2%`);
  const reduced = rollLoot(slime, 1, () => 0.6, 0.25);
  assert.equal(reduced.items.length, 0, 'farm soft-cap multiplier reduces drops');
});
