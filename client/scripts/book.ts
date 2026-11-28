// Adventure Book end to end: a kill adds the species (a bookEntry message), a claim not reached is refused, and the book survives a relog.
//   GM_PASSPHRASE=<phrase> node server/src/index.ts ;  node client/scripts/book.ts [serverUrl] <phrase>
import { Msg, type BookEntryEvent, type BookEvent, type GmResultEvent } from "../../shared/protocol.ts";
import { bookKey } from "../../shared/rules/collection.ts";
import { joinAs } from "./bot.ts";

const url = process.argv[2] ?? "http://localhost:2567", phrase = process.argv[3] ?? process.env.GM_PASSPHRASE ?? "";
const fail = (m: string): never => { console.error(`FAIL: ${m}`); process.exit(1); };
setTimeout(() => fail("timed out"), 120_000);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (f: () => boolean, ms: number, what: string) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) fail(what); await wait(100); } };
async function session(fresh: boolean) {
  const { room: r } = await joinAs(url, "book_bot", "BookBot", fresh);
  const s = { r, book: undefined as BookEvent | undefined, entries: [] as BookEntryEvent[], gm: undefined as GmResultEvent | undefined, gmOn: false, notes: [] as string[] };
  r.onMessage(Msg.book, (m: BookEvent) => { s.book = m; });
  r.onMessage(Msg.bookEntry, (m: BookEntryEvent) => s.entries.push(m));
  r.onMessage(Msg.gmResult, (m: GmResultEvent) => { s.gm = m; });
  r.onMessage(Msg.gmState, () => { s.gmOn = true; });
  r.onMessage(Msg.notice, (m: { text: string }) => s.notes.push(m.text));
  r.onMessage("*", () => {});
  return s;
}
const s = await session(true), r = s.r;
await until(() => !!s.book, 4000, "no book at entry");
r.send(Msg.gmAuth, { phrase });
await until(() => s.gmOn, 4000, "GM did not unlock");
const gmDo = async (op: object) => { s.gm = undefined; r.send(Msg.gm, op); await until(() => !!s.gm, 4000, `GM ${JSON.stringify(op)}`); if (!s.gm!.ok) fail(`GM refused: ${s.gm!.text}`); };
await gmDo({ op: "warp", map: "f1_field01", x: 40, y: 40 });
await wait(1200);
await gmDo({ op: "level", base: 20, job: 1 });
await gmDo({ op: "stat", stat: "str", value: 90 });
await gmDo({ op: "killmobs" });
await gmDo({ op: "spawn", mobId: 1063, count: 1 });
await wait(400);
const [id] = [...(r.state as any).monsters.entries()].reverse().find(([k, m]: any) => !m.dead && String(k).startsWith("gm"))!;
r.send(Msg.attack, { id });
await until(() => s.entries.some((e) => e.kind === "mob" && e.ref === 1063), 40000, "no book entry for the kill");
console.log(`OK kill recorded: ${JSON.stringify(s.entries.find((e) => e.ref === 1063))}, note: ${s.notes.find((n) => /Adventure Book/.test(n))}`);
s.notes.length = 0;
r.send(Msg.bookClaim, { id: "mobAll" });
await until(() => s.notes.some((n) => /not reached/.test(n)), 3000, "an unreached claim was not refused");
console.log("OK unreached milestone refused");
await r.leave(); await wait(1500);
const s2 = await session(false);
await until(() => !!s2.book, 4000, "no book after relog");
const n = new Map(s2.book!.entries).get(bookKey("mob", 1063));
if (!n) fail("the kill was not saved");
console.log(`OK book saved across a relog (${n} kills)`);
process.exit(0);
