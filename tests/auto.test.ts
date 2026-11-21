import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeClient, makeServer, ticks } from './helpers.ts';
import { DEFAULT_AUTO, AUTO_CONFIG } from '../src/shared/config/auto.ts';
import { createItem } from '../src/server/inventory.ts';

const cfg = (over: Partial<typeof DEFAULT_AUTO> = {}) => ({ ...structuredClone(DEFAULT_AUTO), ...over });

test('auto farm: refused in town; runs on the server in the field, kills targets, loots, gains EXP', async () => {
  const { server } = await makeServer();
  const c = new FakeClient(server);
  await c.join('autoa');
  const p = server.playerByName('AutoaX')!;
  c.send({ t: 'auto_start', cfg: cfg() });
  assert.equal((await c.waitFor('error')).code, 'safe_zone');
  server.transfer(p, 'greenfall_plains', 16, 44);
  c.send({ t: 'auto_start', cfg: cfg({ targets: ['green_slime'], radius: 12 }) });
  await c.waitFor('auto', (m) => m.on);
  const exp0 = p.rec.exp + p.rec.level * 1e6, gold0 = p.rec.gold;
  const field = server.zoneOf(p)!;
  for (let i = 0; i < 20 * 60; i++) { ticks(server, 1); if (p.auto && p.auto.kills >= 3) break; }
  assert.ok(p.auto, 'still running');
  assert.ok(p.auto!.kills >= 3, `kills ${p.auto!.kills}`);
  assert.ok(p.rec.exp + p.rec.level * 1e6 > exp0, 'exp gained');
  // only slimes were attacked
  for (const m of field.monsters.values()) if (m.def.id !== 'green_slime') assert.equal(m.threat.has(p.id), false, `attacked ${m.def.id}`);
  for (let i = 0; i < 20 * 15; i++) ticks(server, 1);
  assert.ok(p.rec.gold > gold0, 'auto looted gold');
  assert.deepEqual(p.inv.validate(), []);
  // snapshots tell the client that auto is running
  assert.equal(c.last('snap')!.self.auto, true);
});

test('auto farm: manual input cancels; elites need allowElite; potions used at threshold', async () => {
  const { server } = await makeServer();
  const c = new FakeClient(server);
  await c.join('autob');
  const p = server.playerByName('AutobX')!;
  server.transfer(p, 'greenfall_plains', 86, 18); // next to the Alpha Wolf (elite)
  const field = server.zoneOf(p)!;
  const alpha = [...field.monsters.values()].find((m) => m.def.id === 'alpha_wolf')!;
  alpha.x = 87; alpha.y = 18; alpha.homeX = 87; alpha.homeY = 18; alpha.state = 'idle'; alpha.stateUntil = 1e9;
  for (const m of field.monsters.values()) if (m !== alpha && Math.hypot(m.x - 86, m.y - 18) < 15) { m.state = 'dead'; m.respawnAt = 1e9; }
  c.send({ t: 'auto_start', cfg: cfg({ radius: 10, allowElite: false }) });
  await c.waitFor('auto', (m) => m.on);
  alpha.def = { ...alpha.def, behavior: { ...alpha.def.behavior, passive: true } }; // keep it from aggroing for this part
  ticks(server, 40);
  assert.equal(alpha.threat.has(p.id), false, 'elite ignored without allowElite');
  // potion at threshold
  p.hp = p.stats.hp * 0.2;
  const pots = p.inv.count('pot_hp_small');
  ticks(server, 2);
  assert.equal(p.inv.count('pot_hp_small'), pots - 1, 'used HP potion');
  // manual movement cancels
  c.input(1, 0);
  ticks(server, 1);
  assert.equal(p.auto, null);
  assert.ok(c.all('auto').some((m) => !m.on && m.reason.includes('ควบคุมเอง')));
  // an elite that attacks first stops auto instead of being auto-fought
  c.send({ t: 'auto_start', cfg: cfg({ radius: 10, allowElite: false }) });
  await c.waitFor('auto', (m) => m.on);
  alpha.state = 'chase'; alpha.targetId = p.id;
  ticks(server, 1);
  assert.equal(p.auto, null);
  assert.equal(alpha.threat.has(p.id), false);
});

test('auto farm: hourly kill cap and bag-full stop', async () => {
  const { server } = await makeServer();
  const c = new FakeClient(server);
  await c.join('autoc');
  const p = server.playerByName('AutocX')!;
  server.transfer(p, 'greenfall_plains', 16, 44);
  p.autoKillTimes = Array.from({ length: AUTO_CONFIG.hourlyKillCap }, () => server.time);
  c.send({ t: 'auto_start', cfg: cfg() });
  assert.equal((await c.waitFor('error')).code, 'hour_cap');
  p.autoKillTimes = [];
  while (p.inv.freeSlots().length) p.inv.addInstance(createItem('wpn_oak_staff', 1));
  c.send({ t: 'auto_start', cfg: cfg() });
  await c.waitFor('auto', (m) => m.on);
  ticks(server, 1);
  assert.equal(p.auto, null);
  assert.ok(c.all('auto').some((m) => m.reason === 'กระเป๋าเต็ม'));
});
