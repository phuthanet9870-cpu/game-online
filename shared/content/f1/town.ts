// Floor 1 — Hearthmoor, the floor's rest town. No monsters. The Hearthkeeper keeps the climbers' save point (rAthena's Kafra "Save"
// service: F_KafraSave -> savepoint) and a fireside heal (the town healers of npc/re/other/healer.txt: free for Novices, a small fee
// for everyone else, percentheal 100,100). Hearthmoor is the floor's hub: new climbers start here, and a gate on each side leads to
// a field (shared/maps.ts WARPS).
import type { NpcScript, Script } from "../api.ts";
import { ET } from "../../rules/script.ts";
import { MAPID } from "../../rules/status.ts";
import { TOWN, TOWN_SAVE } from "../../maps.ts";
import { TOWN_CELLS } from "../../town.ts";
import { resetFee } from "../../rules/reset.ts";

/** Where the town's NPCs stand on f1_town01 (shared/town.ts). The guild masters stand in the guild hall's courtyard (f1/jobs.ts). */
export const TOWN_SPOT = {
  hearthkeeper: { x: TOWN_SAVE.x, y: TOWN_SAVE.y - 2 }, tools: TOWN_CELLS.tools, arms: TOWN_CELLS.arms, refiner: TOWN_CELLS.refiner,
} as const;
export const TOWN_NPC = { hearthkeeper: "npc_hearthkeeper", tools: "town_tools", arms: "town_arms", refiner: "npc_refiner" } as const;
/** The heal fee for climbers past the Fledgling job (healer.txt charges everyone; our Novices rest for free). */
export const HEAL_FEE = 50;
const isNovice = (s: Pick<Script, "get">) => s.get("BaseJob") === MAPID.Novice;

// ---------- Hearthkeeper Bren: save point and fireside heal ----------
const B = "[Hearthkeeper Bren]";
export const hearthkeeper: NpcScript = async (s) => {
  s.mes(B, "Welcome to the fire of ^4d4dffHearthmoor^000000, climber. What will it be?");
  await s.next();
  const c = await s.select("Set my hearth here", "Rest by the fire", "Start my training over", "Cancel");
  if (c === 1) {
    s.savepoint(TOWN, TOWN_SAVE.x, TOWN_SAVE.y); // F_KafraSave
    s.mes(B, "Done. Your ^4d4dffsave point^000000 is Hearthmoor now. Fall in the field and you wake here.");
    return s.close();
  }
  if (c === 2) {
    if (!isNovice(s)) {
      if (s.get("Zeny") < HEAL_FEE) { s.mes(B, `A seat by the fire is ^4d4dff${HEAL_FEE} zeny^000000 for a guild climber. Come back with the coin.`); return s.close(); }
      s.set("Zeny", s.get("Zeny") - HEAL_FEE);
    }
    s.percentheal(100, 100);
    s.emotion(ET.SMILE);
    s.mes(B, isNovice(s) ? "Sit, sit. Fledglings rest for free at my fire." : "There. Good as new.");
    return s.close();
  }
  if (c === 3) return retrain(s);
  return s.close();
};

// Stat / skill reset (shared/rules/reset.ts): free below Base Lv 40, then a fee by level.
async function retrain(s: Script) {
  const lv = s.get("BaseLevel"), stat = resetFee("stat", lv), skill = resetFee("skill", lv);
  const price = (z: number) => (z ? `${z.toLocaleString("en")} zeny` : "free");
  s.mes(B, "Every climber gets it wrong once. Sit with me and we'll undo what you've trained.",
    `Stats back to 1 with every point returned: ^4d4dff${price(stat)}^000000. Skills forgotten (but Basic Training) with every point returned: ^4d4dff${price(skill)}^000000.`);
  await s.next();
  const pick = await s.select("Reset my stats", "Reset my skills", "Cancel");
  if (pick !== 1 && pick !== 2) return s.close();
  const fee = pick === 1 ? stat : skill;
  if (s.get("Zeny") < fee) { s.mes(B, `That costs ^4d4dff${price(fee)}^000000. Come back with the coin.`); return s.close(); }
  s.mes(B, "Are you sure? This can't be undone.");
  await s.next();
  if (await s.select("Yes, start over.", "Not now.") !== 1) return s.close();
  if (fee) s.set("Zeny", s.get("Zeny") - fee);
  if (pick === 1) { s.resetstatus(); s.mes(B, "Done. Your status points are waiting in the Status window (^4d4dffAlt+A^000000)."); }
  else { const n = s.resetskill(); s.mes(B, `Done. ^4d4dff${n}^000000 skill points are back in the Skill window (^4d4dffAlt+S^000000).`); }
  s.emotion(ET.SMILE);
  return s.close();
}

/** Hearthmoor's shops (rAthena "shop" NPCs, opened by a click): the tool shop and the arms dealer. Mira's field stock split by type. */
export const toolStock = (items: { id: number; type: string }[]) => items.filter((i) => i.type === "Healing" || i.type === "DelayConsume" || i.type === "Ammo").map((i) => i.id);
export const armsStock = (items: { id: number; type: string }[]) => items.filter((i) => i.type === "Weapon" || i.type === "Armor").map((i) => i.id);
