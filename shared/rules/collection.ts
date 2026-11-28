// The Adventure Book: what a climber has met and found, kept for good. Monsters by species (kills), the five monster variants, and every
// card ever picked up. Milestones pay once each (claimed by the player, checked and recorded by the server). Rewards are materials and
// zeny, never combat power, so the book matters without making old players stronger in a fight.
import { MOBS } from "./data.ts";
import { ITEMS } from "./items.ts";
import { VARIANTS } from "./variants.ts";

export type Kind = "mob" | "variant" | "card";
export type Book = Map<string, number>; // `${kind}:${ref}` -> count
export const bookKey = (kind: Kind, ref: number) => `${kind}:${ref}`;
/** The species the book lists: the imported roster with a spawn of its own (Tower species / the dummy are not listed). */
export const BOOK_MOBS = MOBS.filter((m) => m.baseExp > 0).map((m) => m.id);
export const BOOK_CARDS = [...ITEMS.values()].filter((i) => i.type === "Card").map((i) => i.id);
export const BOOK_VARIANTS = VARIANTS.filter((v) => v.id > 0).map((v) => v.id);
/** Kills of one species that "master" it (a star in the book). */
export const MASTERY_KILLS = 100;

export type Milestone = { id: string; title: string; th: string; kind: Kind; need: number; reward: { zeny?: number; items?: { item: string; count: number }[] } };
const ms = (id: string, title: string, th: string, kind: Kind, need: number, reward: Milestone["reward"]): Milestone => ({ id, title, th, kind, need, reward });
export const MILESTONES: readonly Milestone[] = [
  ms("mob10", "Field Notes: 10 species", "บันทึกภาคสนาม: 10 ชนิด", "mob", 10, { zeny: 5000, items: [{ item: "Elite Essence", count: 3 }] }),
  ms("mob20", "Field Notes: 20 species", "บันทึกภาคสนาม: 20 ชนิด", "mob", 20, { zeny: 15000, items: [{ item: "Elite Essence", count: 5 }] }),
  ms("mob30", "Field Notes: 30 species", "บันทึกภาคสนาม: 30 ชนิด", "mob", 30, { zeny: 40000, items: [{ item: "Cursed Ember", count: 3 }] }),
  ms("mobAll", "Bestiary Complete", "สารานุกรมสัตว์ประหลาดครบ", "mob", BOOK_MOBS.length, { zeny: 150000, items: [{ item: "Ancient Fragment", count: 3 }] }),
  ms("var3", "Strange Breeds: 3 variants", "สายพันธุ์แปลก: 3 แบบ", "variant", 3, { items: [{ item: "Elite Essence", count: 5 }] }),
  ms("varAll", "Strange Breeds: all variants", "สายพันธุ์แปลก: ครบทุกแบบ", "variant", BOOK_VARIANTS.length, { items: [{ item: "Ancient Fragment", count: 2 }] }),
  ms("card5", "Card Collector: 5", "นักสะสมการ์ด: 5 ใบ", "card", 5, { zeny: 10000 }),
  ms("card20", "Card Collector: 20", "นักสะสมการ์ด: 20 ใบ", "card", 20, { zeny: 50000, items: [{ item: "Ancient Fragment", count: 1 }] }),
  ms("card50", "Card Collector: 50", "นักสะสมการ์ด: 50 ใบ", "card", 50, { zeny: 200000, items: [{ item: "Ancient Fragment", count: 3 }] }),
];
export const MILESTONE_BY_ID = new Map(MILESTONES.map((m) => [m.id, m]));

/** How many distinct entries of a kind the book holds. */
export function discovered(book: Book, kind: Kind): number {
  const list = kind === "mob" ? BOOK_MOBS : kind === "card" ? BOOK_CARDS : BOOK_VARIANTS;
  return list.filter((ref) => (book.get(bookKey(kind, ref)) ?? 0) > 0).length;
}
export const milestoneReached = (book: Book, m: Milestone) => discovered(book, m.kind) >= m.need;
/** Why a milestone can't be claimed now, or null. */
export function claimBlock(book: Book, claimed: ReadonlySet<string>, id: string): string | null {
  const m = MILESTONE_BY_ID.get(id);
  if (!m) return "no such milestone";
  if (claimed.has(id)) return "already claimed";
  if (!milestoneReached(book, m)) return "not reached yet";
  return null;
}
