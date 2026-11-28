// Salvage: a piece of equipment that came off a monster (fine grade or better, or one with affixes) is broken down at the forgemaster into
// the materials reforging spends. It is the sure road: unlucky drops still turn into progress. A worn piece, one with cards in it, or a
// plain common shop piece can't be salvaged.
import type { Item } from "./items.ts";

export const SALVAGE_YIELD: Record<string, { item: string; count: number }[]> = {
  common: [{ item: "Elite Essence", count: 1 }],
  fine: [{ item: "Elite Essence", count: 2 }],
  rare: [{ item: "Elite Essence", count: 3 }, { item: "Cursed Ember", count: 1 }],
  epic: [{ item: "Elite Essence", count: 5 }, { item: "Cursed Ember", count: 2 }, { item: "Ancient Fragment", count: 1 }],
  legendary: [{ item: "Elite Essence", count: 8 }, { item: "Cursed Ember", count: 3 }, { item: "Ancient Fragment", count: 2 }],
};
export const SALVAGE_FEE = 100;
export const gradeKey = (it: object) => ((it as { grade?: string }).grade ?? "common");

/** Why this bag row can't be salvaged, or null. */
export function salvageBlock(it: Item | undefined, row: { equip: string | null; cards: readonly number[]; affixes?: readonly unknown[] } | undefined): string | null {
  if (!it || !row) return "that item is gone";
  if (it.type !== "Weapon" && it.type !== "Armor") return "only weapons and armour can be salvaged";
  if (row.equip) return "take it off first";
  if (row.cards.length) return "it has cards in it";
  if (gradeKey(it) === "common" && !(row.affixes?.length)) return "there is nothing in a plain shop piece to salvage";
  return null;
}
/** What a piece breaks into: its grade's yield, +1 Elite Essence per affix. */
export function salvageYield(it: Item, affixes = 0) {
  const base = (SALVAGE_YIELD[gradeKey(it)] ?? SALVAGE_YIELD.common).map((y) => ({ ...y }));
  if (affixes) { const e = base.find((y) => y.item === "Elite Essence"); if (e) e.count += affixes; else base.push({ item: "Elite Essence", count: affixes }); }
  return base;
}
