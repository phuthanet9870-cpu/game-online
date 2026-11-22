/**
 * Typed event bridge between Phaser (world) and React (HUD). React never touches simulation state
 * directly; it receives immutable snapshots and sends UI commands (spec §20.1).
 */
import type { GateItem } from './phaseGate';
import type { CharacterState, CombatState, DeathRecapEntry, RejectReason } from '../core/simulation';
import { defaultLayout, type HotbarAction, type HotbarLayoutEntry } from '../core/hotbar';
import type { AutoView, OnlineState, PowerView } from '../core/worldSource';

export interface SlotCooldown {
  remainingMs: number;
  fraction: number;
}

export interface TargetInfo {
  id: string;
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  ai: string;
  statuses: string[];
}

export interface MinimapEntity {
  x: number;
  y: number;
  kind: 'player' | 'monster' | 'dead' | 'other';
}

export interface HudSnapshot {
  ready: boolean;
  playerName: string;
  level: number;
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  charState: CharacterState;
  combatState: CombatState;
  cooldowns: Partial<Record<HotbarAction, SlotCooldown>>;
  staminaCosts: Partial<Record<HotbarAction, number>>;
  skillNames: Partial<Record<HotbarAction, string>>;
  target: TargetInfo | null;
  respawnInMs: number;
  deathRecap: DeathRecapEntry[];
  mapName: string;
  mapId: string;
  mapSize: { w: number; h: number };
  minimap: MinimapEntity[];
  gate: GateItem[];
  mode: 'offline' | 'online';
  online: OnlineState | null;
  energy: number;
  maxEnergy: number;
  weaponId: string;
  power: PowerView | null;
  energyCosts: Partial<Record<HotbarAction, number>>;
  statuses: string[];
  auto: AutoView | null;
  gmResult: Record<string, unknown> | null;
  nearSeverer: boolean;
  nearNpc: string;
  dropsNearby: number;
  othersCount: number;
  fps: number;
  debug: boolean;
  invulnerable: boolean;
}

export type LogChannel = 'combat' | 'system' | 'world';
export interface LogEntry {
  id: number;
  channel: LogChannel;
  text: string;
  tone?: 'normal' | 'good' | 'bad' | 'crit' | 'warn';
}

export type UiCommand =
  | { type: 'hotbar'; action: HotbarAction }
  | { type: 'toggleDebug' }
  | { type: 'setInputEnabled'; enabled: boolean }
  | { type: 'setReducedEffects'; value: boolean };

type Listener = () => void;

export class Store<T> {
  private listeners = new Set<Listener>();
  constructor(private state: T) {}
  get = (): T => this.state;
  set(next: T): void {
    this.state = next;
    this.listeners.forEach((l) => l());
  }
  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
}

export const INITIAL_HUD: HudSnapshot = {
  ready: false,
  playerName: 'Eclipse',
  level: 1,
  hp: 1,
  maxHp: 1,
  stamina: 0,
  maxStamina: 1,
  charState: 'CREATED',
  combatState: 'idle',
  cooldowns: {},
  staminaCosts: {},
  skillNames: {},
  target: null,
  respawnInMs: 0,
  deathRecap: [],
  mapName: '',
  mapId: '',
  mapSize: { w: 1, h: 1 },
  minimap: [],
  gate: [],
  mode: 'offline',
  online: null,
  energy: 0,
  maxEnergy: 100,
  weaponId: 'sword',
  power: null,
  energyCosts: {},
  statuses: [],
  auto: null,
  gmResult: null,
  nearSeverer: false,
  nearNpc: '',
  dropsNearby: 0,
  othersCount: 0,
  fps: 0,
  debug: false,
  invulnerable: false,
};

export const hudStore = new Store<HudSnapshot>(INITIAL_HUD);
/** Active hotbar layout (server-persisted online, browser-local in the offline sandbox). */
export const hotbarStore = new Store<HotbarLayoutEntry[]>(defaultLayout());
/** One-shot UI requests from the world (e.g. open The Severer dialog). */
export interface UiEvent {
  id: number;
  kind: 'severer' | 'npc' | 'none';
  npc?: string;
  data?: Record<string, unknown>;
}
export const uiEventStore = new Store<UiEvent>({ id: 0, kind: 'none' });
let uiEventId = 0;
export const requestUi = (kind: 'severer' | 'npc', npc?: string, data?: Record<string, unknown>): void =>
  uiEventStore.set({ id: ++uiEventId, kind, npc, data });
export const logStore = new Store<LogEntry[]>([]);
export const toastStore = new Store<{ id: number; text: string } | null>(null);

let logId = 0;
export function pushLog(channel: LogChannel, text: string, tone: LogEntry['tone'] = 'normal'): void {
  const next = [...logStore.get(), { id: ++logId, channel, text, tone }];
  logStore.set(next.length > 80 ? next.slice(-80) : next);
}

let toastId = 0;
export function showToast(text: string): void {
  toastStore.set({ id: ++toastId, text });
}

const commandListeners = new Set<(c: UiCommand) => void>();
export const sendCommand = (c: UiCommand): void => commandListeners.forEach((l) => l(c));
export const onCommand = (l: (c: UiCommand) => void): (() => void) => {
  commandListeners.add(l);
  return () => commandListeners.delete(l);
};

export const REJECT_TEXT: Record<RejectReason, string> = {
  cooldown: 'ยังติดคูลดาวน์',
  stamina: 'Stamina ไม่พอ',
  busy: 'กำลังใช้ท่าอื่นอยู่',
  dead: 'ตัวละครเสียชีวิต',
  full: 'HP เต็มแล้ว',
  'no-item': 'ไม่มีไอเทมนี้ในกระเป๋า',
  energy: 'Power Energy ไม่พอ',
  stance: 'ต้อง Activate The Power ก่อน (ช่อง 11)',
  'no-power': 'ยังไม่ได้ผูก The Power',
  weapon: 'อาวุธนี้ใช้กับพลังนี้ไม่ได้',
  empty: 'ช่องนี้ยังไม่ได้ใส่สกิลพลัง',
};

/** Counts uncaught runtime errors for the QA gate. */
export const runtimeErrors = { count: 0, last: '' };
