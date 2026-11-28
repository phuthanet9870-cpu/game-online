import { test } from "node:test";
import assert from "node:assert/strict";
import { BOOK_CARDS, BOOK_MOBS, MILESTONES, bookKey, claimBlock, discovered, type Book } from "./collection.ts";
import { itemNamed } from "./lookup.ts";
import { DUMMY_ID } from "./data.ts";

test("adventure book: lists, discovery counts, milestone claims pay once", () => {
  assert.ok(BOOK_MOBS.length >= 40 && !BOOK_MOBS.includes(DUMMY_ID));
  assert.equal(BOOK_CARDS.length, 90);
  const book: Book = new Map();
  for (const id of BOOK_MOBS.slice(0, 10)) book.set(bookKey("mob", id), 1);
  book.set(bookKey("mob", BOOK_MOBS[11]), 0);
  assert.equal(discovered(book, "mob"), 10);
  assert.equal(claimBlock(book, new Set(), "mob10"), null);
  assert.equal(claimBlock(book, new Set(["mob10"]), "mob10"), "already claimed");
  assert.equal(claimBlock(book, new Set(), "mob20"), "not reached yet");
  assert.equal(claimBlock(book, new Set(), "nope"), "no such milestone");
  for (const m of MILESTONES) for (const r of m.reward.items ?? []) assert.ok(itemNamed(r.item), `${m.id}: ${r.item}`);
  assert.equal(new Set(MILESTONES.map((m) => m.id)).size, MILESTONES.length);
});
