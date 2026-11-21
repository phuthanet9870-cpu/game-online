/**
 * SQLite storage (Node 22 built-in `node:sqlite`). Schema is versioned by
 * numbered migrations recorded in `schema_migrations`.
 */
import { DatabaseSync } from 'node:sqlite';
import type { AccountRecord, AuditEntry, CharacterRecord, Storage } from './types.ts';
import type { ItemInstance } from '../../shared/config/items.ts';

export const MIGRATIONS: { id: number; name: string; sql: string }[] = [
  {
    id: 1, name: 'initial',
    sql: `
      CREATE TABLE accounts (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        pass_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE characters (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id),
        name TEXT NOT NULL,
        name_lower TEXT NOT NULL UNIQUE,
        appearance TEXT NOT NULL,
        level INTEGER NOT NULL,
        exp INTEGER NOT NULL,
        rested_exp INTEGER NOT NULL DEFAULT 0,
        gold INTEGER NOT NULL CHECK (gold >= 0),
        zone_id TEXT NOT NULL,
        x REAL NOT NULL, y REAL NOT NULL,
        hp INTEGER NOT NULL, energy INTEGER NOT NULL,
        mastery TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_seen INTEGER NOT NULL,
        version INTEGER NOT NULL
      );
      CREATE INDEX idx_characters_account ON characters(account_id);
      CREATE TABLE items (
        uid TEXT PRIMARY KEY,
        character_id TEXT NOT NULL REFERENCES characters(id),
        def_id TEXT NOT NULL,
        qty INTEGER NOT NULL CHECK (qty > 0),
        rarity TEXT NOT NULL,
        ilvl INTEGER NOT NULL,
        enhance INTEGER NOT NULL DEFAULT 0,
        bound INTEGER NOT NULL DEFAULT 0,
        slot INTEGER,
        equip TEXT,
        UNIQUE (character_id, slot),
        UNIQUE (character_id, equip)
      );
      CREATE INDEX idx_items_character ON items(character_id);
      CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at INTEGER NOT NULL,
        account_id TEXT, character_id TEXT,
        kind TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX idx_audit_char ON audit_log(character_id, at);
    `,
  },
  {
    id: 2, name: 'account_bans',
    sql: `ALTER TABLE accounts ADD COLUMN banned_until INTEGER NOT NULL DEFAULT 0;`,
  },
];

type Row = Record<string, unknown>;

export class SqliteStorage implements Storage {
  private db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  }

  async init() { this.migrate(); }

  migrate(): number[] {
    this.db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)');
    const done = new Set((this.db.prepare('SELECT id FROM schema_migrations').all() as Row[]).map((r) => Number(r.id)));
    const applied: number[] = [];
    for (const m of MIGRATIONS) {
      if (done.has(m.id)) continue;
      this.tx(() => {
        this.db.exec(m.sql);
        this.db.prepare('INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)').run(m.id, m.name, Date.now());
      });
      applied.push(m.id);
    }
    return applied;
  }

  private tx<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const r = fn();
      this.db.exec('COMMIT');
      return r;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  async createAccount(username: string, passHash: string, salt: string) {
    const rec: AccountRecord = { id: crypto.randomUUID(), username, passHash, salt, createdAt: Date.now(), bannedUntil: 0 };
    try {
      this.db.prepare('INSERT INTO accounts (id, username, pass_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(rec.id, rec.username, rec.passHash, rec.salt, rec.createdAt);
    } catch (e) {
      if (String(e).includes('UNIQUE')) return 'taken' as const;
      throw e;
    }
    return rec;
  }

  async getAccount(username: string) {
    const r = this.db.prepare('SELECT * FROM accounts WHERE username = ?').get(username) as Row | undefined;
    return r ? { id: String(r.id), username: String(r.username), passHash: String(r.pass_hash), salt: String(r.salt), createdAt: Number(r.created_at), bannedUntil: Number(r.banned_until ?? 0) } : null;
  }

  private rowToChar(r: Row): CharacterRecord {
    const items = (this.db.prepare('SELECT * FROM items WHERE character_id = ?').all(String(r.id)) as Row[]).map((i): ItemInstance => ({
      uid: String(i.uid), defId: String(i.def_id), qty: Number(i.qty), rarity: String(i.rarity) as ItemInstance['rarity'],
      ilvl: Number(i.ilvl), enhance: Number(i.enhance), bound: Number(i.bound) === 1,
      slot: i.slot === null ? null : Number(i.slot), equip: i.equip === null ? null : (String(i.equip) as ItemInstance['equip']),
    }));
    return {
      id: String(r.id), accountId: String(r.account_id), name: String(r.name), app: JSON.parse(String(r.appearance)),
      level: Number(r.level), exp: Number(r.exp), restedExp: Number(r.rested_exp), gold: Number(r.gold), zoneId: String(r.zone_id),
      x: Number(r.x), y: Number(r.y), hp: Number(r.hp), energy: Number(r.energy), mastery: JSON.parse(String(r.mastery)),
      items, createdAt: Number(r.created_at), lastSeen: Number(r.last_seen), version: Number(r.version),
    };
  }

  async listCharacters(accountId: string) {
    return (this.db.prepare('SELECT * FROM characters WHERE account_id = ? ORDER BY created_at').all(accountId) as Row[]).map((r) => this.rowToChar(r));
  }

  private writeItems(c: CharacterRecord) {
    this.db.prepare('DELETE FROM items WHERE character_id = ?').run(c.id);
    const ins = this.db.prepare('INSERT INTO items (uid, character_id, def_id, qty, rarity, ilvl, enhance, bound, slot, equip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const it of c.items) ins.run(it.uid, c.id, it.defId, it.qty, it.rarity, it.ilvl, it.enhance, it.bound ? 1 : 0, it.slot, it.equip);
  }

  async createCharacter(c: CharacterRecord) {
    try {
      this.tx(() => {
        this.db.prepare(`INSERT INTO characters (id, account_id, name, name_lower, appearance, level, exp, rested_exp, gold, zone_id, x, y, hp, energy, mastery, created_at, last_seen, version)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(c.id, c.accountId, c.name, c.name.toLowerCase(), JSON.stringify(c.app), c.level, c.exp, c.restedExp, c.gold, c.zoneId, c.x, c.y, c.hp, c.energy,
            JSON.stringify(c.mastery), c.createdAt, c.lastSeen, c.version);
        this.writeItems(c);
      });
    } catch (e) {
      if (String(e).includes('UNIQUE') && String(e).includes('name_lower')) return 'name_taken' as const;
      throw e;
    }
    return 'ok' as const;
  }

  async loadCharacter(id: string) {
    const r = this.db.prepare('SELECT * FROM characters WHERE id = ?').get(id) as Row | undefined;
    return r ? this.rowToChar(r) : null;
  }

  async saveCharacter(c: CharacterRecord) {
    return this.tx(() => {
      const res = this.db.prepare(`UPDATE characters SET level = ?, exp = ?, rested_exp = ?, gold = ?, zone_id = ?, x = ?, y = ?, hp = ?, energy = ?,
          mastery = ?, last_seen = ?, version = ? WHERE id = ? AND version = ?`)
        .run(c.level, c.exp, c.restedExp, c.gold, c.zoneId, c.x, c.y, c.hp, c.energy, JSON.stringify(c.mastery), c.lastSeen, c.version, c.id, c.version - 1);
      if (Number(res.changes) !== 1) return 'stale' as const;
      this.writeItems(c);
      return 'ok' as const;
    });
  }

  async audit(e: AuditEntry) {
    this.db.prepare('INSERT INTO audit_log (at, account_id, character_id, kind, data) VALUES (?, ?, ?, ?, ?)')
      .run(e.at, e.accountId, e.characterId, e.kind, JSON.stringify(e.data));
  }

  async setBan(accountId: string, until: number) {
    const r = this.db.prepare('UPDATE accounts SET banned_until = ? WHERE id = ?').run(until, accountId);
    return Number(r.changes) === 1;
  }

  /** Online backup to a file (used by `npm run backup`-style ops). */
  backup(path: string) { this.db.exec(`VACUUM INTO '${path.replace(/'/g, "''")}'`); }

  async close() { this.db.close(); }
}
