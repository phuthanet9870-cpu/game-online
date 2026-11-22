import type { Mod } from '../types.js';

export interface DungeonModifierDef { id: string; name: string; desc: string; kind: 'positive' | 'negative' | 'mixed'; loot: number; enemyHp?: number; enemyDmg?: number; playerMods?: Mod[]; flags?: string[] }
export const DUNGEON_MODIFIERS: DungeonModifierDef[] = [
  { id: 'blazing', name: 'Blazing Eclipse', desc: 'Enemies deal +20% damage. Your Fire damage +20%.', kind: 'mixed', loot: 0.1, enemyDmg: 1.2, playerMods: [{ stat: 'dmgPct.fire', value: 20 }] },
  { id: 'fortified', name: 'Fortified Halls', desc: 'Enemies have +30% life. +20% item rarity.', kind: 'negative', loot: 0.2, enemyHp: 1.3 },
  { id: 'elite_tide', name: 'Elite Tide', desc: 'More elite packs spawn. +15% item rarity.', kind: 'negative', loot: 0.15, flags: ['more_elites'] },
  { id: 'gilded', name: 'Gilded Depths', desc: 'Treasure rooms hold extra gold.', kind: 'positive', loot: 0, flags: ['extra_gold'] },
  { id: 'withering', name: 'Withering Air', desc: 'Your healing is reduced by 30%. +15% item rarity.', kind: 'negative', loot: 0.15, playerMods: [{ stat: 'healPct', value: -30 }] },
  { id: 'storm', name: 'Static Storm', desc: 'Your Lightning damage +25%; enemies move 10% faster.', kind: 'mixed', loot: 0.05, playerMods: [{ stat: 'dmgPct.lightning', value: 25 }], flags: ['fast_enemies'] },
  { id: 'veiled', name: 'Veiled Moon', desc: 'Critical strikes deal +25% damage.', kind: 'positive', loot: 0, playerMods: [{ stat: 'critMult', value: 25 }] },
];

/** Temporary run blessings (roguelike choices). Lost when the run ends. */
export const BLESSINGS: Array<{ id: string; name: string; desc: string; mods: Mod[]; curse?: boolean; loot?: number }> = [
  { id: 'b_fury', name: 'Blessing of Fury', desc: '+20% damage this run.', mods: [{ stat: 'dmgPct', value: 20 }] },
  { id: 'b_swift', name: 'Blessing of the Gale', desc: '+15% attack and cast speed this run.', mods: [{ stat: 'atkSpeed', value: 15 }, { stat: 'castSpeed', value: 15 }] },
  { id: 'b_ward', name: 'Blessing of the Ward', desc: '+25% maximum life this run.', mods: [{ stat: 'maxHpPct', value: 25 }] },
  { id: 'b_crit', name: 'Blessing of the Hunter', desc: '+10% critical chance this run.', mods: [{ stat: 'critChance', value: 10 }] },
  { id: 'b_time', name: 'Blessing of Hours', desc: '+15% cooldown reduction this run.', mods: [{ stat: 'cdr', value: 15 }] },
  { id: 'b_leech', name: 'Blessing of the Crimson', desc: '1.5% life leech this run.', mods: [{ stat: 'lifeOnHitPct', value: 1.5 }] },
  { id: 'b_echo', name: 'Blessing of Echoes', desc: 'Basic attacks strike one extra time.', mods: [{ stat: 'basic.proj', value: 1 }] },
  { id: 'b_minion', name: 'Blessing of the Legion', desc: '+40% minion damage this run.', mods: [{ stat: 'minionDmgPct', value: 40 }] },
  { id: 'c_glass', name: 'Curse of Glass (Bargain)', desc: '-25% max life, but +40% item rarity and +25% damage.', mods: [{ stat: 'maxHpPct', value: -25 }, { stat: 'dmgPct', value: 25 }], curse: true, loot: 0.4 },
  { id: 'c_slow', name: 'Curse of Lead (Bargain)', desc: '-15% movement speed, but +30% item rarity.', mods: [{ stat: 'moveSpeedPct', value: -15 }], curse: true, loot: 0.3 },
];
export const BLESSING_MAP = Object.fromEntries(BLESSINGS.map((b) => [b.id, b]));

export type RoomType = 'entry' | 'combat' | 'elite' | 'treasure' | 'shrine' | 'rest' | 'miniboss' | 'boss' | 'event';
