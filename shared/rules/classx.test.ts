import { test } from "node:test";
import assert from "node:assert/strict";
import { CLASSX_JOBS, BEHAVIOR, DROP, describeSkill, sumFx } from "../classx/engine.ts";
import { CLASSX_KEYS } from "../classx/keys.ts";
import { CLASSX_ITEMS } from "../classx/items.ts";
import { JOBS, type JobKey } from "./data.ts";
import { MAPID, isSecondJob, isTrans } from "./status.ts";
import { SKILLS, SKILL_ID, skillReady, skillTree, treeRows, normalizeJob } from "./skill.ts";
import { ITEMS } from "./items.ts";
import { THIRD_OF } from "../content/f1/jobsx.ts";
import { NPC_BY_ID } from "../content/npcs.ts";

test("extended classes: keys, rows and class ids are consistent", () => {
  assert.deepEqual(CLASSX_JOBS.map((j) => j.key), [...CLASSX_KEYS]);
  const ids = new Set<number>();
  for (const j of CLASSX_JOBS) {
    assert.ok(JOBS[j.key as JobKey], j.key);
    assert.equal(JOBS[j.key as JobKey].baseHp.length, JOBS[j.key as JobKey].maxBaseLevel);
    assert.equal(JOBS[j.key as JobKey].jobExp.length, JOBS[j.key as JobKey].maxJobLevel);
    const id = MAPID[j.key as JobKey];
    assert.ok(!ids.has(id), `class id of ${j.key} is unique`); ids.add(id);
  }
  for (const j of Object.keys(JOBS)) assert.ok(j in MAPID, `${j} has a class id`);
});

test("extended classes: every skill has a row, a working use, valid prerequisites and levels", () => {
  for (const j of CLASSX_JOBS) {
    const keys = new Set(j.skills.map((s) => s.k));
    assert.ok(j.skills.length >= 6, `${j.key} has skills of its own`);
    for (const s of j.skills) {
      assert.ok(s.n && s.m, `${s.k} has a name and levels`);
      assert.ok(SKILL_ID[s.k] >= 6000, `${s.k} has an id`);
      assert.ok(skillReady(SKILL_ID[s.k]), `${s.k} works`);
      for (const [rk, lv] of s.req ?? []) { assert.ok(keys.has(rk), `${s.k} requires ${rk} of its own job`); assert.ok(lv <= j.skills.find((x) => x.k === rk)!.m!, `${s.k}: ${rk} level ${lv} exists`); }
      if (s.t === "wpn" || s.t === "mag") assert.ok(s.r, `${s.k} has a ratio`);
      assert.ok(describeSkill(s.k) !== undefined || s.t === "tp", `${s.k} has a description`);
    }
  }
});

test("every tree of every job is fully usable, and cut skills are in no tree", () => {
  for (const job of Object.keys(JOBS)) for (const r of treeRows(job)) {
    assert.ok(skillReady(r.id), `${job}: ${SKILLS.get(r.id)!.key} works`);
    assert.ok(!DROP.has(SKILLS.get(r.id)!.key), `${job}: ${SKILLS.get(r.id)!.key} was cut`);
    for (const q of r.requires) assert.ok(treeRows(job).some((x) => x.id === q.id), `${job}: ${SKILLS.get(r.id)!.key} requires a skill that is in its tree`);
  }
  for (const b of BEHAVIOR.values()) if (b.t === "buff" || b.t === "aura") assert.ok(b.fx && Object.keys(b.fx).length > 0 || b.k === "PF_MEMORIZE", `${b.k} changes something`);
});

test("each class opens its own skills as soon as it has points (no tree stuck on the first job's)", () => {
  const learned: Record<number, number> = { [SKILL_ID.NV_BASIC]: 9 };
  for (const r of treeRows("Taekwon")) learned[r.id] = r.maxLevel; // the points a Striker spent before it became a second job
  for (const j of CLASSX_JOBS) {
    const tree = skillTree(j.key as JobKey, learned, 99, 50, undefined, 40);
    const own = j.skills.filter((s) => !s.req?.length).map((s) => SKILL_ID[s.k]);
    assert.ok(own.every((id) => tree.known.has(id)), `${j.key}: its first skills are open (tree ${tree.job})`);
  }
  assert.equal(normalizeJob("Super_Novice" as JobKey, learned, undefined, 10), "Super_Novice");
});

test("the third dawn maps every transcendent second job to its third job, one to one", () => {
  const thirds = new Set<string>();
  for (const [from, to] of Object.entries(THIRD_OF)) {
    assert.ok(isTrans(from as JobKey) && isSecondJob(from as JobKey), `${from} -> ${to}`);
    assert.ok(MAPID[to as JobKey] & 0x4000, `${to} carries the third-class bit`); thirds.add(to);
  }
  assert.equal(thirds.size, 13);
  assert.ok(NPC_BY_ID.has("npc_job_paths") && NPC_BY_ID.has("npc_third_dawn"));
});

test("the new gear is real: ids are free, guns shoot bullets, kunai is ammo, jobs widen to the new classes", () => {
  const ids = new Set<number>();
  for (const it of CLASSX_ITEMS) { assert.ok(!ids.has(it.id)); ids.add(it.id); assert.equal(ITEMS.get(it.id)!.name, it.name, `${it.name} was not overwritten`); }
  assert.ok((ITEMS.get(3101)!.jobs as string[]).includes("Gunslinger"));
  const dagger = [...ITEMS.values()].find((i) => i.name === "Knife")!;
  assert.ok((dagger.jobs as string[]).includes("Ninja") && (dagger.jobs as string[]).includes("Gunslinger"));
  assert.equal(sumFx([[{ atk: [5, 2] }, 3]]).atk, 11);
});

test("retired pet items are dropped by no monster and sold by no shop", async () => {
  const { RETIRED_ITEMS, SHOP_ITEMS } = await import("./items.ts");
  const { MOB_BY_ID } = await import("./data.ts");
  assert.equal(RETIRED_ITEMS.size, 18);
  for (const m of MOB_BY_ID.values()) for (const d of [...m.drops, ...(m.mvpDrops ?? [])]) assert.ok(!RETIRED_ITEMS.has(d.item), `${m.name} drops ${d.item}`);
  for (const id of SHOP_ITEMS) assert.ok(!RETIRED_ITEMS.has(id));
});
