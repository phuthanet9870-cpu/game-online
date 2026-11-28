// Equipment sets: wearing several pieces of one family adds bonuses at 2 and 3 pieces. Bonuses are ordinary item bonuses (bonus.ts),
// applied by gearOf after the pieces' own scripts. A piece lists the item ids that count for it (same-named rows with other slots / grades).
import type { ItemBonus } from "./bonus.ts";

export type ItemSet = { key: string; name: string; th: string; pieces: number[][]; at: Record<number, ItemBonus[]> };
const b = (type: string, value: number, type2?: string): ItemBonus => (type2 ? { type, type2, value } : { type, value });
export const SETS: readonly ItemSet[] = [
  { key: "forgeborn", name: "Forgeborn", th: "ชุดหลอมเหล็ก", pieces: [[2354], [2419], [2520]],
    at: { 2: [b("bDef", 5), b("bMaxHPrate", 3)], 3: [b("bAtkRate", 5), b("bVit", 3)] } },
  { key: "traveler", name: "Traveler", th: "ชุดนักเดินทาง", pieces: [[2305, 2306], [2505], [2401, 2402, 2403]],
    at: { 2: [b("bFlee", 5)], 3: [b("bAgi", 2), b("bHPrecovRate", 10)] } },
  { key: "seraph", name: "Seraph", th: "ชุดเซราฟ", pieces: [[2355], [2116], [5125]],
    at: { 2: [b("bMaxSPrate", 5), b("bMatkRate", 3)], 3: [b("bInt", 3), b("bMdef", 5)] } },
  { key: "dread", name: "Dread", th: "ชุดสยอง", pieces: [[2375], [2411], [2177]],
    at: { 2: [b("bAtkRate", 4)], 3: [b("bCritAtkRate", 10), b("bAddClass", 5, "Boss")] } },
  { key: "windrunner", name: "Windrunner", th: "ชุดวิ่งตามลม", pieces: [[2534], [2418], [2616]],
    at: { 2: [b("bAspdRate", 3)], 3: [b("bLongAtkRate", 6), b("bDex", 3)] } },
  { key: "bastion", name: "Bastion", th: "ชุดป้อมปราการ", pieces: [[2341], [2110], [2413]],
    at: { 2: [b("bDef", 6), b("bNearAtkDef", 3)], 3: [b("bMaxHPrate", 6), b("bLongAtkDef", 5)] } },
];
export const SET_OF_ITEM = new Map<number, ItemSet>();
for (const s of SETS) for (const p of s.pieces) for (const id of p) SET_OF_ITEM.set(id, s);

/** How many pieces of each set the worn item ids cover. */
export function setCounts(worn: Iterable<number>): Map<ItemSet, number> {
  const ids = new Set(worn), out = new Map<ItemSet, number>();
  for (const s of SETS) { const n = s.pieces.filter((p) => p.some((id) => ids.has(id))).length; if (n >= 2) out.set(s, n); }
  return out;
}
/** The bonuses the worn sets add: every threshold reached. */
export function setBonuses(worn: Iterable<number>): ItemBonus[] {
  const out: ItemBonus[] = [];
  for (const [s, n] of setCounts(worn)) for (const [k, list] of Object.entries(s.at)) if (n >= Number(k)) out.push(...list);
  return out;
}
const LABEL: Record<string, [string, string, boolean?]> = {
  bDef: ["DEF", "DEF"], bMdef: ["MDEF", "MDEF"], bMaxHPrate: ["Max HP", "HP สูงสุด", true], bMaxSPrate: ["Max SP", "SP สูงสุด", true], bAtkRate: ["ATK", "ATK", true],
  bMatkRate: ["MATK", "MATK", true], bVit: ["VIT", "VIT"], bAgi: ["AGI", "AGI"], bInt: ["INT", "INT"], bDex: ["DEX", "DEX"], bFlee: ["FLEE", "FLEE"],
  bHPrecovRate: ["HP recovery", "ฟื้นฟู HP", true], bCritAtkRate: ["Critical damage", "ดาเมจคริติคอล", true], bAddClass: ["Damage to bosses", "ดาเมจต่อบอส", true],
  bAspdRate: ["Attack speed", "ความเร็วโจมตี", true], bLongAtkRate: ["Ranged damage", "ดาเมจระยะไกล", true], bNearAtkDef: ["Melee damage taken", "ลดดาเมจประชิด", true],
  bLongAtkDef: ["Ranged damage taken", "ลดดาเมจระยะไกล", true],
};
export function setBonusText(x: ItemBonus, lang: "en" | "th" = "en") {
  const l = LABEL[x.type] ?? [x.type, x.type];
  const less = x.type.endsWith("AtkDef");
  return `${less ? "-" : "+"}${x.value}${l[2] ? "%" : ""} ${lang === "th" ? l[1] : l[0]}`;
}
