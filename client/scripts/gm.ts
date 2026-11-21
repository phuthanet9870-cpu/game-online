// GM system check (server/src/gm.ts): run against a server started with GM_PASSPHRASE set.
//   GM_PASSPHRASE=<phrase> node server/src/index.ts ;  node client/scripts/gm.ts [serverUrl] <phrase>
// A wrong passphrase is refused like an unknown command, a non-GM's GM request is ignored, then the GM unlocks and drives a
// second character: levels, job, stats, zeny, items, heal / kill / revive, warp / summon / goto, mute, spawn, kill-all, rates,
// announce, online list, kick.
import { Msg, type GmOnlineEvent, type GmOp, type GmResultEvent, type GmStateEvent, type InvEvent, type StatusEvent } from "../../shared/protocol.ts";
import { joinAs } from "./bot.ts";
import { FIELD, TOWN } from "../../shared/maps.ts";

const url = process.argv[2] ?? "http://localhost:2567", phrase = process.argv[3] ?? process.env.GM_PASSPHRASE ?? "";
const fail = (m: string): never => { console.error(`FAIL: ${m}`); process.exit(1); };
setTimeout(() => fail("timed out after 120s"), 120_000);
if (!phrase) fail("pass the GM passphrase");
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const { room: g } = await joinAs(url, "gm_bot_admin", "GmAdmin", true);
const { room: t } = await joinAs(url, "gm_bot_target", "GmTarget", true);
const notices: string[] = [], results: GmResultEvent[] = [];
let state: GmStateEvent | undefined, online: GmOnlineEvent | undefined, tStatus: StatusEvent | undefined, tInv: InvEvent | undefined, tNotice = "";
g.onMessage(Msg.notice, (m: { text: string }) => notices.push(m.text));
g.onMessage(Msg.gmResult, (m: GmResultEvent) => results.push(m));
g.onMessage(Msg.gmState, (m: GmStateEvent) => { state = m; });
g.onMessage(Msg.gmOnline, (m: GmOnlineEvent) => { online = m; });
g.onMessage("*", () => {});
t.onMessage(Msg.status, (m: StatusEvent) => { tStatus = m; });
t.onMessage(Msg.inv, (m: InvEvent) => { tInv = m; });
t.onMessage(Msg.notice, (m: { text: string }) => { tNotice = m.text; });
t.onMessage("*", () => {});
await Promise.all([g.travel(TOWN), t.travel(TOWN)]);

const gm = async (op: GmOp, ok = true) => {
  const n = results.length;
  g.send(Msg.gm, op);
  for (let i = 0; i < 40 && results.length === n; i++) await wait(50);
  const r = results[n] ?? fail(`no answer to ${op.op}`);
  if (r.ok !== ok) fail(`${op.op}: expected ok=${ok}, got "${r.text}"`);
  console.log(`ok   ${op.op}: ${r.text}`);
  return r;
};

// not a GM yet: GM requests are ignored, a wrong passphrase looks like an unknown command
g.send(Msg.gm, { op: "heal" });
await wait(400);
if (results.length) fail("a non-GM got a GM answer");
g.send(Msg.gmAuth, { phrase: phrase + "x" });
await wait(400);
if (state?.gm || notices.at(-1) !== "Unknown command.") fail(`wrong passphrase: ${JSON.stringify({ state, notice: notices.at(-1) })}`);
console.log("ok   wrong passphrase refused");
g.send(Msg.gmAuth, { phrase });
for (let i = 0; i < 40 && !state?.gm; i++) await wait(50);
if (!state?.gm) fail("the right passphrase did not unlock GM");
console.log("ok   unlocked");

g.send(Msg.gm, { op: "online" });
for (let i = 0; i < 40 && !online; i++) await wait(50);
if (!online?.players.some((p) => p.name === "GmTarget")) fail("online list misses the target");
console.log(`ok   online: ${online.players.map((p) => `${p.name}@${p.map}`).join(", ")}`);

await gm({ op: "level", target: "GmTarget", base: 20, job: 10 });
await wait(200);
if (tStatus?.level !== 20 || tStatus.jobLevel !== 10) fail(`level: ${JSON.stringify(tStatus)}`);
await gm({ op: "stat", target: "GmTarget", stat: "str", value: 50 });
await wait(200);
if (tStatus?.str !== 50) fail("stat");
await gm({ op: "zeny", target: "GmTarget", amount: 12345 });
await wait(200);
if (tInv?.zeny !== 12345) fail(`zeny ${tInv?.zeny}`);
await gm({ op: "item", target: "GmTarget", itemId: 501, amount: 7 });
await wait(200);
if (!tInv?.items.some((i) => i.itemId === 501 && i.amount >= 7)) fail("item");
await gm({ op: "job", target: "GmTarget", job: "Swordman" });
await gm({ op: "kill", target: "GmTarget" });
await gm({ op: "revive", target: "GmTarget" });
await gm({ op: "heal", target: "Nobody" }, false);
await gm({ op: "mute", target: "GmTarget", minutes: 5 });
await wait(200);
if (!/muted/i.test(tNotice)) fail("mute notice");
await gm({ op: "unmute", target: "GmTarget" });
await gm({ op: "warp", target: "GmTarget", map: FIELD });
for (let i = 0; i < 60 && t.map !== FIELD; i++) await wait(100);
if (t.map !== FIELD) fail(`warp: target is on ${t.map}`);
console.log("ok   target arrived on", t.map);
await gm({ op: "goto", target: "GmTarget" });
for (let i = 0; i < 60 && g.map !== FIELD; i++) await wait(100);
if (g.map !== FIELD) fail(`goto: GM is on ${g.map}`);
await gm({ op: "spawn", mobId: 1002, count: 3 });
await gm({ op: "killmobs" });
await gm({ op: "rates", exp: 300, drop: 200 });
if (state?.rates.exp !== 3 || state.rates.drop !== 2) fail("rates state");
await gm({ op: "rates", exp: 100, drop: 100 });
await gm({ op: "announce", text: "GM bot test" });
await gm({ op: "kick", target: "GmTarget" });
console.log("PASS gm");
process.exit(0);
