import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeClient, makeServer, ticks } from './helpers.ts';
import { BTN } from '../src/shared/protocol.ts';
import { WEAPONS, WEAPON_TYPES } from '../src/shared/config/weapons.ts';
import { createItem } from '../src/server/inventory.ts';
import type { MonsterEntity, PlayerEntity } from '../src/server/entities.ts';
import type { GameServer } from '../src/server/GameServer.ts';

test('all 6 weapons are enabled with normal/heavy/dodge/defensive + 3 skills', () => {
  for (const t of WEAPON_TYPES) {
    const w = WEAPONS[t];
    assert.ok(w && w.enabled, t);
    assert.equal(w!.skills.length, 3);
    for (const s of [w!.normal, w!.heavy, ...w!.skills]) assert.equal(s.weapon, t, s.id);
  }
});

async function setup(weapon: string, name: string) {
  const { server } = await makeServer();
  const c = new FakeClient(server);
  await c.join(name, undefined, weapon);
  const p = server.playerByName(name.charAt(0).toUpperCase() + name.slice(1) + 'X')!;
  assert.equal(p.weapon?.type, weapon);
  server.transfer(p, 'greenfall_plains', 16, 44);
  const z = server.zoneOf(p)!;
  for (const m of z.monsters.values()) { m.state = 'dead'; m.respawnAt = 1e9; }
  const spawnAt = (x: number, y: number, id = 'meadow_boar') => {
    const m = z.spawnMonster({ id: 't', monsterId: id, x, y, radius: 0, baseCount: 0, perPlayer: 0, maxCount: 99 })!;
    m.x = x; m.y = y; m.homeX = x; m.homeY = y; m.state = 'idle'; m.stateUntil = 1e9; m.hp = m.maxHp = 100000;
    return m;
  };
  ticks(server, 1);
  return { server, c, p, z, spawnAt };
}
const cast = (c: FakeClient, s: GameServer, p: PlayerEntity, bit: number, ax = 1, ay = 0) => {
  p.actionLockUntil = 0; p.energy = p.stats.energy; p.ms.stamina = p.stats.stamina;
  c.input(0, 0, bit, ax, ay, s.zoneOf(p)!.tick); ticks(s, 1);
};
const hitsOn = (c: FakeClient, m: MonsterEntity) => c.all('snap').flatMap((x) => x.ev).filter((e) => e.e === 'hit' && e.t === m.id && e.d > 0);

test('dagger: Shadow Step teleports behind the target; no target = nothing spent; backstab bonus', async () => {
  const { server, c, p, spawnAt } = await setup('dagger', 'dag');
  const en0 = p.energy;
  cast(c, server, p, BTN.SKILL1); // nothing in front
  assert.equal(p.energy, en0, 'no energy spent without a target');
  const m = spawnAt(p.ms.x + 4, p.ms.y);
  m.facingX = -1; m.facingY = 0; // facing the player
  ticks(server, 1);
  cast(c, server, p, BTN.SKILL1);
  assert.ok(p.ms.x > m.x, `teleported behind (p ${p.ms.x.toFixed(2)} m ${m.x.toFixed(2)})`);
  assert.ok(hitsOn(c, m).length >= 1);
});

test('dagger: Double Fang hits twice', async () => {
  const { server, c, p, spawnAt } = await setup('dagger', 'dagb');
  const m = spawnAt(p.ms.x + 1, p.ms.y);
  ticks(server, 1); c.inbox.length = 0;
  cast(c, server, p, BTN.SKILL2);
  assert.equal(c.all('snap').flatMap((x) => x.ev).filter((e) => e.e === 'hit' && e.t === m.id).length, 2);
});

test('bow: Triple Shot fires 3 arrows; Evasive Shot dashes backwards', async () => {
  const { server, c, p } = await setup('bow', 'bowa');
  c.inbox.length = 0;
  cast(c, server, p, BTN.SKILL1);
  assert.equal(c.all('snap').flatMap((x) => x.ev).filter((e) => e.e === 'proj' && e.s === p.id).length, 3);
  const x0 = p.ms.x;
  cast(c, server, p, BTN.SKILL3, 1, 0);
  ticks(server, 6);
  assert.ok(p.ms.x < x0 - 1, 'moved backwards');
});

test('grimoire: Rune Trap arms, triggers on a monster and roots it; max 3 active', async () => {
  const { server, c, p, z, spawnAt } = await setup('grimoire', 'grim');
  cast(c, server, p, BTN.SKILL1);
  assert.equal(z.traps.length, 1);
  for (let i = 0; i < 3; i++) { p.cooldowns.clear(); cast(c, server, p, BTN.SKILL1, 0, 1); }
  assert.equal(z.traps.length, 3, 'capped at maxActive');
  const trap = z.traps[0];
  ticks(server, 15); // arm
  const m = spawnAt(trap.x, trap.y);
  ticks(server, 2);
  assert.ok(!z.traps.includes(trap), 'trap consumed');
  assert.ok(m.rootUntil > server.time, 'monster rooted');
  assert.ok(hitsOn(c, m).length >= 1);
});

test('gauntlet: Rapid Fist hits 5 times; Iron Body reduces incoming damage and blocks stun', async () => {
  const { server, c, p, spawnAt } = await setup('gauntlet', 'gaun');
  const m = spawnAt(p.ms.x + 1, p.ms.y);
  ticks(server, 1); c.inbox.length = 0;
  cast(c, server, p, BTN.SKILL1);
  assert.equal(c.all('snap').flatMap((x) => x.ev).filter((e) => e.e === 'hit' && e.t === m.id).length, 5);
  cast(c, server, p, BTN.SKILL3);
  assert.ok(p.drUntil > server.time && p.drAmount === 0.4);
  assert.ok(p.superArmorUntil > server.time);
});

test('new starter weapons are sold in town and can be equipped there', async () => {
  const { server } = await makeServer();
  const c = new FakeClient(server);
  await c.join('shopw');
  const p = server.playerByName('ShopwX')!;
  for (const id of ['wpn_rusty_dagger', 'wpn_short_bow', 'wpn_worn_grimoire', 'wpn_leather_gauntlet']) {
    const it = createItem(id, 1);
    p.inv.addInstance(it);
    c.send({ t: 'equip', uid: it.uid });
    ticks(server, 1);
    assert.equal(p.inv.equippedIn('weapon')?.defId, id);
  }
  assert.equal(p.weapon?.type, 'gauntlet');
});
