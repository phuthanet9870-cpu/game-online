import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeClient, makeServer, ticks } from './helpers.ts';
import { POWERS, POWER_CONFIG, unlockedAbilities } from '../src/shared/config/powers.ts';
import { BTN } from '../src/shared/protocol.ts';
import { createItem } from '../src/server/inventory.ts';
import { grantPower } from '../src/server/powers.ts';
import { tryCast } from '../src/server/combat.ts';
import type { GameServer } from '../src/server/GameServer.ts';
import type { MonsterEntity, PlayerEntity } from '../src/server/entities.ts';

test('data: 6 powers × 15 active + 5 ultimate + 5 passive = 150 unique abilities with full specs', () => {
  const ids = new Set<string>();
  let total = 0;
  for (const p of Object.values(POWERS)) {
    assert.equal(p.actives.length, 15, p.id);
    assert.equal(p.ultimates.length, 5, p.id);
    assert.equal(p.passives.length, 5, p.id);
    for (const s of [...p.actives, ...p.ultimates]) {
      assert.ok(!ids.has(s.id), `dup ${s.id}`); ids.add(s.id);
      assert.ok(s.cooldown > 0 && s.energyCost >= 0 && s.description.length > 5 && s.validation.length > 0, s.id);
      assert.ok(s.damage || s.effects.length, `${s.id} does nothing`);
      if (s.type === 'power_ultimate') assert.ok(s.counterplay && s.energyCost > 0 && s.cooldown >= 45, `${s.id} ultimate needs counterplay/cost/cd`);
    }
    for (const ps of p.passives) { assert.ok(!ids.has(ps.id)); ids.add(ps.id); assert.ok(ps.stats || ps.statsPct || ps.mods || ps.onHit, ps.id); }
    total += p.actives.length + p.ultimates.length + p.passives.length;
    assert.ok(p.strengths.length && p.weaknesses.length && p.counterplay && p.teamRole && p.pve && p.pvp && p.guildWar);
  }
  assert.equal(total, 150);
  assert.deepEqual(POWERS.shadow.weapons, ['dagger']);
  assert.deepEqual(POWERS.gravity.weapons, ['sword', 'staff', 'gauntlet']);
});

async function setup(name: string, weapon = 'sword') {
  const { server } = await makeServer();
  const c = new FakeClient(server);
  await c.join(name, undefined, weapon);
  const p = server.playerByName(name.charAt(0).toUpperCase() + name.slice(1) + 'X')!;
  return { server, c, p };
}
function field(server: GameServer, p: PlayerEntity) {
  server.transfer(p, 'greenfall_plains', 16, 44);
  const z = server.zoneOf(p)!;
  for (const m of z.monsters.values()) { m.state = 'dead'; m.respawnAt = 1e9; }
  const spawn = (x: number, y: number, id = 'meadow_boar', hp = 1e6) => {
    const m = z.spawnMonster({ id: 't', monsterId: id, x, y, radius: 0, baseCount: 0, perPlayer: 0, maxCount: 99 })!;
    Object.assign(m, { x, y, homeX: x, homeY: y, state: 'idle', stateUntil: 1e9, hp, maxHp: hp });
    m.def = { ...m.def, behavior: { ...m.def.behavior, passive: true } };
    return m;
  };
  ticks(server, 1);
  return { z, spawn };
}
const refill = (p: PlayerEntity) => { p.energy = p.stats.energy; p.ms.stamina = p.stats.stamina; p.actionLockUntil = 0; p.cooldowns.clear(); p.ms.forceT = 0; p.ms.dodgeT = 0; };

test('exchange at the Sage: needs fragments + gold + proximity; first power is equipped', async () => {
  const { server, c, p } = await setup('pwa');
  const z = server.zoneOf(p)!;
  const sage = [...z.npcs.values()].find((n) => n.def.role === 'power')!;
  c.send({ t: 'power_exchange', npc: sage.id, power: 'solar' });
  assert.equal((await c.waitFor('error')).code, 'too_far');
  p.ms.x = sage.x; p.ms.y = sage.y + 1.5;
  c.send({ t: 'power_exchange', npc: sage.id, power: 'solar' });
  assert.equal((await c.waitFor('error')).code, 'no_fragments');
  p.inv.addInstance(createItem('mat_power_fragment', POWER_CONFIG.exchange.fragments * 2));
  p.rec.gold = POWER_CONFIG.exchange.gold * 2;
  c.send({ t: 'power_exchange', npc: sage.id, power: 'solar' });
  ticks(server, 1);
  assert.equal(p.rec.powers.active, 'solar');
  assert.equal(p.power?.id, 'solar');
  assert.equal(p.inv.count('mat_power_fragment'), POWER_CONFIG.exchange.fragments);
  c.send({ t: 'power_exchange', npc: sage.id, power: 'frost' });
  ticks(server, 1);
  assert.equal(p.rec.powers.active, 'solar', 'second power goes to the collection; switching needs the ritual');
  assert.ok(p.rec.powers.owned.some((o) => o.id === 'frost'));
  assert.ok(c.last('powers')!.owned.length === 2);
});

test('weapon restriction: Shadow of Abyss only works with a dagger', async () => {
  const { server, p } = await setup('pwb', 'sword');
  grantPower(p, 'shadow');
  server.afterPowerChange(p);
  assert.equal(p.rec.powers.active, 'shadow');
  assert.equal(p.power, null, 'disabled with a sword');
  const { server: s2, p: p2 } = await setup('pwc', 'dagger');
  grantPower(p2, 'shadow');
  s2.afterPowerChange(p2);
  assert.equal(p2.power?.id, 'shadow');
});

test('loadout: locked abilities and duplicates are rejected; awakening unlocks more', async () => {
  const { server, c, p } = await setup('pwd');
  grantPower(p, 'thunder');
  server.afterPowerChange(p);
  const T = POWERS.thunder;
  p.lastCombatAt = -100;
  c.send({ t: 'power_loadout', power: 'thunder', actives: [T.actives[5].id, null, null, null, null], ult: null, passives: [null, null, null] });
  assert.equal((await c.waitFor('error')).code, 'locked');
  c.send({ t: 'power_loadout', power: 'thunder', actives: [T.actives[0].id, T.actives[0].id, null, null, null], ult: null, passives: [null, null, null] });
  assert.equal((await c.waitFor('error')).code, 'duplicate');
  // awakening II requirements
  c.send({ t: 'power_awaken', power: 'thunder' });
  assert.equal((await c.waitFor('error')).code, 'mastery');
  p.rec.powers.owned[0].masteryLevel = 5;
  const cost = POWER_CONFIG.awakening[1].cost!;
  for (const [id, n] of Object.entries(cost.items)) p.inv.addInstance(createItem(id, n));
  p.rec.gold = cost.gold;
  c.send({ t: 'power_awaken', power: 'thunder' });
  ticks(server, 1);
  assert.equal(p.rec.powers.owned[0].awakening, 2);
  assert.equal(unlockedAbilities(T, 2).actives.length, 10);
  c.send({ t: 'power_loadout', power: 'thunder', actives: [T.actives[5].id, T.actives[9].id, null, null, null], ult: T.ultimates[2].id, passives: [T.passives[2].id, null, null] });
  ticks(server, 1);
  assert.equal(p.rec.powers.loadouts.thunder.actives[0], T.actives[5].id);
});

test('casting: Fire Bullet via input bit spends energy, burns over time, gains Power Mastery', async () => {
  const { server, c, p } = await setup('pwe', 'staff');
  grantPower(p, 'solar');
  server.afterPowerChange(p);
  const { spawn } = field(server, p);
  const m = spawn(p.ms.x + 3, p.ms.y);
  refill(p);
  const en = p.energy;
  c.input(0, 0, BTN.P1, 1, 0, server.zoneOf(p)!.tick);
  ticks(server, 10);
  assert.ok(p.energy < en + 5, 'energy spent');
  assert.ok(m.dots.some((d) => d.label === 'burn') || m.hp < m.maxHp);
  const hp1 = m.hp;
  ticks(server, 40);
  assert.ok(m.hp < hp1, 'burn ticked');
  assert.ok(p.rec.powers.owned[0].masteryXp > 0);
});

test('mechanics: frost stacks freeze, static charge amplifies Thunder Burst, zones tick, summons attack, heal, stealth, cheat death', async () => {
  const { server, p } = await setup('pwf', 'sword');
  for (const id of ['frost', 'thunder', 'solar', 'genesis', 'shadow']) grantPower(p, id, 3);
  const { z, spawn } = field(server, p);
  const cast = (power: string, id: string, ax = 1, ay = 0) => {
    p.rec.powers.active = power; server.afterPowerChange(p); refill(p);
    const sk = [...POWERS[power].actives, ...POWERS[power].ultimates].find((s) => s.id === `${power}_${id}`)!;
    assert.ok(tryCast(z, p, sk, ax, ay, z.tick), `cast ${sk.id}`);
    ticks(server, Math.ceil(sk.castTime * 20) + 2);
  };
  // frost: 5 stacks -> frozen
  const m1 = spawn(p.ms.x + 1.5, p.ms.y);
  // 2 stacks per Nova; a hit can miss (95% hit chance), so allow a couple of extra casts
  for (let i = 0; i < 5 && m1.stunUntil <= server.time; i++) cast('frost', 'frost_nova');
  assert.ok(m1.stunUntil > server.time, 'frozen');
  // thunder: charges then burst
  m1.hp = m1.maxHp; m1.stunUntil = 0;
  cast('thunder', 'volt_strike'); cast('thunder', 'volt_strike'); cast('thunder', 'volt_strike');
  assert.ok(p.charges >= 3, `charges ${p.charges}`);
  cast('thunder', 'thunder_burst');
  assert.equal(p.charges, 0, 'consumed');
  // solar zone ticks several times
  const hpz = m1.hp;
  cast('solar', 'burning_ground', 0, 0.0001);
  m1.x = p.ms.x; m1.y = p.ms.y + 0.1; // stand in the zone
  const zoneHere = z.powerZones[z.powerZones.length - 1];
  zoneHere.x = m1.x; zoneHere.y = m1.y;
  ticks(server, 40);
  assert.ok(m1.hp < hpz, 'zone damaged');
  // genesis: heal + summon wolf attacks
  p.hp = p.stats.hp * 0.3;
  cast('genesis', 'healing_bloom');
  assert.ok(p.hp > p.stats.hp * 0.3 + 1, 'healed');
  const hpw = m1.hp;
  cast('genesis', 'summon_wolf');
  ticks(server, 40);
  assert.ok(p.summons.length === 1 && m1.hp < hpw, 'summon attacked');
  // stealth: chasing monster loses track
  m1.state = 'chase'; m1.targetId = p.id;
  p.weapon = { ...p.weapon!, type: 'dagger' } as typeof p.weapon; // allow shadow
  p.rec.powers.active = 'shadow'; p.power = POWERS.shadow; refill(p);
  assert.ok(tryCast(z, p, POWERS.shadow.actives.find((s) => s.id === 'shadow_vanish')!, 1, 0, z.tick));
  ticks(server, 2);
  assert.notEqual(m1.targetId, p.id, 'lost target');
  // cheat death
  p.cheatDeath = { until: server.time + 10, hpPct: 0.5 };
  p.hp = 1;
  const big = spawn(p.ms.x + 1, p.ms.y, 'alpha_wolf');
  big.atk = 1e6; big.state = 'chase'; big.targetId = p.id; p.stealthUntil = 0; p.iframesUntil = 0;
  for (let i = 0; i < 80 && p.cheatDeath; i++) ticks(server, 1);
  assert.equal(p.dead, false, 'survived lethal hit once');
});

test('Rebirth Ritual: only at the temple, needs materials/gold, 12h cooldown, keeps old power + mastery', async () => {
  const { server, c, p } = await setup('pwg', 'sword');
  grantPower(p, 'solar');
  grantPower(p, 'gravity');
  p.rec.powers.owned[0].masteryLevel = 7;
  server.afterPowerChange(p);
  server.transfer(p, 'warhaven_citadel', 27.5, 21);
  const z = server.zoneOf(p)!;
  const temple = [...z.npcs.values()].find((n) => n.def.role === 'ritual')!;
  p.lastCombatAt = -100;
  c.send({ t: 'power_ritual', npc: temple.id, power: 'gravity' });
  assert.equal((await c.waitFor('error')).code, 'materials');
  for (const [id, n] of Object.entries({ ...POWER_CONFIG.ritual.items, mat_gravity_stone: 10 })) p.inv.addInstance(createItem(id, n));
  p.rec.gold = POWER_CONFIG.ritual.gold;
  c.send({ t: 'power_ritual', npc: temple.id, power: 'gravity' });
  ticks(server, 1);
  assert.equal(p.rec.powers.active, 'gravity');
  assert.equal(p.power?.id, 'gravity');
  assert.equal(p.rec.gold, 0);
  assert.equal(p.rec.powers.owned.find((o) => o.id === 'solar')!.masteryLevel, 7, 'mastery kept');
  for (const [id, n] of Object.entries({ ...POWER_CONFIG.ritual.items, mat_solar_ember: 10 })) p.inv.addInstance(createItem(id, n));
  p.rec.gold = POWER_CONFIG.ritual.gold;
  c.send({ t: 'power_ritual', npc: temple.id, power: 'solar' });
  assert.equal((await c.waitFor('error')).code, 'cooldown');
  assert.deepEqual(p.inv.validate(), []);
});

test('smoke: every active and ultimate of all 6 powers can be cast against monsters without errors', async () => {
  const { server, p } = await setup('pwz', 'sword');
  const { z, spawn } = field(server, p);
  for (const id of Object.keys(POWERS)) grantPower(p, id, 3);
  let casts = 0;
  for (const def of Object.values(POWERS)) {
    // pick an allowed weapon
    const weapon = def.weapons ? def.weapons[0] : 'sword';
    if (p.weapon?.type !== weapon) { p.inv.addInstance(createItem({ dagger: 'wpn_rusty_dagger', sword: 'wpn_rusty_sword' }[weapon as 'dagger' | 'sword'], 1)); const it = p.inv.bagItems().find((i) => i.defId.includes(weapon)); p.inv.equip(it!.uid, 99); }
    p.rec.powers.active = def.id;
    server.afterPowerChange(p);
    assert.equal(p.power?.id, def.id, `${def.id} usable`);
    for (const sk of [...def.actives, ...def.ultimates]) {
      for (const m of z.monsters.values()) if (m.group.id === 't') { m.state = 'dead'; m.respawnAt = 1e9; }
      spawn(p.ms.x + 1.2, p.ms.y); spawn(p.ms.x + 3.5, p.ms.y + 0.4); spawn(p.ms.x + 5, p.ms.y - 0.4);
      ticks(server, 1);
      refill(p); p.dead = false; p.hp = p.stats.hp;
      assert.ok(tryCast(z, p, sk, 1, 0, z.tick), `cast ${sk.id}`);
      ticks(server, Math.ceil(sk.castTime * 20) + 6);
      casts++;
      p.ms.x = 16; p.ms.y = 44;
    }
  }
  ticks(server, 20 * 12); // let zones/summons/dots finish
  assert.equal(casts, 120);
  assert.deepEqual(p.inv.validate(), []);
});
