import type { Database, Migration } from "@game/core";
import { DEFAULT_MAP_ID, MAPS, PLAYER_COLORS } from "../shared";

export const CHARACTER_MIGRATIONS: Migration[] = [
  {
    id: "world/001_characters",
    sql: `
      CREATE TABLE world_characters (
        id          SERIAL PRIMARY KEY,
        account_id  INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        color       SMALLINT NOT NULL,
        map_id      TEXT NOT NULL,
        x           SMALLINT NOT NULL,
        y           SMALLINT NOT NULL,
        save_map_id TEXT NOT NULL,
        save_x      SMALLINT NOT NULL,
        save_y      SMALLINT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX world_characters_name_idx ON world_characters (lower(name));
      CREATE INDEX world_characters_account_idx ON world_characters (account_id);
    `,
  },
];

export const MAX_CHARACTERS = 3;
/** Letters (Thai included), combining marks and digits, single spaces inside. */
const NAME_PATTERN = /^[\p{L}\p{M}\p{N}]+(?: [\p{L}\p{M}\p{N}]+)*$/u;

export interface CharacterRow {
  id: number;
  accountId: number;
  name: string;
  color: number;
  mapId: string;
  x: number;
  y: number;
}

/** What the character-select screen shows. */
export interface CharacterSummary {
  id: number;
  name: string;
  color: number;
  mapName: string;
}

export class CharacterError extends Error {
  readonly expose = true;
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export function validateCharacterName(input: unknown): string {
  const name = typeof input === "string" ? input.normalize("NFC").trim().replace(/\s+/g, " ") : "";
  if ([...name].length < 2 || [...name].length > 16 || !NAME_PATTERN.test(name)) {
    throw new CharacterError(400, "ชื่อตัวละครต้องยาว 2–16 ตัว ใช้ตัวอักษร ตัวเลข และเว้นวรรคได้");
  }
  return name;
}

const SELECT = `SELECT id, account_id AS "accountId", name, color, map_id AS "mapId", x, y FROM world_characters`;

export class CharacterStore {
  constructor(private readonly db: Database) {}

  async list(accountId: number): Promise<CharacterSummary[]> {
    const { rows } = await this.db.query<CharacterRow>(`${SELECT} WHERE account_id = $1 ORDER BY id`, [accountId]);
    return rows.map((r) => ({ id: r.id, name: r.name, color: r.color, mapName: MAPS[r.mapId]?.name ?? r.mapId }));
  }

  async create(accountId: number, input: { name?: unknown; color?: unknown }): Promise<CharacterSummary> {
    const name = validateCharacterName(input.name);
    const color = Number(input.color);
    if (!Number.isInteger(color) || color < 0 || color >= PLAYER_COLORS) throw new CharacterError(400, "สีตัวละครไม่ถูกต้อง");
    const map = MAPS[DEFAULT_MAP_ID];

    return this.db.transaction(async (tx) => {
      // Lock the account row so two parallel creates cannot both pass the slot check.
      await tx.query("SELECT id FROM accounts WHERE id = $1 FOR UPDATE", [accountId]);
      const { rows: count } = await tx.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM world_characters WHERE account_id = $1", [accountId]);
      if (count[0].n >= MAX_CHARACTERS) throw new CharacterError(409, `สร้างได้สูงสุด ${MAX_CHARACTERS} ตัวต่อบัญชี`);
      const { rows: taken } = await tx.query("SELECT 1 FROM world_characters WHERE lower(name) = lower($1)", [name]);
      if (taken.length > 0) throw new CharacterError(409, "ชื่อตัวละครนี้มีคนใช้แล้ว");
      const { rows } = await tx.query<{ id: number }>(
        `INSERT INTO world_characters (account_id, name, color, map_id, x, y, save_map_id, save_x, save_y)
         VALUES ($1, $2, $3, $4, $5, $6, $4, $5, $6) RETURNING id`,
        [accountId, name, color, map.id, map.spawn.x, map.spawn.y],
      );
      return { id: rows[0].id, name, color, mapName: map.name };
    });
  }

  async remove(accountId: number, id: number): Promise<boolean> {
    const { rows } = await this.db.query(
      "DELETE FROM world_characters WHERE id = $1 AND account_id = $2 RETURNING id", [id, accountId]);
    return rows.length > 0;
  }

  /** Load a character only if it belongs to the account. */
  async load(accountId: number, id: number): Promise<CharacterRow | null> {
    const { rows } = await this.db.query<CharacterRow>(`${SELECT} WHERE id = $1 AND account_id = $2`, [id, accountId]);
    return rows[0] ?? null;
  }

  async savePosition(id: number, mapId: string, x: number, y: number): Promise<void> {
    await this.db.query(
      "UPDATE world_characters SET map_id = $2, x = $3, y = $4, updated_at = now() WHERE id = $1",
      [id, mapId, x, y],
    );
  }
}
