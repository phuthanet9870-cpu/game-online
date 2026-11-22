import type { ItemBase, Rarity } from '../types.js';

export const ITEM_BASES: ItemBase[] = [
  // Weapons (class affinity shown, any class may equip; affinity grants +10% damage)
  { id: 'w_greatsword', name: 'Ironvale Greatsword', slot: 'weapon', classes: ['warrior'], implicit: [{ stat: 'dmgPct.melee', value: 8 }], weaponPower: 14, icon: 'sword' },
  { id: 'w_axe', name: 'Bearded War Axe', slot: 'weapon', classes: ['warrior'], implicit: [{ stat: 'critMult', value: 15 }], weaponPower: 13, icon: 'axe' },
  { id: 'w_staff', name: 'Conservatory Staff', slot: 'weapon', classes: ['mage'], implicit: [{ stat: 'castSpeed', value: 6 }], weaponPower: 12, icon: 'staff' },
  { id: 'w_wand', name: 'Starglass Wand', slot: 'weapon', classes: ['mage', 'necromancer'], implicit: [{ stat: 'critChance', value: 3 }], weaponPower: 11, icon: 'wand' },
  { id: 'w_daggers', name: 'Veil Daggers', slot: 'weapon', classes: ['assassin'], implicit: [{ stat: 'atkSpeed', value: 8 }], weaponPower: 11, icon: 'dagger' },
  { id: 'w_claw', name: 'Moonclaw', slot: 'weapon', classes: ['assassin'], implicit: [{ stat: 'critChance', value: 4 }], weaponPower: 11, icon: 'dagger' },
  { id: 'w_bow', name: 'Greenwatch Longbow', slot: 'weapon', classes: ['ranger'], implicit: [{ stat: 'dmgPct.projectile', value: 8 }], weaponPower: 12, icon: 'bow' },
  { id: 'w_crossbow', name: 'Repeater Crossbow', slot: 'weapon', classes: ['ranger'], implicit: [{ stat: 'atkSpeed', value: 6 }], weaponPower: 12, icon: 'bow' },
  { id: 'w_mace', name: 'Dawnspire Mace', slot: 'weapon', classes: ['paladin'], implicit: [{ stat: 'dmgPct.holy', value: 8 }], weaponPower: 13, icon: 'hammer' },
  { id: 'w_sword_shield', name: 'Oathblade & Aegis', slot: 'weapon', classes: ['paladin'], implicit: [{ stat: 'block', value: 6 }], weaponPower: 12, icon: 'shield' },
  { id: 'w_scythe', name: 'Gravewarden Scythe', slot: 'weapon', classes: ['necromancer'], implicit: [{ stat: 'minionDmgPct', value: 10 }], weaponPower: 12, icon: 'scythe' },
  { id: 'w_tome', name: 'Tome of Pale Names', slot: 'weapon', classes: ['necromancer'], implicit: [{ stat: 'dmgPct.shadow', value: 8 }], weaponPower: 11, icon: 'tome' },
  // Armor
  { id: 'a_helm_plate', name: 'Plated Helm', slot: 'helmet', implicit: [{ stat: 'armor', value: 18 }], icon: 'helm' },
  { id: 'a_hood', name: 'Duskweave Hood', slot: 'helmet', implicit: [{ stat: 'dodge', value: 2 }], icon: 'helm' },
  { id: 'a_circlet', name: 'Astral Circlet', slot: 'helmet', implicit: [{ stat: 'maxRes', value: 10 }], icon: 'helm' },
  { id: 'a_chest_plate', name: 'Bastion Cuirass', slot: 'chest', implicit: [{ stat: 'armor', value: 40 }], icon: 'chest' },
  { id: 'a_chest_leather', name: 'Shadowhide Jerkin', slot: 'chest', implicit: [{ stat: 'armor', value: 20 }, { stat: 'dodge', value: 2 }], icon: 'chest' },
  { id: 'a_robe', name: 'Starthread Robe', slot: 'chest', implicit: [{ stat: 'maxHp', value: 30 }, { stat: 'res.all', value: 4 }], icon: 'chest' },
  { id: 'a_gauntlets', name: 'Iron Gauntlets', slot: 'gloves', implicit: [{ stat: 'armor', value: 12 }], icon: 'gloves' },
  { id: 'a_wraps', name: 'Silk Handwraps', slot: 'gloves', implicit: [{ stat: 'atkSpeed', value: 3 }], icon: 'gloves' },
  { id: 'a_greaves', name: 'Sabaton Greaves', slot: 'boots', implicit: [{ stat: 'armor', value: 14 }, { stat: 'moveSpeedPct', value: 2 }], icon: 'boots' },
  { id: 'a_treads', name: 'Windstep Treads', slot: 'boots', implicit: [{ stat: 'moveSpeedPct', value: 5 }], icon: 'boots' },
  // Jewellery / relic / rune
  { id: 'j_ring_gold', name: 'Gilded Band', slot: 'ring', implicit: [{ stat: 'goldFindPct', value: 10 }], icon: 'ring' },
  { id: 'j_ring_moon', name: 'Moonstone Ring', slot: 'ring', implicit: [{ stat: 'res.all', value: 4 }], icon: 'ring' },
  { id: 'j_ring_ember', name: 'Ember Loop', slot: 'ring', implicit: [{ stat: 'dmgPct.fire', value: 5 }], icon: 'ring' },
  { id: 'j_amulet', name: 'Eclipse Pendant', slot: 'necklace', implicit: [{ stat: 'dmgPct', value: 4 }], icon: 'amulet' },
  { id: 'j_choker', name: 'Warden Choker', slot: 'necklace', implicit: [{ stat: 'maxHpPct', value: 4 }], icon: 'amulet' },
  { id: 'r_relic_star', name: 'Fallen Star Shard', slot: 'relic', implicit: [{ stat: 'cdr', value: 3 }], icon: 'relic' },
  { id: 'r_relic_bone', name: 'Saint’s Knucklebone', slot: 'relic', implicit: [{ stat: 'healPct', value: 8 }], icon: 'relic' },
  { id: 'r_rune_fire', name: 'Rune of Kindling', slot: 'rune', implicit: [{ stat: 'onHitBurn', value: 0.05 }], icon: 'rune' },
  { id: 'r_rune_frost', name: 'Rune of Rime', slot: 'rune', implicit: [{ stat: 'dmgPct.ice', value: 6 }], icon: 'rune' },
  { id: 'r_rune_venom', name: 'Rune of Thorns', slot: 'rune', implicit: [{ stat: 'onHitPoison', value: 0.05 }], icon: 'rune' },
];
export const ITEM_BASE_MAP: Record<string, ItemBase> = Object.fromEntries(ITEM_BASES.map((b) => [b.id, b]));

/** Affix pool. `per` = value per item level at tier 1 base; tiers scale up to 1.6x. `slots` restricts where it rolls. */
export interface AffixDef { id: string; stat: string; base: number; per: number; label: string; slots?: string[]; int?: boolean }
export const AFFIXES: AffixDef[] = [
  { id: 'str', stat: 'str', base: 2, per: 0.35, label: '+{v} Strength', int: true },
  { id: 'dex', stat: 'dex', base: 2, per: 0.35, label: '+{v} Dexterity', int: true },
  { id: 'int', stat: 'int', base: 2, per: 0.35, label: '+{v} Intelligence', int: true },
  { id: 'vit', stat: 'vit', base: 2, per: 0.3, label: '+{v} Vitality', int: true },
  { id: 'life', stat: 'maxHp', base: 10, per: 2.5, label: '+{v} Maximum Life', int: true },
  { id: 'armor', stat: 'armor', base: 8, per: 1.6, label: '+{v} Armor', int: true, slots: ['helmet', 'chest', 'gloves', 'boots'] },
  { id: 'res_all', stat: 'res.all', base: 3, per: 0.15, label: '+{v}% All Resistances', int: true },
  { id: 'res_fire', stat: 'res.fire', base: 6, per: 0.3, label: '+{v}% Fire Resistance', int: true },
  { id: 'res_shadow', stat: 'res.shadow', base: 6, per: 0.3, label: '+{v}% Shadow Resistance', int: true },
  { id: 'dmg', stat: 'dmgPct', base: 4, per: 0.25, label: '+{v}% Damage', int: true, slots: ['weapon', 'ring', 'necklace', 'relic'] },
  { id: 'crit', stat: 'critChance', base: 1.5, per: 0.08, label: '+{v}% Critical Chance', slots: ['weapon', 'helmet', 'ring', 'necklace', 'gloves'] },
  { id: 'critm', stat: 'critMult', base: 8, per: 0.4, label: '+{v}% Critical Damage', int: true, slots: ['weapon', 'necklace', 'gloves', 'ring'] },
  { id: 'aspd', stat: 'atkSpeed', base: 3, per: 0.15, label: '+{v}% Attack Speed', int: true, slots: ['weapon', 'gloves', 'ring'] },
  { id: 'cspd', stat: 'castSpeed', base: 3, per: 0.15, label: '+{v}% Cast Speed', int: true, slots: ['weapon', 'gloves', 'necklace'] },
  { id: 'cdr', stat: 'cdr', base: 2, per: 0.1, label: '+{v}% Cooldown Reduction', int: true, slots: ['helmet', 'relic', 'necklace'] },
  { id: 'move', stat: 'moveSpeedPct', base: 3, per: 0.1, label: '+{v}% Movement Speed', int: true, slots: ['boots'] },
  { id: 'leech', stat: 'lifeOnHitPct', base: 0.3, per: 0.02, label: '{v}% of hit damage leeched as Life', slots: ['weapon', 'ring', 'gloves'] },
  { id: 'regen', stat: 'hpRegen', base: 1, per: 0.15, label: '+{v} Life per second', slots: ['chest', 'helmet', 'ring', 'necklace'] },
  { id: 'fire', stat: 'dmgPct.fire', base: 5, per: 0.3, label: '+{v}% Fire Damage', int: true },
  { id: 'ice', stat: 'dmgPct.ice', base: 5, per: 0.3, label: '+{v}% Ice Damage', int: true },
  { id: 'light', stat: 'dmgPct.lightning', base: 5, per: 0.3, label: '+{v}% Lightning Damage', int: true },
  { id: 'holy', stat: 'dmgPct.holy', base: 5, per: 0.3, label: '+{v}% Holy Damage', int: true },
  { id: 'shadow', stat: 'dmgPct.shadow', base: 5, per: 0.3, label: '+{v}% Shadow Damage', int: true },
  { id: 'phys', stat: 'dmgPct.physical', base: 5, per: 0.3, label: '+{v}% Physical Damage', int: true },
  { id: 'poison', stat: 'dmgPct.poison', base: 5, per: 0.3, label: '+{v}% Poison Damage', int: true },
  { id: 'minion', stat: 'minionDmgPct', base: 6, per: 0.35, label: '+{v}% Minion Damage', int: true, slots: ['weapon', 'helmet', 'relic', 'necklace'] },
  { id: 'basic', stat: 'basic.dmgPct', base: 6, per: 0.35, label: '+{v}% Basic Attack Damage', int: true, slots: ['weapon', 'gloves', 'ring'] },
  { id: 'aoe', stat: 'aoePct', base: 4, per: 0.15, label: '+{v}% Area of Effect', int: true, slots: ['helmet', 'relic', 'chest'] },
  { id: 'dodge', stat: 'dodge', base: 2, per: 0.08, label: '+{v}% Dodge Chance', int: true, slots: ['boots', 'chest', 'helmet'] },
  { id: 'block', stat: 'block', base: 2, per: 0.08, label: '+{v}% Block Chance', int: true, slots: ['weapon', 'chest', 'gloves'] },
  { id: 'gold', stat: 'goldFindPct', base: 5, per: 0.3, label: '+{v}% Gold Found', int: true, slots: ['ring', 'necklace', 'helmet'] },
  { id: 'mf', stat: 'magicFindPct', base: 4, per: 0.2, label: '+{v}% Item Rarity', int: true, slots: ['ring', 'necklace', 'helmet', 'boots'] },
];
export const AFFIX_MAP: Record<string, AffixDef> = Object.fromEntries(AFFIXES.map((a) => [a.id, a]));

export interface RarityDef { id: Rarity; name: string; color: string; affixes: [number, number]; weight: number; salvage: number; tierBonus: number; glyph: string }
export const RARITY_DEFS: Record<Rarity, RarityDef> = {
  common: { id: 'common', name: 'Common', color: '#c8c8c8', affixes: [0, 0], weight: 520, salvage: 1, tierBonus: 0, glyph: '○' },
  uncommon: { id: 'uncommon', name: 'Uncommon', color: '#5fd068', affixes: [1, 2], weight: 300, salvage: 2, tierBonus: 0, glyph: '◇' },
  rare: { id: 'rare', name: 'Rare', color: '#4f9dff', affixes: [3, 4], weight: 130, salvage: 4, tierBonus: 0.1, glyph: '◆' },
  epic: { id: 'epic', name: 'Epic', color: '#b46cff', affixes: [4, 5], weight: 38, salvage: 8, tierBonus: 0.2, glyph: '✦' },
  legendary: { id: 'legendary', name: 'Legendary', color: '#ff9a2e', affixes: [4, 5], weight: 10, salvage: 18, tierBonus: 0.3, glyph: '★' },
  ancient: { id: 'ancient', name: 'Ancient', color: '#ff4f6a', affixes: [5, 5], weight: 2, salvage: 40, tierBonus: 0.55, glyph: '✷' },
};

/** Legendary powers — build-defining effects. Applied as mods (some interpreted specially by combat). */
export const LEGENDARY_POWERS: Record<string, { name: string; desc: string; mods: { stat: string; value: number }[]; slots?: string[] }> = {
  lp_split_basic: { name: 'of the Split Moon', desc: 'Basic attacks fire/strike 2 additional times at 35% less damage.', mods: [{ stat: 'basic.proj', value: 2 }, { stat: 'basic.dmgPct', value: -35 }] },
  lp_ember_basic: { name: 'of Living Embers', desc: 'Basic attacks deal Fire damage and always Burn.', mods: [{ stat: 'basic.convert.fire', value: 1 }, { stat: 'basic.statusChance', value: 1 }] },
  lp_chain_basic: { name: 'of the Storm Thread', desc: 'Basic attacks chain to 3 additional enemies.', mods: [{ stat: 'basic.chain', value: 3 }] },
  lp_cdr: { name: 'of Folded Time', desc: '+15% cooldown reduction, ultimates recharge 20% faster.', mods: [{ stat: 'cdr', value: 15 }, { stat: 'ultCdr', value: 20 }] },
  lp_minion: { name: 'of the Pale Court', desc: '+1 maximum minions, minions deal 40% more damage.', mods: [{ stat: 'minionCap', value: 1 }, { stat: 'minionDmgPct', value: 40 }] },
  lp_leech: { name: 'of the Crimson Moon', desc: '2% of hit damage leeched as life; +15% damage while above 80% life.', mods: [{ stat: 'lifeOnHitPct', value: 2 }, { stat: 'highLifeDmgPct', value: 15 }] },
  lp_proj: { name: 'of the Hundred Feathers', desc: 'Skills fire 2 additional projectiles.', mods: [{ stat: 'projCount', value: 2 }] },
  lp_finisher: { name: 'of the Final Hour', desc: 'Finishers and Soul-spenders deal 50% more damage per point consumed.', mods: [{ stat: 'finisherPct', value: 50 }] },
};

export const POTION = { maxCharges: 4, healPct: 0.45, cooldown: 6, buyPrice: 15 };
