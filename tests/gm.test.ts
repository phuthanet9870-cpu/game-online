import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameServer } from '../src/server/GameServer.ts';
import { MemoryStorage } from '../src/server/storage/memory.ts';
import { silentLogger } from '../src/server/util.ts';
import { mulberry32 } from '../src/shared/rng.ts';
import { FakeClient, ticks } from './helpers.ts';

async function server(gmPassphrase: string | null) {
  const s = new GameServer({ storage: new MemoryStorage(), logger: silentLogger, rng: mulberry32(1), hashIterations: 1000, gmPassphrase });
  await s.init();
  return s;
}
const gmLines = (c: FakeClient) => c.all('chat').filter((m) => m.ch === 'system').map((m) => m.text);
async function settle() { await new Promise((r) => setTimeout(r, 20)); }

test('GM disabled when no passphrase configured', async () => {
  const s = await server(null);
  const c = new FakeClient(s);
  await c.join('gmnone');
  c.send({ t: 'chat', text: '/gmstefanonline' });
  assert.ok(gmLines(c).some((l) => l.includes('ระบบ GM ปิดอยู่')));
  assert.equal(s.playerByName('GmnoneX')!.gm, false);
});

test('GM unlock requires exact passphrase; failures are rejected; commands without GM do nothing', async () => {
  const s = await server('secret-pass');
  const c = new FakeClient(s);
  await c.join('gmuser');
  const p = s.playerByName('GmuserX')!;
  c.send({ t: 'chat', text: '/gm gold 999999' });
  c.send({ t: 'chat', text: '/gmwrong' });
  await settle();
  assert.equal(p.gm, false);
  assert.equal(p.rec.gold, 100);
  c.send({ t: 'chat', text: '/gmsecret-pass' });
  assert.equal(p.gm, true);
  const gmState = c.last('gm');
  assert.equal(gmState?.on, true);
});

test('GM commands: gold, item, level, god, nocd, speed, tp, spawn, rates, kick, ban', async () => {
  const s = await server('pw');
  const gm = new FakeClient(s);
  await gm.join('admin');
  const other = new FakeClient(s);
  await other.join('victim');
  const g = s.playerByName('AdminX')!;
  const v = s.playerByName('VictimX')!;
  gm.send({ t: 'chat', text: '/gmpw' });
  const run = async (line: string) => { gm.send({ t: 'chat', text: `/gm ${line}` }); await settle(); };

  await run('gold 5000');
  assert.equal(g.rec.gold, 5100);
  await run('gold 250 VictimX');
  assert.equal(v.rec.gold, 350);
  await run('item wpn_wolfbane_blade 1 legendary');
  assert.ok(g.inv.items.some((i) => i.defId === 'wpn_wolfbane_blade' && i.rarity === 'legendary'));
  await run('item mat_iron_ore 2500');
  assert.equal(g.inv.count('mat_iron_ore'), 2500);
  await run('itemall material 10');
  assert.equal(g.inv.count('mat_soul_essence'), 10);
  assert.equal(g.inv.count('mat_power_fragment'), 10);
  await run('itemall boots 1 epic');
  assert.ok(g.inv.items.some((i) => i.defId === 'bts_leather_boots' && i.rarity === 'epic'));
  await run('level 50');
  assert.equal(g.rec.level, 50);
  assert.equal(g.hp, g.stats.hp);
  const baseSpeed = g.stats.moveSpeed;
  await run('speed 2');
  assert.ok(Math.abs(g.stats.moveSpeed - baseSpeed * 2) < 1e-9);
  await run('tp 20 50 greenfall_plains');
  assert.equal(g.rec.zoneId, 'greenfall_plains');
  const field = s.zoneOf(g)!;
  const before = field.monsters.size;
  await run('spawn alpha_wolf 3');
  assert.equal(field.monsters.size, before + 3);
  // god mode: monster hits do nothing
  await run('god');
  const wolf = [...field.monsters.values()].find((m) => m.def.id === 'alpha_wolf' && m.group.id.startsWith('gm_'))!;
  wolf.x = g.ms.x + 1; wolf.y = g.ms.y; wolf.state = 'chase'; wolf.targetId = g.id;
  const hp0 = g.hp;
  for (let i = 0; i < 60; i++) { gm.input(0, 0); ticks(s, 1); }
  assert.equal(g.hp, hp0, 'god mode prevents damage');
  // nocd: skills usable back-to-back without energy
  await run('nocd');
  g.energy = 0;
  gm.inbox.length = 0;
  gm.input(0, 0, 16, 1, 0, field.tick); ticks(s, 1); // Blade Rush
  g.actionLockUntil = 0; g.ms.forceT = 0;
  gm.input(0, 0, 16, 1, 0, field.tick); ticks(s, 1);
  const acts = gm.all('snap').flatMap((x) => x.ev).filter((e) => e.e === 'act' && e.a === 'sword_blade_rush');
  assert.equal(acts.length, 2);
  // rates
  await run('rates 3 2 5');
  assert.deepEqual(s.rates, { exp: 3, drop: 2, gold: 5 });
  // kick
  await run('kick VictimX');
  assert.ok(other.closed);
  assert.equal(s.playerByName('VictimX'), undefined);
  // ban persists: victim can't log back in
  const v2 = new FakeClient(s);
  v2.send({ t: 'hello', v: 1 });
  v2.send({ t: 'login', user: 'victim', pass: 'secret123' });
  await v2.waitFor('auth_ok');
  v2.send({ t: 'char_list' });
  const list = await v2.waitFor('char_list');
  v2.send({ t: 'char_select', id: list.chars[0].id });
  await v2.waitFor('enter_zone');
  await run('ban VictimX 1');
  const v3 = new FakeClient(s);
  v3.send({ t: 'hello', v: 1 });
  v3.send({ t: 'login', user: 'victim', pass: 'secret123' });
  assert.equal((await v3.waitFor('error')).code, 'banned');
  await run('unban victim');
  v3.send({ t: 'login', user: 'victim', pass: 'secret123' });
  await v3.waitFor('auth_ok');
  // every GM command is audited
  const audit = (s.storage as MemoryStorage).auditLog.filter((e) => e.kind === 'gm_command');
  assert.ok(audit.length >= 12);
  assert.deepEqual(g.inv.validate(), []);
});
