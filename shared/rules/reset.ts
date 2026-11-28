// Stat and skill resets (rAthena pc_resetstate / pc_resetskill, as a town service). A reset gives back every point: stats return to 1 and
// their points are the level's full allowance (statPointsAt, +52 after the rebirth like a High Novice's 100); skills are forgotten except
// Basic Training, and every level spent in them comes back as a skill point. Free while a climber is still finding their feet, then a fee.
import { isTrans } from "./status.ts";
import { statPointsAt } from "./exp.ts";
import type { JobKey } from "./data.ts";

export const RESET_CONF = { freeBelowLevel: 40, statZenyPerLevel: 300, skillZenyPerLevel: 300 };
/** The status points a character holds right after a stat reset (pc_resetstate: the table value of its level; trans +52). */
export const statResetPoints = (job: JobKey, level: number) => statPointsAt(level) + (isTrans(job) ? 52 : 0);
/** The fee of a reset at this base level (0 = free). */
export const resetFee = (kind: "stat" | "skill", level: number, c = RESET_CONF) =>
  level < c.freeBelowLevel ? 0 : level * (kind === "stat" ? c.statZenyPerLevel : c.skillZenyPerLevel);
/** pc_resetskill: the levels handed back (every learned skill but the kept ones) and the skills that stay. */
export function skillReset(learned: Record<number, number>, keep: ReadonlySet<number>) {
  let refund = 0;
  const left: Record<number, number> = {};
  for (const [id, lv] of Object.entries(learned)) {
    if (keep.has(Number(id))) left[Number(id)] = lv; else refund += Math.max(0, lv);
  }
  return { refund, left };
}
