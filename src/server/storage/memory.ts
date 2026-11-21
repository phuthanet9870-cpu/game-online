import type { AccountRecord, AuditEntry, CharacterRecord, Storage } from './types.ts';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export interface MemorySnapshot { accounts: AccountRecord[]; characters: CharacterRecord[] }

/**
 * In-memory storage used by the in-browser server (Web Worker) and tests.
 * `onChange` lets the host persist a snapshot (e.g. to localStorage).
 */
export class MemoryStorage implements Storage {
  private accounts = new Map<string, AccountRecord>();
  private chars = new Map<string, CharacterRecord>();
  readonly auditLog: AuditEntry[] = [];

  constructor(snapshot?: MemorySnapshot | null, private onChange?: (s: MemorySnapshot) => void) {
    if (snapshot) {
      for (const a of snapshot.accounts ?? []) this.accounts.set(a.username, a);
      for (const c of snapshot.characters ?? []) this.chars.set(c.id, c);
    }
  }

  async init() {}
  snapshot(): MemorySnapshot { return clone({ accounts: [...this.accounts.values()], characters: [...this.chars.values()] }); }
  private changed() { this.onChange?.(this.snapshot()); }

  async createAccount(username: string, passHash: string, salt: string) {
    if (this.accounts.has(username)) return 'taken' as const;
    const rec: AccountRecord = { id: crypto.randomUUID(), username, passHash, salt, createdAt: Date.now(), bannedUntil: 0 };
    this.accounts.set(username, rec);
    this.changed();
    return clone(rec);
  }
  async getAccount(username: string) { const a = this.accounts.get(username); return a ? clone(a) : null; }
  async listCharacters(accountId: string) {
    return [...this.chars.values()].filter((c) => c.accountId === accountId).sort((a, b) => a.createdAt - b.createdAt).map(clone);
  }
  async createCharacter(rec: CharacterRecord) {
    const lower = rec.name.toLowerCase();
    for (const c of this.chars.values()) if (c.name.toLowerCase() === lower) return 'name_taken' as const;
    this.chars.set(rec.id, clone(rec));
    this.changed();
    return 'ok' as const;
  }
  async loadCharacter(id: string) { const c = this.chars.get(id); return c ? clone(c) : null; }
  async saveCharacter(rec: CharacterRecord) {
    const cur = this.chars.get(rec.id);
    if (!cur || cur.version !== rec.version - 1) return 'stale' as const;
    const uids = new Set<string>();
    for (const it of rec.items) { if (uids.has(it.uid)) throw new Error('duplicate item uid in save'); uids.add(it.uid); }
    this.chars.set(rec.id, clone(rec));
    this.changed();
    return 'ok' as const;
  }
  async audit(entry: AuditEntry) {
    this.auditLog.push(entry);
    if (this.auditLog.length > 5000) this.auditLog.splice(0, 1000);
  }
  async setBan(accountId: string, until: number) {
    for (const a of this.accounts.values()) if (a.id === accountId) { a.bannedUntil = until; this.changed(); return true; }
    return false;
  }
  async close() {}
}
