// Town services end to end, through the real NPC dialogs: the Hearthkeeper's stat and skill resets, the Forgemaster's salvage and reforge
// menus; plus the training dummies (hits land, they never die, never fight back) and the two accessory slots.
//   GM_PASSPHRASE=<phrase> node server/src/index.ts ;  node client/scripts/services.ts [serverUrl] <phrase>
import { Msg, type GmResultEvent, type HitEvent, type InvEvent, type StatusEvent, type SkillsEvent } from "../../shared/protocol.ts";
import { SKILL_ID } from "../../shared/rules/skill.ts";
import { ITEMS } from "../../shared/rules/items.ts";
import { itemNamed } from "../../shared/rules/lookup.ts";
import { DUMMY_ID } from "../../shared/rules/data.ts";
import { statResetPoints } from "../../shared/rules/reset.ts";
import { TOWN_CELLS } from "../../shared/town.ts";
import { TOWN_SAVE } from "../../shared/maps.ts";
import { joinAs } from "./bot.ts";

const url = process.argv[2] ?? "http://localhost:2567", phrase = process.argv[3] ?? process.env.GM_PASSPHRASE ?? "";
const fail = (m: string): never => { console.error(`FAIL: ${m}`); process.exit(1); };
setTimeout(() => fail("timed out"), 180_000);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (f: () => boolean, ms: number, what: string) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) fail(what); await wait(100); } };
const { room: r } = await joinAs(url, "service_bot", "ServiceBot", true);
let gm: GmResultEvent | undefined, gmOn = false, own: StatusEvent | undefined, inv: InvEvent | undefined, skills: SkillsEvent | undefined;
let nextBtn = false, closeBtn = false, menu: string[] | undefined, ended = false;
const lines: string[] = [], hits: HitEvent[] = [];
r.onMessage(Msg.gmResult, (m: GmResultEvent) => { gm = m; });
r.onMessage(Msg.gmState, () => { gmOn = true; });
r.onMessage(Msg.status, (m: StatusEvent) => { own = m; });
r.onMessage(Msg.inv, (m: InvEvent) => { inv = m; });
r.onMessage(Msg.skills, (m: SkillsEvent) => { skills = m; });
r.onMessage(Msg.hit, (m: HitEvent) => hits.push(m));
r.onMessage(Msg.npcMes, (m: { lines?: string[]; text?: string }) => lines.push(...(m.lines ?? (m.text ? [m.text] : []))));
r.onMessage(Msg.npcNextBtn, () => { nextBtn = true; });
r.onMessage(Msg.npcCloseBtn, () => { closeBtn = true; });
r.onMessage(Msg.npcMenuList, (m: { options: string[] }) => { menu = m.options; });
r.onMessage(Msg.npcEnd, () => { ended = true; });
r.onMessage("*", () => {});
const me = () => (r.state as any).players.get(r.sessionId);
r.send(Msg.gmAuth, { phrase });
await until(() => gmOn, 4000, "GM did not unlock");
const gmDo = async (op: object) => { gm = undefined; r.send(Msg.gm, op); await until(() => !!gm, 4000, `GM ${JSON.stringify(op)} unanswered`); const g = gm as GmResultEvent | undefined; if (!g?.ok) fail(`GM refused: ${g?.text}`); };
/** answer a dialog: each menu by the label that matches the next pattern */
async function talk(npc: string, picks: RegExp[]) {
  nextBtn = closeBtn = ended = false; menu = undefined; lines.length = 0;
  const left = [...picks];
  r.send(Msg.npc, { id: npc });
  for (let i = 0; i < 300 && !ended; i++) {
    await wait(50);
    if (menu) { const o: string[] = menu as string[]; menu = undefined; const want = left.shift(); const c = want ? o.findIndex((x) => want.test(x)) + 1 : 0; if (!c) { r.send(Msg.npcMenu, { npc, choice: 255 }); if (want) fail(`no menu entry ${want} in ${o.join(" | ")}`); break; } r.send(Msg.npcMenu, { npc, choice: c }); }
    else if (nextBtn) { nextBtn = false; r.send(Msg.npcNext, { npc }); }
    else if (closeBtn) { closeBtn = false; r.send(Msg.npcClose, { npc }); await wait(200); break; }
  }
  return lines.join(" ").replace(/\^[0-9a-f]{6}/gi, "");
}

// 1) stat + skill reset at the Hearthkeeper (free below Base Lv 40)
await gmDo({ op: "warp", map: "f1_town01", x: TOWN_SAVE.x, y: TOWN_SAVE.y - 1 });
await wait(1200);
await gmDo({ op: "level", base: 30, job: 10 });
await until(() => own?.level === 30, 3000, "level not set");
r.send(Msg.statUp, { stat: "str" }); r.send(Msg.statUp, { stat: "str" });
for (let i = 0; i < 9; i++) r.send(Msg.skillUp, { id: SKILL_ID.NV_BASIC });
await wait(800);
let said = await talk("npc_hearthkeeper", [/training over/i, /stats/i, /yes/i]);
await until(() => own?.str === 1 && own?.statPoints === statResetPoints("Novice", 30), 3000, `stats not reset: ${said.slice(-120)}`);
console.log(`OK stat reset: STR 1, ${own!.statPoints} points`);
await gmDo({ op: "job", job: "Swordman" });
await gmDo({ op: "points", skill: 5 });
for (let i = 0; i < 5; i++) r.send(Msg.skillUp, { id: SKILL_ID.SM_BASH });
await until(() => skills?.list.find((s) => s.id === SKILL_ID.SM_BASH)?.lv === 5, 3000, "Bash not learned");
said = await talk("npc_hearthkeeper", [/training over/i, /skills/i, /yes/i]);
await until(() => (skills?.list.find((s) => s.id === SKILL_ID.SM_BASH)?.lv ?? 0) === 0 && skills?.list.find((s) => s.id === SKILL_ID.NV_BASIC)?.lv === 9, 3000, `skills not reset: ${said.slice(-120)}`);
console.log(`OK skill reset: Bash 0, Basic Training kept, ${own!.skillPoints} points`);

// 2) the training dummies: hits land, they keep standing, they never strike back
const dummy = [...(r.state as any).monsters.entries()].find(([, m]: any) => m.mobId === DUMMY_ID);
if (!dummy) fail("no training dummy in town");
await gmDo({ op: "stat", stat: "str", value: 80 });
hits.length = 0;
r.send(Msg.attack, { id: dummy![0] });
await until(() => hits.filter((h) => h.from === r.sessionId).length >= 3, 20000, "no hits on the dummy");
if (hits.some((h) => h.from === dummy![0])) fail("the dummy hit back");
if ((r.state as any).monsters.get(dummy![0]).dead) fail("the dummy died");
console.log(`OK dummy took ${hits.filter((h) => h.from === r.sessionId).map((h) => h.dmg).join(",")}`);
r.send(Msg.move, { x: TOWN_CELLS.refiner.x, y: TOWN_CELLS.refiner.y + 1 });

// 3) salvage at the forgemaster
await gmDo({ op: "warp", map: "f1_town01", x: TOWN_CELLS.refiner.x, y: TOWN_CELLS.refiner.y + 1 });
await wait(800);
const rare = [...ITEMS.values()].find((i) => i.type === "Armor" && (i as { grade?: string }).grade === "rare")!;
await gmDo({ op: "item", itemId: rare.id, amount: 1 });
await gmDo({ op: "zeny", amount: 5000 });
await until(() => !!inv?.items.find((x) => x.itemId === rare.id), 3000, "no piece to salvage");
said = await talk("npc_refiner", [/salvage/i, new RegExp(rare.name.replace(/[^\w ]/g, "."), "i"), /break it down/i]);
await until(() => !inv!.items.some((x) => x.itemId === rare.id) && inv!.items.some((x) => x.itemId === itemNamed("Elite Essence")!.id), 3000, `not salvaged: ${said.slice(-160)}`);
console.log(`OK salvaged ${rare.name}: ${said.match(/\d+ × [A-Za-z ]+/g)?.join(", ")}`);

// 4) accessories: two rings worn, one on each side
const ring = [...ITEMS.values()].find((i) => (i.locations as string[]).includes("Both_Accessory") && i.type === "Armor" && (i.jobs as string[]).includes("Swordman") && i.equipLevel <= 30)!;
await gmDo({ op: "item", itemId: ring.id, amount: 2 });
await until(() => (inv?.items.filter((x) => x.itemId === ring.id).length ?? 0) >= 2, 3000, "no rings");
for (const x of inv!.items.filter((x) => x.itemId === ring.id).slice(0, 2)) { r.send(Msg.equip, { uid: x.uid }); await wait(400); }
await until(() => { const w = inv!.items.filter((x) => x.itemId === ring.id).map((x) => x.equip).sort().join(); return w === "accL,accR"; }, 3000, `rings not on both sides: ${inv!.items.filter((x) => x.itemId === ring.id).map((x) => x.equip)}`);
console.log(`OK ${ring.name} worn on both accessory slots`);
console.log("OK");
process.exit(0);
