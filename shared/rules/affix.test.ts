import { test } from "node:test";
import assert from "node:assert/strict";
import { AFFIX_CONF, affixBonuses, cleanAffixes, poolFor, rollAffixes, type Affix } from "./affix.ts";
import { ITEMS, gearOf } from "./items.ts";
import { playerStatus } from "./status.ts";

const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };
const byGrade = (g: string, type: string) => [...ITEMS.values()].find((i) => (i as { grade?: string }).grade === g && i.type === type)!;

test("affixes: count by grade, distinct keys from the piece's own pool", () => {
  for (const g of ["fine", "rare", "epic"]) {
    const it = byGrade(g, "Weapon");
    if (!it) continue;
    const ax = rollAffixes(it, Math.random);
    assert.equal(ax.length, AFFIX_CONF.count[g], `${g}: ${it.name}`);
    assert.equal(new Set(ax.map((a) => a.k)).size, ax.length);
    const pool = new Set(poolFor(it).map((d) => d.k));
    for (const a of ax) assert.ok(pool.has(a.k) && a.v >= 1);
  }
  assert.deepEqual(rollAffixes(byGrade("common", "Weapon")), []);
  assert.deepEqual(rollAffixes([...ITEMS.values()].find((i) => i.type === "Healing")!), []);
  const arrow = [...ITEMS.values()].find((i) => i.type === "Ammo")!;
  assert.equal(poolFor(arrow).length, 0);
});

test("affixes: a locked affix is kept as it is, the extra roll adds at most one", () => {
  const it = byGrade("rare", "Weapon"), keep: Affix = { k: "boss", v: 7 };
  const ax = rollAffixes(it, Math.random, { count: 2, keep: [keep] });
  assert.deepEqual(ax[0], keep); assert.equal(ax.length, 2); assert.notEqual(ax[1].k, "boss");
  assert.equal(rollAffixes(it, seq([0]), { extra: true }).length, AFFIX_CONF.count.rare + 1); // r() = 0 < bonusChance
  assert.equal(rollAffixes(it, seq([0.99]), { count: 9 }).length, AFFIX_CONF.max);
});

test("affixes change the status like the item's own script would", () => {
  const sword = [...ITEMS.values()].find((i) => i.type === "Weapon" && i.subType === "1hSword")!;
  const stats = { str: 30, agi: 20, vit: 20, int: 1, dex: 20, luk: 1 };
  const base = playerStatus({ job: "Swordman", level: 30, jobLevel: 10, stats, equip: gearOf([{ item: sword, refine: 0 }]).equip });
  const withAx = playerStatus({ job: "Swordman", level: 30, jobLevel: 10, stats, equip: gearOf([{ item: sword, refine: 0, affixes: [{ k: "str", v: 3 }, { k: "hit", v: 8 }] }]).equip });
  assert.equal(withAx.stats.str, base.stats.str + 3);
  assert.ok(withAx.hit >= base.hit + 8);
  assert.deepEqual(affixBonuses([{ k: "boss", v: 5 }]), [{ type: "bAddClass", type2: "Boss", value: 5 }]);
});

test("affixes from storage are cleaned: unknown keys and bad numbers are dropped", () => {
  assert.deepEqual(cleanAffixes([{ k: "str", v: 2 }, { k: "godmode", v: 1 }, { k: "dex", v: "x" }, null, 5]), [{ k: "str", v: 2 }]);
  assert.deepEqual(cleanAffixes("nope"), []);
  assert.equal(cleanAffixes(Array.from({ length: 9 }, () => ({ k: "str", v: 1 }))).length, AFFIX_CONF.max);
});
