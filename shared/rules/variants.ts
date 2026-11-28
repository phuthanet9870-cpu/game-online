// Monster variants: a monster of a field's ordinary spawn may rise as an Elite, Golden, Cursed, Ancient or Shiny version of itself.
// Rolled by the server when the monster spawns (bosses, MVPs, guardians and summoned slaves never vary), synced as Monster.variant
// so clients colour and name it, and read again on death for the rewards. Every number is in VARIANTS / VARIANT_CONF.
import type { Mob } from "./data.ts";
import type { MobStatus } from "./status.ts";
import type { ScKey } from "./status_change.ts";

export type Variant = {
  id: number; key: "normal" | "elite" | "golden" | "cursed" | "ancient" | "shiny";
  /** shown before the monster's name */
  title: string;
  /** chance in 1/10000 for an ordinary monster */
  chance: number;
  hp: number; atk: number; def: number; hit: number; flee: number; speed: number; // multipliers (speed < 1 = faster walk)
  exp: number; drop: number; card: number; // EXP, item and card drop rate multipliers
  zeny: number; // zeny given to the loot owner, x the monster's level (0 = none)
  addEff?: Partial<Record<ScKey, number>>; // what its hits may inflict (1/10000)
  extra?: { item: string; rate: number }[]; // a material it always may drop (rate 1/10000)
  colour: string; // name colour (CSS) and sprite tint
};
export const VARIANTS: readonly Variant[] = [
  { id: 0, key: "normal", title: "", chance: 0, hp: 1, atk: 1, def: 1, hit: 1, flee: 1, speed: 1, exp: 1, drop: 1, card: 1, zeny: 0, colour: "#ffffff" },
  { id: 1, key: "elite", title: "Elite", chance: 300, hp: 3, atk: 1.4, def: 1.3, hit: 1.15, flee: 1.1, speed: 0.85, exp: 3, drop: 2, card: 2, zeny: 0,
    addEff: { Stun: 800 }, extra: [{ item: "Elite Essence", rate: 6000 }], colour: "#ff9a3c" },
  { id: 2, key: "golden", title: "Golden", chance: 100, hp: 2, atk: 1, def: 2, hit: 1, flee: 1.4, speed: 0.7, exp: 1, drop: 3, card: 1, zeny: 60, colour: "#ffd34a" },
  { id: 3, key: "cursed", title: "Cursed", chance: 150, hp: 2, atk: 1.5, def: 1, hit: 1.1, flee: 1, speed: 1, exp: 2.5, drop: 2, card: 2, zeny: 0,
    addEff: { Curse: 1500, Silence: 600 }, extra: [{ item: "Cursed Ember", rate: 5000 }], colour: "#b06cff" },
  { id: 4, key: "ancient", title: "Ancient", chance: 60, hp: 5, atk: 1.8, def: 1.5, hit: 1.2, flee: 1, speed: 1.1, exp: 4, drop: 2, card: 3, zeny: 0,
    extra: [{ item: "Ancient Fragment", rate: 10000 }], colour: "#d8b27a" },
  { id: 5, key: "shiny", title: "Shiny", chance: 20, hp: 1.5, atk: 1, def: 1, hit: 1, flee: 1.2, speed: 1, exp: 5, drop: 2, card: 10, zeny: 0, colour: "#7ff0ff" },
];
export const VARIANT_BY_ID = new Map(VARIANTS.map((v) => [v.id, v]));
/** chanceScale multiplies every variant's chance (GM / events can raise it); enabled turns the system off. */
export const VARIANT_CONF = { enabled: true, chanceScale: 1 };

/** Which variant a spawning monster is: never for a boss / MVP; otherwise one roll against the summed chances. */
export function rollVariant(def: Pick<Mob, "bossType">, roll: number, conf = VARIANT_CONF): number {
  if (!conf.enabled || def.bossType !== "None") return 0;
  let at = Math.floor(roll * 10000);
  for (const v of VARIANTS) {
    const c = Math.round(v.chance * conf.chanceScale);
    if (!c) continue;
    if (at < c) return v.id;
    at -= c;
  }
  return 0;
}

const t = Math.trunc;
/** A monster's status with its variant's numbers. */
export function variantStatus(s: MobStatus, id: number): MobStatus {
  const v = VARIANT_BY_ID.get(id);
  if (!v || id === 0) return s;
  return {
    ...s, maxHp: t(s.maxHp * v.hp), batk: t(s.batk * v.atk), watk: t(s.watk * v.atk), atkMin: t(s.atkMin * v.atk), atkMax: t(s.atkMax * v.atk),
    def: t(s.def * v.def), def2: t(s.def2 * v.def), mdef: t(s.mdef * v.def), hit: t(s.hit * v.hit), flee: t(s.flee * v.flee),
    walkMs: t(s.walkMs * v.speed), addEff: { ...(s.addEff ?? {}), ...(v.addEff ?? {}) },
  };
}
export const variantHp = (hp: number, id: number) => t(hp * (VARIANT_BY_ID.get(id)?.hp ?? 1));
