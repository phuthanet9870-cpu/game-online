import { test } from "node:test";
import assert from "node:assert/strict";
import { VARIANTS, VARIANT_CONF, rollVariant, variantHp, variantStatus } from "./variants.ts";
import { MOBS, MOB_BY_ID } from "./data.ts";
import { mobStatus } from "./status.ts";
import { itemNamed } from "./lookup.ts";

test("variants: bosses never vary, ordinary monsters do at the configured rates", () => {
  const boss = MOBS.find((m) => m.bossType !== "None")!, mob = MOB_BY_ID.get(1002)!;
  for (let i = 0; i < 200; i++) assert.equal(rollVariant(boss, i / 200), 0);
  const counts = new Map<number, number>();
  for (let i = 0; i < 10000; i++) { const v = rollVariant(mob, (i + 0.5) / 10000); counts.set(v, (counts.get(v) ?? 0) + 1); }
  for (const v of VARIANTS.slice(1)) assert.equal(counts.get(v.id), v.chance, v.key);
  const off = { ...VARIANT_CONF, enabled: false };
  assert.equal(rollVariant(mob, 0, off), 0);
});

test("variants: numbers scale and every material exists", () => {
  const mob = MOB_BY_ID.get(1063)!, s = mobStatus(mob), e = variantStatus(s, 1);
  assert.equal(variantHp(mob.hp, 1), Math.trunc(mob.hp * 3));
  assert.ok(e.batk > s.batk && e.def >= s.def && (e.addEff?.Stun ?? 0) > 0);
  assert.equal(variantStatus(s, 0), s);
  for (const v of VARIANTS) for (const x of v.extra ?? []) assert.ok(itemNamed(x.item), `${v.key}: ${x.item}`);
  for (const v of VARIANTS.slice(1)) assert.ok(v.exp > 1 || v.zeny > 0 || v.drop > 1, `${v.key} rewards more`);
});
