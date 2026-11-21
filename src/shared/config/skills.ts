/**
 * Skill / action schema. Shared by weapon actions now and by The Power
 * abilities in Milestone 3. Each field maps to the technical spec list in
 * the design brief (PART 5.7).
 */
import type { WeaponType } from './weapons.ts';

export type Element = 'none' | 'fire' | 'ice' | 'lightning' | 'dark' | 'nature' | 'gravity' | 'arcane';
export type DamageStat = 'patk' | 'matk';
/** 'weapon' = the equipped weapon's damage stat (lets one Power work with every weapon). */
export type SkillStat = DamageStat | 'weapon';

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
  | { kind: 'backdash'; distance: number; duration: number }
  // ---- The Power effects
  /** Damage over time (burn/poison): dps = casterStat × dpsMult. */
  | { kind: 'dot'; dpsMult: number; duration: number; label: 'burn' | 'poison' }
  /** Heal self and allies in radius: maxHp × pct + healStat × statMult. */
  | { kind: 'heal'; pct: number; statMult: number; radius: number }
  /** Timed self buff. `stats` additive, `statsPct` multiplies base value (0.2 = +20%). */
  | { kind: 'buff'; duration: number; stats?: Partial<Record<string, number>>; statsPct?: Partial<Record<string, number>> }
  /** Persistent area that ticks the skill's damage (and other effects) or heals allies. */
  | { kind: 'zone'; radius: number; forward: number; duration: number; tick: number; follow: boolean; healPct?: number }
  | { kind: 'pull'; distance: number }
  /** Frost stacks; at 5 stacks the target freezes. */
  | { kind: 'frost'; stacks: number }
  /** Gain Static Charge (max 10). */
  | { kind: 'charge'; gain: number }
  /** Consume all Static Charges: +multPer damage per charge. */
  | { kind: 'consume_charge'; multPer: number }
  | { kind: 'summon'; summon: 'shadow_clone' | 'lightning_clone' | 'wolf' | 'treant' | 'ice_mirror'; count: number; duration: number; atkMult: number; interval: number; range: number }
  /** Monsters lose track of the caster; broken by attacking. */
  | { kind: 'stealth'; duration: number }
  | { kind: 'blink'; distance: number }
  /** Target takes +amount damage. */
  | { kind: 'vuln'; amount: number; duration: number }
  | { kind: 'pierce_def'; amount: number }
  | { kind: 'execute'; threshold: number; mult: number }
  | { kind: 'chain'; jumps: number; range: number }
  | { kind: 'cheat_death'; duration: number; hpPct: number }
  | { kind: 'lifesteal'; fraction: number }
  | { kind: 'reflect'; fraction: number; duration: number }
  | { kind: 'cleanse' }
  /** Bonus damage against frozen/rooted/stunned targets. */
  | { kind: 'shatter'; mult: number };

export interface SkillDef {
  id: string;
  name: string;
  nameTh: string;
  description: string;
  type: 'normal' | 'heavy' | 'weapon_skill' | 'power_active' | 'power_ultimate' | 'power_passive';
  element: Element;
  weapon: WeaponType | null;
  unlockLevel: number;
  damage?: { stat: SkillStat; mult: number; flat: number };
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
  /** How opponents can play around it (required for ultimates). */
  counterplay?: string;
}

export const COMMON_VALIDATION = [
  'caster alive and not stunned',
  'cooldown ready (server clock)',
  'energy/stamina available (server value)',
  'weapon requirement matches equipped weapon',
  'aim vector normalised server-side; hit test uses server positions (lag-compensated <= maxRewindMs)',
];
