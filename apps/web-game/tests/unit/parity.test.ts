import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONTENT, getPower, getWeapon, type WeaponType } from '../../src/core/content';
import { GameSimulation, type ActionRequest, type SimEvent } from '../../src/core/simulation';
import { arenaMap } from './helpers';

/**
 * Go↔TypeScript parity: fixtures are produced by the Go server engine
 * (server/internal/game/parity_test.go). The offline TS engine must emit the same event stream.
 */
interface Scenario {
  name: string;
  seed: number;
  weapon: WeaponType;
  power?: string;
  points?: number;
  spawns: Array<[string, string, [number, number]]>;
  steps: number;
  dtMs: number;
  inputs: Array<{ step: number; move: [number, number]; aim?: [number, number]; actions?: ActionRequest[] }>;
  events: string[];
}

const r3 = (f: number) => (Math.round(f * 1000) / 1000).toFixed(3);
function record(e: SimEvent): string | null {
  switch (e.type) {
    case 'damage':
      return `${r3(e.time)} damage ${e.sourceId}->${e.targetId} ${e.amount} ${e.isCrit} ${e.actionId}`;
    case 'death':
    case 'respawn':
      return `${r3(e.time)} ${e.type} ${e.entityId}`;
    case 'status':
      return `${r3(e.time)} status ${e.targetId} ${e.statusId}`;
    case 'rejected':
      return `${r3(e.time)} rejected ${e.action} ${e.reason}`;
    case 'ai-state':
      return `${r3(e.time)} ai ${e.entityId} ${e.from}->${e.to}`;
    default:
      return null;
  }
}

const names = ['sword-vs-slime-wolf', 'bow-projectiles', 'inferno-staff-burn-meteor'];

describe('Go ↔ TypeScript engine parity', () => {
  for (const name of names) {
    it(name, () => {
      const sc = JSON.parse(
        readFileSync(
          fileURLToPath(new URL(`../../../../tests/parity/${name}.json`, import.meta.url)),
          'utf8',
        ),
      ) as Scenario;
      const sim = new GameSimulation({
        map: arenaMap(
          sc.spawns.map(([id, monsterId, [tx, ty]]) => ({ id, monsterId, x: tx * 16 + 8, y: ty * 16 + 8 })),
        ),
        weapon: getWeapon(sc.weapon),
        monsters: CONTENT.monsters,
        player: CONTENT.player,
        seed: sc.seed,
      });
      if (sc.power) sim.bindPower(getPower(sc.power)!, sc.points ?? 0);
      const byStep = new Map(sc.inputs.map((i) => [i.step, i]));
      const got: string[] = [];
      let move = { x: 0, y: 0 };
      for (let i = 0; i < sc.steps; i++) {
        const st = byStep.get(i);
        let aim = null;
        let actions: ActionRequest[] = [];
        if (st) {
          move = { x: st.move[0], y: st.move[1] };
          if (st.aim) aim = { x: st.aim[0], y: st.aim[1] };
          actions = st.actions ?? [];
        }
        sim.step(sc.dtMs, { move, aim, actions });
        for (const e of sim.drainEvents()) {
          const s = record(e);
          if (s) got.push(s);
        }
      }
      for (let i = 0; i < Math.max(got.length, sc.events.length); i++)
        expect(got[i], `event #${i}`).toBe(sc.events[i]);
    });
  }
});
