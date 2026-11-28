// Turns the JobSpec tables into what the rest of the rules expect: skills.json-shaped rows, skill_tree.json-shaped trees and
// jobs.json-shaped job rows. Pure data, built once at load.
import { CLASSX_JOBS } from "./engine.ts";
import { val, type Sk, type T } from "./types.ts";
import type { Skill } from "../rules/skill.ts";

export const CLASSX_SKILL_BASE = 6000;
const TARGET: Record<T, string> = { wpn: "Attack", mag: "Attack", magTgt: "Attack", dbf: "Attack", wpnSelf: "Self", magSelf: "Self", buff: "Self", aura: "Self", tp: "Self", wpnTgt: "Attack", wpnGnd: "Ground", magGnd: "Ground", heal: "Support", pas: "Passive" };
const TYPE: Partial<Record<T, string>> = { wpn: "Weapon", wpnSelf: "Weapon", wpnTgt: "Weapon", wpnGnd: "Weapon", mag: "Magic", magTgt: "Magic", magSelf: "Magic", magGnd: "Magic", heal: "Magic" };

function row(id: number, s: Sk): Skill {
  const m = s.m ?? 1, per = (f: (lv: number) => number) => Array.from({ length: m }, (_, i) => Math.round(f(i + 1)));
  const rg = s.rg ?? (s.t === "wpn" ? 2 : s.t === "heal" || s.t === "mag" || s.t === "magTgt" || s.t === "dbf" ? 9 : s.t === "magGnd" || s.t === "wpnGnd" ? 9 : 0);
  const magic = s.t.startsWith("mag") || s.t === "heal";
  return {
    id, key: s.k, name: s.n ?? s.k, maxLevel: m, type: TYPE[s.t] ?? null, target: TARGET[s.t], range: per(() => rg),
    hit: (s.h ?? 1) > 1 ? "Multi_Hit" : "Single", hitCount: per(() => s.h ?? 1), element: per(() => 0).map(() => s.e && s.e !== "W" ? s.e : magic || s.t === "dbf" ? "Neutral" : "Weapon"),
    splash: per(() => s.spl ?? (s.t === "aura" ? -1 : 0)), knockback: per(() => 0),
    castTime: per(() => s.cast ?? 0), fixedCastTime: per(() => 0), delay: per(() => s.dl ?? 300), walkDelay: per(() => 0), cooldown: per(() => s.cd ?? 0),
    duration1: per((lv) => val(s.d, lv)), duration2: per(() => s.st?.[3] ?? 0),
    castCancel: true, castDefenseReduction: 0, castTimeFlags: [], castDelayFlags: [], damageFlags: [], flags: [],
    sp: per((lv) => (s.sp ? s.sp[0] + s.sp[1] * lv : 10 + 2 * lv)), hp: per(() => 0), zeny: per(() => 0), hpRateCost: per(() => 0), spRateCost: per(() => 0),
    weapons: s.w ? [...s.w] : null, ammo: s.ammo ? [...s.ammo] : null, ammoAmount: per(() => (s.ammo ? 1 : 0)), status: null,
  };
}

export const CLASSX_ROWS: Skill[] = [];
const idOf = new Map<string, number>();
{
  let n = CLASSX_SKILL_BASE;
  for (const j of CLASSX_JOBS) for (const s of j.skills) if (s.n && !idOf.has(s.k)) { idOf.set(s.k, n); CLASSX_ROWS.push(row(n, s)); n++; }
}
export const classxSkillId = (key: string) => idOf.get(key);

type TreeRow = { id: number; maxLevel: number; requires: { id: number; level: number }[]; baseLevel: number; jobLevel: number };
export const CLASSX_TREES: Record<string, { inherit: string[]; tree: TreeRow[] }> = {};
for (const j of CLASSX_JOBS) {
  CLASSX_TREES[j.key] = {
    inherit: j.inherit,
    tree: j.skills.filter((s) => s.n).map((s) => ({
      id: idOf.get(s.k)!, maxLevel: s.m ?? 1, baseLevel: 0, jobLevel: 0,
      requires: (s.req ?? []).map(([k, level]) => ({ id: idOf.get(k) ?? -1, level })).filter((q) => q.id >= 0),
    })),
  };
}
