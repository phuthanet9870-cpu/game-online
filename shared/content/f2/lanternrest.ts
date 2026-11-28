// Floor 2 — Lanternrest, the Ember Floor's rest town. No monsters. Lamplighter Isolde keeps the lanterns and the climbers' save point
// (Kafra "Save", F_KafraSave -> savepoint) and a rest by the lantern fire (percentheal 100,100 for HEAL_FEE zeny).
import type { NpcScript } from "../api.ts";
import { ET } from "../../rules/script.ts";
import { HEAL_FEE } from "../f1/town.ts";
import { F2_SAVE } from "../../maps.ts";

// ---------- Lamplighter Isolde: save point and a rest ----------
const I = "[Lamplighter Isolde]";
export const lamplighterIsolde: NpcScript = async (s) => {
  s.mes(I, "Mind the lanterns, climber. Every one on this floor is lit by hand, and every one is mine to keep burning.",
    "Anything I can do for you?");
  await s.next();
  const c = await s.select("Set my hearth here", "Rest by the lanterns", "Cancel");
  if (c === 1) {
    s.savepoint(F2_SAVE.map, F2_SAVE.x, F2_SAVE.y); // F_KafraSave
    s.mes(I, "Done. If the Heights take you, you will wake beside my lanterns in ^4d4dffLanternrest^000000.");
    return s.close();
  }
  if (c === 2) {
    if (s.get("Zeny") < HEAL_FEE) { s.mes(I, `A rest by the lanterns is ^4d4dff${HEAL_FEE} zeny^000000. Come back with the coin.`); return s.close(); }
    s.set("Zeny", s.get("Zeny") - HEAL_FEE);
    s.percentheal(100, 100);
    s.emotion(ET.SMILE);
    s.mes(I, "There. The ember glow sees to the rest.");
    return s.close();
  }
  return s.close();
};
