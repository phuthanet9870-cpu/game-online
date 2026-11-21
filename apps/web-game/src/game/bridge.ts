/**
 * Typed event bridge between Phaser (world) and React (HUD). React never touches simulation state
 * directly; it receives immutable snapshots and sends UI commands (spec §20.1).
 */
import type { GateItem } from './phaseGate';
import type { CharacterState, CombatState, DeathRecapEntry, RejectReason } from '../core/simulation';
import type { HotbarAction } from '../core/hotbar';

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
  kind: 'player' | 'monster' | 'dead';
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
  mapSize: { w: number; h: number };
  minimap: MinimapEntity[];
  gate: GateItem[];
  fps: number;
  debug: boolean;
  invulnerable: boolean;
}

export type LogChannel = 'combat' | 'system';
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

class Store<T> {
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
  mapSize: { w: 1, h: 1 },
  minimap: [],
  gate: [],
  fps: 0,
  debug: false,
  invulnerable: false,
};

export const hudStore = new Store<HudSnapshot>(INITIAL_HUD);
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
};

/** Counts uncaught runtime errors for the QA gate. */
export const runtimeErrors = { count: 0, last: '' };
