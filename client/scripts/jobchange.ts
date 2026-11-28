// Job change check (no quests): a fresh Fledgling raised by a GM to Job Lv 10, Basic Training 9 learned, talks to the guild masters.
//   GM_PASSPHRASE=<phrase> node server/src/index.ts ;  node client/scripts/jobchange.ts [serverUrl] <phrase>
// Checks: too early is refused with the reason, a Fledgling that is ready becomes the job (and gets its kit), a second master
// refuses a character that already has a job, and the Grandmaster refuses a first job below Job Lv 40.
import { Msg, type GmResultEvent, type InvEvent, type StatusEvent } from "../../shared/protocol.ts";
import { SKILL_ID } from "../../shared/rules/skill.ts";
import { itemNamed } from "../../shared/rules/lookup.ts";
import { joinAs } from "./bot.ts";
import { TOWN } from "../../shared/maps.ts";

const url = process.argv[2] ?? "http://localhost:2567", phrase = process.argv[3] ?? process.env.GM_PASSPHRASE ?? "";
const fail = (m: string): never => { console.error(`FAIL: ${m}`); process.exit(1); };
setTimeout(() => fail("timed out after 150s"), 150_000);
if (!phrase) fail("pass the GM passphrase");
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (f: () => boolean, ms: number, what: string) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) fail(what); await wait(100); } };

const { room: r } = await joinAs(url, "jobchange_bot", "JobBot", true);
let own: StatusEvent | undefined, inv: InvEvent | undefined, gm: GmResultEvent | undefined, gmOn = false;
let nextBtn = false, closeBtn = false, menu: string[] | undefined, ended = false;
const lines: string[] = [];
r.onMessage(Msg.status, (m: StatusEvent) => { own = m; });
r.onMessage(Msg.inv, (m: InvEvent) => { inv = m; });
r.onMessage(Msg.gmResult, (m: GmResultEvent) => { gm = m; });
r.onMessage(Msg.gmState, () => { gmOn = true; });
r.onMessage(Msg.npcMes, (m: { lines?: string[]; text?: string }) => lines.push(...(m.lines ?? (m.text ? [m.text] : []))));
r.onMessage(Msg.npcNextBtn, () => { nextBtn = true; });
r.onMessage(Msg.npcCloseBtn, () => { closeBtn = true; });
r.onMessage(Msg.npcMenuList, (m: { options: string[] }) => { menu = m.options; });
r.onMessage(Msg.npcEnd, () => { ended = true; });
r.onMessage("*", () => {});
await r.travel(TOWN);
const me = () => (r.state as any).players.get(r.sessionId);

/** Click an NPC and answer its dialog: Next / Close when asked, each menu with the next of `choices` (1-based). */
async function talk(npc: string, choices: number[]) {
  nextBtn = closeBtn = ended = false; menu = undefined; lines.length = 0;
  const left = [...choices];
  r.send(Msg.npc, { id: npc });
  for (let i = 0; i < 200 && !ended; i++) {
    await wait(50);
    if (menu) { const o = menu; menu = undefined; const c = left.shift(); if (!c) { r.send(Msg.npcMenu, { npc, choice: 255 }); break; } r.send(Msg.npcMenu, { npc, choice: c }); void o; }
    else if (nextBtn) { nextBtn = false; r.send(Msg.npcNext, { npc }); }
    else if (closeBtn) { closeBtn = false; r.send(Msg.npcClose, { npc }); await wait(150); break; }
  }
  return lines.join(" ").replace(/\^[0-9a-f]{6}/gi, "");
}

// raise: unlock GM, Job Lv 10 (9 skill points), spend them on Basic Training (the job change asks for Basic Training 9)
r.send(Msg.gmAuth, { phrase });
await until(() => gmOn, 3000, "GM did not unlock");
const gmDo = async (op: object) => { gm = undefined; r.send(Msg.gm, op); await until(() => !!gm, 3000, `GM ${JSON.stringify(op)} unanswered`); if (!gm!.ok) fail(`GM refused: ${gm!.text}`); };

/** GM-warp next to an NPC (a click only works within 15 cells; walking there is the other bots' job). */
const near = async (npc: string) => { const n = (r.state as any).npcs.get(npc); if (!n) fail(`${npc} is not in this room`); await gmDo({ op: "warp", map: TOWN, x: Math.round(n.x) + 1, y: Math.round(n.y) + 1 }); await wait(500); };

// 1) too early: a Fledgling at Job Lv 1 is turned away with the reason
await near("npc_job_swordman");
let said = await talk("npc_job_swordman", [2]);
if (me().job !== "Novice") fail("the job changed without the training");
if (!/Basic Training|Job Lv 10/i.test(said)) fail(`the refusal gave no reason: ${said}`);
console.log("OK: too early is refused with the reason");

await gmDo({ op: "level", base: 20, job: 10 });
await until(() => own?.jobLevel === 10 && own.skillPoints === 9, 3000, "job level / points not raised");
for (let i = 0; i < 9; i++) r.send(Msg.skillUp, { id: SKILL_ID.NV_BASIC });
await until(() => own?.skillPoints === 0, 4000, "Basic Training not learned");

// 2) the master changes the job: menu 2 = "I want to become ...", then "Yes, I'm ready."
said = await talk("npc_job_swordman", [2, 1]);
await until(() => me().job === "Swordman", 3000, `no job change: ${said.slice(-160)}`);
await until(() => own?.jobLevel === 1, 3000, "job level not reset");
await until(() => (inv?.items.some((s) => s.itemId === itemNamed("Sword")!.id) ?? false), 3000, "no starter sword");
console.log("OK: Fledgling -> Vanguard (Swordman), level reset, starter sword given");

// 3) another master turns a Vanguard away; the Grandmaster wants Job Lv 40
await near("npc_job_mage");
said = await talk("npc_job_mage", [2]);
if (me().job !== "Swordman" || !/already|another path/i.test(said)) fail(`second master: ${said.slice(-160)} (job ${me().job})`);
console.log("OK: a second master refuses a character that already has a job");
await near("npc_job_grandmaster");
said = await talk("npc_job_grandmaster", [1]);
if (["Knight", "Crusader"].includes(me().job)) fail("the Grandmaster changed a job below Job Lv 40");
console.log("OK: the Grandmaster does not change a first job below Job Lv 40");
console.log("PASS jobchange");
process.exit(0);
