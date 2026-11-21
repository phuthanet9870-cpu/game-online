import { COMMON_VALIDATION, type DamageStat, type SkillDef } from './skills.ts';

export const WEAPON_TYPES = ['staff', 'sword', 'dagger', 'bow', 'grimoire', 'gauntlet'] as const;
export type WeaponType = typeof WEAPON_TYPES[number];

export interface WeaponDef {
  type: WeaponType;
  name: string;
  nameTh: string;
  role: string;
  /** Disabled weapons are designed but not implemented yet; server rejects them. */
  enabled: boolean;
  damageStat: DamageStat;
  normal: SkillDef;
  heavy: SkillDef;
  /** Combo: consecutive normal hits within comboWindow; final hit gets comboFinisherMult. */
  combo: { hits: number; window: number; finisherMult: number };
  dodge: { distance: number; duration: number; iframes: number; staminaCost: number; cooldown: number };
  defensive: { kind: 'block' | 'mana_guard'; damageReduction: number; arcDeg: number; staminaPerSec: number; energyPerSec: number; moveMult: number };
  skills: [SkillDef, SkillDef, SkillDef];
  /** Starter item def id given at character creation. */
  starterItem: string;
}

const V = COMMON_VALIDATION;

const swordNormal: SkillDef = {
  id: 'sword_normal', name: 'Slash', nameTh: 'ฟัน', description: 'ฟันเป็นวงโค้งด้านหน้า คอมโบ 3 จังหวะ',
  type: 'normal', element: 'none', weapon: 'sword', unlockLevel: 1,
  damage: { stat: 'patk', mult: 1.0, flat: 0 }, target: 'enemy',
  shape: { kind: 'arc', range: 1.7, arcDeg: 110 },
  cooldown: 0.5, energyCost: 0, staminaCost: 0, castTime: 0, animTime: 0.3, moveMultDuringAnim: 0.5,
  effects: [], pvpMult: 1, pveMult: 1, vfx: 'slash_arc', sfx: 'sword_swing', validation: V,
  upgradeScaling: { damagePerLevel: 0, maxLevel: 0 },
};
const swordHeavy: SkillDef = {
  ...swordNormal, id: 'sword_heavy', name: 'Cleave', nameTh: 'ฟันหนัก', description: 'ง้างแล้วฟันกว้าง ดาเมจสูง ผลักศัตรู',
  type: 'heavy', damage: { stat: 'patk', mult: 2.2, flat: 0 }, shape: { kind: 'arc', range: 2.0, arcDeg: 150 },
  cooldown: 1.4, staminaCost: 22, castTime: 0.35, animTime: 0.6, moveMultDuringAnim: 0.2,
  effects: [{ kind: 'knockback', distance: 1.2 }], vfx: 'cleave_arc', sfx: 'sword_heavy',
};

const staffNormal: SkillDef = {
  id: 'staff_normal', name: 'Mana Orb', nameTh: 'ลูกแก้วมานา', description: 'ยิงลูกพลังเวทระยะกลาง',
  type: 'normal', element: 'arcane', weapon: 'staff', unlockLevel: 1,
  damage: { stat: 'matk', mult: 0.9, flat: 0 }, target: 'enemy',
  shape: { kind: 'projectile', speed: 11, range: 7, radius: 0.35, pierce: false },
  cooldown: 0.6, energyCost: 0, staminaCost: 0, castTime: 0, animTime: 0.3, moveMultDuringAnim: 0.6,
  effects: [], pvpMult: 1, pveMult: 1, vfx: 'orb_small', sfx: 'staff_cast', validation: V,
  upgradeScaling: { damagePerLevel: 0, maxLevel: 0 },
};
const staffHeavy: SkillDef = {
  ...staffNormal, id: 'staff_heavy', name: 'Charged Orb', nameTh: 'ลูกแก้วชาร์จ', description: 'ชาร์จลูกพลังขนาดใหญ่ ทะลุศัตรู',
  type: 'heavy', damage: { stat: 'matk', mult: 1.9, flat: 0 },
  shape: { kind: 'projectile', speed: 9, range: 8, radius: 0.55, pierce: true },
  cooldown: 1.6, staminaCost: 20, castTime: 0.4, animTime: 0.6, moveMultDuringAnim: 0.2,
  vfx: 'orb_large', sfx: 'staff_heavy',
};

export const WEAPONS: Record<WeaponType, WeaponDef | null> = {
  sword: {
    type: 'sword', name: 'Sword', nameTh: 'ดาบ', role: 'โจมตีประชิดและป้องกัน', enabled: true, damageStat: 'patk',
    normal: swordNormal, heavy: swordHeavy,
    combo: { hits: 3, window: 0.9, finisherMult: 1.5 },
    dodge: { distance: 3.0, duration: 0.25, iframes: 0.22, staminaCost: 30, cooldown: 0.5 },
    defensive: { kind: 'block', damageReduction: 0.6, arcDeg: 140, staminaPerSec: 12, energyPerSec: 0, moveMult: 0.45 },
    starterItem: 'wpn_rusty_sword',
    skills: [
      {
        ...swordNormal, id: 'sword_blade_rush', name: 'Blade Rush', nameTh: 'พุ่งฟัน', type: 'weapon_skill',
        description: 'พุ่งไปข้างหน้า 4 ช่อง ฟันทุกศัตรูในเส้นทาง',
        damage: { stat: 'patk', mult: 1.6, flat: 10 }, shape: { kind: 'line', length: 4, width: 1.1 },
        cooldown: 6, energyCost: 15, castTime: 0, animTime: 0.3, moveMultDuringAnim: 0,
        effects: [{ kind: 'dash', distance: 4, duration: 0.22 }], pvpMult: 0.8, vfx: 'rush_trail', sfx: 'sword_rush',
        validation: [...V, 'dash path collision-checked on server'],
        upgradeScaling: { damagePerLevel: 0.05, maxLevel: 10 },
      },
      {
        ...swordNormal, id: 'sword_rising_slash', name: 'Rising Slash', nameTh: 'ฟันเสยลอย', type: 'weapon_skill',
        description: 'ฟันเสยขึ้น ทำให้ศัตรูลอยกลางอากาศ (มึน) ชั่วครู่',
        damage: { stat: 'patk', mult: 1.4, flat: 8 }, shape: { kind: 'arc', range: 1.9, arcDeg: 120 },
        cooldown: 8, energyCost: 20, castTime: 0.12, animTime: 0.45, moveMultDuringAnim: 0,
        effects: [{ kind: 'stun', duration: 0.9 }], pvpMult: 0.8, vfx: 'rising_arc', sfx: 'sword_rise',
        upgradeScaling: { damagePerLevel: 0.05, maxLevel: 10 },
      },
      {
        ...swordNormal, id: 'sword_guard_counter', name: 'Guard Counter', nameTh: 'ตั้งรับสวนกลับ', type: 'weapon_skill',
        description: 'ตั้งท่ารับ 0.9 วินาที หากถูกโจมตีจะไม่รับความเสียหายและสวนกลับรอบตัว',
        damage: { stat: 'patk', mult: 2.4, flat: 15 }, shape: { kind: 'self' },
        cooldown: 10, energyCost: 15, castTime: 0, animTime: 0.9, moveMultDuringAnim: 0,
        effects: [{ kind: 'counter', window: 0.9, damageMult: 2.4, range: 2.6, stunDuration: 0.6 }],
        pvpMult: 0.7, vfx: 'guard_flash', sfx: 'sword_parry',
        validation: [...V, 'counter window measured on server clock'],
        upgradeScaling: { damagePerLevel: 0.05, maxLevel: 10 },
      },
    ],
  },
  staff: {
    type: 'staff', name: 'Staff', nameTh: 'คทา', role: 'เวทระยะกลางและสนับสนุน', enabled: true, damageStat: 'matk',
    normal: staffNormal, heavy: staffHeavy,
    combo: { hits: 3, window: 1.0, finisherMult: 1.4 },
    dodge: { distance: 3.4, duration: 0.25, iframes: 0.2, staminaCost: 32, cooldown: 0.5 },
    defensive: { kind: 'mana_guard', damageReduction: 0.45, arcDeg: 360, staminaPerSec: 0, energyPerSec: 10, moveMult: 0.5 },
    starterItem: 'wpn_apprentice_staff',
    skills: [
      {
        ...staffNormal, id: 'staff_arcane_bolt', name: 'Arcane Bolt', nameTh: 'กระสุนเวท', type: 'weapon_skill',
        description: 'ยิงกระสุนเวทความเร็วสูงระยะไกล',
        damage: { stat: 'matk', mult: 1.7, flat: 10 }, shape: { kind: 'projectile', speed: 16, range: 9, radius: 0.4, pierce: false },
        cooldown: 2.5, energyCost: 10, castTime: 0, animTime: 0.3, moveMultDuringAnim: 0.3,
        effects: [], pvpMult: 0.85, vfx: 'arcane_bolt', sfx: 'staff_bolt',
        upgradeScaling: { damagePerLevel: 0.05, maxLevel: 10 },
      },
      {
        ...staffNormal, id: 'staff_mana_wave', name: 'Mana Wave', nameTh: 'คลื่นมานา', type: 'weapon_skill',
        description: 'ปล่อยคลื่นพลังรอบตัว ผลักศัตรูออกไป',
        damage: { stat: 'matk', mult: 1.1, flat: 6 }, shape: { kind: 'circle', radius: 2.6, forward: 0 },
        cooldown: 9, energyCost: 25, castTime: 0.15, animTime: 0.45, moveMultDuringAnim: 0,
        effects: [{ kind: 'knockback', distance: 2.2 }], pvpMult: 0.8, vfx: 'mana_wave', sfx: 'staff_wave',
        upgradeScaling: { damagePerLevel: 0.05, maxLevel: 10 },
      },
      {
        ...staffNormal, id: 'staff_mystic_barrier', name: 'Mystic Barrier', nameTh: 'เกราะเวท', type: 'weapon_skill',
        description: 'สร้างโล่ดูดซับความเสียหาย 5 วินาที (15% HP สูงสุด + 1.5×Magic ATK)',
        damage: undefined, target: 'self', shape: { kind: 'self' },
        cooldown: 15, energyCost: 30, castTime: 0, animTime: 0.3, moveMultDuringAnim: 0.5,
        effects: [{ kind: 'shield', hpFraction: 0.15, stat: 'matk', statMult: 1.5, duration: 5 }],
        pvpMult: 0.7, vfx: 'barrier', sfx: 'staff_barrier',
        upgradeScaling: { damagePerLevel: 0.05, maxLevel: 10 },
      },
    ],
  },
  // Designed in docs/WEAPON_SYSTEM.md, implementation scheduled for Milestone 2.
  dagger: null, bow: null, grimoire: null, gauntlet: null,
};

export const WEAPON_DISPLAY: Record<WeaponType, { name: string; nameTh: string }> = {
  staff: { name: 'Staff', nameTh: 'คทา' }, sword: { name: 'Sword', nameTh: 'ดาบ' },
  dagger: { name: 'Dagger', nameTh: 'มีดสั้น' }, bow: { name: 'Bow', nameTh: 'ธนู' },
  grimoire: { name: 'Grimoire', nameTh: 'สมุดเวท' }, gauntlet: { name: 'Gauntlet', nameTh: 'ถุงมือ' },
};

export function getWeapon(type: string | null | undefined): WeaponDef | null {
  if (!type || !(WEAPON_TYPES as readonly string[]).includes(type)) return null;
  const w = WEAPONS[type as WeaponType];
  return w && w.enabled ? w : null;
}

/** All implemented actions keyed by id (normal, heavy, skills). */
export function allWeaponSkills(): SkillDef[] {
  const out: SkillDef[] = [];
  for (const t of WEAPON_TYPES) {
    const w = WEAPONS[t];
    if (!w) continue;
    out.push(w.normal, w.heavy, ...w.skills);
  }
  return out;
}
