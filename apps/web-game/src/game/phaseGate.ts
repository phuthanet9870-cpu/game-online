import type { Dir8 } from '../core/direction';
import type { Telemetry } from '../core/simulation';

export interface GateItem {
  id: string;
  label: string;
  done: boolean;
  detail?: string;
  required: boolean;
}

/**
 * Live, client-side view of the Phase 1 Acceptance Gate (spec §24 Phase 01).
 * This is a QA aid for the human tester — the authoritative proof is the automated test suite.
 */
export function computePhase1Gate(
  t: Telemetry,
  facings: ReadonlySet<Dir8>,
  runtimeErrors: number,
): GateItem[] {
  const used = (id: string) => (t.actionsUsed[id] ?? 0) > 0;
  return [
    {
      id: 'move8',
      label: 'เดินครบ 8 ทิศ',
      done: facings.size >= 8,
      detail: `${facings.size}/8`,
      required: true,
    },
    { id: 'collide', label: 'ชนกำแพง/สิ่งกีดขวาง', done: t.collisionBlocks > 0, required: true },
    { id: 'hit', label: 'โจมตีมอนสเตอร์โดน', done: t.damageDealt > 0, required: true },
    {
      id: 'kill',
      label: 'กำจัดมอนสเตอร์',
      done: t.monstersKilled > 0,
      detail: `${t.monstersKilled}`,
      required: true,
    },
    { id: 'respawn', label: 'มอนสเตอร์เกิดใหม่ (respawn)', done: t.monsterRespawns > 0, required: true },
    { id: 'sk1', label: 'Triple Slash', done: used('sword_triple_slash'), required: true },
    { id: 'sk2', label: 'Guard Break', done: used('sword_guard_break'), required: true },
    { id: 'sk3', label: 'Counter Slash', done: used('sword_counter_slash'), required: true },
    { id: 'dodge', label: 'Dodge ใช้ Stamina', done: t.dashStaminaSpent > 0, required: true },
    { id: 'death', label: 'ตาย → เกิดใหม่ (ทางเลือก)', done: t.playerRespawns > 0, required: false },
    { id: 'counterOk', label: 'Counter สำเร็จ (ทางเลือก)', done: t.counters > 0, required: false },
    {
      id: 'noErr',
      label: 'ไม่มี runtime error',
      done: runtimeErrors === 0,
      detail: `${runtimeErrors}`,
      required: true,
    },
  ];
}

export const gatePassed = (items: GateItem[]): boolean => items.every((i) => !i.required || i.done);
