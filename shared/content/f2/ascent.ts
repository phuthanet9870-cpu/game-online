// Floor 2 — the Ascent Stair and the warp crystals.
// The Ascent Stair: a pale spiral stair in the Sunken Mire's drowned chapel, an invisible NPC on its cell with a 3x3 OnTouch area: a climber
// of Base Lv F2_GATE_LEVEL or more whose party felled floor 1's guardian goes up to Lanternrest; anyone else is told what is missing.
// Arriving sets f2_visit (the crystals work).
// The warp crystals (one in each town, rAthena's Kafra warp service without the fee): a floor's town can be reached from any other
// floor's town the climber has already stood in.
import type { NpcScript } from "../api.ts";
import { F2_ARRIVAL, TOWN } from "../../maps.ts";
import { F2_TOWN } from "../../floor2.ts";
import { CRYSTAL_LANDING, F2_GATE_LEVEL, F2_VAR } from "./chapter2.ts";
import { towerFloor } from "../../tower.ts";

const N = "-! The Ascent Stair !-";

export const ascentStair: NpcScript = async (s) => {
  if (s.get("BaseLevel") < F2_GATE_LEVEL) {
    s.mes(N, "The rune-light across the first step reads your measure and finds it short.",
      `The upper floor asks ^4d4dffBase Lv ${F2_GATE_LEVEL}^000000. You are Base Lv ^4d4dff${s.get("BaseLevel")}^000000.`,
      "Hunt the catacombs below the keep a while longer.");
    return s.close();
  }
  // 2.9.0 the Tower rule: the floor's guardian (Gloopking, roaming the Greenhollow Wilds) must have fallen to the climber's party
  if (s.get(towerFloor(1)!.clearVar) < 1) {
    s.mes(N, "The rune-light lifts a little, then settles again. A second seal glows on the step: a slime's crown in green light.",
      "^4d4dffThe floor's guardian still stands.^000000",
      "Fell ^ff4d4dGloopking^000000 in the Greenhollow Wilds (the ring stones west of this Mire); it rises somewhere different every time.");
    return s.close();
  }
  s.set(F2_VAR, 1);
  return s.warp(F2_ARRIVAL.map, F2_ARRIVAL.x, F2_ARRIVAL.y);
};

/** A warp crystal in `here`'s town ("f1" Hearthmoor / "f2" Lanternrest): dark until the climber has stood on floor 2. */
export const warpCrystal = (here: "f1" | "f2"): NpcScript => async (s) => {
  const C = "[Warp Crystal]";
  if (s.get(F2_VAR) < 1) {
    s.mes(C, "A tall crystal, dark and cold. Rune-lines run up it from the floor, and none of them are lit.",
      "It wakes for climbers who have stood on the floor above.");
    return s.close();
  }
  s.mes(C, "The crystal hums and its runes light one by one. It remembers every floor town you have stood in.",
    "Where to?");
  const to = here === "f1" ? CRYSTAL_LANDING[F2_TOWN] : CRYSTAL_LANDING[TOWN];
  const c = await s.select(here === "f1" ? "Lanternrest (Floor 2)" : "Hearthmoor (Floor 1)", "Cancel");
  if (c !== 1) return s.close();
  return s.warp(to.map, to.x, to.y);
};
