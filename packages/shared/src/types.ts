// Core content and runtime types. All content is data-driven and keyed by stable string IDs.

export const PROTOCOL_VERSION = 1;
export const CONTENT_SCHEMA_VERSION = 1;

export type DamageType = 'physical' | 'fire' | 'ice' | 'lightning' | 'holy' | 'shadow' | 'poison';
export const DAMAGE_TYPES: DamageType[] = ['physical', 'fire', 'ice', 'lightning', 'holy', 'shadow', 'poison'];

export type ClassId = 'warrior' | 'mage' | 'assassin' | 'ranger' | 'paladin' | 'necromancer' | 'chronomancer';
/** Six launch classes + standalone classes added in later updates (Chronomancer: Phase 7). Never class evolutions. */
export const CLASS_IDS: ClassId[] = ['warrior', 'mage', 'assassin', 'ranger', 'paladin', 'necromancer', 'chronomancer'];
export const LAUNCH_CLASS_IDS: ClassId[] = ['warrior', 'mage', 'assassin', 'ranger', 'paladin', 'necromancer'];

export type StatusId =
  | 'burn' | 'freeze' | 'chill' | 'shock' | 'poison' | 'bleed' | 'curse' | 'slow' | 'stun'
  | 'weaken' | 'vulnerable' | 'marked' | 'taunt' | 'broken';

export interface StatusApply {
  id: StatusId;
  chance: number; // 0..1
  duration: number; // seconds
  /** For DoTs: fraction of the hit damage dealt per second. For debuffs: magnitude. */
  power?: number;
}

export interface Dmg {
  coef: number; // multiplier of caster power
  type: DamageType;
  status?: StatusApply;
}

/** Stat modifier. `stat` is a StatKey (see stats.ts). */
export interface Mod {
  stat: string;
  value: number;
}

export type SkillEffect =
  | { t: 'melee'; range: number; arc: number; dmg: Dmg; knock?: number }
  | {
      t: 'projectile'; count?: number; spread?: number; speed: number; range: number; radius?: number;
      dmg: Dmg; pierce?: number; chain?: number; explode?: { radius: number; dmg: Dmg }; homing?: boolean;
    }
  | {
      t: 'area'; at: 'self' | 'cursor'; radius: number; dmg?: Dmg; delay?: number; duration?: number;
      tick?: number; count?: number; scatter?: number; pull?: number; healPct?: number; follow?: boolean;
    }
  | { t: 'dash'; dist: number; dmg?: Dmg; radius?: number; invuln?: boolean; backward?: boolean }
  | { t: 'buff'; name: string; duration: number; mods: Mod[]; party?: boolean; radius?: number }
  | { t: 'heal'; pct: number; radius?: number }
  | { t: 'barrier'; pct: number; duration: number; radius?: number }
  | { t: 'summon'; minion: string; count: number; duration: number }
  | { t: 'gain'; resource?: number; secondary?: number }
  | { t: 'taunt'; radius: number; duration: number }
  | { t: 'consume'; corpses?: boolean };

export type Targeting = 'direction' | 'ground' | 'self' | 'target';

export interface SkillDef {
  id: string;
  cls: ClassId;
  kind: 'active' | 'ultimate';
  name: string;
  desc: string;
  tags: string[];
  cost: number; // primary resource
  cooldown: number; // seconds
  cast: number; // seconds of action lock
  range: number; // max aim distance (px) for ground/target skills
  targeting: Targeting;
  unlockLevel: number;
  effects: SkillEffect[];
  /** Finisher: consumes secondary resource for bonus damage per point. */
  consumeSecondary?: { bonusPerPoint: number };
  /** Requires at least N secondary points to cast. */
  requireSecondary?: number;
  icon: string; // glyph id for the icon renderer
}

export interface ResourceDef {
  id: string;
  name: string;
  max: number;
  regen: number; // per second
  decay?: number; // per second when out of combat
  startFull: boolean;
  onHitDealt?: number;
  onHitTaken?: number;
  color: string;
}

export interface BasicAttackDef {
  kind: 'melee' | 'projectile';
  interval: number; // seconds between attacks at 100% speed
  chain: Array<{ coef: number; range: number; arc?: number; speed?: number }>;
  type: DamageType;
  secondaryGain?: number; // e.g. combo points per hit
  resourceGain?: number;
}

export interface ClassDef {
  id: ClassId;
  name: string;
  role: string;
  fantasy: string;
  difficulty: 1 | 2 | 3;
  primaryAttr: 'str' | 'dex' | 'int';
  base: { hp: number; armor: number; moveSpeed: number; str: number; dex: number; int: number; vit: number };
  perLevel: { hp: number; str: number; dex: number; int: number; vit: number };
  resource: ResourceDef;
  secondary?: { id: string; name: string; max: number; color: string };
  basic: BasicAttackDef;
  mechanic: string;
  archetypes: string[];
  colors: { body: string; hair: string; accent: string };
  weaponAffinity: string[];
}

export interface PassiveNode {
  id: string;
  tree: ClassId | 'central';
  x: number;
  y: number;
  name: string;
  kind: 'start' | 'minor' | 'notable' | 'keystone';
  mods: Mod[];
  flags?: string[];
  desc?: string;
  links: string[];
}

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'ancient';
export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'ancient'];

export type EquipSlot = 'weapon' | 'helmet' | 'chest' | 'gloves' | 'boots' | 'ring1' | 'ring2' | 'necklace' | 'relic' | 'rune';
export const EQUIP_SLOTS: EquipSlot[] = ['weapon', 'helmet', 'chest', 'gloves', 'boots', 'ring1', 'ring2', 'necklace', 'relic', 'rune'];
export type ItemSlotType = 'weapon' | 'helmet' | 'chest' | 'gloves' | 'boots' | 'ring' | 'necklace' | 'relic' | 'rune';

export interface ItemBase {
  id: string;
  name: string;
  slot: ItemSlotType;
  classes?: ClassId[];
  implicit: Mod[]; // scaled by item level where noted in loot.ts
  weaponPower?: number;
  icon: string;
}

export interface ItemAffix {
  id: string;
  stat: string;
  value: number;
  tier: number;
}

export interface Item {
  uid: string;
  baseId: string;
  name: string;
  slot: ItemSlotType;
  rarity: Rarity;
  ilvl: number;
  reqLevel: number;
  implicit: Mod[];
  affixes: ItemAffix[];
  power?: string; // legendary power id
  weaponPower?: number;
  bound: boolean;
  hardcore: boolean;
}

export interface EnemyAttack {
  id: string;
  kind: 'melee' | 'projectile' | 'slam' | 'nova' | 'summon' | 'eruption' | 'charge' | 'cleave' | 'eclipse';
  range: number;
  cooldown: number;
  windup: number;
  dmg: number; // fraction of enemy power
  type: DamageType;
  radius?: number;
  count?: number;
  speed?: number;
  summon?: string;
  status?: StatusApply;
  phase?: number; // min phase index required
}

export interface EnemyDef {
  id: string;
  name: string;
  family: string;
  role: 'melee' | 'ranged' | 'caster' | 'tank' | 'summoner' | 'flanker' | 'boss';
  hp: number;
  power: number;
  armor: number;
  res: Partial<Record<DamageType, number>>;
  speed: number;
  radius: number;
  xp: number;
  aggroRange: number;
  preferRange?: number;
  attacks: EnemyAttack[];
  color: string;
  boss?: { phases: number[]; breakGauge: number; title: string };
  /** Seconds after engaging before the boss enrages (damage ×1.8). */
  enrage?: number;
  lootBonus?: number;
}

export type DifficultyId = 'story' | 'normal' | 'hard' | 'expert' | 'nightmare' | 'abyssal';
export interface DifficultyDef {
  id: DifficultyId;
  name: string;
  hp: number;
  dmg: number;
  loot: number; // rarity bonus
  xp: number;
  minLevel: number;
  eliteMods: number;
  telegraphSpeed: number; // multiplier on enemy windups (lower = faster)
  extraMechanics: string[];
  recommendedPower: number;
}

export interface CharacterData {
  id: string;
  accountId: string;
  name: string;
  cls: ClassId;
  hardcore: boolean;
  dead: boolean;
  level: number;
  xp: number;
  mastery: { level: number; xp: number };
  gold: number;
  dust: number;
  potions: number;
  inventory: (Item | null)[];
  equipment: Partial<Record<EquipSlot, Item>>;
  passives: string[]; // allocated node ids
  bonusPoints: number; // from quests/mastery
  respecTokens: number;
  loadout: { active: (string | null)[]; ultimate: (string | null)[] };
  presets: Array<{ name: string; passives: string[]; active: (string | null)[]; ultimate: (string | null)[] }>;
  quests: Record<string, { progress: number; done: boolean; claimed: boolean }>;
  stats: { kills: number; deaths: number; bossKills: number; runsCleared: number; highestTier: number };
  createdAt: number;
  version: number;
  mats: Record<string, number>;
  prof: Record<string, { lv: number; xp: number }>;
  elixir: { id: string; until: number } | null;
}

export interface AccountProgress {
  codex: Record<string, number>; // enemy id -> kills
  achievements: string[];
  titles: string[];
  stash: { normal: (Item | null)[]; hardcore: (Item | null)[] };
  season: SeasonProgress | null;
  auras: string[];
  aura: string | null;
  pets: string[];
  pet: string | null;
}
export interface SeasonProgress { id: string; xp: number; shards: number; claimed: number[]; week: number; weekly: Record<string, number>; weeklyDone: string[]; archive: Array<{ id: string; xp: number; tier: number }> }
export const STASH_SIZE = 20;

export const INVENTORY_SIZE = 40;
export const ACTIVE_SLOTS = 8;
export const ULTIMATE_SLOTS = 4;
export const LEVEL_CAP = 100;
