// Floor 2 of the Tower (2.5.0), "The Ember Floor": the permanent variables, the level gate of the Ascent Stair and where the floor's
// NPCs stand.
import { F2_TOWN, T2_CELLS } from "../../floor2.ts";
import { TOWN } from "../../maps.ts";

/** Base level the Ascent Stair asks for : the catacombs below end at Lv 30, the Ember Floor's monsters run from Lv 32 to 45. */
export const F2_GATE_LEVEL = 30;
/** Permanent character variable: 1 = this climber has stood on floor 2 (the warp crystals of both towns work for them). */
export const F2_VAR = "f2_visit";
/** Permanent character variable: 1 = the vault's boss is down ("Embers of the Vault" done; the stair to floor 3 opens in a later release). */
export const F2_VAULT_VAR = "f2_vault";

export const NPC2 = {
  keeper: "npc_f2_keeper", shop: "f2_shop", crystal: "f2_crystal", crystal1: "f1_crystal", ascent: "f1_ascent",
} as const;
/** Where floor 2's NPCs stand on Lanternrest (shared/floor2.ts T2_CELLS). */
export const SPOT2 = {
  keeper: { map: F2_TOWN, ...T2_CELLS.keeper }, shop: { map: F2_TOWN, ...T2_CELLS.shop },
  crystal: { map: F2_TOWN, ...T2_CELLS.crystal },
} as const;
/** Hearthmoor's warp crystal (on the plaza, north-east of the fountain). */
export const CRYSTAL1 = { map: TOWN, x: 30, y: 22 } as const;
/** Where a crystal puts the climber down: two cells south of itself. */
export const CRYSTAL_LANDING = {
  [TOWN]: { map: TOWN, x: CRYSTAL1.x, y: CRYSTAL1.y + 2 },
  [F2_TOWN]: { map: F2_TOWN, x: T2_CELLS.crystal.x, y: T2_CELLS.crystal.y + 2 },
} as const;
