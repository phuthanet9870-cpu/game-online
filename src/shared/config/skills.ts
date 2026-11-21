/**
 * Skill / action schema. Shared by weapon actions now and by The Power
 * abilities in Milestone 3. Each field maps to the technical spec list in
 * the design brief (PART 5.7).
 */
import type { WeaponType } from './weapons.ts';

export type Element = 'none' | 'fire' | 'ice' | 'lightning' | 'dark' | 'nature' | 'gravity' | 'arcane';
export type DamageStat = 'patk' | 'matk';

export type HitShape =
  | { kind: 'arc'; range: number; arcDeg: number }
  | { kind: 'circle'; radius: number; forward: number }
  | { kind: 'line'; length: number; width: number }
  | { kind: 'projectile'; speed: number; range: number; radius: number; pierce: boolean }
  | { kind: 'self' };

export type SkillEffect =
  | { kind: 'stun'; duration: number }
  | { kind: 'knockback'; distance: number }
  | { kind: 'slow'; mult: number; duration: number }
  | { kind: 'dash'; distance: number; duration: number }
  | { kind: 'shield'; hpFraction: number; stat: DamageStat; statMult: number; duration: number }
  | { kind: 'counter'; window: number; damageMult: number; range: number; stunDuration: number }
  /** Target cannot move (can still attack). */
  | { kind: 'root'; duration: number }
  /** Hit the same targets N times (damage per hit = mult). */
  | { kind: 'multi'; hits: number }
  /** Fire `count` projectiles fanned over `angleDeg`. */
  | { kind: 'spread'; count: number; angleDeg: number }
  /** Teleport behind the nearest enemy within range in the aim cone, then strike. */
  | { kind: 'blink_behind'; range: number; coneDeg: number }
  /** Damage multiplier when hitting a target from behind. */
  | { kind: 'backstab'; mult: number }
  /** Leave a trap that arms after `armSec`, triggers on the first enemy in radius. */
  | { kind: 'trap'; radius: number; armSec: number; lifeSec: number; maxActive: number }
  /** Self buff: flat damage reduction (and optional immunity to stun/knockback). */
  | { kind: 'buff_dr'; amount: number; duration: number; superArmor: boolean }
  /** Dash opposite to the aim before the attack resolves. */
  | { kind: 'backdash'; distance: number; duration: number };

export interface SkillDef {
  id: string;
  name: string;
  nameTh: string;
  description: string;
  type: 'normal' | 'heavy' | 'weapon_skill' | 'power_active' | 'power_ultimate' | 'power_passive';
  element: Element;
  weapon: WeaponType | null;
  unlockLevel: number;
  damage?: { stat: DamageStat; mult: number; flat: number };
  target: 'enemy' | 'self';
  shape: HitShape;
  /** Seconds. Normal attack cooldown is divided by attack speed. */
  cooldown: number;
  energyCost: number;
  staminaCost: number;
  /** Seconds between input and hit resolution (0 = instant, lag compensated). */
  castTime: number;
  /** Seconds the caster cannot start another action. */
  animTime: number;
  /** Movement speed multiplier while animating (0 = rooted). */
  moveMultDuringAnim: number;
  effects: SkillEffect[];
  pvpMult: number;
  pveMult: number;
  vfx: string;
  sfx: string;
  /** Human-readable list of server-side checks applied before the skill resolves. */
  validation: string[];
  upgradeScaling: { damagePerLevel: number; maxLevel: number };
}

export const COMMON_VALIDATION = [
  'caster alive and not stunned',
  'cooldown ready (server clock)',
  'energy/stamina available (server value)',
  'weapon requirement matches equipped weapon',
  'aim vector normalised server-side; hit test uses server positions (lag-compensated <= maxRewindMs)',
];
