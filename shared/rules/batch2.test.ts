import { test } from "node:test";
import assert from "node:assert/strict";
import { RESET_CONF, resetFee, skillReset, statResetPoints } from "./reset.ts";
import { salvageBlock, salvageYield } from "./salvage.ts";
import { SETS, setBonuses, setCounts } from "./sets.ts";
import { ITEMS, gearOf, isBothAccessory, slotsOf } from "./items.ts";
import { playerStatus } from "./status.ts";
import { statPointsAt } from "./exp.ts";
import { DUMMY_ID, MOB_BY_ID } from "./data.ts";
import { rollVariant } from "./variants.ts";
import { MD } from "./mode.ts";
import { itemNamed } from "./lookup.ts";

test("reset: points come back in full, Basic Training stays, free below the threshold", () => {
  assert.equal(statResetPoints("Swordman", 50), statPointsAt(50));
  assert.equal(statResetPoints("Lord_Knight", 50), statPointsAt(50) + 52);
  assert.deepEqual(skillReset({ 1: 9, 5: 10, 7: 3 }, new Set([1])), { refund: 13, left: { 1: 9 } });
  assert.equal(resetFee("stat", RESET_CONF.freeBelowLevel - 1), 0);
  assert.equal(resetFee("skill", 60), 60 * RESET_CONF.skillZenyPerLevel);
});

test("salvage: only bag pieces without cards; yield grows with grade and affixes", () => {
  const rare = [...ITEMS.values()].find((i) => i.type === "Weapon" && (i as { grade?: string }).grade === "rare")!;
  const plain = [...ITEMS.values()].find((i) => i.type === "Weapon" && ((i as { grade?: string }).grade ?? "common") === "common")!;
  assert.equal(salvageBlock(rare, { equip: null, cards: [] }), null);
  assert.ok(salvageBlock(rare, { equip: "weapon", cards: [] }));
  assert.ok(salvageBlock(rare, { equip: null, cards: [4001] }));
  assert.ok(salvageBlock(plain, { equip: null, cards: [] }));
  assert.equal(salvageBlock(plain, { equip: null, cards: [], affixes: [{}] }), null);
  const y = salvageYield(rare, 2), ess = y.find((x) => x.item === "Elite Essence")!;
  assert.equal(ess.count, 3 + 2);
  for (const x of y) assert.ok(itemNamed(x.item), x.item);
});

test("sets: real items, bonuses at 2 and 3 pieces, applied to the status", () => {
  for (const s of SETS) for (const p of s.pieces) for (const id of p) assert.ok(ITEMS.has(id), `${s.key}: item ${id}`);
  const f = SETS.find((s) => s.key === "forgeborn")!;
  assert.equal(setBonuses([2354]).length, 0);
  assert.equal(setCounts([2354, 2419]).get(f), 2);
  assert.equal(setBonuses([2354, 2419, 2520]).length, f.at[2].length + f.at[3].length);
  const pieces = [2354, 2419, 2520].map((id) => ({ item: ITEMS.get(id)!, refine: 0 }));
  const stats = { str: 30, agi: 20, vit: 20, int: 1, dex: 20, luk: 1 };
  const one = playerStatus({ job: "Swordman", level: 60, jobLevel: 40, stats, equip: gearOf(pieces.slice(0, 1)).equip });
  const all = playerStatus({ job: "Swordman", level: 60, jobLevel: 40, stats, equip: gearOf(pieces).equip });
  assert.ok(all.stats.vit - one.stats.vit >= 3); // the 3-piece +3 VIT (a piece may add its own VIT too)
});

test("accessories can be worn (two sides), the training dummy is inert and never a variant", () => {
  const ring = [...ITEMS.values()].find((i) => (i.locations as string[]).includes("Both_Accessory") && i.type === "Armor")!;
  assert.ok(isBothAccessory(ring));
  assert.deepEqual(slotsOf(ring), ["accR"]);
  const d = MOB_BY_ID.get(DUMMY_ID)!;
  assert.equal(d.mode & MD.CANMOVE, 0); assert.equal(d.mode & MD.CANATTACK, 0); assert.equal(d.baseExp, 0); assert.equal(d.drops.length, 0);
  assert.ok(d.hp > 1e9);
  assert.equal(rollVariant({ bossType: "None" }, 0), 1); // (the room skips the roll for a monster that gives no EXP)
});
