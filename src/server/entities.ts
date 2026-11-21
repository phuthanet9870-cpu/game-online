import type { MonsterDef } from '../shared/config/monsters.ts';
import type { NpcDef, ResourceNodeDef, SpawnGroupDef } from '../shared/config/zones.ts';
import type { Stats } from '../shared/config/stats.ts';
import type { SkillDef, SkillEffect, Element } from '../shared/config/skills.ts';
import type { WeaponDef } from '../shared/config/weapons.ts';
import type { ItemInstance } from '../shared/config/items.ts';
import type { MoveState } from '../shared/movement.ts';
import type { ClientMessage } from '../shared/protocol.ts';
import type { CharacterRecord } from './storage/types.ts';
import type { Inventory } from './inventory.ts';
import type { GmFlags } from './gm.ts';
import type { AutoState } from './autofarm.ts';

export type InputMsg = Extract<ClientMessage, { t: 'in' }>;

export interface SessionRef {
  send(msg: unknown): void;
  connId: string;
}

export interface PlayerEntity {
  kind: 1;
  id: number;
  rec: CharacterRecord;
  inv: Inventory;
  session: SessionRef | null;
  /** Server time (s) when the session dropped; player lingers for a grace period. */
  disconnectedAt: number | null;
  ms: MoveState;
  facingX: number; facingY: number;
  radius: number;
  stats: Stats;
  weapon: WeaponDef | null;
  hp: number; energy: number;
  shield: number; shieldUntil: number;
  /** skillId -> server time when ready */
  cooldowns: Map<string, number>;
  actionLockUntil: number;
  iframesUntil: number;
  counterUntil: number;
  blocking: boolean;
  combo: number; lastNormalAt: number;
  dead: boolean;
  lastCombatAt: number;
  potCdUntil: number;
  inputQueue: InputMsg[];
  lastSeq: number;
  inputBudget: number;
  ticksWithoutInput: number;
  /** Entity ids whose meta this client already has. */
  known: Set<number>;
  anim: number; animUntil: number;
  killTimes: number[];
  dirty: boolean;
  invDirty: boolean;
  charDirty: boolean;
  lastSaveAt: number;
  saving: Promise<void>;
  hazardTickAt: number;
  /** GM privileges are per session and only granted by the server. */
  gm: boolean;
  gmFlags: GmFlags;
  mutedUntil: number;
  auto: AutoState | null;
  /** Server times of kills made under auto (rolling hourly cap). */
  autoKillTimes: number[];
}

export interface MonsterEntity {
  kind: 2;
  id: number;
  def: MonsterDef;
  group: SpawnGroupDef;
  level: number;
  x: number; y: number;
  homeX: number; homeY: number;
  facingX: number; facingY: number;
  radius: number;
  hp: number; maxHp: number; atk: number; defense: number; exp: number;
  state: 'idle' | 'patrol' | 'chase' | 'windup' | 'return' | 'dead';
  stateUntil: number;
  wanderX: number; wanderY: number;
  targetId: number | null;
  /** attack index -> server time ready */
  attackReady: number[];
  windup: { idx: number; until: number; aimX: number; aimY: number; tx: number; ty: number } | null;
  /** player id -> damage dealt (threat & contribution) */
  threat: Map<number, number>;
  stunUntil: number;
  slowUntil: number; slowMult: number;
  forceUntil: number; fvx: number; fvy: number;
  respawnAt: number;
  anim: number; animUntil: number;
  lastHitAt: number;
}

export interface DropEntity {
  kind: 3;
  id: number;
  x: number; y: number;
  /** Gold drop when item is null. */
  item: ItemInstance | null;
  gold: number;
  ownerCharId: string | null;
  ownerUntil: number;
  despawnAt: number;
}

export interface NpcEntity { kind: 4; id: number; def: NpcDef; x: number; y: number }

export interface NodeEntity { kind: 5; id: number; def: ResourceNodeDef; x: number; y: number; readyAt: number }

export interface Projectile {
  id: number;
  ownerId: number;
  ownerKind: 1 | 2;
  x: number; y: number;
  vx: number; vy: number;
  radius: number;
  remaining: number;
  pierce: boolean;
  hit: Set<number>;
  hits: 'monsters' | 'players';
  /** Payload resolved on hit. */
  skill: SkillDef | null;
  damageMult: number;
  element: Element;
  effects: SkillEffect[];
  monsterAtkMult?: number;
}

export type Combatant = PlayerEntity | MonsterEntity;
export type AnyEntity = PlayerEntity | MonsterEntity | DropEntity | NpcEntity | NodeEntity;

export function entityPos(e: AnyEntity): { x: number; y: number } {
  return e.kind === 1 ? e.ms : e;
}
