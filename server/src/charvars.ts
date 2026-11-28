// Permanent character variables (rAthena: char_reg_num): the tower's cleared floors, "visited floor 2", the rebirth bookkeeping.
// Loaded at login after the inventory (so after writesSettled), kept in memory, and written through on every change on the
// character's own write chain (Inventory.persist): variables, inventory and the status save land in order, and the character's
// next session waits for all of them.
import { db } from "./db.ts";
import type { Inventory } from "./inventory.ts";

export class CharVars {
  /** Permanent character variables (char_reg_num, index 0); unset = 0, like rAthena. */
  readonly vars: Map<string, number>;
  private readonly inv: Inventory;

  private constructor(inv: Inventory, vars: Map<string, number>) { this.inv = inv; this.vars = vars; }

  /** The character's registry load. Call after Inventory.load (which waited for the old session). */
  static async load(inv: Inventory) {
    const v = await db.query(`SELECT "key", value FROM char_reg_num WHERE char_id = $1 AND "index" = 0`, [inv.charId]);
    return new CharVars(inv, new Map(v.rows.map((r) => [String(r.key), Number(r.value)])));
  }

  /** A store over variables already read (tests that run the script engine without a database). */
  static of(inv: Inventory, vars = new Map<string, number>()) { return new CharVars(inv, vars); }

  private write(sql: string, args: unknown[]) {
    this.inv.persist(sql, args).catch((e: Error) => { if (/after session end/.test(e.message)) console.error("[charvars]", e.message); });
  }

  /** pc_setreg for a permanent character variable: 0 deletes it (pc_setregistry), anything else is stored. */
  setVar(key: string, value: number) {
    if (value === 0) {
      if (!this.vars.delete(key)) return;
      this.write(`DELETE FROM char_reg_num WHERE char_id = $1 AND "key" = $2 AND "index" = 0`, [this.inv.charId, key]);
      return;
    }
    if (this.vars.get(key) === value) return;
    this.vars.set(key, value);
    this.write(
      `INSERT INTO char_reg_num (char_id, "key", "index", value) VALUES ($1, $2, 0, $3)
       ON CONFLICT (char_id, "key", "index") DO UPDATE SET value = EXCLUDED.value`, [this.inv.charId, key, value]);
  }
}
