import type { Element } from './skills.ts';
import type { Rarity } from './items.ts';

export type MonsterTier = 'normal' | 'elite' | 'champion' | 'map_boss' | 'dungeon_boss' | 'world_boss';
export type MonsterFamily = 'slime' | 'boar' | 'wolf' | 'mushroom' | 'wisp' | 'sapling';

export interface LootEntry {
  itemId: string;
  /** Probability 0..1 per kill. */
  chance: number;
  min: number;
  max: number;
  /** Equipment only: rarity weights for the rolled instance. */
  rarityWeights?: Partial<Record<Rarity, number>>;
}

export type MonsterAttack =
  | { kind: 'melee'; windup: number; cooldown: number; range: number; arcDeg: number; mult: number; knockback: number }
  | { kind: 'ranged'; windup: number; cooldown: number; range: number; speed: number; radius: number; mult: number }
  | { kind: 'aoe'; windup: number; cooldown: number; range: number; radius: number; mult: number; slow?: { mult: number; duration: number } };

export interface MonsterDef {
  id: string;
  name: string;
  nameTh: string;
  family: MonsterFamily;
  tier: MonsterTier;
  levelMin: number;
  levelMax: number;
  hp: number; hpPerLevel: number;
  atk: number; atkPerLevel: number;
  def: number; defPerLevel: number;
  damageType: 'physical' | 'magic';
  element: Element;
  resist: Partial<Record<Element, number>>;
  aggroRange: number;
  /** Max distance from spawn point before the monster leashes back. */
  leashRange: number;
  moveSpeed: number;
  radius: number;
  attacks: MonsterAttack[];
  behavior: { passive: boolean; wander: boolean; keepDistance?: number; retreatBelowHp?: number };
  exp: number; expPerLevel: number;
  respawnSec: number;
  gold: [number, number];
  loot: LootEntry[];
  palette: { body: string; dark: string; light: string; eye: string };
  scale: number;
}

const POWER_FRAGMENT_NORMAL = 0.01; // within the 0.5–2% band from the brief
const POWER_FRAGMENT_ELITE = 0.08;  // within the 5–12% band

const base = {
  tier: 'normal' as MonsterTier, damageType: 'physical' as const, element: 'none' as Element, resist: {},
  leashRange: 14, radius: 0.35, behavior: { passive: false, wander: true }, respawnSec: 20, scale: 1,
};

export const MONSTERS: Record<string, MonsterDef> = Object.fromEntries(([
  // ---------------- Greenfall Plains (Lv 1–8) ----------------
  { ...base, id: 'green_slime', name: 'Green Slime', nameTh: 'สไลม์เขียว', family: 'slime', levelMin: 1, levelMax: 3,
    hp: 60, hpPerLevel: 22, atk: 8, atkPerLevel: 3, def: 2, defPerLevel: 1, aggroRange: 4, moveSpeed: 1.8,
    attacks: [{ kind: 'melee', windup: 0.55, cooldown: 1.6, range: 1.1, arcDeg: 120, mult: 1, knockback: 0 }],
    behavior: { passive: true, wander: true }, exp: 12, expPerLevel: 4, gold: [1, 4],
    loot: [{ itemId: 'mat_slime_gel', chance: 0.55, min: 1, max: 2 }, { itemId: 'mat_soul_essence', chance: 0.08, min: 1, max: 1 },
      { itemId: 'pot_hp_small', chance: 0.05, min: 1, max: 1 }, { itemId: 'mat_power_fragment', chance: POWER_FRAGMENT_NORMAL, min: 1, max: 1 }],
    palette: { body: '#5ccf5c', dark: '#2f8a3a', light: '#b6f5a8', eye: '#10301a' } },
  { ...base, id: 'meadow_boar', name: 'Meadow Boar', nameTh: 'หมูป่าทุ่งหญ้า', family: 'boar', levelMin: 3, levelMax: 5,
    hp: 120, hpPerLevel: 30, atk: 13, atkPerLevel: 3.5, def: 5, defPerLevel: 1.5, aggroRange: 5, moveSpeed: 2.6,
    attacks: [{ kind: 'melee', windup: 0.6, cooldown: 1.8, range: 1.3, arcDeg: 90, mult: 1.2, knockback: 0.8 }],
    behavior: { passive: true, wander: true }, exp: 26, expPerLevel: 6, gold: [3, 8],
    loot: [{ itemId: 'mat_boar_hide', chance: 0.5, min: 1, max: 2 }, { itemId: 'mat_iron_ore', chance: 0.12, min: 1, max: 1 },
      { itemId: 'helm_leather_cap', chance: 0.02, min: 1, max: 1, rarityWeights: { common: 80, uncommon: 18, rare: 2 } },
      { itemId: 'mat_power_fragment', chance: POWER_FRAGMENT_NORMAL, min: 1, max: 1 }],
    palette: { body: '#9b6b46', dark: '#5c3b22', light: '#d4a27a', eye: '#1a0d05' } },
  { ...base, id: 'plains_wolf', name: 'Plains Wolf', nameTh: 'หมาป่าทุ่งราบ', family: 'wolf', levelMin: 4, levelMax: 7,
    hp: 110, hpPerLevel: 28, atk: 16, atkPerLevel: 4, def: 4, defPerLevel: 1.4, aggroRange: 6.5, moveSpeed: 3.4,
    attacks: [{ kind: 'melee', windup: 0.4, cooldown: 1.3, range: 1.2, arcDeg: 90, mult: 1, knockback: 0 }],
    exp: 34, expPerLevel: 7, gold: [4, 10],
    loot: [{ itemId: 'mat_wolf_pelt', chance: 0.45, min: 1, max: 1 }, { itemId: 'mat_soul_essence', chance: 0.12, min: 1, max: 2 },
      { itemId: 'bts_leather_boots', chance: 0.02, min: 1, max: 1, rarityWeights: { common: 80, uncommon: 18, rare: 2 } },
      { itemId: 'glv_leather_gloves', chance: 0.02, min: 1, max: 1, rarityWeights: { common: 80, uncommon: 18, rare: 2 } },
      { itemId: 'mat_power_fragment', chance: POWER_FRAGMENT_NORMAL, min: 1, max: 1 }],
    palette: { body: '#9aa0a8', dark: '#5a5f66', light: '#d8dce0', eye: '#ffcc33' } },
  { ...base, id: 'puffcap', name: 'Puffcap', nameTh: 'เห็ดพองลม', family: 'mushroom', levelMin: 2, levelMax: 5,
    hp: 90, hpPerLevel: 22, atk: 10, atkPerLevel: 3, def: 3, defPerLevel: 1, aggroRange: 4.5, moveSpeed: 1.5, damageType: 'magic', element: 'nature',
    attacks: [{ kind: 'aoe', windup: 1.0, cooldown: 3.2, range: 3, radius: 1.6, mult: 1.3, slow: { mult: 0.6, duration: 2 } }],
    exp: 22, expPerLevel: 5, gold: [2, 6],
    loot: [{ itemId: 'mat_spore_cap', chance: 0.5, min: 1, max: 2 }, { itemId: 'mat_nature_herb', chance: 0.25, min: 1, max: 1 },
      { itemId: 'pot_energy_small', chance: 0.05, min: 1, max: 1 }, { itemId: 'mat_power_fragment', chance: POWER_FRAGMENT_NORMAL, min: 1, max: 1 }],
    palette: { body: '#d9534f', dark: '#8a2a28', light: '#f6e7c8', eye: '#2a1010' } },
  { ...base, id: 'field_wisp', name: 'Field Wisp', nameTh: 'ภูตแสงทุ่งหญ้า', family: 'wisp', levelMin: 3, levelMax: 6,
    hp: 70, hpPerLevel: 18, atk: 12, atkPerLevel: 3.5, def: 1, defPerLevel: 0.8, aggroRange: 7, moveSpeed: 2.4, damageType: 'magic', element: 'arcane',
    attacks: [{ kind: 'ranged', windup: 0.7, cooldown: 2.2, range: 6, speed: 7, radius: 0.3, mult: 1 }],
    behavior: { passive: false, wander: true, keepDistance: 4 }, exp: 28, expPerLevel: 6, gold: [3, 7],
    loot: [{ itemId: 'mat_wisp_dust', chance: 0.5, min: 1, max: 2 }, { itemId: 'mat_soul_essence', chance: 0.15, min: 1, max: 1 },
      { itemId: 'acc_copper_ring', chance: 0.015, min: 1, max: 1, rarityWeights: { common: 75, uncommon: 22, rare: 3 } },
      { itemId: 'mat_power_fragment', chance: POWER_FRAGMENT_NORMAL, min: 1, max: 1 }],
    palette: { body: '#fff3a0', dark: '#e0b030', light: '#ffffff', eye: '#704000' } },
  { ...base, id: 'alpha_wolf', name: 'Alpha Wolf', nameTh: 'หมาป่าจ่าฝูง', family: 'wolf', tier: 'elite', levelMin: 8, levelMax: 8,
    hp: 900, hpPerLevel: 0, atk: 34, atkPerLevel: 0, def: 12, defPerLevel: 0, aggroRange: 7, moveSpeed: 3.6, leashRange: 16, radius: 0.55, scale: 1.45,
    attacks: [
      { kind: 'melee', windup: 0.45, cooldown: 1.4, range: 1.6, arcDeg: 100, mult: 1, knockback: 0 },
      { kind: 'aoe', windup: 1.1, cooldown: 7, range: 1.5, radius: 2.6, mult: 1.8 },
    ],
    exp: 320, expPerLevel: 0, gold: [30, 60], respawnSec: 180,
    loot: [{ itemId: 'mat_wolf_pelt', chance: 1, min: 2, max: 4 }, { itemId: 'mat_soul_essence', chance: 0.6, min: 2, max: 4 },
      { itemId: 'wpn_wolfbane_blade', chance: 0.12, min: 1, max: 1, rarityWeights: { uncommon: 70, rare: 25, epic: 5 } },
      { itemId: 'acc_wolf_fang_necklace', chance: 0.15, min: 1, max: 1, rarityWeights: { uncommon: 75, rare: 22, epic: 3 } },
      { itemId: 'rune_vitality_basic', chance: 0.1, min: 1, max: 1 },
      { itemId: 'mat_power_fragment', chance: POWER_FRAGMENT_ELITE, min: 1, max: 2 }],
    palette: { body: '#6e5a52', dark: '#3a2a26', light: '#c9b8a8', eye: '#ff3a3a' } },

  // ---------------- Whispering Forest (Lv 6–14) ----------------
  { ...base, id: 'moss_slime', name: 'Moss Slime', nameTh: 'สไลม์ตะไคร่', family: 'slime', levelMin: 6, levelMax: 9,
    hp: 160, hpPerLevel: 30, atk: 20, atkPerLevel: 4, def: 8, defPerLevel: 1.5, aggroRange: 4.5, moveSpeed: 2,
    attacks: [{ kind: 'melee', windup: 0.5, cooldown: 1.5, range: 1.1, arcDeg: 120, mult: 1, knockback: 0 }],
    exp: 48, expPerLevel: 8, gold: [5, 12],
    loot: [{ itemId: 'mat_slime_gel', chance: 0.6, min: 1, max: 3 }, { itemId: 'mat_nature_herb', chance: 0.3, min: 1, max: 1 },
      { itemId: 'pot_hp_small', chance: 0.06, min: 1, max: 1 }, { itemId: 'mat_power_fragment', chance: POWER_FRAGMENT_NORMAL, min: 1, max: 1 }],
    palette: { body: '#3f8f5a', dark: '#1d5030', light: '#9ad9a0', eye: '#0a2010' } },
  { ...base, id: 'thorn_boar', name: 'Thorn Boar', nameTh: 'หมูป่าหนาม', family: 'boar', levelMin: 8, levelMax: 11,
    hp: 260, hpPerLevel: 38, atk: 28, atkPerLevel: 4.5, def: 12, defPerLevel: 2, aggroRange: 5.5, moveSpeed: 2.8,
    attacks: [{ kind: 'melee', windup: 0.55, cooldown: 1.7, range: 1.4, arcDeg: 90, mult: 1.25, knockback: 1 }],
    exp: 70, expPerLevel: 10, gold: [7, 15],
    loot: [{ itemId: 'mat_boar_hide', chance: 0.6, min: 1, max: 2 }, { itemId: 'mat_iron_ore', chance: 0.18, min: 1, max: 2 },
      { itemId: 'arm_leather_vest', chance: 0.025, min: 1, max: 1, rarityWeights: { common: 70, uncommon: 25, rare: 5 } },
      { itemId: 'mat_power_fragment', chance: POWER_FRAGMENT_NORMAL, min: 1, max: 1 }],
    palette: { body: '#6b4e33', dark: '#3a2814', light: '#9fd27a', eye: '#1a0d05' } },
  { ...base, id: 'shade_wolf', name: 'Shade Wolf', nameTh: 'หมาป่าเงาไม้', family: 'wolf', levelMin: 9, levelMax: 12,
    hp: 230, hpPerLevel: 34, atk: 32, atkPerLevel: 5, def: 9, defPerLevel: 1.6, aggroRange: 7, moveSpeed: 3.6,
    attacks: [{ kind: 'melee', windup: 0.38, cooldown: 1.2, range: 1.2, arcDeg: 90, mult: 1, knockback: 0 }],
    exp: 82, expPerLevel: 11, gold: [8, 16],
    loot: [{ itemId: 'mat_wolf_pelt', chance: 0.55, min: 1, max: 2 }, { itemId: 'mat_soul_essence', chance: 0.18, min: 1, max: 2 },
      { itemId: 'wpn_iron_sword', chance: 0.02, min: 1, max: 1, rarityWeights: { common: 70, uncommon: 25, rare: 5 } },
      { itemId: 'mat_power_fragment', chance: POWER_FRAGMENT_NORMAL, min: 1, max: 1 }],
    palette: { body: '#3c4a3e', dark: '#1c241e', light: '#7f9a84', eye: '#9cff6a' } },
  { ...base, id: 'sporeling', name: 'Sporeling', nameTh: 'เห็ดสปอร์พิษ', family: 'mushroom', levelMin: 7, levelMax: 10,
    hp: 200, hpPerLevel: 28, atk: 22, atkPerLevel: 4, def: 7, defPerLevel: 1.3, aggroRange: 5, moveSpeed: 1.6, damageType: 'magic', element: 'nature',
    attacks: [{ kind: 'aoe', windup: 0.95, cooldown: 3, range: 3.2, radius: 1.8, mult: 1.35, slow: { mult: 0.55, duration: 2.2 } }],
    exp: 60, expPerLevel: 9, gold: [6, 13],
    loot: [{ itemId: 'mat_spore_cap', chance: 0.6, min: 1, max: 3 }, { itemId: 'mat_nature_herb', chance: 0.35, min: 1, max: 2 },
      { itemId: 'pot_energy_small', chance: 0.06, min: 1, max: 1 }, { itemId: 'mat_power_fragment', chance: POWER_FRAGMENT_NORMAL, min: 1, max: 1 }],
    palette: { body: '#8a4fbf', dark: '#4a2470', light: '#e8d8ff', eye: '#1a0a2a' } },
  { ...base, id: 'forest_wisp', name: 'Forest Wisp', nameTh: 'ภูตไพร', family: 'wisp', levelMin: 8, levelMax: 12,
    hp: 170, hpPerLevel: 26, atk: 26, atkPerLevel: 5, def: 5, defPerLevel: 1.2, aggroRange: 7.5, moveSpeed: 2.6, damageType: 'magic', element: 'nature',
    attacks: [{ kind: 'ranged', windup: 0.6, cooldown: 2, range: 6.5, speed: 8, radius: 0.3, mult: 1 }],
    behavior: { passive: false, wander: true, keepDistance: 4.5 }, exp: 74, expPerLevel: 10, gold: [7, 14],
    loot: [{ itemId: 'mat_wisp_dust', chance: 0.6, min: 1, max: 2 }, { itemId: 'mat_soul_essence', chance: 0.2, min: 1, max: 2 },
      { itemId: 'wpn_oak_staff', chance: 0.02, min: 1, max: 1, rarityWeights: { common: 70, uncommon: 25, rare: 5 } },
      { itemId: 'mat_power_fragment', chance: POWER_FRAGMENT_NORMAL, min: 1, max: 1 }],
    palette: { body: '#a8ffb0', dark: '#30b050', light: '#ffffff', eye: '#004010' } },
  { ...base, id: 'elder_sapling', name: 'Elder Sapling', nameTh: 'ต้นกล้าผู้เฒ่า', family: 'sapling', tier: 'elite', levelMin: 13, levelMax: 13,
    hp: 2600, hpPerLevel: 0, atk: 55, atkPerLevel: 0, def: 22, defPerLevel: 0, aggroRange: 6, moveSpeed: 1.9, leashRange: 14, radius: 0.6, scale: 1.5,
    damageType: 'magic', element: 'nature', resist: { nature: 0.4, fire: -0.3 },
    attacks: [
      { kind: 'melee', windup: 0.6, cooldown: 1.8, range: 1.8, arcDeg: 120, mult: 1, knockback: 1.2 },
      { kind: 'aoe', windup: 1.2, cooldown: 6, range: 6, radius: 2.2, mult: 1.6, slow: { mult: 0.5, duration: 2.5 } },
    ],
    exp: 1100, expPerLevel: 0, gold: [60, 120], respawnSec: 240,
    loot: [{ itemId: 'mat_nature_herb', chance: 1, min: 3, max: 6 }, { itemId: 'mat_soul_essence', chance: 0.7, min: 3, max: 5 },
      { itemId: 'wpn_sylvan_staff', chance: 0.12, min: 1, max: 1, rarityWeights: { uncommon: 70, rare: 25, epic: 5 } },
      { itemId: 'rune_vitality_basic', chance: 0.18, min: 1, max: 1 },
      { itemId: 'mat_power_fragment', chance: POWER_FRAGMENT_ELITE, min: 1, max: 2 }],
    palette: { body: '#5a3e24', dark: '#2e1e10', light: '#6fd36f', eye: '#ffe066' } },
] as MonsterDef[]).map((m) => [m.id, m]));

export function getMonster(id: string): MonsterDef | undefined {
  return Object.prototype.hasOwnProperty.call(MONSTERS, id) ? MONSTERS[id] : undefined;
}

export function monsterStatsAt(def: MonsterDef, level: number) {
  const l = Math.max(0, level - def.levelMin);
  return {
    maxHp: Math.round(def.hp + def.hpPerLevel * l),
    atk: def.atk + def.atkPerLevel * l,
    def: def.def + def.defPerLevel * l,
    exp: Math.round(def.exp + def.expPerLevel * l),
  };
}
