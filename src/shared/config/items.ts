import type { Stats } from './stats.ts';
import type { WeaponType } from './weapons.ts';

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'] as const;
export type Rarity = typeof RARITIES[number];

export const RARITY_INFO: Record<Rarity, { nameTh: string; color: string; statMult: number; optionSlots: number }> = {
  common:    { nameTh: 'ธรรมดา', color: '#c8c8c8', statMult: 1.00, optionSlots: 1 },
  uncommon:  { nameTh: 'ไม่ธรรมดา', color: '#5fd35f', statMult: 1.12, optionSlots: 2 },
  rare:      { nameTh: 'หายาก', color: '#4aa3ff', statMult: 1.25, optionSlots: 3 },
  epic:      { nameTh: 'มหากาพย์', color: '#b46cff', statMult: 1.42, optionSlots: 4 },
  legendary: { nameTh: 'ตำนาน', color: '#ffae34', statMult: 1.62, optionSlots: 5 },
  mythic:    { nameTh: 'เทพนิยาย', color: '#ff4f6a', statMult: 1.85, optionSlots: 6 },
};

export const EQUIP_SLOTS = ['weapon', 'armor', 'helmet', 'gloves', 'boots', 'accessory1', 'accessory2'] as const;
export type EquipSlot = typeof EQUIP_SLOTS[number];

export type ItemCategory = 'weapon' | 'armor' | 'helmet' | 'gloves' | 'boots' | 'accessory' | 'consumable' | 'material' | 'rune';
export type ItemIcon = 'sword' | 'staff' | 'dagger' | 'bow' | 'grimoire' | 'gauntlet' | 'armor' | 'helmet' | 'gloves' | 'boots' | 'ring' | 'necklace' | 'potion' | 'ore' | 'gel' | 'hide' | 'essence' | 'fragment' | 'herb' | 'rune' | 'dust' | 'cap';

export type ItemUse =
  | { kind: 'heal'; flat: number; hpFraction: number; cooldown: number }
  | { kind: 'energy'; flat: number; cooldown: number };

export interface ItemDef {
  id: string;
  name: string;
  nameTh: string;
  description: string;
  category: ItemCategory;
  /** Base rarity (equipment may roll higher on drop). */
  rarity: Rarity;
  stackMax: number;
  levelReq: number;
  weaponType?: WeaponType;
  baseStats?: Partial<Stats>;
  use?: ItemUse;
  sellPrice: number;
  bind: 'none' | 'on_pickup' | 'on_equip';
  icon: ItemIcon;
  color: string;
}

const eq = (d: Omit<ItemDef, 'stackMax' | 'bind'> & { bind?: ItemDef['bind'] }): ItemDef => ({ stackMax: 1, bind: 'on_equip', ...d });
const mat = (id: string, name: string, nameTh: string, icon: ItemIcon, color: string, sellPrice: number, description: string, rarity: Rarity = 'common'): ItemDef => ({
  id, name, nameTh, description, category: 'material', rarity, stackMax: 999, levelReq: 1, sellPrice, bind: 'none', icon, color,
});

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(([
  eq({ id: 'wpn_rusty_sword', name: 'Rusty Sword', nameTh: 'ดาบขึ้นสนิม', description: 'ดาบเริ่มต้น', category: 'weapon', rarity: 'common', levelReq: 1, weaponType: 'sword', baseStats: { patk: 6 }, sellPrice: 5, icon: 'sword', color: '#a08a70', bind: 'on_pickup' }),
  eq({ id: 'wpn_apprentice_staff', name: 'Apprentice Staff', nameTh: 'คทาเด็กฝึก', description: 'คทาเริ่มต้น', category: 'weapon', rarity: 'common', levelReq: 1, weaponType: 'staff', baseStats: { matk: 6 }, sellPrice: 5, icon: 'staff', color: '#a0784a', bind: 'on_pickup' }),
  eq({ id: 'wpn_iron_sword', name: 'Iron Sword', nameTh: 'ดาบเหล็ก', description: 'ดาบเหล็กตีขึ้นรูปอย่างดี', category: 'weapon', rarity: 'common', levelReq: 5, weaponType: 'sword', baseStats: { patk: 14 }, sellPrice: 40, icon: 'sword', color: '#c9d1d9' }),
  eq({ id: 'wpn_oak_staff', name: 'Oak Staff', nameTh: 'คทาไม้โอ๊ค', description: 'คทาไม้โอ๊คที่สะสมมานา', category: 'weapon', rarity: 'common', levelReq: 5, weaponType: 'staff', baseStats: { matk: 14 }, sellPrice: 40, icon: 'staff', color: '#8a5a2b' }),
  eq({ id: 'wpn_wolfbane_blade', name: 'Wolfbane Blade', nameTh: 'ดาบล่าหมาป่า', description: 'ดาบคมกริบจากเขี้ยวหมาป่าจ่าฝูง', category: 'weapon', rarity: 'uncommon', levelReq: 9, weaponType: 'sword', baseStats: { patk: 24, critRate: 0.03 }, sellPrice: 120, icon: 'sword', color: '#e0e6ff' }),
  eq({ id: 'wpn_sylvan_staff', name: 'Sylvan Staff', nameTh: 'คทาพงไพร', description: 'คทาที่เติบโตจากรากไม้โบราณ', category: 'weapon', rarity: 'uncommon', levelReq: 9, weaponType: 'staff', baseStats: { matk: 24, cdr: 0.03 }, sellPrice: 120, icon: 'staff', color: '#6fbf5a' }),
  eq({ id: 'wpn_rusty_dagger', name: 'Rusty Dagger', nameTh: 'มีดสั้นขึ้นสนิม', description: 'มีดสั้นเริ่มต้น', category: 'weapon', rarity: 'common', levelReq: 1, weaponType: 'dagger', baseStats: { patk: 5, critRate: 0.03 }, sellPrice: 5, icon: 'dagger', color: '#a08a70', bind: 'on_pickup' }),
  eq({ id: 'wpn_short_bow', name: 'Short Bow', nameTh: 'ธนูสั้น', description: 'ธนูเริ่มต้น', category: 'weapon', rarity: 'common', levelReq: 1, weaponType: 'bow', baseStats: { patk: 6 }, sellPrice: 5, icon: 'bow', color: '#9a6a3a', bind: 'on_pickup' }),
  eq({ id: 'wpn_worn_grimoire', name: 'Worn Grimoire', nameTh: 'สมุดเวทเก่า', description: 'สมุดเวทเริ่มต้น', category: 'weapon', rarity: 'common', levelReq: 1, weaponType: 'grimoire', baseStats: { matk: 6 }, sellPrice: 5, icon: 'grimoire', color: '#7a4a9a', bind: 'on_pickup' }),
  eq({ id: 'wpn_leather_gauntlet', name: 'Leather Gauntlet', nameTh: 'ถุงมือหนังต่อสู้', description: 'ถุงมือต่อสู้เริ่มต้น', category: 'weapon', rarity: 'common', levelReq: 1, weaponType: 'gauntlet', baseStats: { patk: 5, pdef: 2 }, sellPrice: 5, icon: 'gauntlet', color: '#8b5a3c', bind: 'on_pickup' }),
  eq({ id: 'wpn_iron_dagger', name: 'Iron Dagger', nameTh: 'มีดสั้นเหล็ก', description: 'มีดสั้นคมกริบ', category: 'weapon', rarity: 'common', levelReq: 5, weaponType: 'dagger', baseStats: { patk: 12, critRate: 0.04 }, sellPrice: 40, icon: 'dagger', color: '#c9d1d9' }),
  eq({ id: 'wpn_hunter_bow', name: 'Hunter Bow', nameTh: 'ธนูนักล่า', description: 'ธนูไม้ยูที่ยิงได้ไกล', category: 'weapon', rarity: 'common', levelReq: 5, weaponType: 'bow', baseStats: { patk: 13 }, sellPrice: 40, icon: 'bow', color: '#6b4a2c' }),
  eq({ id: 'wpn_scribe_grimoire', name: "Scribe's Grimoire", nameTh: 'สมุดเวทนักจาร', description: 'บันทึกอักขระเวทชั้นต้น', category: 'weapon', rarity: 'common', levelReq: 5, weaponType: 'grimoire', baseStats: { matk: 13 }, sellPrice: 40, icon: 'grimoire', color: '#3a6ab0' }),
  eq({ id: 'wpn_iron_gauntlet', name: 'Iron Gauntlet', nameTh: 'ถุงมือเหล็ก', description: 'ถุงมือหุ้มเหล็กหนัก', category: 'weapon', rarity: 'common', levelReq: 5, weaponType: 'gauntlet', baseStats: { patk: 12, pdef: 4 }, sellPrice: 40, icon: 'gauntlet', color: '#9aa4ad' }),
  eq({ id: 'arm_cloth_tunic', name: 'Cloth Tunic', nameTh: 'เสื้อผ้าฝ้าย', description: 'ชุดเริ่มต้น', category: 'armor', rarity: 'common', levelReq: 1, baseStats: { pdef: 4, mdef: 4, hp: 20 }, sellPrice: 4, icon: 'armor', color: '#b7a58a', bind: 'on_pickup' }),
  eq({ id: 'arm_leather_vest', name: 'Leather Vest', nameTh: 'เสื้อหนัง', description: 'เสื้อหนังหมูป่าทนทาน', category: 'armor', rarity: 'common', levelReq: 4, baseStats: { pdef: 10, mdef: 6, hp: 45 }, sellPrice: 30, icon: 'armor', color: '#8b5a3c' }),
  eq({ id: 'helm_leather_cap', name: 'Leather Cap', nameTh: 'หมวกหนัง', description: 'หมวกหนังเบา', category: 'helmet', rarity: 'common', levelReq: 3, baseStats: { pdef: 4, hp: 20 }, sellPrice: 18, icon: 'helmet', color: '#8b5a3c' }),
  eq({ id: 'glv_leather_gloves', name: 'Leather Gloves', nameTh: 'ถุงมือหนัง', description: 'ช่วยให้จับอาวุธได้มั่น', category: 'gloves', rarity: 'common', levelReq: 3, baseStats: { pdef: 2, atkSpd: 0.03 }, sellPrice: 18, icon: 'gloves', color: '#8b5a3c' }),
  eq({ id: 'bts_leather_boots', name: 'Leather Boots', nameTh: 'รองเท้าหนัง', description: 'เดินทางได้ไกลขึ้น', category: 'boots', rarity: 'common', levelReq: 3, baseStats: { pdef: 2, moveSpeed: 0.15 }, sellPrice: 18, icon: 'boots', color: '#6b4a2c' }),
  eq({ id: 'acc_copper_ring', name: 'Copper Ring', nameTh: 'แหวนทองแดง', description: 'แหวนเรียบง่ายที่นำโชค', category: 'accessory', rarity: 'common', levelReq: 5, baseStats: { critRate: 0.02, hp: 15 }, sellPrice: 35, icon: 'ring', color: '#d08a4a' }),
  eq({ id: 'acc_wolf_fang_necklace', name: 'Wolf Fang Necklace', nameTh: 'สร้อยเขี้ยวหมาป่า', description: 'เครื่องรางของนักล่า', category: 'accessory', rarity: 'uncommon', levelReq: 8, baseStats: { patk: 4, matk: 4, accuracy: 0.01 }, sellPrice: 60, icon: 'necklace', color: '#f0e6d0' }),
  { id: 'pot_hp_small', name: 'Minor Healing Potion', nameTh: 'ยาฟื้นพลังขนาดเล็ก', description: 'ฟื้น HP 80 + 20% ของ HP สูงสุด', category: 'consumable', rarity: 'common', stackMax: 50, levelReq: 1, use: { kind: 'heal', flat: 80, hpFraction: 0.2, cooldown: 8 }, sellPrice: 5, bind: 'none', icon: 'potion', color: '#e04848' },
  { id: 'pot_energy_small', name: 'Minor Energy Potion', nameTh: 'ยาฟื้นพลังงานขนาดเล็ก', description: 'ฟื้น Energy 50', category: 'consumable', rarity: 'common', stackMax: 50, levelReq: 1, use: { kind: 'energy', flat: 50, cooldown: 8 }, sellPrice: 5, bind: 'none', icon: 'potion', color: '#4880e0' },
  mat('mat_soul_essence', 'Soul Essence', 'แก่นวิญญาณ', 'essence', '#b9a8ff', 3, 'วัตถุดิบพิธีกรรม ใช้ใน Power Rebirth Ritual'),
  mat('mat_iron_ore', 'Iron Ore', 'แร่เหล็ก', 'ore', '#9aa4ad', 4, 'ใช้ตีบวก +1 ถึง +5 (Milestone 4)'),
  mat('mat_slime_gel', 'Slime Gel', 'เจลสไลม์', 'gel', '#7be07b', 1, 'วัตถุดิบคราฟต์ยา'),
  mat('mat_boar_hide', 'Boar Hide', 'หนังหมูป่า', 'hide', '#9b6b46', 2, 'วัตถุดิบคราฟต์เกราะหนัง'),
  mat('mat_wolf_pelt', 'Wolf Pelt', 'หนังหมาป่า', 'hide', '#9aa0a8', 3, 'วัตถุดิบคราฟต์'),
  mat('mat_spore_cap', 'Spore Cap', 'หมวกเห็ดสปอร์', 'cap', '#d9534f', 2, 'วัตถุดิบคราฟต์ยา'),
  mat('mat_wisp_dust', 'Wisp Dust', 'ผงภูตแสง', 'dust', '#fff3a0', 3, 'วัตถุดิบรูน'),
  mat('mat_nature_herb', 'Verdant Herb', 'สมุนไพรเขียวขจี', 'herb', '#4fbf4f', 2, 'วัตถุดิบธรรมชาติ'),
  mat('mat_power_fragment', 'Power Fragment', 'เศษพลัง', 'fragment', '#ff66ff', 25, 'เศษของ The Power ใช้แลกพลังได้ใน Milestone 3', 'rare'),
  { id: 'rune_vitality_basic', name: 'Rune of Vitality (Basic)', nameTh: 'รูนแห่งชีวิต (พื้นฐาน)', description: 'เพิ่ม HP เมื่อฝังในช่องรูน (ระบบฝังรูน: Milestone 4)', category: 'rune', rarity: 'uncommon', stackMax: 99, levelReq: 1, sellPrice: 30, bind: 'none', icon: 'rune', color: '#58e07a' },
] as ItemDef[]).map((d) => [d.id, d]));

export function getItem(id: string): ItemDef | undefined {
  return Object.prototype.hasOwnProperty.call(ITEMS, id) ? ITEMS[id] : undefined;
}

export function isEquipment(def: ItemDef): boolean {
  return ['weapon', 'armor', 'helmet', 'gloves', 'boots', 'accessory'].includes(def.category);
}

export function slotsForCategory(cat: ItemCategory): EquipSlot[] {
  switch (cat) {
    case 'weapon': return ['weapon'];
    case 'armor': return ['armor'];
    case 'helmet': return ['helmet'];
    case 'gloves': return ['gloves'];
    case 'boots': return ['boots'];
    case 'accessory': return ['accessory1', 'accessory2'];
    default: return [];
  }
}

/** Server-side item instance. uid is generated only by the server. */
export interface ItemInstance {
  uid: string;
  defId: string;
  qty: number;
  rarity: Rarity;
  /** Item level (affects stats). */
  ilvl: number;
  enhance: number;
  bound: boolean;
  /** Inventory slot index, or null when equipped. */
  slot: number | null;
  equip: EquipSlot | null;
}

export const INVENTORY_CONFIG = { slots: 40, maxGold: 2_000_000_000 };

/** Stats an equipment instance contributes. */
export function itemStats(inst: ItemInstance): Partial<Stats> {
  const def = getItem(inst.defId);
  if (!def?.baseStats) return {};
  const mult = RARITY_INFO[inst.rarity].statMult * (1 + Math.max(0, inst.ilvl - def.levelReq) * 0.03);
  const out: Partial<Stats> = {};
  for (const [k, v] of Object.entries(def.baseStats) as [keyof Stats, number][]) {
    // flat stats scale; small fractional stats (crit, atkSpd...) scale too but stay tiny.
    out[k] = v * mult;
  }
  return out;
}

export interface ShopDef { id: string; name: string; nameTh: string; items: { itemId: string; price: number }[] }

export const SHOPS: Record<string, ShopDef> = {
  aether_general: {
    id: 'aether_general', name: 'General Store', nameTh: 'ร้านค้าทั่วไป',
    items: [
      { itemId: 'pot_hp_small', price: 20 },
      { itemId: 'pot_energy_small', price: 20 },
      { itemId: 'wpn_rusty_sword', price: 40 },
      { itemId: 'wpn_apprentice_staff', price: 40 },
      { itemId: 'wpn_rusty_dagger', price: 40 },
      { itemId: 'wpn_short_bow', price: 40 },
      { itemId: 'wpn_worn_grimoire', price: 40 },
      { itemId: 'wpn_leather_gauntlet', price: 40 },
      { itemId: 'arm_cloth_tunic', price: 30 },
    ],
  },
};
