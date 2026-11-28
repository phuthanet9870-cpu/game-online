// Random affixes end to end: a GM gives a rare weapon (it rolls its affixes like a drop), the bot wears it (status changes), then reforges
// it at the forgemaster: refused without materials (nothing taken), done with them (zeny + materials taken, one affix locked and kept),
// and the new affixes survive a relog (saved on the inventory row).
//   GM_PASSPHRASE=<phrase> node server/src/index.ts ;  node client/scripts/affix.ts [serverUrl] <phrase>
import { Msg, type GmResultEvent, type InvEvent, type ReforgeAckEvent, type StatusEvent } from "../../shared/protocol.ts";
import { ITEMS } from "../../shared/rules/items.ts";
import { AFFIX_CONF } from "../../shared/rules/affix.ts";
import { itemNamed } from "../../shared/rules/lookup.ts";
import { TOWN_CELLS } from "../../shared/town.ts";
import { joinAs } from "./bot.ts";

const url = process.argv[2] ?? "http://localhost:2567", phrase = process.argv[3] ?? process.env.GM_PASSPHRASE ?? "";
const fail = (m: string): never => { console.error(`FAIL: ${m}`); process.exit(1); };
setTimeout(() => fail("timed out"), 120_000);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (f: () => boolean, ms: number, what: string) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) fail(what); await wait(100); } };

async function session() {
  const { room: r } = await joinAs(url, "affix_bot", "AffixBot", false);
  const s = { r, gm: undefined as GmResultEvent | undefined, gmOn: false, inv: undefined as InvEvent | undefined, ack: undefined as ReforgeAckEvent | undefined, st: undefined as StatusEvent | undefined };
  r.onMessage(Msg.gmResult, (m: GmResultEvent) => { s.gm = m; });
  r.onMessage(Msg.gmState, () => { s.gmOn = true; });
  r.onMessage(Msg.inv, (m: InvEvent) => { s.inv = m; });
  r.onMessage(Msg.status, (m: StatusEvent) => { s.st = m; });
  r.onMessage(Msg.reforgeAck, (m: ReforgeAckEvent) => { s.ack = m; });
  r.onMessage("*", () => {});
  return s;
}
const s = await session(), r = s.r;
r.send(Msg.gmAuth, { phrase });
await until(() => s.gmOn, 4000, "GM did not unlock");
const gmDo = async (op: object) => { s.gm = undefined; r.send(Msg.gm, op); await until(() => !!s.gm, 4000, `GM ${JSON.stringify(op)} unanswered`); if (!s.gm!.ok) fail(`GM refused: ${s.gm!.text}`); };
const weapon = [...ITEMS.values()].find((i) => i.type === "Weapon" && (i as { grade?: string }).grade === "rare" && (i.jobs as string[]).includes("Swordman") && i.equipLevel <= 30)!;
s.gm = undefined; r.send(Msg.gm, { op: "job", job: "Swordman" }); await until(() => !!s.gm, 4000, "job op unanswered"); // ok or "already has that job"
await gmDo({ op: "level", base: 40, job: 20 });
await gmDo({ op: "item", itemId: weapon.id, amount: 1 });
await until(() => !!s.inv?.items.find((x) => x.itemId === weapon.id), 3000, "no weapon");
const row = () => s.inv!.items.find((x) => x.itemId === weapon.id)!;
if ((row().affixes?.length ?? 0) !== AFFIX_CONF.count.rare) fail(`a rare piece rolled ${row().affixes?.length ?? 0} affixes`);
console.log(`OK ${weapon.name}: ${JSON.stringify(row().affixes)}`);
r.send(Msg.equip, { uid: row().uid });
await until(() => row().equip === "weapon", 3000, "not worn");
// next to the forgemaster
await gmDo({ op: "warp", map: "f1_town01", x: TOWN_CELLS.refiner.x, y: TOWN_CELLS.refiner.y + 1 });
await wait(1500);
const zenyBefore = s.inv!.zeny;
s.ack = undefined; r.send(Msg.reforge, { uid: row().uid });
await until(() => !!s.ack, 3000, "no reforge answer");
if (s.ack!.ok) fail("reforged without materials");
if (s.inv!.zeny !== zenyBefore) fail("a refused reforge took zeny");
console.log(`OK refused: ${s.ack!.text}`);
const c = AFFIX_CONF.reforge;
await gmDo({ op: "zeny", amount: c.zeny * 2 });
await gmDo({ op: "item", itemId: itemNamed(c.material)!.id, amount: c.materialCount });
await gmDo({ op: "item", itemId: itemNamed(c.lockMaterial)!.id, amount: c.lockCount });
await wait(500);
const lockedAffix = row().affixes![0], zenyNow = s.inv!.zeny;
s.ack = undefined; r.send(Msg.reforge, { uid: row().uid, lock: 0 });
await until(() => !!s.ack, 3000, "no reforge answer");
if (!s.ack!.ok) fail(`reforge refused: ${s.ack!.text}`);
await wait(500);
if (JSON.stringify(row().affixes![0]) !== JSON.stringify(lockedAffix)) fail("the locked affix changed");
if (s.inv!.zeny !== zenyNow - c.zeny) fail(`zeny ${zenyNow} -> ${s.inv!.zeny}, wanted -${c.zeny}`);
if (s.inv!.items.some((x) => x.itemId === itemNamed(c.material)!.id || x.itemId === itemNamed(c.lockMaterial)!.id)) fail("materials not taken");
const after = JSON.stringify(row().affixes);
console.log(`OK reforged (lock kept): ${after}`);
// relog: the affixes are on the inventory row
await r.leave(); await wait(1500);
const s2 = await session();
await until(() => !!s2.inv, 4000, "no bag after relog");
const again = s2.inv!.items.find((x) => x.itemId === weapon.id);
if (JSON.stringify(again?.affixes) !== after) fail(`after relog ${JSON.stringify(again?.affixes)} != ${after}`);
console.log("OK affixes saved across a relog");
process.exit(0);
