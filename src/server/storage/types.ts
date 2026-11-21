import type { Appearance } from '../../shared/config/appearance.ts';
import type { ItemInstance } from '../../shared/config/items.ts';
import type { WeaponType } from '../../shared/config/weapons.ts';

export interface AccountRecord { id: string; username: string; passHash: string; salt: string; createdAt: number; bannedUntil: number }

export interface CharacterRecord {
  id: string;
  accountId: string;
  name: string;
  app: Appearance;
  level: number;
  exp: number;
  restedExp: number;
  gold: number;
  zoneId: string;
  x: number;
  y: number;
  hp: number;
  energy: number;
  /** weaponType -> mastery xp total */
  mastery: Partial<Record<WeaponType, { level: number; xp: number }>>;
  items: ItemInstance[];
  createdAt: number;
  lastSeen: number;
  /** Monotonic version, incremented on every save (optimistic concurrency). */
  version: number;
}

export interface AuditEntry { at: number; accountId: string | null; characterId: string | null; kind: string; data: Record<string, unknown> }

/**
 * Persistence boundary. Every method is atomic: saveCharacter writes the
 * character row and its full item set in one transaction.
 */
export interface Storage {
  init(): Promise<void>;
  createAccount(username: string, passHash: string, salt: string): Promise<AccountRecord | 'taken'>;
  getAccount(username: string): Promise<AccountRecord | null>;
  listCharacters(accountId: string): Promise<CharacterRecord[]>;
  createCharacter(rec: CharacterRecord): Promise<'ok' | 'name_taken'>;
  loadCharacter(id: string): Promise<CharacterRecord | null>;
  /** Fails with 'stale' if rec.version - 1 is not the stored version. */
  saveCharacter(rec: CharacterRecord): Promise<'ok' | 'stale'>;
  audit(entry: AuditEntry): Promise<void>;
  setBan(accountId: string, until: number): Promise<boolean>;
  close(): Promise<void>;
}
