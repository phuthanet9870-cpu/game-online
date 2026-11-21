import starterField from "../../data/maps/starter-field.json";
import { GameMap, type MapFile } from "./map";

/** Every map in the game. Add a JSON file under data/maps and list it here. */
export const MAPS: Record<string, GameMap> = Object.fromEntries(
  [starterField as MapFile].map((file) => [file.id, new GameMap(file)]),
);

export const DEFAULT_MAP_ID = "starter-field";
