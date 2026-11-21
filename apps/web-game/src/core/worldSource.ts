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
}
