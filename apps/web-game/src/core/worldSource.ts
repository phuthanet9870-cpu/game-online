import type { ActionDef, MonsterDef, WeaponDef } from './content';
import type { Dir8 } from './direction';
import type { Vec2 } from './math';
import type { CollisionGrid } from './movement';
import type {
  ActionSlot,
  AiState,
  CharacterState,
  CombatState,
  DeathRecapEntry,
  PlayerInput,
  SimEvent,
  Telemetry,
} from './simulation';

/**
 * What the Phaser scene and HUD read. Implemented by the offline GameSimulation (Phase 1 sandbox)
 * and by NetWorld (Phase 2 online client fed by authoritative server snapshots).
 */
export interface PlayerView {
  id: string;
  name: string;
  pos: Vec2;
  facing: Dir8;
  moving: boolean;
  dash: unknown;
  action: { def: ActionDef; startedAt: number; angle: number } | null;
  charState: CharacterState;
  combatState: CombatState;
  invulnerableUntil: number;
  hp: number;
  maxHp: number;
  stamina: { current: number; max: number };
  cooldowns: { remaining(id: string, now: number): number; fraction(id: string, now: number): number };
  base: { radius: number; level: number; dash: { staminaCost: number } };
  energy: number;
  statuses: Array<{ id: string; expiresAt: number }>;
  respawnAt: number;
  lastDeathRecap: DeathRecapEntry[];
  readonly alive: boolean;
}

export interface MonsterView {
  id: string;
  def: MonsterDef;
  pos: Vec2;
  spawn: Vec2;
  hp: number;
  ai: AiState;
  statuses: Array<{ id: string; defenseMultiplier: number }>;
  facingX: 1 | -1;
  diedAt: number;
  attackStartedAt: number;
  readonly alive: boolean;
}

export interface OtherPlayerView {
  id: string;
  name: string;
  level: number;
  pos: Vec2;
  facing: Dir8;
  moving: boolean;
  dashing: boolean;
  hp: number;
  maxHp: number;
  charState: CharacterState;
  action: { def: ActionDef; startedAt: number; angle: number } | null;
  invulnerableUntil: number;
  connected: boolean;
}

export interface OnlineState {
  status: 'connecting' | 'online' | 'reconnecting' | 'closed';
  kicked: string | null;
  gold: number;
  xp: number;
  xpStart: number;
  xpNext: number;
  level: number;
  items: Array<{ templateId: string; quantity: number }>;
  slots: number;
  ping: number;
  seq: number;
  ack: number;
  playersOnline: number;
  instance: string;
  testWorld: boolean;
  gm: { open: boolean; role: string; caps: string[] } | null;
}

export interface WorldSource {
  readonly mode: 'offline' | 'online';
  readonly time: number;
  readonly grid: CollisionGrid;
  readonly player: PlayerView;
  readonly monsters: MonsterView[];
  readonly others: OtherPlayerView[];
  readonly weapon: WeaponDef;
  readonly telemetry: Telemetry;
  targetId: string | null;
  debugGodMode: boolean;
  step(dtMs: number, input: PlayerInput): void;
  drainEvents(): SimEvent[];
  getActionDef(slot: ActionSlot): ActionDef;
  getMonster(id: string | null): MonsterView | undefined;
  readonly online?: OnlineState;
  sendChat?(text: string): void;
  usePotion?(): void;
  dispose?(): void;
  /* Phase 3 */
  powerView(): PowerView | null;
  readonly drops: Array<{ id: string; x: number; y: number }>;
  readonly auto: AutoView | null;
  equip(weapon: string): void;
  bind(itemOrPowerId: string): void;
  unbind(confirm: string): void;
  setLoadout(lo: { actives: string[]; ultimate: string; passives: string[] }): void;
  craft?(recipe: string): void;
  saveHotbar(slots: Array<{ action: string; key: string }>): void;
  setAuto?(enabled: boolean | null, settings?: AutoSettings): void;
  pickup?(id: string): void;
  gm?(op: string, args: Record<string, unknown>): void;
}

export interface PowerSkillView {
  id: string;
  name: string;
  category: 'power-active' | 'power-ultimate' | 'power-passive';
  implemented: boolean;
  unlocked: boolean;
  energyCost?: number;
  cooldownMs?: number;
  description?: string;
}

export interface PowerView {
  id: string;
  name: string;
  type: string;
  allowedWeapons: string[];
  weaponOk: boolean;
  stance: boolean;
  points: number;
  rank: number;
  nextRankPoints: number;
  loadout: { actives: string[]; ultimate: string; passives: string[] };
  skills: PowerSkillView[];
}

export interface AutoSettings {
  radiusTiles: number;
  useSkills: boolean;
  skillOrder: string[];
  autoPotion: boolean;
  potionPct: number;
  autoLoot: boolean;
  lootCategories: string[];
  targets: string[];
  blacklist: string[];
  stopNoPotion: boolean;
  maxMinutes: number;
}

export interface AutoReport {
  reason?: string;
  durationMs: number;
  kills: number;
  xp: number;
  gold: number;
  items: Record<string, number>;
  potionsUsed: number;
}

export interface AutoView {
  enabled: boolean;
  settings: AutoSettings;
  live: AutoReport | null;
  report: AutoReport | null;
}
