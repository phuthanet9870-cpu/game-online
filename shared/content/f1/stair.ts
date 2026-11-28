// Floor 1 — the stair under the Sunken Mire's old keep, the way down into the Mirefall Catacombs (shared/maps.ts DUN1..3).
// An invisible NPC on the stair cell with a 3x3 OnTouch area: walking in goes straight down. shared/maps.ts lists the stair in WARPS
// (npc "f1_stair") so navigation routes through it.
import type { NpcScript } from "../api.ts";
import { DUNGEON_ENTRY } from "../../maps.ts";

export const sealedStair: NpcScript = async (s) => s.warp(DUNGEON_ENTRY.map, DUNGEON_ENTRY.x, DUNGEON_ENTRY.y);
