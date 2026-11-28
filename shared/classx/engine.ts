// The generic skill engine's lookups: merge the spec tables into one behaviour map and answer the questions skill.ts, status_change.ts
// and the server ask (what kind of skill, what ratio, which status, what numbers).
import type { Element } from "../rules/data.ts";
import { DROP, EXISTING } from "./existing.ts";
import { EXPANDED_JOBS } from "./expanded.ts";
import { THIRD_JOBS } from "./third.ts";
import { val, type Fx, type JobSpec, type Sk, type T } from "./types.ts";

export const CLASSX_JOBS: JobSpec[] = [...EXPANDED_JOBS, ...THIRD_JOBS];
export const BEHAVIOR = new Map<string, Sk>();
for (const s of EXISTING) BEHAVIOR.set(s.k, s);
for (const j of CLASSX_JOBS) for (const s of j.skills) BEHAVIOR.set(s.k, s);
export { DROP };

/** The kind of use (shared/rules/skill.ts SkillUse) each behaviour type runs as. */
export const KIND: Record<T, string> = {
  wpn: "weapon", mag: "magic", magTgt: "targetSplash", wpnSelf: "selfSplash", magSelf: "selfMagic", wpnTgt: "targetSplash", wpnGnd: "groundSplash", magGnd: "groundMagic",
  buff: "status", dbf: "status", aura: "aura", heal: "heal", pas: "", tp: "tp",
};
export const isPassiveFx = (k: string) => BEHAVIOR.get(k)?.t === "pas";

/** Percent damage ratio of a generic skill at a level (undefined = not generic). */
export function ratioOf(key: string, lv: number): number | undefined {
  const s = BEHAVIOR.get(key);
  return s?.r ? s.r[0] + s.r[1] * lv : undefined;
}

// ---- generic statuses ("G_<skill key>") ----
export const GENERIC_PREFIX = "G_";
export const gKey = (skill: string) => GENERIC_PREFIX + skill;
/** Every skill key a G_ status can come from (buffs, auras, debuffs, and `st` procs with a G_ name). */
export const GFX = new Map<string, { fx: Fx; debuff: boolean }>();
for (const s of BEHAVIOR.values()) {
  if (s.t === "buff" || s.t === "aura" || s.t === "dbf") GFX.set(gKey(s.k), { fx: s.fx ?? {}, debuff: s.t === "dbf" });
  if (s.st && s.st[0].startsWith(GENERIC_PREFIX) && !GFX.has(s.st[0])) GFX.set(s.st[0], { fx: s.fx ?? {}, debuff: true });
}
export const isGeneric = (k: string) => k.startsWith(GENERIC_PREFIX);

/** The summed numbers of a set of generic statuses: entries are [status key, skill level]. */
export type FxSum = { atk: number; matk: number; def: number; mdef: number; hit: number; flee: number; cri: number; aspd: number; hp: number; sp: number;
  str: number; agi: number; vit: number; int: number; dex: number; luk: number; ms: number; red: number; block: number; weapon: number; hpr: number; spr: number; ele?: Element };
const KEYS = ["atk", "matk", "def", "mdef", "hit", "flee", "cri", "aspd", "hp", "sp", "str", "agi", "vit", "int", "dex", "luk", "ms", "red", "block", "weapon", "hpr", "spr"] as const;
export function sumFx(list: Iterable<readonly [fx: Fx, lv: number]>): FxSum {
  const o = Object.fromEntries(KEYS.map((k) => [k, 0])) as unknown as FxSum;
  for (const [fx, lv] of list) {
    for (const k of KEYS) { const v = fx[k]; if (v !== undefined) o[k] += val(v, lv); }
    if (fx.ele) o.ele = fx.ele;
  }
  return o;
}
/** Passive skills: levels by skill key -> summed numbers. */
export function passiveFx(levels: Record<string, number>): FxSum {
  const list: [Fx, number][] = [];
  for (const [k, lv] of Object.entries(levels)) { const s = BEHAVIOR.get(k); if (s?.t === "pas" && s.fx && lv > 0) list.push([s.fx, lv]); }
  return sumFx(list);
}
export const PASSIVE_KEYS: readonly string[] = [...BEHAVIOR.values()].filter((s) => s.t === "pas").map((s) => s.k);

// ---- tooltip text for generic skills ----
const FX_LABEL: Record<string, [string, string]> = {
  atk: ["attack", "%"], matk: ["magic attack", "%"], def: ["defence", "%"], mdef: ["magic defence", ""], hit: ["hit", ""], flee: ["flee", ""], cri: ["critical", ""],
  aspd: ["attack speed", ""], hp: ["max HP", "%"], sp: ["max SP", "%"], str: ["STR", ""], agi: ["AGI", ""], vit: ["VIT", ""], int: ["INT", ""], dex: ["DEX", ""], luk: ["LUK", ""],
  ms: ["walk speed", "%"], red: ["damage taken", "% less"], block: ["chance to stop a hit", "%"], weapon: ["weapon damage", ""], hpr: ["HP recovery", "%"], spr: ["SP recovery", "%"],
};
const num = (n: number | readonly [number, number]) => (typeof n === "number" ? `${n}` : n[1] === 0 ? `${n[0]}` : n[0] === 0 ? `${n[1]} per level` : `${n[0]} + ${n[1]} per level`);
/** One or two sentences of what a generic skill does, built from its data row. Hand-written text (shared/content/skill_text.ts) wins. */
export function describeSkill(key: string): string | undefined {
  const s = BEHAVIOR.get(key);
  if (!s) return undefined;
  const parts: string[] = [];
  const ele = s.e && s.e !== "W" ? ` (${s.e.toLowerCase()})` : "";
  if (s.r) {
    const base = s.t.startsWith("mag") ? "magic" : "weapon";
    const where = s.t === "wpnSelf" || s.t === "magSelf" ? " on every enemy around you" : s.t === "wpnGnd" || s.t === "magGnd" ? " on every enemy at a chosen spot" : s.t === "wpnTgt" || s.t === "magTgt" ? " on a target and its neighbours" : "";
    parts.push(`${base === "magic" ? "Magic" : "Weapon"} strike${where}${ele}: ${s.r[0]}%${s.r[1] ? ` + ${s.r[1]}% per level` : ""} of your ${base === "magic" ? "MATK" : "ATK"}${s.h && s.h > 1 ? `, ${s.h} hits` : ""}.`);
  }
  if (s.t === "heal") parts.push("Restores an ally's HP.");
  if (s.t === "tp") parts.push("Hop to a random spot nearby.");
  if (s.fx) {
    const bits = Object.entries(s.fx).filter(([k]) => k !== "ele").map(([k, v]) => {
      const [name, unit] = FX_LABEL[k] ?? [k, ""];
      const n = num(v as number | readonly [number, number]);
      return unit.startsWith("% ") ? `${name} ${n}${unit}` : `${Number(typeof v === "number" ? v : v[0]) < 0 && !n.includes("per") ? "" : "+"}${n}${unit} ${name}`;
    });
    if (s.fx.ele) bits.push(`your weapon becomes ${s.fx.ele.toLowerCase()}`);
    const who = s.t === "aura" ? "You and your party nearby" : s.t === "dbf" ? "The target" : "You";
    if (bits.length) parts.push(`${s.t === "pas" ? "Passive:" : who + ":"} ${bits.join(", ")}.`);
  }
  if (s.st) parts.push(`May inflict ${s.st[0].replace(/^G_/, "").toLowerCase().replace(/_/g, " ")} (${s.st[1]}%${s.st[2] ? ` + ${s.st[2]}% per level` : ""}).`);
  if (s.info) parts.unshift(s.info);
  return parts.join(" ") || undefined;
}
