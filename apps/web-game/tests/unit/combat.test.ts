import { describe, expect, it } from 'vitest';
import { arenaMap, DT, makeSim, press, run } from './helpers';
import type { SimEvent } from '../../src/core/simulation';

const slimeAt = (tx: number, ty: number, id = 'slime_1') => ({
  id,
  monsterId: 'MON-SLIME-001',
  x: tx * 16 + 8,
  y: ty * 16 + 8,
});
const wolfAt = (tx: number, ty: number, id = 'wolf_1') => ({
  id,
  monsterId: 'MON-WOLF-001',
  x: tx * 16 + 8,
  y: ty * 16 + 8,
});

function collect(sim: ReturnType<typeof makeSim>, ms: number, eachStep?: () => void): SimEvent[] {
  const out: SimEvent[] = [];
  const steps = Math.round(ms / DT);
  for (let i = 0; i < steps; i++) {
    eachStep?.();
    sim.step(DT, { move: { x: 0, y: 0 }, actions: [] });
    out.push(...sim.drainEvents());
  }
  return out;
}

describe('sword basic attack', () => {
  it('hits a monster in front, deals damage and knocks it back', () => {
    const sim = makeSim(arenaMap([slimeAt(5, 6)]));
    const slime = sim.monsters[0]!;
    const x0 = slime.pos.x;
    press(sim, { type: 'attack', slot: 'basic' }, slime.pos);
    const events = [...sim.drainEvents(), ...collect(sim, 300)];
    const dmg = events.filter((e) => e.type === 'damage' && e.targetId === slime.id);
    expect(dmg).toHaveLength(1);
    expect(slime.hp).toBeLessThan(slime.def.maxHp);
    expect(slime.pos.x).toBeGreaterThan(x0);
    expect(sim.player.charState).toBe('IN_COMBAT');
  });
  it('misses a monster behind the player', () => {
    const sim = makeSim(arenaMap([slimeAt(1, 6)]));
    sim.player.pos = { x: 5 * 16 + 8, y: 6 * 16 + 8 };
    press(sim, { type: 'attack', slot: 'basic' }, { x: 300, y: 104 });
    collect(sim, 300);
    expect(sim.monsters[0]!.hp).toBe(sim.monsters[0]!.def.maxHp);
  });
  it('respects cooldown (second press rejected or buffered, never double damage early)', () => {
    const sim = makeSim(arenaMap([slimeAt(5, 6)]));
    const slime = sim.monsters[0]!;
    press(sim, { type: 'attack', slot: 'basic' }, slime.pos);
    sim.drainEvents();
    // after action lock ends but before cooldown expires
    run(sim, 200);
    press(sim, { type: 'attack', slot: 'basic' }, slime.pos);
    const ev = sim.drainEvents();
    expect(ev.some((e) => e.type === 'rejected' && e.reason === 'cooldown')).toBe(true);
  });
});

describe('monster death and respawn', () => {
  it('kills a slime by repeated attacks, then it respawns at its spawn point', () => {
    const sim = makeSim(arenaMap([slimeAt(5, 6)]));
    const slime = sim.monsters[0]!;
    sim.debugGodMode = true;
    let guard = 0;
    while (slime.alive && guard++ < 2000) {
      sim.step(DT, { move: { x: 0, y: 0 }, aim: slime.pos, actions: [{ type: 'attack', slot: 'basic' }] });
    }
    expect(slime.alive).toBe(false);
    expect(sim.telemetry.monstersKilled).toBe(1);
    run(sim, slime.def.respawnMs + 100);
    expect(slime.alive).toBe(true);
    expect(slime.hp).toBe(slime.def.maxHp);
    expect(sim.telemetry.monsterRespawns).toBe(1);
  });
});

describe('sword skills (exactly 3)', () => {
  it('Triple Slash hits the same target 3 times', () => {
    const sim = makeSim(arenaMap([wolfAt(5, 6)]));
    const wolf = sim.monsters[0]!;
    press(sim, { type: 'attack', slot: 'skill1' }, wolf.pos);
    const events = [...sim.drainEvents(), ...collect(sim, 700)];
    expect(events.filter((e) => e.type === 'damage' && e.targetId === wolf.id)).toHaveLength(3);
    expect(sim.player.stamina.current).toBeLessThan(sim.player.stamina.max);
  });
  it('Guard Break applies the guard_break status and reduces defense', () => {
    const sim = makeSim(arenaMap([wolfAt(5, 6)]));
    const wolf = sim.monsters[0]!;
    press(sim, { type: 'attack', slot: 'skill2' }, wolf.pos);
    const events = [...sim.drainEvents(), ...collect(sim, 400)];
    expect(events.some((e) => e.type === 'status' && e.statusId === 'guard_break')).toBe(true);
    expect(wolf.statuses.find((s) => s.id === 'guard_break')?.defenseMultiplier).toBe(0.5);
  });
  it('Guard Break interrupts a monster attack windup', () => {
    const sim = makeSim(arenaMap([wolfAt(4, 6)]));
    const wolf = sim.monsters[0]!;
    let guard = 0;
    while (wolf.ai !== 'ATTACK' && guard++ < 600) run(sim, DT);
    expect(wolf.ai).toBe('ATTACK');
    press(sim, { type: 'attack', slot: 'skill2' }, wolf.pos);
    const events = [...sim.drainEvents(), ...collect(sim, 300)];
    expect(events.some((e) => e.type === 'interrupt' && e.entityId === wolf.id)).toBe(true);
  });
  it('Counter Slash negates an incoming hit and strikes back', () => {
    const sim = makeSim(arenaMap([wolfAt(4, 6)]));
    const wolf = sim.monsters[0]!;
    let guard = 0;
    while (wolf.ai !== 'ATTACK' && guard++ < 600) run(sim, DT);
    const hpBefore = sim.player.hp;
    press(sim, { type: 'attack', slot: 'skill3' }, wolf.pos);
    const events = [...sim.drainEvents(), ...collect(sim, wolf.def.attackWindupMs + 100)];
    expect(events.some((e) => e.type === 'counter')).toBe(true);
    expect(sim.player.hp).toBe(hpBefore);
    expect(wolf.hp).toBeLessThan(wolf.def.maxHp);
    expect(sim.telemetry.counters).toBe(1);
  });
  it('uses the sword weapon definition with exactly 3 skills', () => {
    const sim = makeSim();
    expect(sim.weapon.skills).toHaveLength(3);
    expect(sim.weapon.skills.map((s) => s.name)).toEqual(['Triple Slash', 'Guard Break', 'Counter Slash']);
  });
});

describe('dodge / dash and stamina', () => {
  it('dash costs stamina, moves the player and grants i-frames', () => {
    const sim = makeSim();
    const x0 = sim.player.pos.x;
    sim.step(DT, { move: { x: 1, y: 0 }, actions: [{ type: 'dash' }] });
    expect(sim.player.stamina.current).toBe(sim.player.stamina.max - sim.player.base.dash.staminaCost);
    expect(sim.player.invulnerableUntil).toBeGreaterThan(sim.time);
    run(sim, sim.player.base.dash.durationMs + 50, { move: { x: 1, y: 0 } });
    expect(sim.player.pos.x - x0).toBeGreaterThan(sim.player.base.dash.distance * 0.8);
    expect(sim.telemetry.dashStaminaSpent).toBe(sim.player.base.dash.staminaCost);
  });
  it('dash is rejected when stamina is insufficient (no partial spend)', () => {
    const sim = makeSim();
    sim.player.stamina.current = 10;
    sim.step(DT, { move: { x: 1, y: 0 }, actions: [{ type: 'dash' }] });
    const ev = sim.drainEvents();
    expect(ev.some((e) => e.type === 'rejected' && e.reason === 'stamina')).toBe(true);
    expect(sim.player.stamina.current).toBeCloseTo(10, 0);
    expect(sim.player.dash).toBeNull();
  });
  it('stamina regenerates after the regen delay', () => {
    const sim = makeSim();
    sim.step(DT, { move: { x: 1, y: 0 }, actions: [{ type: 'dash' }] });
    const after = sim.player.stamina.current;
    run(sim, 300);
    expect(sim.player.stamina.current).toBe(after);
    run(sim, 1500);
    expect(sim.player.stamina.current).toBeGreaterThan(after);
  });
  it('dash i-frames let the player evade a monster hit', () => {
    const sim = makeSim(arenaMap([wolfAt(4, 6)]));
    const wolf = sim.monsters[0]!;
    let guard = 0;
    while (wolf.ai !== 'ATTACK' && guard++ < 600) run(sim, DT);
    // wait until just before the hit resolves, then dash
    run(sim, wolf.def.attackWindupMs - 80);
    const hp = sim.player.hp;
    sim.step(DT, { move: { x: 0, y: 1 }, actions: [{ type: 'dash' }] });
    const events = [...sim.drainEvents(), ...collect(sim, 200)];
    expect(sim.player.hp).toBe(hp);
    expect(events.some((e) => e.type === 'evade' && e.targetId === 'player' && e.reason === 'dash')).toBe(
      true,
    );
  });
});

describe('player death and respawn', () => {
  it('dies at 0 HP with a death recap, then respawns full at spawn with protection', () => {
    const sim = makeSim(arenaMap([wolfAt(4, 6)]));
    sim.player.hp = 1;
    const events = collect(sim, 4000);
    const death = events.find((e) => e.type === 'death' && e.entityId === 'player');
    expect(death).toBeDefined();
    expect(sim.player.lastDeathRecap.length).toBeGreaterThan(0);
    expect(sim.player.lastDeathRecap[0]!.attackerName).toBe('Grey Wolf');
    run(sim, sim.player.base.respawnDelayMs + 200);
    expect(sim.player.charState === 'IN_WORLD' || sim.player.charState === 'IN_COMBAT').toBe(true);
    expect(sim.telemetry.playerRespawns).toBe(1);
    expect(sim.player.hp).toBeGreaterThan(sim.player.maxHp * 0.9);
  });
  it('character state machine passes IN_WORLD → IN_COMBAT → DEAD → RESPAWNING → IN_WORLD', () => {
    const sim = makeSim(arenaMap([wolfAt(4, 6)]));
    sim.player.hp = 1;
    const events = collect(sim, 8000);
    const seq = events
      .filter((e) => e.type === 'char-state')
      .map((e) => (e.type === 'char-state' ? e.to : ''));
    expect(seq.slice(0, 5)).toEqual(['IN_WORLD', 'IN_COMBAT', 'DEAD', 'RESPAWNING', 'IN_WORLD']);
  });
  it('rejects actions while dead', () => {
    const sim = makeSim(arenaMap([wolfAt(4, 6)]));
    sim.player.hp = 1;
    collect(sim, 3000);
    expect(sim.player.charState).toBe('DEAD');
    press(sim, { type: 'attack', slot: 'basic' });
    expect(sim.drainEvents().some((e) => e.type === 'rejected' && e.reason === 'dead')).toBe(false); // dead: input ignored entirely
    expect(sim.player.action).toBeNull();
  });
});

describe('monster AI state machine', () => {
  it('goes IDLE → ALERT → CHASE → ATTACK when the player is near', () => {
    const sim = makeSim(arenaMap([slimeAt(6, 6)]));
    const states = collect(sim, 3000)
      .filter((e) => e.type === 'ai-state')
      .map((e) => (e.type === 'ai-state' ? e.to : ''));
    expect(states.slice(0, 3)).toEqual(['ALERT', 'CHASE', 'ATTACK']);
  });
  it('patrols when the player is far away', () => {
    const sim = makeSim(arenaMap([slimeAt(9, 9)]));
    sim.player.pos = { x: 24, y: 24 };
    const states = collect(sim, 6000)
      .filter((e) => e.type === 'ai-state')
      .map((e) => (e.type === 'ai-state' ? e.to : ''));
    expect(states).toContain('PATROL');
    expect(states).not.toContain('CHASE');
  });
  it('resets (leash) when pulled too far from spawn and heals to full', () => {
    const sim = makeSim(arenaMap([slimeAt(6, 6)]));
    const slime = sim.monsters[0]!;
    slime.hp = 10;
    collect(sim, 1200);
    slime.pos = { x: slime.spawn.x + slime.def.leashRadius + 20, y: slime.spawn.y };
    const ev = collect(sim, 6000);
    expect(ev.some((e) => e.type === 'ai-state' && e.to === 'RESET')).toBe(true);
    expect(slime.hp).toBe(slime.def.maxHp);
  });
});
