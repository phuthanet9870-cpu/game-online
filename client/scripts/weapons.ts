// New-weapon combat check: a Marksman with a revolver and bullets, a Shinobi with a throwing star and kunai. Each wears its gear, auto-
// attacks a monster at range (the hits must land and, for guns, spend bullets), then casts its signature ranged skill.
//   GM_PASSPHRASE=<phrase> node server/src/index.ts ;  node client/scripts/weapons.ts [serverUrl] <phrase>
import { Msg, type GmResultEvent, type HitEvent, type InvEvent, type SkillFailEvent, type SkillUseEvent } from "../../shared/protocol.ts";
import { SKILL_ID } from "../../shared/rules/skill.ts";
import { itemNamed } from "../../shared/rules/lookup.ts";
import { joinAs } from "./bot.ts";

const url = process.argv[2] ?? "http://localhost:2567", phrase = process.argv[3] ?? process.env.GM_PASSPHRASE ?? "";
const fail = (m: string): never => { console.error(`FAIL: ${m}`); process.exit(1); };
setTimeout(() => fail("timed out"), 200_000);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (f: () => boolean, ms: number, what: string) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) fail(what); await wait(100); } };
const { room: r } = await joinAs(url, "weapon_bot", "WeaponBot", true);
let gm: GmResultEvent | undefined, gmOn = false, inv: InvEvent | undefined;
const hits: HitEvent[] = [], used: number[] = [], fails: SkillFailEvent[] = [];
r.onMessage(Msg.gmResult, (m: GmResultEvent) => { gm = m; });
r.onMessage(Msg.gmState, () => { gmOn = true; });
r.onMessage(Msg.inv, (m: InvEvent) => { inv = m; });
r.onMessage(Msg.hit, (m: HitEvent) => { if (m.from === r.sessionId) hits.push(m); });
r.onMessage(Msg.skillUse, (m: SkillUseEvent) => { if (m.src === r.sessionId) used.push(m.id); });
r.onMessage(Msg.skillFail, (m: SkillFailEvent) => { fails.push(m); });
r.onMessage(Msg.notice, (m: { text: string }) => console.log("notice:", m.text));
r.onMessage("*", () => {});
r.send(Msg.gmAuth, { phrase });
await until(() => gmOn, 4000, "GM did not unlock");
const gmDo = async (op: object) => { gm = undefined; r.send(Msg.gm, op); await until(() => !!gm, 4000, `GM ${JSON.stringify(op)} unanswered`); const g = gm as GmResultEvent | undefined; if (!g?.ok) fail(`GM refused: ${g?.text}`); };
await gmDo({ op: "warp", map: "f1_field01", x: 40, y: 40 });
await wait(1500);
const stackOf = (name: string) => inv?.items.find((s) => s.itemId === itemNamed(name)!.id);

async function trial(job: string, weapon: string, ammo: string, skill: string) {
  await gmDo({ op: "job", job }).catch(() => {});
  await gmDo({ op: "level", base: 60, job: 40 });
  await gmDo({ op: "stat", stat: "dex", value: 80 });
  await gmDo({ op: "item", itemId: itemNamed(weapon)!.id, amount: 1 });
  await gmDo({ op: "item", itemId: itemNamed(ammo)!.id, amount: 200 });
  await until(() => !!stackOf(weapon) && !!stackOf(ammo), 3000, `${weapon} / ${ammo} not received`);
  r.send(Msg.equip, { uid: stackOf(weapon)!.uid }); await wait(400);
  r.send(Msg.equip, { uid: stackOf(ammo)!.uid }); await wait(400);
  await until(() => stackOf(weapon)?.equip === "weapon", 3000, `${job}: ${weapon} not worn (job can't equip it?)`);
  await until(() => stackOf(ammo)?.equip === "ammo", 3000, `${job}: ${ammo} not worn`);
  // learn the skill and its prerequisites by spending points on the whole own tree
  await gmDo({ op: "points", skill: 200 });
  for (let i = 0; i < 9; i++) r.send(Msg.skillUp, { id: SKILL_ID.NV_BASIC });
  await wait(400);
  for (let pass = 0; pass < 6; pass++) { for (const k of Object.keys(SKILL_ID)) if (k.startsWith(skill.split("_")[0] + "_")) for (let i = 0; i < 10; i++) r.send(Msg.skillUp, { id: SKILL_ID[k] }); await wait(400); }
  await gmDo({ op: "killmobs" }); await gmDo({ op: "spawn", mobId: 1002, count: 1 }); await wait(500);
  const mob = [...(r.state as any).monsters.entries()].reverse().find(([k, m]: any) => !m.dead && String(k).startsWith("gm"));
  if (!mob) fail("no monster");
  const before = stackOf(ammo)!.amount;
  hits.length = 0;
  r.send(Msg.attack, { id: mob![0] });
  const seen: string[] = []; r.onMessage("*", (t: unknown) => seen.push(String(t)));
  const t0 = Date.now(); while (!hits.some((h) => !h.skill) && Date.now() - t0 < 8000) await wait(100);
  if (!hits.some((h) => !h.skill)) {
    const me = (r.state as any).players.get(r.sessionId), mm = (r.state as any).monsters.get(mob![0]);
    console.log("DEBUG", { me: [me.x, me.y, me.job, me.sitting, me.dead], mob: mm ? [mm.x, mm.y, mm.dead, mm.hp] : "gone", worn: inv?.items.filter((x) => x.equip).map((x) => [x.itemId, x.equip]), seen: [...new Set(seen)].join(",") });
    fail(`${job}: no normal attack hit with ${weapon}`);
  }
  await wait(1500);
  const spent = before - (stackOf(ammo)?.amount ?? 0);
  const dmg = hits.filter((h) => !h.skill && !h.miss).map((h) => h.dmg);
  console.log(`${job}: ${weapon} normal attacks ${hits.length} (dmg ${dmg.join(",")}), ${ammo} spent ${spent}`);
  await gmDo({ op: "killmobs" }); await gmDo({ op: "spawn", mobId: 1002, count: 1 }); await wait(500);
  const mob2 = [...(r.state as any).monsters.entries()].reverse().find(([k, m]: any) => !m.dead && String(k).startsWith("gm"));
  used.length = 0; fails.length = 0; hits.length = 0;
  r.send(Msg.useSkill, { id: SKILL_ID[skill], target: mob2![0] });
  await until(() => used.includes(SKILL_ID[skill]) || fails.length > 0, 6000, `${skill}: no answer`);
  if (fails.length) fail(`${skill} failed: ${fails[0].why}`);
  await wait(1200);
  const sh = hits.filter((h) => h.skill === SKILL_ID[skill]);
  if (!sh.length) fail(`${skill}: no skill hit`);
  console.log(`OK ${job}: ${skill} hit ${sh.map((h) => h.dmg).join(",")}`);
  return spent;
}
if (process.argv[4] === "ninja") { await trial("Ninja", "Windmill Star", "Kunai", "NJ_THROWKUNAI"); process.exit(0); }
const gunAmmo = await trial("Gunslinger", "Six-Shooter", "Iron Bullet", "GS_PIERCINGSHOT");
if (gunAmmo <= 0) fail("a revolver's normal attack spent no bullets");
await trial("Ninja", "Windmill Star", "Kunai", "NJ_THROWKUNAI");
console.log("OK");
process.exit(0);
