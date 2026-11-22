// Professions, materials and recipes. Crafting is server-side; recipes are data.
import type { Mod } from '../types.js';

export type ProfId = 'mining' | 'herbalism' | 'alchemy' | 'smithing' | 'cooking';
export const PROFESSIONS: Record<ProfId, { name: string; desc: string }> = {
  mining: { name: 'Mining', desc: 'Gather ore from veins in the Ashen Highlands.' },
  herbalism: { name: 'Herbalism', desc: 'Gather Moonpetal and Emberbloom.' },
  alchemy: { name: 'Alchemy', desc: 'Brew potions and elixirs (Sister Maelis).' },
  smithing: { name: 'Smithing', desc: 'Forge equipment from ore (Brenna the Smith).' },
  cooking: { name: 'Cooking', desc: 'Cook meals from beast meat (Sister Maelis).' },
};
export const PROF_MAX = 10;
export const profXpToNext = (lv: number) => 60 * lv * lv;

export const MATERIALS: Record<string, { name: string; source: string }> = {
  moonpetal: { name: 'Moonpetal', source: 'Herb blooms in Duskmeadow' },
  emberbloom: { name: 'Emberbloom', source: 'Herb blooms in the Ashen Highlands' },
  iron_ore: { name: 'Iron Ore', source: 'Iron veins in the Ashen Highlands' },
  starsteel: { name: 'Starsteel Ore', source: 'Starsteel veins (Mining 4+) in the Ashen Highlands' },
  cinder_core: { name: 'Cinder Core', source: 'Dropped by Cinderkin' },
  beast_meat: { name: 'Beast Meat', source: 'Dropped by Duskmeadow and Highland beasts' },
};

/** Consumable buffs. One active at a time; it persists across zones until it expires. */
export const ELIXIRS: Record<string, { name: string; minutes: number; mods: Mod[] }> = {
  elixir_fury: { name: 'Elixir of Fury', minutes: 15, mods: [{ stat: 'dmgPct', value: 12 }] },
  elixir_stone: { name: 'Stoneskin Elixir', minutes: 15, mods: [{ stat: 'armorPct', value: 20 }, { stat: 'maxHpPct', value: 10 }] },
  elixir_swift: { name: 'Elixir of the Gale', minutes: 15, mods: [{ stat: 'atkSpeed', value: 10 }, { stat: 'castSpeed', value: 10 }, { stat: 'moveSpeedPct', value: 5 }] },
  hunter_stew: { name: "Hunter's Stew", minutes: 20, mods: [{ stat: 'hpRegen', value: 4 }, { stat: 'maxHpPct', value: 5 }] },
  ember_skewers: { name: 'Ember Skewers', minutes: 20, mods: [{ stat: 'dmgPct.fire', value: 10 }, { stat: 'res.fire', value: 10 }] },
};

export interface Recipe {
  id: string; prof: ProfId; name: string; level: number; xp: number;
  mats: Record<string, number>; dust?: number; gold?: number;
  result: { kind: 'potion' } | { kind: 'elixir'; id: string } | { kind: 'item'; rarity: 'rare' | 'epic' };
}
export const RECIPES: Recipe[] = [
  { id: 'r_potion', prof: 'alchemy', name: 'Restorative Draught (+1 potion charge)', level: 1, xp: 15, mats: { moonpetal: 3 }, result: { kind: 'potion' } },
  { id: 'r_fury', prof: 'alchemy', name: 'Elixir of Fury', level: 2, xp: 30, mats: { moonpetal: 4, emberbloom: 2 }, result: { kind: 'elixir', id: 'elixir_fury' } },
  { id: 'r_stone', prof: 'alchemy', name: 'Stoneskin Elixir', level: 2, xp: 30, mats: { moonpetal: 3, iron_ore: 3 }, result: { kind: 'elixir', id: 'elixir_stone' } },
  { id: 'r_swift', prof: 'alchemy', name: 'Elixir of the Gale', level: 4, xp: 50, mats: { emberbloom: 4, cinder_core: 1 }, result: { kind: 'elixir', id: 'elixir_swift' } },
  { id: 'r_stew', prof: 'cooking', name: "Hunter's Stew", level: 1, xp: 15, mats: { beast_meat: 3, moonpetal: 1 }, result: { kind: 'elixir', id: 'hunter_stew' } },
  { id: 'r_skewer', prof: 'cooking', name: 'Ember Skewers', level: 3, xp: 30, mats: { beast_meat: 3, emberbloom: 2 }, result: { kind: 'elixir', id: 'ember_skewers' } },
  { id: 'r_forge_rare', prof: 'smithing', name: 'Forge Rare Equipment', level: 1, xp: 40, mats: { iron_ore: 6 }, dust: 10, gold: 50, result: { kind: 'item', rarity: 'rare' } },
  { id: 'r_forge_epic', prof: 'smithing', name: 'Forge Epic Equipment', level: 5, xp: 120, mats: { starsteel: 6, cinder_core: 2 }, dust: 30, gold: 300, result: { kind: 'item', rarity: 'epic' } },
];
export const RECIPE_MAP = Object.fromEntries(RECIPES.map((r) => [r.id, r]));
export const CRAFT_SLOTS = ['weapon', 'helmet', 'chest', 'gloves', 'boots', 'ring', 'necklace', 'relic', 'rune'] as const;
