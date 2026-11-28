// Random equipment affixes: a piece of equipment that drops from a monster rolls extra bonuses on the server, by its grade (fine 1, rare 2,
// epic 3, legendary 4), and keeps them for good on its inventory row (inventory.affixes). An affix is an ordinary item bonus (bonus.ts
// scriptBonus), so every effect it has is one the status / battle code already applies. Reforging rerolls them for materials, with one
// affix optionally locked. All numbers are in AFFIXES / AFFIX_CONF.
import type { Item } from "./items.ts";
import type { ItemBonus } from "./bonus.ts";

export type Affix = { k: string; v: number };
type Def = { k: string; bonus: string; type2?: string; min: number; max: number; on: "weapon" | "armor" | "any"; label: string; th: string; pct?: boolean };
export const AFFIXES: readonly Def[] = [
  { k: "str", bonus: "bStr", min: 1, max: 3, on: "any", label: "STR", th: "STR" },
  { k: "agi", bonus: "bAgi", min: 1, max: 3, on: "any", label: "AGI", th: "AGI" },
  { k: "vit", bonus: "bVit", min: 1, max: 3, on: "any", label: "VIT", th: "VIT" },
  { k: "int", bonus: "bInt", min: 1, max: 3, on: "any", label: "INT", th: "INT" },
  { k: "dex", bonus: "bDex", min: 1, max: 3, on: "any", label: "DEX", th: "DEX" },
  { k: "luk", bonus: "bLuk", min: 1, max: 3, on: "any", label: "LUK", th: "LUK" },
  { k: "atk", bonus: "bBaseAtk", min: 4, max: 12, on: "weapon", label: "ATK", th: "ATK" },
  { k: "atkrate", bonus: "bAtkRate", min: 2, max: 5, on: "weapon", label: "ATK", th: "ATK", pct: true },
  { k: "matkrate", bonus: "bMatkRate", min: 2, max: 5, on: "weapon", label: "MATK", th: "MATK", pct: true },
  { k: "hit", bonus: "bHit", min: 3, max: 10, on: "weapon", label: "HIT", th: "HIT" },
  { k: "crit", bonus: "bCritical", min: 2, max: 6, on: "weapon", label: "Critical", th: "คริติคอล" },
  { k: "aspd", bonus: "bAspdRate", min: 2, max: 5, on: "weapon", label: "Attack speed", th: "ความเร็วโจมตี", pct: true },
  { k: "critdmg", bonus: "bCritAtkRate", min: 5, max: 15, on: "weapon", label: "Critical damage", th: "ดาเมจคริติคอล", pct: true },
  { k: "boss", bonus: "bAddClass", type2: "Boss", min: 3, max: 8, on: "weapon", label: "Damage to bosses", th: "ดาเมจต่อบอส", pct: true },
  { k: "melee", bonus: "bShortAtkRate", min: 3, max: 8, on: "weapon", label: "Melee damage", th: "ดาเมจระยะประชิด", pct: true },
  { k: "ranged", bonus: "bLongAtkRate", min: 3, max: 8, on: "weapon", label: "Ranged damage", th: "ดาเมจระยะไกล", pct: true },
  { k: "maxhp", bonus: "bMaxHP", min: 40, max: 250, on: "armor", label: "Max HP", th: "HP สูงสุด" },
  { k: "maxhprate", bonus: "bMaxHPrate", min: 2, max: 6, on: "armor", label: "Max HP", th: "HP สูงสุด", pct: true },
  { k: "maxsprate", bonus: "bMaxSPrate", min: 2, max: 6, on: "armor", label: "Max SP", th: "SP สูงสุด", pct: true },
  { k: "def", bonus: "bDef", min: 2, max: 6, on: "armor", label: "DEF", th: "DEF" },
  { k: "mdef", bonus: "bMdef", min: 2, max: 6, on: "armor", label: "MDEF", th: "MDEF" },
  { k: "flee", bonus: "bFlee", min: 3, max: 10, on: "armor", label: "FLEE", th: "FLEE" },
  { k: "hpregen", bonus: "bHPrecovRate", min: 5, max: 15, on: "armor", label: "HP recovery", th: "ฟื้นฟู HP", pct: true },
  { k: "spregen", bonus: "bSPrecovRate", min: 5, max: 15, on: "armor", label: "SP recovery", th: "ฟื้นฟู SP", pct: true },
  { k: "nearres", bonus: "bNearAtkDef", min: 2, max: 5, on: "armor", label: "Melee damage taken", th: "ลดดาเมจระยะประชิด", pct: true },
  { k: "longres", bonus: "bLongAtkDef", min: 2, max: 5, on: "armor", label: "Ranged damage taken", th: "ลดดาเมจระยะไกล", pct: true },
];
export const AFFIX_BY_KEY = new Map(AFFIXES.map((a) => [a.k, a]));
/** Affixes by item grade, the extra chance of one more (a dangerous kill: an Elite / Ancient ...), and the reforge prices. */
export const AFFIX_CONF = {
  count: { common: 0, fine: 1, rare: 2, epic: 3, legendary: 4 } as Record<string, number>,
  bonusChance: 0.25, max: 4,
  reforge: { zeny: 2000, material: "Elite Essence", materialCount: 2, lockMaterial: "Ancient Fragment", lockCount: 1 },
};

/** affixes a piece can take: weapons the weapon pool, other worn pieces the armour pool, both the "any" pool; ammo never */
export function poolFor(it: Pick<Item, "type">): Def[] {
  if (it.type === "Weapon") return AFFIXES.filter((a) => a.on !== "armor");
  if (it.type === "Armor") return AFFIXES.filter((a) => a.on !== "weapon");
  return [];
}
/** a higher piece rolls higher numbers: x1 below Lv 25, then +50 % per 25 levels */
export const tierOf = (it: Pick<Item, "equipLevel">) => 1 + Math.floor(Math.max(0, it.equipLevel) / 25) * 0.5;
export const gradeOf = (it: object) => ((it as { grade?: string }).grade ?? "common");

type Rng = () => number;
/** One affix value of a definition for a piece (rounded, at least 1). */
export const rollValue = (d: Def, tier: number, r: Rng) => Math.max(1, Math.round((d.min + r() * (d.max - d.min)) * tier));

/** The affixes a piece gets when it drops: `count` distinct affixes of its pool. `keep` are kept as they are (a locked affix). */
export function rollAffixes(it: Item, r: Rng = Math.random, opts: { count?: number; extra?: boolean; keep?: Affix[] } = {}): Affix[] {
  const pool = poolFor(it);
  if (!pool.length) return [];
  let n = opts.count ?? AFFIX_CONF.count[gradeOf(it)] ?? 0;
  if (opts.extra && r() < AFFIX_CONF.bonusChance) n++;
  n = Math.min(n, AFFIX_CONF.max, pool.length);
  const out: Affix[] = [...(opts.keep ?? [])], tier = tierOf(it);
  const left = pool.filter((d) => !out.some((a) => a.k === d.k));
  while (out.length < n && left.length) {
    const d = left.splice(Math.floor(r() * left.length), 1)[0];
    out.push({ k: d.k, v: rollValue(d, tier, r) });
  }
  return out;
}

/** The item bonuses an item's affixes add (fed through bonus.ts scriptBonus like its own script). Unknown keys are ignored. */
export function affixBonuses(affixes: readonly Affix[] | undefined): ItemBonus[] {
  const out: ItemBonus[] = [];
  for (const a of affixes ?? []) {
    const d = AFFIX_BY_KEY.get(a.k);
    if (d && Number.isFinite(a.v)) out.push(d.type2 ? { type: d.bonus, type2: d.type2, value: a.v } : { type: d.bonus, value: a.v });
  }
  return out;
}
/** "+3 STR", "+4% Damage to bosses", "-3% Melee damage taken" */
export function affixText(a: Affix, lang: "en" | "th" = "en"): string {
  const d = AFFIX_BY_KEY.get(a.k);
  if (!d) return a.k;
  const less = d.k === "nearres" || d.k === "longres";
  return `${less ? "-" : "+"}${a.v}${d.pct ? "%" : ""} ${lang === "th" ? d.th : d.label}`;
}
/** Affixes as they come from the database or a message: kept only when every entry is a known key with a finite number. */
export function cleanAffixes(raw: unknown): Affix[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((a): a is Affix => !!a && typeof a === "object" && AFFIX_BY_KEY.has((a as Affix).k) && Number.isFinite((a as Affix).v)).slice(0, AFFIX_CONF.max);
}
