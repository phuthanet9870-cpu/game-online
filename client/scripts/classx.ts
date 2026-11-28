// Extended classes check: for each job, a GM sets the job and levels, the bot learns the whole tree and casts every skill once
// against Puddlebloom monsters spawned beside it. Reports casts that worked and why the others did not (a missing weapon or ammo
// is expected; "not implemented" and silence are bugs).
//   GM_PASSPHRASE=<phrase> node server/src/index.ts ;  node client/scripts/classx.ts [serverUrl] <phrase> [job,job,...]
import { Msg, type GmResultEvent, type SkillFailEvent, type SkillsEvent, type SkillUseEvent, type StatusEvent } from "../../shared/protocol.ts";
import { SKILLS, skillUse, treeRows } from "../../shared/rules/skill.ts";
import { CLASSX_KEYS } from "../../shared/classx/keys.ts";
import { joinAs } from "./bot.ts";
import { FIELD } from "../../shared/maps.ts";

const url = process.argv[2] ?? "http://localhost:2567", phrase = process.argv[3] ?? process.env.GM_PASSPHRASE ?? "";
const jobs = (process.argv[4] ? process.argv[4].split(",") : [...CLASSX_KEYS, "Lord_Knight", "Knight", "Priest", "Stalker"]);
const fail = (m: string): never => { console.error(`FAIL: ${m}`); process.exit(1); };
setTimeout(() => fail("timed out"), 600_000);
if (!phrase) fail("pass the GM passphrase");
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const { room: r } = await joinAs(url, "classx_bot", "ClassBot", true);
let gm: GmResultEvent | undefined, gmOn = false, skills: SkillsEvent | undefined, own: StatusEvent | undefined;
const used = new Set<number>(), failed = new Map<number, string>();
r.onMessage(Msg.gmResult, (m: GmResultEvent) => { gm = m; });
r.onMessage(Msg.gmState, () => { gmOn = true; });
r.onMessage(Msg.skills, (m: SkillsEvent) => { skills = m; });
r.onMessage(Msg.status, (m: StatusEvent) => { own = m; });
r.onMessage(Msg.skillUse, (m: SkillUseEvent) => { if (m.src === r.sessionId) used.add(m.id); });
r.onMessage(Msg.skillFail, (m: SkillFailEvent) => { failed.set(m.id, m.why); });
r.onMessage("*", () => {});
r.send(Msg.gmAuth, { phrase });
for (let i = 0; i < 40 && !gmOn; i++) await wait(100);
if (!gmOn) fail("GM did not unlock");
const gmDo = async (op: object) => { gm = undefined as GmResultEvent | undefined; r.send(Msg.gm, op); for (let i = 0; i < 50 && !gm; i++) await wait(60); const g = gm as GmResultEvent | undefined; if (!g?.ok) fail(`GM ${JSON.stringify(op)}: ${g?.text}`); };
const me = () => (r.state as any).players.get(r.sessionId);
await r.travel(FIELD[0] as never).catch(() => {});
await gmDo({ op: "warp", map: "f1_field01", x: 40, y: 40 });
await wait(800);

let bugs = 0;
for (const job of jobs) {
  await gmDo({ op: "job", job }).catch(() => {});
  await gmDo({ op: "level", base: 99, job: 50 });
  await gmDo({ op: "points", skill: 400 });
  await gmDo({ op: "heal" });
  await gmDo({ op: "zeny", amount: 100000 });
  await wait(300);
  // learn the whole tree: repeat passes until nothing changes
  const rows = treeRows(job);
  for (let pass = 0; pass < 14; pass++) {
    for (const row of rows) for (let i = 0; i < row.maxLevel; i++) r.send(Msg.skillUp, { id: row.id });
    await wait(500);
  }
  const learned = skills?.list.filter((s) => s.lv > 0) ?? [];
  used.clear(); failed.clear();
  await gmDo({ op: "killmobs" });
  await gmDo({ op: "spawn", mobId: 1002, count: 3 });
  await wait(500);
  for (const e of learned) {
    const sk = SKILLS.get(e.id)!;
    if (!skillUse(sk)) continue;
    await gmDo({ op: "heal" });
    await gmDo({ op: "killmobs" }); await gmDo({ op: "spawn", mobId: 1002, count: 2 }); await wait(450);
    const live = [...(r.state as any).monsters.entries()].filter(([, m]: any) => !m.dead)[0];
    const target = live?.[0] as string | undefined, mx = Math.round(live?.[1].x ?? 40), my = Math.round(live?.[1].y ?? 40);
    const msg: Record<string, unknown> = { id: e.id, lv: e.lv };
    if (sk.target === "Attack") msg.target = target; else if (sk.target === "Ground") { msg.x = mx; msg.y = my; } else if (sk.target === "Support") msg.target = r.sessionId;
    r.send(Msg.useSkill, msg);
    for (let i = 0; i < 60 && !used.has(e.id) && !failed.has(e.id); i++) await wait(60);
    await wait(900);
  }
  const casts = learned.filter((e) => skillUse(SKILLS.get(e.id)!));
  const ok = casts.filter((e) => used.has(e.id)).length;
  const reasons: Record<string, string[]> = {};
  for (const e of casts) if (!used.has(e.id)) (reasons[failed.get(e.id) ?? "silent"] ??= []).push(SKILLS.get(e.id)!.key);
  const silent = reasons.silent?.length ?? 0;
  console.log(`${job.padEnd(18)} learned ${learned.length}/${rows.length}  casts ${ok}/${casts.length}  ${Object.entries(reasons).map(([k, v]) => `${k}:${v.length}`).join(" ")}`);
  for (const [k, v] of Object.entries(reasons)) if (k === "silent" || k === "failed" || k === "target") console.log(`   ${k}: ${v.join(" ")}`);
  if (learned.length < rows.length * 0.9) { console.log("   !! tree not fully learned"); bugs++; }
  bugs += silent;
  void own; void me;
}
console.log(bugs ? `${bugs} problem(s)` : "OK");
process.exit(bugs ? 1 : 0);
