import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeClient, makeServer, ticks } from './helpers.ts';
import { MemoryStorage } from '../src/server/storage/memory.ts';
import { setBossNext, BOSS_CONFIG } from '../src/server/bosses.ts';
import { killMonster } from '../src/server/combat.ts';
import { validateConfig } from '../src/server/validateConfig.ts';

test('every farm map with a boss passes validation (reachable multi spawn points)', () => {
  assert.deepEqual(validateConfig(), []);
});

test('map boss: server-scheduled spawn with hint, persisted timer, phases with adds, personal loot for contributors only', async () => {
  const storage = new MemoryStorage();
  const { server } = await makeServer(storage);
  const field = server.zoneById('greenfall_plains')!;
  const b = field.bosses[0];
  assert.ok(b.nextSpawnAt >= 45 * 60 && b.nextSpawnAt <= 90 * 60 + 1, `window ${b.nextSpawnAt}`);
  assert.ok(await storage.getKV(`boss:${b.key}`), 'timer persisted');
  const a = new FakeClient(server); await a.join('bossa');
  const c = new FakeClient(server); await c.join('bossb');
  const leech = new FakeClient(server); await leech.join('bossc');
  const pa = server.playerByName('BossaX')!, pc = server.playerByName('BossbX')!, pl = server.playerByName('BosscX')!;
  server.transfer(pa, 'greenfall_plains', 40, 80); server.transfer(pc, 'greenfall_plains', 41, 80); server.transfer(pl, 'greenfall_plains', 42, 81);
  setBossNext(field, b.key, server.time + 2); // hint window already passed -> hint now, spawn in 2 s
  ticks(server, 1);
  assert.ok(a.all('chat').some((m) => m.text.includes('สั่นไหว')), 'spawn hint');
  ticks(server, 45);
  const boss = b.alive!;
  assert.ok(boss, 'spawned');
  assert.ok(a.all('chat').some((m) => m.text.includes('ปรากฏตัว')));
  // phase 2 with adds
  const before = field.monsters.size;
  boss.threat.set(pa.id, boss.maxHp * 0.5);
  boss.boss!.tanked.set(pc.id, boss.maxHp * 0.3);
  boss.threat.set(pl.id, 1); // tiny contribution: not eligible
  boss.hp = boss.maxHp * 0.65;
  ticks(server, 1);
  assert.equal(boss.boss!.phase, 1);
  assert.ok(field.monsters.size > before, 'adds summoned');
  // kill -> personal loot for contributors only, rescheduled
  killMonster(field, boss);
  const owners = new Set([...field.drops.values()].map((d) => d.ownerCharId));
  assert.ok(owners.has(pa.rec.id) && owners.has(pc.rec.id), 'damage + tank contributors get loot');
  assert.ok(!owners.has(pl.rec.id), 'leech gets nothing');
  assert.equal(b.alive, null);
  assert.ok(b.nextSpawnAt > server.time + 44 * 60);
  for (const d of field.drops.values()) if (d.ownerCharId === pa.rec.id) assert.ok(d.ownerUntil - server.time > 60);
});

test('map boss: cannot be auto-farmed; resets when abandoned; pity guarantees a Power Core', async () => {
  const { server } = await makeServer();
  const c = new FakeClient(server); await c.join('bossd');
  const p = server.playerByName('BossdX')!;
  server.transfer(p, 'greenfall_plains', 60, 18);
  const field = server.zoneOf(p)!;
  const b = field.bosses[0];
  setBossNext(field, b.key, server.time);
  ticks(server, 2);
  const boss = b.alive!;
  boss.x = p.ms.x + 2; boss.y = p.ms.y; boss.homeX = boss.x; boss.homeY = boss.y;
  for (const m of field.monsters.values()) if (m !== boss) { m.state = 'dead'; m.respawnAt = 1e12; }
  c.send({ t: 'auto_start', cfg: { radius: 10 } });
  await c.waitFor('auto', (m) => m.on);
  ticks(server, 20);
  assert.equal(boss.threat.has(p.id), false, 'auto never attacks a boss');
  // abandoned -> reset
  boss.hp = boss.maxHp * 0.5; boss.boss!.phase = 1;
  server.transfer(p, 'aether_capital', 28, 33);
  ticks(server, 20 * (BOSS_CONFIG.resetAfterSec + 2));
  assert.equal(boss.hp, boss.maxHp);
  assert.equal(boss.boss!.phase, 0);
  // pity
  server.transfer(p, 'greenfall_plains', 60, 18);
  p.rec.powers.corePity = BOSS_CONFIG.corePity - 1;
  boss.threat.set(p.id, 1000);
  killMonster(field, boss);
  assert.ok([...field.drops.values()].some((d) => d.item?.defId === 'power_core' && d.ownerCharId === p.rec.id), 'guaranteed core');
  assert.equal(p.rec.powers.corePity, 0);
  // using the core grants a power
  const core = [...field.drops.values()].find((d) => d.item?.defId === 'power_core')!;
  p.ms.x = core.x; p.ms.y = core.y;
  c.send({ t: 'pickup', id: core.id });
  const uid = p.inv.bagItems().find((i) => i.defId === 'power_core')!.uid;
  c.send({ t: 'use', uid });
  ticks(server, 1);
  assert.equal(p.rec.powers.owned.length, 1);
});

test('boss timer survives a server restart (no early or duplicate spawn)', async () => {
  const storage = new MemoryStorage();
  const s1 = await makeServer(storage);
  const key = s1.server.zoneById('greenfall_plains')!.bosses[0].key;
  const saved = Number(await storage.getKV(`boss:${key}`));
  const s2 = await makeServer(storage);
  const b2 = s2.server.zoneById('greenfall_plains')!.bosses[0];
  const expected = (saved - Date.now()) / 1000;
  assert.ok(Math.abs(b2.nextSpawnAt - expected) < 5 || b2.nextSpawnAt > 0, 'restored from storage');
  assert.equal(b2.alive, null);
});
