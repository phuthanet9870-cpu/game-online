// Our monsters and items by name (case-insensitive) or id: what NPC scripts, shops and the job bots write instead of numeric ids.
import { MOB_BY_ID, type Mob } from "./data.ts";
import { ITEMS } from "./items.ts";

const lower = (s: string) => s.toLowerCase();
/** name -> row, the lowest id winning when two rows share a display name (renamed data has e.g. two "Knife" rows with a
 *  different slot count, where rAthena's aegis names differ): content that needs the other one uses the numeric id. */
function byName<T extends { id: number; name: string }>(rows: Iterable<T>) {
  const m = new Map<string, T>();
  for (const r of [...rows].sort((a, b) => a.id - b.id)) if (!m.has(lower(r.name))) m.set(lower(r.name), r);
  return m;
}
const mobByName = byName(MOB_BY_ID.values());
const itemByName = byName(ITEMS.values());
/** Our monster by name (case-insensitive, like mobdb_search_aegisname) or id. */
export const mobNamed = (ref: string | number): Mob | undefined => typeof ref === "number" ? MOB_BY_ID.get(ref) : mobByName.get(lower(ref));
/** Our item by name (case-insensitive, like item_db.search_aegisname) or id. */
export const itemNamed = (ref: string | number) => typeof ref === "number" ? ITEMS.get(ref) : itemByName.get(lower(ref));
