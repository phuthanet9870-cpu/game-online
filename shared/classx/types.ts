// Extended classes and the generic skill engine. Every skill we add (and every existing skill that had no code of its own) is one row of
// plain data here: what it does (`t`), its damage ratio, buff numbers (`fx`) and the status it may leave on a target (`st`). The engine
// (shared/rules/skill.ts, status_change.ts, server/src/skills*.ts) reads this table; nothing here knows about rooms or clocks.
import type { Element } from "../rules/data.ts";

/** A per-level number: a constant, or [base, perLevel] meaning base + perLevel x skill level. */
export type N = number | readonly [number, number];
export const val = (n: N | undefined, lv: number) => (n === undefined ? 0 : typeof n === "number" ? n : n[0] + n[1] * lv);

/** What a buff / passive / debuff changes. Percent fields are whole percents; the rest are flat. */
export type Fx = {
  atk?: N; matk?: N; def?: N; mdef?: N; hit?: N; flee?: N; cri?: N; aspd?: N; hp?: N; sp?: N;
  str?: N; agi?: N; vit?: N; int?: N; dex?: N; luk?: N;
  ms?: N; // walk speed %, positive = faster
  red?: N; // % of all damage taken that is ignored
  block?: N; // % chance a weapon hit is stopped entirely
  weapon?: N; // flat extra weapon ATK (passive masteries)
  ele?: Element; // endows the weapon
  hpr?: N; spr?: N; // natural HP / SP regeneration, %
};

/** The shape of a skill:
 *  wpn / mag = one target, weapon / magic damage · wpnSelf / magSelf = around the caster · wpnTgt = target and its surroundings ·
 *  wpnGnd / magGnd = on a chosen cell · buff = status on self (or a chosen ally) · aura = status on self and the party nearby ·
 *  dbf = a debuff on an enemy · heal = restores HP · pas = a passive. */
export type T = "wpn" | "mag" | "magTgt" | "wpnSelf" | "magSelf" | "wpnTgt" | "wpnGnd" | "magGnd" | "buff" | "aura" | "dbf" | "heal" | "pas" | "tp";

export type Sk = {
  k: string; // skill key
  n?: string; // display name (rows we create; existing skills keep theirs)
  m?: number; // max level (new rows)
  t: T;
  r?: readonly [number, number]; // damage ratio % = a + b x lv
  e?: Element | "W"; // element, W = the weapon's own
  h?: number; // hits
  spl?: number; // splash radius
  rg?: number; // range in cells (negative = weapon range)
  sp?: readonly [number, number]; // SP cost = a + b x lv
  cast?: number; dl?: number; cd?: number; // ms
  d?: readonly [number, number]; // duration ms = a + b x lv
  w?: readonly string[]; ammo?: readonly string[];
  /** a status the hit (or a debuff cast) leaves: [status key, chance % base, chance % per level, duration ms] */
  st?: readonly [string, number, number, number];
  fx?: Fx;
  req?: readonly (readonly [string, number])[]; // prerequisites in the same job's tree (skill key, level)
  ico?: string; // icon glyph hint
  info?: string; // one line for the tooltip
};

/** A job we add: a template for its numbers, the trees it inherits, its own skills and what it wields. */
export type JobSpec = {
  key: string; name: string; like: string; // `like`: an existing job whose HP / SP / EXP / ASPD tables it borrows
  mapid: number; inherit: string[]; trans?: boolean;
  hp?: number; sp?: number; // table multipliers
  weapons?: Record<string, number>; // extra ASPD bases
  skills: Sk[];
  gear?: string[]; // jobs whose equipment it can wear
};
