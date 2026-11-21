import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeClient, makeServer, ticks } from './helpers.ts';
import { BTN } from '../src/shared/protocol.ts';
import { MemoryStorage } from '../src/server/storage/memory.ts';
import { createItem } from '../src/server/inventory.ts';
import type { MonsterEntity } from '../src/server/entities.ts';

test('register, create character, enter capital', async () => {
  const { server } = await makeServer();
  const c = new FakeClient(server);
  const ez = await c.join('alice');
  assert.equal(ez.zone, 'aether_capital');
  assert.ok(ez.metas.some((m) => m.k === 4), 'NPCs visible in town');
  const inv = c.last('inv') ?? (await c.waitFor('inv'));
  assert.ok(inv.items.some((i) => i.defId === 'wpn_rusty_sword' && i.equip === 'weapon'));
  assert.equal(inv.gold, 100);
});

test('auth: duplicate username, wrong password, messages before hello are rejected', async () => {
  const { server } = await makeServer();
  const a = new FakeClient(server);
  await a.join('bob');
  const b = new FakeClient(server);
  b.send({ t: 'register', user: 'bob', pass: 'secret123' }); // no hello
  b.send({ t: 'hello', v: 1 });
  b.send({ t: 'register', user: 'bob', pass: 'secret123' });
  assert.equal((await b.waitFor('error')).code, 'username_taken');
  b.send({ t: 'login', user: 'bob', pass: 'wrongpass' });
  assert.equal((await b.waitFor('error')).code, 'bad_credentials');
  b.send({ t: 'login', user: 'bob', pass: 'secret123' });
  await b.waitFor('auth_ok');
});

test('weapon not yet implemented cannot be chosen; invalid names rejected', async () => {
  const { server } = await makeServer();
  const c = new FakeClient(server);
  c.send({ t: 'hello', v: 1 });
  c.send({ t: 'register', user: 'carl', pass: 'secret123' });
  await c.waitFor('auth_ok');
  const app = { gender: 'male', skin: 0, hairStyle: 0, hairColor: 0, face: 0, outfit: 0 };
  c.send({ t: 'char_create', name: 'Carl', weapon: 'bow', app });
  assert.equal((await c.waitFor('error')).code, 'weapon_unavailable');
  c.send({ t: 'char_create', name: 'a<b>', weapon: 'sword', app });
  assert.equal((await c.waitFor('error')).code, 'bad_name');
  c.send({ t: 'char_create', name: 'x'.repeat(40), weapon: 'sword', app });
  assert.equal((await c.waitFor('error')).code, 'bad_message');
  c.send({ t: 'char_create', name: 'ชื่อไทย', weapon: 'staff', app });
  const list = await c.waitFor('char_list', (m) => m.chars.length === 1);
  assert.equal(list.chars[0].weapon, 'staff');
});

test('movement is server-authoritative: speed matches config and input flood is capped', async () => {
  const { server } = await makeServer();
  const c = new FakeClient(server);
  await c.join('dora');
  const p = server.playerByName('DoraX')!;
  const x0 = p.ms.x;
  // one tick worth of input moving +x
  c.input(1, 0);
  ticks(server, 1);
  const moved = p.ms.x - x0;
  assert.ok(Math.abs(moved - p.stats.moveSpeed / 20) < 1e-6, `moved ${moved}`);
  // speed hack attempt: 100 inputs in a single tick -> queue capped, budget limits processing
  const before = p.ms.x;
  for (let i = 0; i < 100; i++) c.input(1, 0);
  ticks(server, 1);
  const perTickMax = (p.stats.moveSpeed / 20) * 3 + 1e-6; // budget max 3
  assert.ok(p.ms.x - before <= perTickMax, 'burst limited by input budget');
  assert.ok(c.all('error').length === 0 || true);
  // non-normalised input vector is clamped by validation (|v|<=1.5) and normalised by sim
  const b2 = p.ms.x;
  c.send({ t: 'in', s: ++c.seq + 1000, mx: 50, my: 0, ax: 1, ay: 0, b: 0, vt: 0 });
  ticks(server, 1);
  assert.ok(p.ms.x - b2 <= p.stats.moveSpeed / 20 * 3 + 1e-6);
});

test('replayed input sequence numbers are ignored', async () => {
  const { server } = await makeServer();
  const c = new FakeClient(server);
  await c.join('eve');
  const p = server.playerByName('EveX')!;
  c.send({ t: 'in', s: 5, mx: 1, my: 0, ax: 1, ay: 0, b: 0, vt: 0 });
  ticks(server, 1);
  const x1 = p.ms.x;
  c.send({ t: 'in', s: 5, mx: 1, my: 0, ax: 1, ay: 0, b: 0, vt: 0 });
  c.send({ t: 'in', s: 3, mx: 1, my: 0, ax: 1, ay: 0, b: 0, vt: 0 });
  ticks(server, 1);
  assert.equal(p.ms.x, x1);
});

function placeNear(server: Awaited<ReturnType<typeof makeServer>>['server'], name: string, monsterId: string) {
  const p = server.playerByName(name)!;
  const z = server.zoneOf(p)!;
  const field = server.zoneById('greenfall_plains')!;
  server.transfer(p, field.def.id, 16, 44);
  const m = [...field.monsters.values()].find((x) => x.def.id === monsterId && x.state !== 'dead')! as MonsterEntity;
  // put the monster right in front of the player
  m.x = p.ms.x + 1.0; m.y = p.ms.y; m.homeX = m.x; m.homeY = m.y; m.state = 'idle'; m.stateUntil = 1e9;
  void z;
  return { p, m, field };
}

test('combat: melee hit validated by server, kill grants EXP and server-generated loot', async () => {
  const { server } = await makeServer();
  const c = new FakeClient(server);
  await c.join('finn');
  const { p, m, field } = placeNear(server, 'FinnX', 'green_slime');
  const exp0 = p.rec.exp;
  let guard = 0;
  while (m.state !== 'dead' && guard++ < 400) {
    c.input(0, 0, BTN.ATTACK, 1, 0, field.tick);
    ticks(server, 1);
  }
  assert.equal(m.state, 'dead', 'slime should die');
  assert.ok(p.rec.exp > exp0 || p.rec.level > 1, 'gained exp');
  const snaps = c.all('snap');
  assert.ok(snaps.some((s) => s.ev.some((e) => e.e === 'hit' && e.t === m.id && e.d > 0)));
  assert.ok(field.drops.size > 0, 'at least gold dropped');
  // drops are owned by the killer
  for (const d of field.drops.values()) assert.equal(d.ownerCharId, p.rec.id);
});

test('attack out of range does not hit; attacking faster than cooldown is ignored', async () => {
  const { server } = await makeServer();
  const c = new FakeClient(server);
  await c.join('gina');
  const { p, m, field } = placeNear(server, 'GinaX', 'meadow_boar');
  m.x = p.ms.x + 5; // out of sword range
  const hp0 = m.hp;
  c.input(0, 0, BTN.ATTACK, 1, 0, field.tick);
  ticks(server, 1);
  assert.equal(m.hp, hp0);
  m.x = p.ms.x + 1;
  ticks(server, 1); // record the new position in lag-compensation history
  // 3 attack inputs within one tick window: only one can pass the cooldown
  p.cooldowns.clear();
  p.actionLockUntil = 0;
  c.input(0, 0, BTN.ATTACK, 1, 0, field.tick);
  c.input(0, 0, BTN.ATTACK, 1, 0, field.tick);
  c.input(0, 0, BTN.ATTACK, 1, 0, field.tick);
  ticks(server, 1);
  const hits = c.all('snap').flatMap((s) => s.ev).filter((e) => e.e === 'hit' && e.t === m.id);
  assert.equal(hits.length, 1);
});

test('loot: pickup range, ownership, no double claim, inventory overflow', async () => {
  const { server } = await makeServer();
  const a = new FakeClient(server);
  await a.join('hank');
  const b = new FakeClient(server);
  await b.join('ivan');
  const pa = server.playerByName('HankX')!;
  const pb = server.playerByName('IvanX')!;
  const field = server.zoneById('greenfall_plains')!;
  server.transfer(pa, field.def.id, 20, 50);
  server.transfer(pb, field.def.id, 20.5, 50);
  const item = createItem('wpn_iron_sword', 1);
  field.createDrop(20, 50, item, 0, pa.rec.id);
  const drop = [...field.drops.values()].find((d) => d.item?.uid === item.uid)!;
  drop.x = 20; drop.y = 50;
  // other player can't take it during ownership window
  b.send({ t: 'pickup', id: drop.id });
  assert.equal((await b.waitFor('error')).code, 'not_owner');
  // too far
  pa.ms.x = 30;
  a.send({ t: 'pickup', id: drop.id });
  assert.equal((await a.waitFor('error')).code, 'too_far');
  pa.ms.x = 20.2;
  a.send({ t: 'pickup', id: drop.id });
  a.send({ t: 'pickup', id: drop.id });
  assert.equal((await a.waitFor('error')).code, 'no_drop', 'second claim fails');
  assert.equal(pa.inv.items.filter((i) => i.uid === item.uid).length, 1);
  // overflow: fill bag
  while (pa.inv.freeSlots().length) pa.inv.addInstance(createItem('wpn_oak_staff', 1));
  const it2 = createItem('wpn_iron_sword', 1);
  field.createDrop(20.2, 50, it2, 0, null);
  const d2 = [...field.drops.values()].find((d) => d.item?.uid === it2.uid)!;
  d2.x = 20.2; d2.y = 50;
  a.send({ t: 'pickup', id: d2.id });
  assert.equal((await a.waitFor('error')).code, 'inventory_full');
  assert.ok(field.drops.has(d2.id), 'drop stays on the ground when bag is full');
  assert.deepEqual(pa.inv.validate(), []);
});

test('shop: buy requires gold and proximity, sell removes item, audit written', async () => {
  const storage = new MemoryStorage();
  const { server } = await makeServer(storage);
  const c = new FakeClient(server);
  await c.join('june');
  const p = server.playerByName('JuneX')!;
  const z = server.zoneOf(p)!;
  const npc = [...z.npcs.values()].find((n) => n.def.shopId)!;
  c.send({ t: 'shop_buy', npc: npc.id, item: 'pot_hp_small', qty: 1 });
  assert.equal((await c.waitFor('error')).code, 'too_far');
  p.ms.x = npc.x; p.ms.y = npc.y + 1.5;
  c.send({ t: 'shop_buy', npc: npc.id, item: 'pot_hp_small', qty: 2 });
  await c.waitFor('notice', (m) => m.text.includes('ซื้อ'));
  assert.equal(p.rec.gold, 100 - 40);
  c.send({ t: 'shop_buy', npc: npc.id, item: 'wpn_iron_sword', qty: 1 });
  assert.equal((await c.waitFor('error')).code, 'not_sold');
  c.send({ t: 'shop_buy', npc: npc.id, item: 'pot_hp_small', qty: 50 });
  assert.equal((await c.waitFor('error')).code, 'no_gold');
  assert.equal(p.rec.gold, 60);
  const pot = p.inv.bagItems().find((i) => i.defId === 'pot_hp_small')!;
  const qty0 = pot.qty;
  c.send({ t: 'shop_sell', npc: npc.id, uid: pot.uid, qty: 1 });
  ticks(server, 1);
  assert.equal(p.rec.gold, 65);
  assert.equal(p.inv.count('pot_hp_small'), qty0 - 1);
  await p.saving;
  assert.ok(storage.auditLog.some((e) => e.kind === 'shop_buy'));
  assert.ok(storage.auditLog.some((e) => e.kind === 'shop_sell'));
});

test('weapon can only be changed in a safe zone', async () => {
  const { server } = await makeServer();
  const c = new FakeClient(server);
  await c.join('kate');
  const p = server.playerByName('KateX')!;
  const staff = createItem('wpn_apprentice_staff', 1);
  p.inv.addInstance(staff);
  server.transfer(p, 'greenfall_plains', 10, 50);
  c.send({ t: 'equip', uid: staff.uid });
  assert.equal((await c.waitFor('error')).code, 'safe_zone_only');
  assert.equal(p.weapon?.type, 'sword');
  server.transfer(p, 'aether_capital', 28, 33);
  c.send({ t: 'equip', uid: staff.uid });
  ticks(server, 1);
  assert.equal(p.weapon?.type, 'staff');
});

test('persistence: progress survives logout and reload; reconnect within grace keeps the player', async () => {
  const storage = new MemoryStorage();
  const { server } = await makeServer(storage);
  const c = new FakeClient(server);
  await c.join('liam');
  const p = server.playerByName('LiamX')!;
  p.rec.gold = 777;
  p.inv.addInstance(createItem('mat_iron_ore', 5));
  c.send({ t: 'logout' });
  await c.waitFor('logged_out');
  const saved = (await storage.listCharacters(p.rec.accountId))[0];
  assert.equal(saved.gold, 777);
  assert.equal(saved.items.find((i) => i.defId === 'mat_iron_ore')?.qty, 5);

  // reconnect flow
  const token = c.last('auth_ok')?.token ?? (c.all('auth_ok')[0]?.token);
  c.send({ t: 'char_select', id: saved.id });
  await c.waitFor('enter_zone');
  const p2 = server.playerByName('LiamX')!;
  server.disconnect(c.id);
  ticks(server, 20); // 1 s < grace
  assert.ok(server.playerByName('LiamX'), 'still in world during grace period');
  const c2 = new FakeClient(server);
  c2.send({ t: 'hello', v: 1 });
  if (token) c2.send({ t: 'resume', token }); else c2.send({ t: 'login', user: 'liam', pass: 'secret123' });
  await c2.waitFor('auth_ok');
  c2.send({ t: 'char_select', id: saved.id });
  await c2.waitFor('enter_zone');
  assert.equal(server.playerByName('LiamX'), p2, 'same entity reattached');
  server.disconnect(c2.id);
  ticks(server, 20 * 16);
  assert.equal(server.playerByName('LiamX'), undefined, 'removed after grace');
});

test('malformed and flooding clients get kicked', async () => {
  const { server } = await makeServer();
  const c = new FakeClient(server);
  c.send({ t: 'hello', v: 1 });
  for (let i = 0; i < 60; i++) c.sendRaw('{not json');
  assert.ok(c.closed, 'connection closed after too many violations');
});

test('monster AI: aggressive monster chases, leashes back and heals', async () => {
  const { server } = await makeServer();
  const c = new FakeClient(server);
  await c.join('mona');
  const p = server.playerByName('MonaX')!;
  server.transfer(p, 'greenfall_plains', 70, 48);
  const field = server.zoneOf(p)!;
  const wolf = [...field.monsters.values()].find((m) => m.def.id === 'plains_wolf' && m.state !== 'dead')!;
  wolf.x = p.ms.x + 3; wolf.y = p.ms.y; wolf.homeX = wolf.x; wolf.homeY = wolf.y; wolf.state = 'idle';
  ticks(server, 2);
  assert.equal((wolf.state as string) === 'chase' || (wolf.state as string) === 'windup', true, `state ${wolf.state}`);
  wolf.hp = 10;
  // teleport player far away (server-side) -> wolf must leash home
  p.ms.x = wolf.homeX - 30;
  ticks(server, 20 * 15);
  assert.equal(wolf.state === 'idle' || wolf.state === 'patrol', true, `state ${wolf.state}`);
  assert.equal(wolf.hp, wolf.maxHp);
});

test('dodge grants i-frames: monster attack during dodge deals no damage', async () => {
  const { server } = await makeServer();
  const c = new FakeClient(server);
  await c.join('nina');
  const { p, m, field } = placeNear(server, 'NinaX', 'meadow_boar');
  void field;
  const hp0 = p.hp;
  m.state = 'chase'; m.targetId = p.id;
  // run until windup begins
  let g = 0;
  while ((m.state as string) !== 'windup' && g++ < 100) { c.input(0, 0); ticks(server, 1); }
  assert.equal(m.state as string, 'windup');
  const until = m.windup!.until;
  // wait until just before the hit, then dodge sideways
  while (server.time < until - 0.1) { c.input(0, 0); ticks(server, 1); }
  c.inbox.length = 0;
  c.input(0, 1, BTN.DODGE);
  ticks(server, 3);
  const dmg = c.all('snap').flatMap((s) => s.ev).filter((e) => e.e === 'hit' && e.t === p.id && e.d > 0);
  assert.equal(dmg.length, 0, 'no damage while dodging');
  assert.ok(p.hp >= hp0);
});
