// Job rows (jobs.json shape) and class ids of the extended classes, built from the specs over an existing job's tables.
import type { JobSpec } from "./types.ts";

type Row = { name: string; maxStats: Record<string, number>; maxWeight: number; maxBaseLevel: number; maxJobLevel: number; baseHp: number[]; baseSp: number[];
  baseExp: number[]; jobExp: number[]; aspdBase: Record<string, number>; bonusStats: unknown[]; trans: boolean };

export function buildJobRows(specs: readonly JobSpec[], base: Record<string, Row>): Record<string, Row> {
  const out: Record<string, Row> = {};
  for (const j of specs) {
    const like = base[j.like] ?? out[j.like];
    if (!like) throw new Error(`classx: ${j.key} is modelled on unknown job ${j.like}`);
    out[j.key] = {
      ...like, name: j.name, trans: j.trans ?? false,
      baseHp: like.baseHp.map((v) => Math.round(v * (j.hp ?? 1))), baseSp: like.baseSp.map((v) => Math.round(v * (j.sp ?? 1))),
      aspdBase: { ...like.aspdBase, ...(j.weapons ?? {}) },
    };
  }
  return out;
}
export const classxMapids = (specs: readonly JobSpec[]) => Object.fromEntries(specs.map((j) => [j.key, j.mapid])) as Record<string, number>;
