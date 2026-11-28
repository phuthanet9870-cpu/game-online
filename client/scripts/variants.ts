// Monster variants end to end: a GM spawns an ordinary and an Elite / Golden / Ancient version of the same species; the synced variant and
// HP must match shared/rules/variants.ts, a kill must pay the variant's EXP multiplier, a Golden kill a purse of zeny, an Ancient its fragment.
//   GM_PASSPHRASE=<phrase> node server/src/index.ts ;  node client/scripts/variants.ts [serverUrl] <phrase>
import { Msg, type GmResultEvent, type InvEvent, type StatusEvent } from "../../shared/protocol.ts";
import { VARIANTS } from "../../shared/rules/variants.ts";
import { MOB_BY_ID } from "../../shared/rules/data.ts";
import { itemNamed } from "../../shared/rules/lookup.ts";
import { joinAs } from "./bot.ts";

const url = process.argv[2] ?? "http://localhost:2567", phrase = process.argv[3] ?? process.env.GM_PASSPHRASE ?? "";
const fail = (m: string): never => { console.error(`FAIL: ${m}`); process.exit(1); };
setTimeout(() => fail("timed out"), 180_000);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (f: () => boolean, ms: number, what: string) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) fail(what); await wait(100); } };
const { room: r } = await joinAs(url, "variant_bot", "VariantBot", true);
let gm: GmResultEvent | undefined, gmOn = false, own: StatusEvent | undefined, inv: InvEvent | undefined;
r.onMessage(Msg.gmResult, (m: GmResultEvent) => { gm = m; });
r.onMessage(Msg.gmState, () => { gmOn = true; });
r.onMessage(Msg.status, (m: StatusEvent) => { own = m; });
r.onMessage(Msg.inv, (m: InvEvent) => { inv = m; });
r.onMessage("*", () => {});
r.send(Msg.gmAuth, { phrase });
await until(() => gmOn, 4000, "GM did not unlock");
const gmDo = async (op: object) => { gm = undefined; r.send(Msg.gm, op); await until(() => !!gm, 4000, `GM ${JSON.stringify(op)} unanswered`); const g = gm as GmResultEvent | undefined; if (!g?.ok) fail(`GM refused: ${g?.text}`); };
await gmDo({ op: "warp", map: "f1_field01", x: 40, y: 40 });
await wait(1200);
await gmDo({ op: "level", base: 30, job: 1 });
await gmDo({ op: "stat", stat: "str", value: 99 });
await gmDo({ op: "stat", stat: "dex", value: 99 });
const MOB = 1063, def = MOB_BY_ID.get(MOB)!;

/** spawn one, check what is synced, kill it, return the base EXP gained. */
async function hunt(variant?: string) {
  await gmDo({ op: "killmobs" });
  await gmDo({ op: "spawn", mobId: MOB, count: 1, variant });
  await wait(400);
  const [id, m] = [...(r.state as any).monsters.entries()].reverse().find(([k, x]: any) => !x.dead && String(k).startsWith("gm")) as [string, any];
  const v = VARIANTS.find((x) => x.key === (variant ?? "normal"))!;
  if (m.variant !== v.id) fail(`${variant}: synced variant ${m.variant}, wanted ${v.id}`);
  if (m.maxHp !== Math.trunc(def.hp * v.hp)) fail(`${variant}: max HP ${m.maxHp}, wanted ${Math.trunc(def.hp * v.hp)}`);
  await gmDo({ op: "heal" });
  const before = { exp: own?.exp ?? 0, lv: own?.level ?? 0 };
  r.send(Msg.attack, { id });
  await until(() => !(r.state as any).monsters.get(id) || (r.state as any).monsters.get(id).dead, 60000, `${variant ?? "normal"}: not killed`);
  await wait(900);
  if (own!.level !== before.lv) fail("levelled up mid-test: lower the level");
  return own!.exp - before.exp;
}
const base = await hunt();
const elite = await hunt("elite");
console.log(`normal ${base} EXP, elite ${elite} EXP`);
if (Math.abs(elite / base - 3) > 0.35) fail("Elite did not pay about 3x EXP");
const zenyBefore = inv?.zeny ?? 0;
await hunt("golden");
await wait(800);
const zeny = (inv?.zeny ?? 0) - zenyBefore;
console.log(`golden purse ${zeny} zeny`);
if (zeny < 60 * def.level) fail("Golden paid no purse");
await hunt("ancient");
await wait(500);
const frag = [...(r.state as any).floor.values()].some((f: any) => f.itemId === itemNamed("Ancient Fragment")!.id);
if (!frag) fail("Ancient dropped no fragment");
console.log("OK");
process.exit(0);
