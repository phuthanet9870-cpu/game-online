import type { DifficultyDef, DifficultyId, EnemyDef } from '../types.js';
import { BESTIARY } from './bestiary.js';

// Enemy family 1: The Hollowborn — eclipse-corrupted husks of the old kingdom.
// Enemy family 2: Duskmeadow Wildlife — open-world beasts twisted by the last eclipse.
// hp/power are base values at level 1; scaled by level and difficulty in world.ts.

export const ENEMIES: Record<string, EnemyDef> = {
  ...BESTIARY,
  hollow_grunt: {
    id: 'hollow_grunt', name: 'Hollow Husk', family: 'hollowborn', role: 'melee', hp: 70, power: 9, armor: 20, res: { shadow: 30, holy: -20 }, speed: 120, radius: 15, xp: 14, aggroRange: 300,
    attacks: [{ id: 'swipe', kind: 'melee', range: 52, cooldown: 1.6, windup: 0.45, dmg: 1, type: 'physical' }], color: '#5b4a7a',
  },
  hollow_archer: {
    id: 'hollow_archer', name: 'Hollow Bowman', family: 'hollowborn', role: 'ranged', hp: 50, power: 8, armor: 10, res: { shadow: 30, holy: -20 }, speed: 115, radius: 14, xp: 16, aggroRange: 420, preferRange: 300,
    attacks: [{ id: 'shot', kind: 'projectile', range: 430, cooldown: 2.0, windup: 0.6, dmg: 1, type: 'shadow', speed: 380 }], color: '#4a5b7a',
  },
  hollow_hexer: {
    id: 'hollow_hexer', name: 'Hollow Hexweaver', family: 'hollowborn', role: 'caster', hp: 55, power: 10, armor: 8, res: { shadow: 40, holy: -25 }, speed: 105, radius: 14, xp: 20, aggroRange: 420, preferRange: 260,
    attacks: [{ id: 'hex', kind: 'eruption', range: 380, cooldown: 3.5, windup: 1.0, dmg: 1.6, type: 'shadow', radius: 70, status: { id: 'weaken', chance: 1, duration: 3, power: 0.2 } }], color: '#7a4a6e',
  },
  hollow_brute: {
    id: 'hollow_brute', name: 'Hollow Juggernaut', family: 'hollowborn', role: 'tank', hp: 220, power: 14, armor: 60, res: { shadow: 30, physical: 10, holy: -15 }, speed: 95, radius: 22, xp: 45, aggroRange: 320,
    attacks: [
      { id: 'slam', kind: 'slam', range: 90, cooldown: 3.2, windup: 0.9, dmg: 1.6, type: 'physical', radius: 95, status: { id: 'stun', chance: 0.6, duration: 0.8 } },
      { id: 'punch', kind: 'melee', range: 60, cooldown: 1.8, windup: 0.5, dmg: 0.9, type: 'physical' },
    ], color: '#3f3555', lootBonus: 1,
  },
  hollow_captain: {
    id: 'hollow_captain', name: 'Hollow Vanguard Captain', family: 'hollowborn', role: 'boss', hp: 900, power: 15, armor: 50, res: { shadow: 40, holy: -10 }, speed: 120, radius: 24, xp: 160, aggroRange: 380,
    attacks: [
      { id: 'cleave', kind: 'cleave', range: 120, cooldown: 2.8, windup: 0.8, dmg: 1.5, type: 'physical' },
      { id: 'charge', kind: 'charge', range: 360, cooldown: 7, windup: 0.9, dmg: 1.4, type: 'physical', status: { id: 'stun', chance: 1, duration: 0.6 } },
      { id: 'rally', kind: 'summon', range: 400, cooldown: 14, windup: 1, dmg: 0, type: 'physical', summon: 'hollow_grunt', count: 2, phase: 1 },
    ], color: '#6a3a5a', boss: { phases: [0.5], breakGauge: 400, title: 'Mini-boss' }, lootBonus: 2,
  },
  veyra: {
    id: 'veyra', name: 'Veyra, the Umbral Warden', family: 'hollowborn', role: 'boss', hp: 3800, power: 15, armor: 60, res: { shadow: 50, holy: -10, fire: 10 }, speed: 115, radius: 34, xp: 600, aggroRange: 520,
    attacks: [
      { id: 'sweep', kind: 'cleave', range: 150, cooldown: 3.0, windup: 0.9, dmg: 1.6, type: 'shadow' },
      { id: 'orbs', kind: 'nova', range: 520, cooldown: 6, windup: 1.0, dmg: 1.0, type: 'shadow', count: 14, speed: 230 },
      { id: 'eruption', kind: 'eruption', range: 520, cooldown: 5, windup: 1.1, dmg: 2.0, type: 'shadow', radius: 90, count: 4, phase: 1 },
      { id: 'adds', kind: 'summon', range: 600, cooldown: 16, windup: 1.2, dmg: 0, type: 'shadow', summon: 'hollow_grunt', count: 3, phase: 1 },
      { id: 'eclipse', kind: 'nova', range: 600, cooldown: 9, windup: 1.4, dmg: 1.3, type: 'shadow', count: 28, speed: 200, phase: 2 },
    ], color: '#2a1a40', boss: { phases: [0.6, 0.25], breakGauge: 900, title: 'Guardian of the First Rift' }, lootBonus: 4,
  },
  // World boss — spawns as a public event in Duskmeadow
  gloomheart: {
    id: 'gloomheart', name: 'Gloomheart, the Eclipsed Grove', family: 'wildlife', role: 'boss', hp: 2600, power: 14, armor: 70, res: { poison: 40, fire: -20, shadow: 30 }, speed: 70, radius: 40, xp: 500, aggroRange: 460,
    attacks: [
      { id: 'root_slam', kind: 'slam', range: 130, cooldown: 3.4, windup: 1.0, dmg: 1.5, type: 'physical', radius: 140, status: { id: 'slow', chance: 1, duration: 2, power: 0.4 } },
      { id: 'spores', kind: 'nova', range: 520, cooldown: 7, windup: 1.1, dmg: 0.9, type: 'poison', count: 18, speed: 210 },
      { id: 'thorns', kind: 'eruption', range: 560, cooldown: 5.5, windup: 1.2, dmg: 1.7, type: 'physical', radius: 85, count: 5 },
      { id: 'brood', kind: 'summon', range: 600, cooldown: 15, windup: 1.2, dmg: 0, type: 'physical', summon: 'gloomfang', count: 3, phase: 1 },
    ], color: '#2f4a2a', boss: { phases: [0.5], breakGauge: 700, title: 'World Boss' }, lootBonus: 4,
  },
  // Ancient Labyrinth
  stone_sentry: {
    id: 'stone_sentry', name: 'Labyrinth Sentry', family: 'construct', role: 'tank', hp: 160, power: 12, armor: 90, res: { physical: 20, poison: 50, lightning: -20 }, speed: 90, radius: 18, xp: 30, aggroRange: 280,
    attacks: [{ id: 'crush', kind: 'slam', range: 80, cooldown: 2.8, windup: 0.8, dmg: 1.3, type: 'physical', radius: 90 }], color: '#7a7466',
  },
  labyrinth_warden: {
    id: 'labyrinth_warden', name: 'Oruk, Warden of the Coil', family: 'construct', role: 'boss', hp: 3400, power: 18, armor: 110, res: { physical: 20, poison: 50, lightning: -15 }, speed: 125, radius: 32, xp: 650, aggroRange: 420,
    attacks: [
      { id: 'gore', kind: 'charge', range: 420, cooldown: 6, windup: 1.0, dmg: 1.7, type: 'physical', status: { id: 'stun', chance: 1, duration: 0.8 } },
      { id: 'quake', kind: 'slam', range: 140, cooldown: 3.5, windup: 1.0, dmg: 1.6, type: 'physical', radius: 160 },
      { id: 'rubble', kind: 'eruption', range: 500, cooldown: 5, windup: 1.1, dmg: 1.6, type: 'physical', radius: 80, count: 4, phase: 1 },
      { id: 'sentries', kind: 'summon', range: 500, cooldown: 18, windup: 1.2, dmg: 0, type: 'physical', summon: 'stone_sentry', count: 2, phase: 1 },
    ], color: '#5a5040', boss: { phases: [0.5], breakGauge: 800, title: 'Ancient Labyrinth' }, lootBonus: 5,
  },
  // Raid (4-8 players)
  sovereign: {
    id: 'sovereign', name: 'Nyx Aurelion, the Eclipse Sovereign', family: 'hollowborn', role: 'boss', hp: 10500, power: 17, armor: 80, res: { shadow: 50, holy: -10, fire: 15, ice: 15 }, speed: 110, radius: 42, xp: 1500, aggroRange: 700,
    attacks: [
      { id: 'crescent', kind: 'cleave', range: 170, cooldown: 3.2, windup: 1.0, dmg: 1.8, type: 'shadow' },
      { id: 'total_eclipse', kind: 'eclipse', range: 900, cooldown: 14, windup: 2.4, dmg: 3.2, type: 'shadow', radius: 150 },
      { id: 'starfall', kind: 'eruption', range: 700, cooldown: 6, windup: 1.2, dmg: 1.8, type: 'fire', radius: 85, count: 6 },
      { id: 'guard', kind: 'summon', range: 700, cooldown: 22, windup: 1.4, dmg: 0, type: 'shadow', summon: 'hollow_brute', count: 2, phase: 1 },
      { id: 'umbral_wave', kind: 'nova', range: 800, cooldown: 8, windup: 1.3, dmg: 1.2, type: 'shadow', count: 32, speed: 230, phase: 2 },
    ], color: '#1d1030', boss: { phases: [0.65, 0.3], breakGauge: 1600, title: 'Raid Boss' }, enrage: 480, lootBonus: 6,
  },
  // Open world — Duskmeadow
  gloomfang: {
    id: 'gloomfang', name: 'Gloomfang Wolf', family: 'wildlife', role: 'flanker', hp: 55, power: 8, armor: 15, res: { ice: 20 }, speed: 175, radius: 14, xp: 12, aggroRange: 300,
    attacks: [{ id: 'bite', kind: 'melee', range: 46, cooldown: 1.2, windup: 0.35, dmg: 0.9, type: 'physical', status: { id: 'bleed', chance: 0.3, duration: 3, power: 0.2 } }], color: '#4b5560',
  },
  thornback: {
    id: 'thornback', name: 'Thornback Boar', family: 'wildlife', role: 'tank', hp: 140, power: 11, armor: 40, res: { poison: 30 }, speed: 110, radius: 19, xp: 26, aggroRange: 260,
    attacks: [{ id: 'gore', kind: 'charge', range: 280, cooldown: 4.5, windup: 0.8, dmg: 1.3, type: 'physical' }, { id: 'tusk', kind: 'melee', range: 52, cooldown: 1.6, windup: 0.5, dmg: 1, type: 'physical' }], color: '#6b4a2f',
  },
  wisp: {
    id: 'wisp', name: 'Eclipse Wisp', family: 'wildlife', role: 'caster', hp: 40, power: 9, armor: 0, res: { shadow: 50, lightning: 30 }, speed: 130, radius: 12, xp: 15, aggroRange: 380, preferRange: 280,
    attacks: [{ id: 'spark', kind: 'projectile', range: 400, cooldown: 1.8, windup: 0.5, dmg: 0.9, type: 'lightning', speed: 420, status: { id: 'shock', chance: 0.3, duration: 2, power: 0.1 } }], color: '#7ad0ff',
  },
  // Ashen Highlands — the Cinderkin (levels 10-20)
  ember_imp: {
    id: 'ember_imp', name: 'Ember Imp', family: 'cinderkin', role: 'flanker', hp: 60, power: 10, armor: 15, res: { fire: 60, ice: -30 }, speed: 185, radius: 12, xp: 16, aggroRange: 320,
    attacks: [{ id: 'claw', kind: 'melee', range: 44, cooldown: 1.1, windup: 0.35, dmg: 0.9, type: 'fire', status: { id: 'burn', chance: 0.3, duration: 3, power: 0.2 } }], color: '#d9542b',
  },
  flamecaller: {
    id: 'flamecaller', name: 'Cinder Flamecaller', family: 'cinderkin', role: 'caster', hp: 60, power: 12, armor: 10, res: { fire: 60, ice: -30 }, speed: 105, radius: 14, xp: 22, aggroRange: 420, preferRange: 270,
    attacks: [{ id: 'pyre', kind: 'eruption', range: 400, cooldown: 3.2, windup: 1.0, dmg: 1.7, type: 'fire', radius: 75, count: 2, status: { id: 'burn', chance: 1, duration: 3, power: 0.25 } }], color: '#b2402a',
  },
  magma_golem: {
    id: 'magma_golem', name: 'Magma Golem', family: 'cinderkin', role: 'tank', hp: 240, power: 15, armor: 80, res: { fire: 75, ice: -40, physical: 15 }, speed: 85, radius: 22, xp: 48, aggroRange: 300,
    attacks: [{ id: 'eruption_slam', kind: 'slam', range: 90, cooldown: 3.0, windup: 0.9, dmg: 1.6, type: 'fire', radius: 110 }], color: '#7a2a1a', lootBonus: 1,
  },
  cinder_drake: {
    id: 'cinder_drake', name: 'Cinder Drakeling', family: 'cinderkin', role: 'ranged', hp: 75, power: 11, armor: 25, res: { fire: 60, ice: -30 }, speed: 150, radius: 15, xp: 24, aggroRange: 440, preferRange: 280,
    attacks: [{ id: 'flame_spit', kind: 'projectile', range: 440, cooldown: 1.9, windup: 0.5, dmg: 1.0, type: 'fire', speed: 460 }], color: '#e0763a',
  },
  // Starfall Wastes — the Shardborn (levels 20-30): crystal life grown from fallen stars
  shard_stalker: {
    id: 'shard_stalker', name: 'Shard Stalker', family: 'shardborn', role: 'flanker', hp: 70, power: 12, armor: 40, res: { lightning: 40, holy: 30, physical: -10 }, speed: 195, radius: 13, xp: 22, aggroRange: 340,
    attacks: [{ id: 'facet', kind: 'melee', range: 46, cooldown: 1.1, windup: 0.3, dmg: 1.0, type: 'lightning', status: { id: 'shock', chance: 0.25, duration: 2, power: 0.1 } }, { id: 'pounce', kind: 'charge', range: 260, cooldown: 6, windup: 0.6, dmg: 1.1, type: 'physical' }], color: '#7fd8ff',
  },
  prism_seer: {
    id: 'prism_seer', name: 'Prism Seer', family: 'shardborn', role: 'caster', hp: 65, power: 13, armor: 20, res: { holy: 50, shadow: -20 }, speed: 100, radius: 14, xp: 26, aggroRange: 440, preferRange: 290,
    attacks: [{ id: 'refract', kind: 'nova', range: 420, cooldown: 4.5, windup: 0.9, dmg: 0.8, type: 'holy', count: 10, speed: 280 }, { id: 'lens', kind: 'eruption', range: 420, cooldown: 3.4, windup: 1.0, dmg: 1.6, type: 'holy', radius: 70 }], color: '#e8d6ff',
  },
  glass_colossus: {
    id: 'glass_colossus', name: 'Glass Colossus', family: 'shardborn', role: 'tank', hp: 280, power: 16, armor: 120, res: { physical: 25, lightning: 30, fire: -25 }, speed: 80, radius: 24, xp: 60, aggroRange: 300,
    attacks: [{ id: 'shatter_slam', kind: 'slam', range: 100, cooldown: 3.2, windup: 1.0, dmg: 1.7, type: 'physical', radius: 120, status: { id: 'slow', chance: 1, duration: 2, power: 0.35 } }], color: '#a8e0ea', lootBonus: 1,
  },
  starling: {
    id: 'starling', name: 'Starling Swarm', family: 'shardborn', role: 'ranged', hp: 45, power: 11, armor: 10, res: { holy: 30, ice: -20 }, speed: 165, radius: 11, xp: 18, aggroRange: 420, preferRange: 260,
    attacks: [{ id: 'glint', kind: 'projectile', range: 420, cooldown: 1.6, windup: 0.4, dmg: 0.9, type: 'holy', speed: 520 }], color: '#fff4b8',
  },
  // Training dummy (town)
  dummy: {
    id: 'dummy', name: 'Training Dummy', family: 'construct', role: 'tank', hp: 1_000_000, power: 0, armor: 0, res: {}, speed: 0, radius: 18, xp: 0, aggroRange: 0, attacks: [], color: '#a8875a',
  },
};

export const DIFFICULTIES: Record<DifficultyId, DifficultyDef> = {
  story: { id: 'story', name: 'Story', hp: 0.6, dmg: 0.5, loot: 0, xp: 0.7, minLevel: 1, eliteMods: 0, telegraphSpeed: 1.25, extraMechanics: [], recommendedPower: 0 },
  normal: { id: 'normal', name: 'Normal', hp: 1, dmg: 1, loot: 0.1, xp: 1, minLevel: 1, eliteMods: 0, telegraphSpeed: 1, extraMechanics: [], recommendedPower: 1 },
  hard: { id: 'hard', name: 'Hard', hp: 1.6, dmg: 1.35, loot: 0.3, xp: 1.4, minLevel: 8, eliteMods: 1, telegraphSpeed: 0.95, extraMechanics: ['elite_affix'], recommendedPower: 2 },
  expert: { id: 'expert', name: 'Expert', hp: 2.5, dmg: 1.8, loot: 0.55, xp: 1.9, minLevel: 18, eliteMods: 1, telegraphSpeed: 0.85, extraMechanics: ['elite_affix', 'fast_telegraphs'], recommendedPower: 3 },
  nightmare: { id: 'nightmare', name: 'Nightmare', hp: 4, dmg: 2.5, loot: 0.85, xp: 2.6, minLevel: 30, eliteMods: 2, telegraphSpeed: 0.8, extraMechanics: ['elite_affix', 'fast_telegraphs', 'boss_extra'], recommendedPower: 4 },
  abyssal: { id: 'abyssal', name: 'Abyssal', hp: 6.5, dmg: 3.4, loot: 1.2, xp: 3.5, minLevel: 45, eliteMods: 3, telegraphSpeed: 0.72, extraMechanics: ['elite_affix', 'fast_telegraphs', 'boss_extra', 'death_burst'], recommendedPower: 5 },
};
export const DIFFICULTY_ORDER: DifficultyId[] = ['story', 'normal', 'hard', 'expert', 'nightmare', 'abyssal'];

/** Elite affixes rolled on elites/bosses by difficulty. */
export const ELITE_AFFIXES: Record<string, { name: string; desc: string }> = {
  hasted: { name: 'Hasted', desc: '+35% movement and attack speed' },
  shielded: { name: 'Shielded', desc: 'Starts with a barrier equal to 30% life' },
  volatile: { name: 'Volatile', desc: 'Explodes on death after a short delay' },
  vampiric: { name: 'Vampiric', desc: 'Heals for 20% of damage dealt' },
  frenzied: { name: 'Frenzied', desc: '+40% damage below 50% life' },
};
