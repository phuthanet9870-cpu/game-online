import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteStorage } from '../src/server/storage/sqlite.ts';
import { FakeClient, makeServer, ticks } from './helpers.ts';
import { createItem } from '../src/server/inventory.ts';

test('sqlite: migrations are idempotent; save/load roundtrip; optimistic versioning; unique names', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tpew-'));
  const path = join(dir, 'game.db');
  const st = new SqliteStorage(path);
  await st.init();
  assert.deepEqual(st.migrate(), [], 'second run applies nothing');
  const acc = await st.createAccount('zed', 'h', 's');
  assert.notEqual(acc, 'taken');
  assert.equal(await st.createAccount('zed', 'h', 's'), 'taken');
  const { server } = await makeServer(st);
  const rec = server.newCharacter((acc as { id: string }).id, 'Zed', { gender: 'male', skin: 0, hairStyle: 0, hairColor: 0, face: 0, outfit: 0 }, 'sword');
  assert.equal(await st.createCharacter(rec), 'ok');
  assert.equal(await st.createCharacter({ ...rec, id: crypto.randomUUID() , name: 'zed' }), 'name_taken', 'names unique case-insensitive');
  const loaded = (await st.loadCharacter(rec.id))!;
  assert.deepEqual(loaded.items.map((i) => i.uid).sort(), rec.items.map((i) => i.uid).sort());
  loaded.gold = 5000; loaded.version += 1;
  assert.equal(await st.saveCharacter(loaded), 'ok');
  assert.equal(await st.saveCharacter(loaded), 'stale', 'same version twice is rejected');
  // duplicated uid inside one save violates PK -> whole transaction rolls back
  const bad = { ...loaded, version: loaded.version + 1, gold: 1, items: [...loaded.items, { ...loaded.items[0] }] };
  await assert.rejects(st.saveCharacter(bad));
  const after = (await st.loadCharacter(rec.id))!;
  assert.equal(after.gold, 5000, 'rolled back');
  assert.equal(after.items.length, loaded.items.length);
  await st.close();
  // reopen: data persisted on disk
  const st2 = new SqliteStorage(path);
  await st2.init();
  assert.equal((await st2.loadCharacter(rec.id))!.gold, 5000);
  st2.backup(join(dir, 'backup.db'));
  const bk = new SqliteStorage(join(dir, 'backup.db'));
  assert.equal((await bk.loadCharacter(rec.id))!.gold, 5000, 'backup readable');
  await bk.close();
  await st2.close();
});

test('sqlite: full game flow persists through a server restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tpew-'));
  const path = join(dir, 'game.db');
  let st = new SqliteStorage(path);
  let { server } = await makeServer(st);
  const c = new FakeClient(server);
  await c.join('olga');
  const p = server.playerByName('OlgaX')!;
  p.inv.addInstance(createItem('mat_soul_essence', 12));
  p.rec.gold = 321;
  server.transfer(p, 'greenfall_plains', 6, 50);
  ticks(server, 2);
  await server.stop();
  await st.close();

  st = new SqliteStorage(path);
  ({ server } = await makeServer(st));
  const c2 = new FakeClient(server);
  c2.send({ t: 'hello', v: 1 });
  c2.send({ t: 'login', user: 'olga', pass: 'secret123' });
  await c2.waitFor('auth_ok');
  c2.send({ t: 'char_list' });
  const list = await c2.waitFor('char_list');
  c2.send({ t: 'char_select', id: list.chars[0].id });
  const ez = await c2.waitFor('enter_zone');
  assert.equal(ez.zone, 'greenfall_plains');
  const p2 = server.playerByName('OlgaX')!;
  assert.equal(p2.rec.gold, 321);
  assert.equal(p2.inv.count('mat_soul_essence'), 12);
  await st.close();
});
