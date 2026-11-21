import { describe, expect, it } from 'vitest';
import { computePhase1Gate, gatePassed } from '../../src/game/phaseGate';
import { DIR8 } from '../../src/core/direction';
import { makeSim } from './helpers';

describe('Phase 1 gate tracker', () => {
  it('is not passed for a fresh simulation', () => {
    const sim = makeSim();
    expect(gatePassed(computePhase1Gate(sim.telemetry, new Set(), 0))).toBe(false);
  });
  it('passes when every required item is satisfied, optional items do not block', () => {
    const t = makeSim().telemetry;
    Object.assign(t, {
      collisionBlocks: 1,
      damageDealt: 10,
      monstersKilled: 1,
      monsterRespawns: 1,
      dashStaminaSpent: 25,
    });
    t.actionsUsed = { sword_triple_slash: 1, sword_guard_break: 1, sword_counter_slash: 1 };
    expect(gatePassed(computePhase1Gate(t, new Set(DIR8), 0))).toBe(true);
    expect(gatePassed(computePhase1Gate(t, new Set(DIR8), 1))).toBe(false); // runtime error blocks
  });
});
