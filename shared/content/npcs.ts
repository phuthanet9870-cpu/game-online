// Every NPC of every map: only the ones the game needs. A room spawns the rows of its own map; kind "shop" opens the shop
// list (its `shop` stock), kind "script" runs `script` for the clicking player (server/src/script.ts). A row with a `trigger`
// area runs `onTouch` (or `script`) for whoever walks in. Server-only: the client gets name / sprite / position through the
// room state (invisible FAKE_NPC rows, sprite "", and floating ones, map "-", never reach it), never the scripts.
//
//   Hearthmoor (floor 1): save point, tool shop, arms shop, refiner, the six first-job masters, the Grandmaster (2nd jobs) and
//                         the rebirth keeper, a warp crystal
//   stairs and gates:     the stair into the catacombs, the Ascent Stair, the stair to floor 3, the chapel gate
//   Lanternrest (floor 2): save point, provisions shop, a warp crystal;  Witherwick (floor 3): save point
import { GRANDMASTER, REBIRTH, grandmaster, rebirth } from "./f1/jobs2.ts";
import { TOWN_CELLS } from "../town.ts";
import type { NpcDef } from "./api.ts";
import { ITEMS, SHOP_ITEMS } from "../rules/items.ts";
import { itemNamed } from "../rules/lookup.ts";
import { FIELD_THEMES, MIRE, MIRE_ASCENT, TOWN } from "../maps.ts";
import { TOWN_NPC, TOWN_SPOT, armsStock, hearthkeeper, toolStock } from "./f1/town.ts";
import { BRANN_ORE_SHOP, ORES, forgemasterBrann } from "./f1/smith.ts";
import { sealedStair } from "./f1/stair.ts";
import { CAMP, MASTERS, jobMaster } from "./f1/jobs.ts";
import { CRYSTAL1, NPC2, SPOT2 } from "./f2/chapter2.ts";
import { ascentStair, warpCrystal } from "./f2/ascent.ts";
import { NPC3, gateToFloor4, sisterOdile, stairToFloor3 } from "./f3/witherwick.ts";
import { F3_CELLS, F3_MAP } from "../floor3.ts";
import { F2_STAIR3 } from "../maps.ts";
import { lamplighterIsolde } from "./f2/lanternrest.ts";

const stock = SHOP_ITEMS.map((id) => ITEMS.get(id)!);

export const NPCS: NpcDef[] = [
  // Hearthmoor: the save point, the shops, the refiner and his floating ore shop (callshop)
  { id: TOWN_NPC.hearthkeeper, map: TOWN, name: "Hearthkeeper Bren", sprite: "npc_merchant", ...TOWN_SPOT.hearthkeeper, kind: "script", script: hearthkeeper },
  { id: TOWN_NPC.tools, map: TOWN, name: "Tilda's Sundries", sprite: "npc_herbalist", ...TOWN_SPOT.tools, kind: "shop", shop: toolStock(stock) },
  { id: TOWN_NPC.arms, map: TOWN, name: "Garrow's Arms", sprite: "npc_warden", ...TOWN_SPOT.arms, kind: "shop", shop: armsStock(stock) },
  { id: TOWN_NPC.refiner, map: TOWN, name: "Forgemaster Brann", sprite: "npc_warden", ...TOWN_SPOT.refiner, kind: "script", script: forgemasterBrann },
  { id: BRANN_ORE_SHOP, map: "-", name: "Brann's Ore", sprite: "", x: 0, y: 0, kind: "shop", shop: ORES.map((n) => itemNamed(n)!.id) },
  // the six first-job masters in Hearthmoor's guild row (f1/jobs.ts CAMP), the Guild Grandmaster (first job -> second job), rebirth
  ...MASTERS.map((m): NpcDef => ({ id: m.npc, map: TOWN, name: m.name, sprite: m.sprite, ...CAMP[m.job], kind: "script", script: jobMaster(m) })),
  { id: GRANDMASTER.npc, map: TOWN, name: GRANDMASTER.name, sprite: GRANDMASTER.sprite, ...TOWN_CELLS.grandmaster, kind: "script", script: grandmaster },
  { id: REBIRTH.npc, map: TOWN, name: REBIRTH.name, sprite: REBIRTH.sprite, ...TOWN_CELLS.rebirth, kind: "script", script: rebirth },
  // the stair under the Sunken Mire's old keep (an invisible OnTouch area; shared/maps.ts WARPS lists it as a door) and the Ascent Stair
  { id: "f1_stair", map: MIRE, name: "The Stair Down", sprite: "", ...FIELD_THEMES[MIRE].stair!, kind: "script", script: sealedStair, trigger: { x: 1, y: 1 } },
  { id: NPC2.ascent, name: "The Ascent Stair", sprite: "", ...MIRE_ASCENT, kind: "script", script: ascentStair, trigger: { x: 1, y: 1 } },
  // floor 2: Lanternrest's save point, provisions shop and the two warp crystals (npc_tomb is the stand-in sprite)
  { id: NPC2.keeper, name: "Lamplighter Isolde", sprite: "npc_herbalist", ...SPOT2.keeper, kind: "script", script: lamplighterIsolde },
  { id: NPC2.shop, name: "Marrow's Provisions", sprite: "npc_merchant", ...SPOT2.shop, kind: "shop", shop: [...toolStock(stock), ...armsStock(stock)] },
  { id: NPC2.crystal, name: "Warp Crystal", sprite: "npc_tomb", ...SPOT2.crystal, kind: "script", script: warpCrystal("f2") },
  { id: NPC2.crystal1, map: CRYSTAL1.map, name: "Warp Crystal", sprite: "npc_tomb", x: CRYSTAL1.x, y: CRYSTAL1.y, kind: "script", script: warpCrystal("f1") },
  // floor 3: the stair up from Lanternrest (opens with floor 2's guardian), the camp's save point, the gate to floor 4
  { id: NPC3.stair, map: F2_STAIR3.map, name: "The Stair to Floor 3", sprite: "", x: F2_STAIR3.x, y: F2_STAIR3.y, kind: "script", script: stairToFloor3, trigger: { x: 1, y: 1 } },
  { id: NPC3.keeper, map: F3_MAP, name: "Sister Odile", sprite: "npc_herbalist", ...F3_CELLS.keeper, kind: "script", script: sisterOdile },
  { id: NPC3.gate, map: F3_MAP, name: "The Chapel Gate", sprite: "", ...F3_CELLS.gateUp, kind: "script", script: gateToFloor4, trigger: { x: 1, y: 1 } },
];

export const npcsOn = (map: string) => NPCS.filter((n) => n.map === map);
export const NPC_BY_ID = new Map(NPCS.map((n) => [n.id, n]));
/** FAKE_NPC (sprite "") or floating (map "-"): rAthena's class-less NPCs, usable from anywhere (npc_checknear, class_ < 0). */
export const npcClassless = (n: Pick<NpcDef, "sprite" | "map">) => !n.sprite || n.map === "-";
