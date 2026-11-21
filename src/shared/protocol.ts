/**
 * Wire protocol. JSON over WebSocket (or postMessage for the in-browser
 * server). All client->server messages are validated with `parseClientMessage`
 * before the server touches them. See docs/NETWORK_PROTOCOL.md.
 */
import { validAppearance, type Appearance } from './config/appearance.ts';
import type { EquipSlot, ItemInstance } from './config/items.ts';
import type { Stats } from './config/stats.ts';
import type { WeaponType } from './config/weapons.ts';
import { isFiniteNum } from './math.ts';

export const PROTOCOL_VERSION = 1;

export const BTN = { ATTACK: 1, HEAVY: 2, DODGE: 4, BLOCK: 8, SKILL1: 16, SKILL2: 32, SKILL3: 64, P1: 128, P2: 256, P3: 512, P4: 1024, P5: 2048, ULT: 4096 } as const;

export type ClientMessage =
  | { t: 'hello'; v: number }
  | { t: 'register'; user: string; pass: string }
  | { t: 'login'; user: string; pass: string }
  | { t: 'resume'; token: string }
  | { t: 'char_list' }
  | { t: 'char_create'; name: string; app: Appearance; weapon: WeaponType }
  | { t: 'char_select'; id: string }
  | { t: 'in'; s: number; mx: number; my: number; ax: number; ay: number; b: number; vt: number }
  | { t: 'pickup'; id: number }
  | { t: 'gather'; id: number }
  | { t: 'talk'; id: number }
  | { t: 'equip'; uid: string }
  | { t: 'unequip'; slot: EquipSlot }
  | { t: 'use'; uid: string }
  | { t: 'discard'; uid: string; qty: number }
  | { t: 'shop_buy'; npc: number; item: string; qty: number }
  | { t: 'shop_sell'; npc: number; uid: string; qty: number }
  | { t: 'respawn' }
  | { t: 'chat'; text: string }
  | { t: 'ping'; c: number }
  | { t: 'logout' }
  | { t: 'auto_start'; cfg: unknown }
  | { t: 'auto_stop' }
  | { t: 'power_exchange'; npc: number; power: string }
  | { t: 'power_awaken'; power: string }
  | { t: 'power_loadout'; power: string; actives: (string | null)[]; ult: string | null; passives: (string | null)[] }
  | { t: 'power_ritual'; npc: number; power: string }

export const ENTITY_KIND = { PLAYER: 1, MONSTER: 2, DROP: 3, NPC: 4, NODE: 5 } as const;
export const ANIM = { IDLE: 0, MOVE: 1, ATTACK: 2, HEAVY: 3, SKILL: 4, DODGE: 5, BLOCK: 6, HURT: 7, DEAD: 8, WINDUP: 9, CAST: 10, RETURN: 11 } as const;

export interface CharacterSummary { id: string; name: string; level: number; weapon: WeaponType | null; app: Appearance; zoneId: string }

/** Full description sent once when an entity enters a client's interest area. */
export type EntityMeta =
  | { id: number; k: 1; name: string; level: number; app: Appearance; weapon: WeaponType | null }
  | { id: number; k: 2; def: string; level: number; name: string; tier: string }
  | { id: number; k: 3; item: string; qty: number; rarity: string; owner: string | null; x: number; y: number }
  | { id: number; k: 4; npc: string; name: string; role: string; x: number; y: number; color: string; shop?: string }
  | { id: number; k: 5; node: string; kind: string; x: number; y: number; ready: boolean };

/** Compact per-tick entity state: [id, x*100, y*100, facing*100, hp%, anim, flags] */
export type EntityState = [number, number, number, number, number, number, number];
export const FLAG = { BLOCKING: 1, SHIELDED: 2, STUNNED: 4, INVULN: 8, SLOWED: 16, ELITE: 32, FROZEN: 64, STEALTH: 128, BURNING: 256, POISONED: 512, ROOTED: 1024 } as const;

export type GameEvent =
  | { e: 'hit'; s: number; t: number; d: number; c: 0 | 1; m: 0 | 1 }
  | { e: 'act'; s: number; a: string; x: number; y: number }
  | { e: 'proj'; id: number; s: number; x: number; y: number; vx: number; vy: number; r: number; life: number; fx: string }
  | { e: 'pend'; id: number }
  | { e: 'tele'; s: number; shape: 'circle' | 'arc'; x: number; y: number; r: number; ang: number; arc: number; dur: number }
  | { e: 'die'; id: number }
  | { e: 'heal'; t: number; v: number }
  | { e: 'lvl'; id: number; lvl: number }
  | { e: 'node'; id: number; ready: boolean }
  | { e: 'counter'; id: number }
  | { e: 'trap'; id: number; x: number; y: number; r: number; arm: number; on: boolean; owner: number }
  | { e: 'zone'; id: number; owner: number; x: number; y: number; r: number; dur: number; follow: boolean; fx: string; heal: boolean; on: boolean }
  | { e: 'summon'; owner: number; kind: string; count: number; dur: number }
  | { e: 'sact'; owner: number; kind: string; t: number }
  | { e: 'frozen'; id: number }
  | { e: 'chain'; a: number; b: number }

export interface SelfState {
  x: number; y: number;
  dodgeT: number; dvx: number; dvy: number;
  forceT: number; fvx: number; fvy: number;
  rootT: number; animT: number; animMoveMult: number;
  stamina: number; staminaDelay: number; dodgeCd: number;
  slowT: number; slowMult: number;
  hp: number; mhp: number; en: number; men: number; mst: number; shield: number;
  dead: boolean;
  /** skillId -> seconds remaining */
  cd: Record<string, number>;
  combo: number;
  potCd: number;
  /** Auto farm running (client stops predicting while true). */
  auto: boolean;
  autoKills: number;
  /** Server-side facing (used to render self while auto drives the character). */
  fx: number; fy: number;
  /** Damage-reduction buff remaining (s). */
  dr: number;
  charges: number;
  stealth: boolean;
  /** active buff sources with seconds left */
  buffs: [string, number][];
  cheat: boolean;
}

export interface CharacterView {
  id: string; name: string; level: number; exp: number; expNext: number; rested: number;
  gold: number; weapon: WeaponType | null; app: Appearance;
  stats: Stats; mastery: Record<string, { level: number; xp: number; next: number }>;
}

export type ServerMessage =
  | { t: 'welcome'; v: number; tickRate: number; serverName: string; mode: string }
  | { t: 'error'; code: string; msg: string }
  | { t: 'auth_ok'; user: string; token: string }
  | { t: 'char_list'; chars: CharacterSummary[]; max: number }
  | { t: 'enter_zone'; zone: string; selfId: number; tick: number; self: SelfState; metas: EntityMeta[] }
  | { t: 'snap'; tick: number; ack: number; self: SelfState; ents: EntityState[]; add: EntityMeta[]; rem: number[]; ev: GameEvent[] }
  | { t: 'char'; c: CharacterView }
  | { t: 'inv'; items: ItemInstance[]; gold: number; slots: number }
  | { t: 'shop'; npc: number; shopId: string; items: { itemId: string; price: number }[] }
  | { t: 'dialog'; npc: number; name: string; lines: string[] }
  | { t: 'chat'; ch: 'zone' | 'system'; from: string; text: string }
  | { t: 'notice'; text: string; kind: 'info' | 'warn' | 'loot' | 'level' }
  | { t: 'pong'; c: number; s: number }
  | { t: 'logged_out' }
  | { t: 'auto'; on: boolean; kills: number; reason: string }
  | { t: 'powers'; owned: { id: string; awakening: number; masteryLevel: number; masteryXp: number; next: number }[]; active: string | null; loadouts: Record<string, { actives: (string | null)[]; ult: string | null; passives: (string | null)[] }>; ritualIn: number; usable: boolean }
  | { t: 'power_npc'; npc: number; role: 'power' | 'ritual' }
  | { t: 'gm'; on: boolean; god: boolean; invis: boolean; nocd: boolean; speed: number; rates: { exp: number; drop: number; gold: number } };

// ---------------------------------------------------------------- validation
const isStr = (v: unknown, min: number, max: number): v is string => typeof v === 'string' && v.length >= min && v.length <= max;
const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const inRange = (v: unknown, lim: number): v is number => isFiniteNum(v) && Math.abs(v) <= lim;

export const NAME_RE = /^[A-Za-z0-9_฀-๿]{3,16}$/u;
export const USER_RE = /^[a-z0-9_]{3,20}$/;

/** Returns a typed message or null when malformed. Never throws. */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  let m: unknown = raw;
  if (typeof raw === 'string') {
    if (raw.length > 4096) return null;
    try { m = JSON.parse(raw); } catch { return null; }
  }
  if (!m || typeof m !== 'object') return null;
  const o = m as Record<string, unknown>;
  switch (o.t) {
    case 'hello': return isInt(o.v, 0, 1e6) ? { t: 'hello', v: o.v } : null;
    case 'register':
    case 'login': return isStr(o.user, 3, 20) && isStr(o.pass, 6, 72) ? { t: o.t, user: o.user, pass: o.pass } : null;
    case 'resume': return isStr(o.token, 16, 128) ? { t: 'resume', token: o.token } : null;
    case 'char_list': return { t: 'char_list' };
    case 'char_create':
      return isStr(o.name, 3, 16) && validAppearance(o.app) && typeof o.weapon === 'string'
        ? { t: 'char_create', name: o.name, app: o.app, weapon: o.weapon as WeaponType } : null;
    case 'char_select': return isStr(o.id, 1, 64) ? { t: 'char_select', id: o.id } : null;
    case 'in':
      return isInt(o.s, 0, 2 ** 31) && inRange(o.mx, 1.5) && inRange(o.my, 1.5) && inRange(o.ax, 1.5) && inRange(o.ay, 1.5)
        && isInt(o.b, 0, 8191) && isInt(o.vt, 0, 2 ** 31)
        ? { t: 'in', s: o.s, mx: o.mx, my: o.my, ax: o.ax, ay: o.ay, b: o.b, vt: o.vt } : null;
    case 'pickup': case 'gather': case 'talk': return isInt(o.id, 0, 2 ** 31) ? { t: o.t, id: o.id } : null;
    case 'equip': case 'use': return isStr(o.uid, 1, 64) ? { t: o.t, uid: o.uid } : null;
    case 'unequip': return isStr(o.slot, 1, 16) ? { t: 'unequip', slot: o.slot as EquipSlot } : null;
    case 'discard': return isStr(o.uid, 1, 64) && isInt(o.qty, 1, 9999) ? { t: 'discard', uid: o.uid, qty: o.qty } : null;
    case 'shop_buy': return isInt(o.npc, 0, 2 ** 31) && isStr(o.item, 1, 64) && isInt(o.qty, 1, 99) ? { t: 'shop_buy', npc: o.npc, item: o.item, qty: o.qty } : null;
    case 'shop_sell': return isInt(o.npc, 0, 2 ** 31) && isStr(o.uid, 1, 64) && isInt(o.qty, 1, 9999) ? { t: 'shop_sell', npc: o.npc, uid: o.uid, qty: o.qty } : null;
    case 'respawn': return { t: 'respawn' };
    case 'chat': return isStr(o.text, 1, 200) ? { t: 'chat', text: o.text } : null;
    case 'ping': return isFiniteNum(o.c) ? { t: 'ping', c: o.c } : null;
    case 'logout': return { t: 'logout' };
    case 'auto_start': return o.cfg && typeof o.cfg === 'object' ? { t: 'auto_start', cfg: o.cfg } : null;
    case 'auto_stop': return { t: 'auto_stop' };
    case 'power_exchange': case 'power_ritual':
      return isInt(o.npc, 0, 2 ** 31) && isStr(o.power, 1, 32) ? { t: o.t, npc: o.npc, power: o.power } : null;
    case 'power_awaken': return isStr(o.power, 1, 32) ? { t: 'power_awaken', power: o.power } : null;
    case 'power_loadout': {
      const ids = (v: unknown, n: number) => Array.isArray(v) && v.length === n && v.every((x) => x === null || isStr(x, 1, 64));
      return isStr(o.power, 1, 32) && ids(o.actives, 5) && ids(o.passives, 3) && (o.ult === null || isStr(o.ult, 1, 64))
        ? { t: 'power_loadout', power: o.power, actives: o.actives as (string | null)[], ult: o.ult as string | null, passives: o.passives as (string | null)[] } : null;
    }
    default: return null;
  }
}
