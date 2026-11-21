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
  dagger: {
    type: 'dagger', name: 'Dagger', nameTh: 'มีดสั้น', role: 'ความเร็วสูงและลอบโจมตี', enabled: true, damageStat: 'patk',
    normal: { ...swordNormal, id: 'dagger_normal', name: 'Stab', nameTh: 'แทง', weapon: 'dagger', description: 'แทงเร็ว ระยะสั้น คอมโบ 4 จังหวะ',
      damage: { stat: 'patk', mult: 0.72, flat: 0 }, shape: { kind: 'arc', range: 1.35, arcDeg: 80 }, cooldown: 0.32, animTime: 0.2, moveMultDuringAnim: 0.7,
      effects: [{ kind: 'backstab', mult: 1.3 }], vfx: 'stab', sfx: 'dagger_stab' },
    heavy: { ...swordHeavy, id: 'dagger_heavy', name: 'Gut Slice', nameTh: 'ปาดลึก', weapon: 'dagger', description: 'ปาดลึก ดาเมจสูงเมื่อโจมตีจากด้านหลัง',
      damage: { stat: 'patk', mult: 1.7, flat: 0 }, shape: { kind: 'arc', range: 1.5, arcDeg: 100 }, cooldown: 1.1, staminaCost: 18, castTime: 0.2, animTime: 0.4,
      moveMultDuringAnim: 0.4, effects: [{ kind: 'backstab', mult: 1.5 }], vfx: 'slash_arc', sfx: 'dagger_heavy' },
    combo: { hits: 4, window: 0.8, finisherMult: 1.6 },
    dodge: { distance: 3.8, duration: 0.24, iframes: 0.24, staminaCost: 26, cooldown: 0.4 },
    defensive: { kind: 'block', damageReduction: 0.35, arcDeg: 120, staminaPerSec: 10, energyPerSec: 0, moveMult: 0.7 },
    starterItem: 'wpn_rusty_dagger',
    skills: [
      { ...swordNormal, id: 'dagger_shadow_step', name: 'Shadow Step', nameTh: 'ก้าวเงา', type: 'weapon_skill', weapon: 'dagger',
        description: 'วาร์ปไปด้านหลังศัตรูที่ใกล้ที่สุดทางด้านหน้า (5 ช่อง) แล้วแทง',
        damage: { stat: 'patk', mult: 1.3, flat: 8 }, shape: { kind: 'arc', range: 1.5, arcDeg: 120 }, cooldown: 7, energyCost: 15, castTime: 0, animTime: 0.25, moveMultDuringAnim: 0,
        effects: [{ kind: 'blink_behind', range: 5, coneDeg: 70 }, { kind: 'backstab', mult: 1.3 }], pvpMult: 0.75, vfx: 'shadow_step', sfx: 'dagger_blink',
        validation: [...V, 'teleport destination collision-checked; requires a valid target in cone'], upgradeScaling: { damagePerLevel: 0.05, maxLevel: 10 } },
      { ...swordNormal, id: 'dagger_double_fang', name: 'Double Fang', nameTh: 'เขี้ยวคู่', type: 'weapon_skill', weapon: 'dagger',
        description: 'แทงสองครั้งติดกันอย่างรวดเร็ว',
        damage: { stat: 'patk', mult: 1.05, flat: 5 }, shape: { kind: 'arc', range: 1.5, arcDeg: 90 }, cooldown: 4, energyCost: 12, castTime: 0, animTime: 0.3, moveMultDuringAnim: 0.3,
        effects: [{ kind: 'multi', hits: 2 }, { kind: 'backstab', mult: 1.3 }], pvpMult: 0.8, vfx: 'double_fang', sfx: 'dagger_double', upgradeScaling: { damagePerLevel: 0.05, maxLevel: 10 } },
      { ...swordNormal, id: 'dagger_backstab', name: 'Backstab', nameTh: 'แทงข้างหลัง', type: 'weapon_skill', weapon: 'dagger',
        description: 'แทงอย่างแม่นยำ ดาเมจ ×2.2 เมื่อโจมตีจากด้านหลังเป้าหมาย',
        damage: { stat: 'patk', mult: 1.6, flat: 10 }, shape: { kind: 'arc', range: 1.4, arcDeg: 70 }, cooldown: 9, energyCost: 20, castTime: 0.1, animTime: 0.35, moveMultDuringAnim: 0,
        effects: [{ kind: 'backstab', mult: 2.2 }], pvpMult: 0.7, vfx: 'backstab', sfx: 'dagger_backstab', upgradeScaling: { damagePerLevel: 0.05, maxLevel: 10 } },
    ],
  },
  bow: {
    type: 'bow', name: 'Bow', nameTh: 'ธนู', role: 'โจมตีระยะไกล', enabled: true, damageStat: 'patk',
    normal: { ...staffNormal, id: 'bow_normal', name: 'Arrow', nameTh: 'ยิงธนู', weapon: 'bow', element: 'none', description: 'ยิงลูกธนูระยะไกล',
      damage: { stat: 'patk', mult: 0.85, flat: 0 }, shape: { kind: 'projectile', speed: 17, range: 9, radius: 0.25, pierce: false }, cooldown: 0.62, animTime: 0.3, moveMultDuringAnim: 0.5,
      vfx: 'arrow', sfx: 'bow_shot' },
    heavy: { ...staffHeavy, id: 'bow_heavy', name: 'Power Shot', nameTh: 'ยิงเต็มแรง', weapon: 'bow', element: 'none', description: 'น้าวสายเต็มแรง ทะลุและผลักเป้าหมาย',
      damage: { stat: 'patk', mult: 1.9, flat: 0 }, shape: { kind: 'projectile', speed: 22, range: 11, radius: 0.3, pierce: true }, cooldown: 1.6, staminaCost: 20, castTime: 0.45, animTime: 0.6,
      effects: [{ kind: 'knockback', distance: 0.8 }], vfx: 'arrow_heavy', sfx: 'bow_heavy' },
    combo: { hits: 3, window: 1.1, finisherMult: 1.35 },
    dodge: { distance: 3.4, duration: 0.25, iframes: 0.2, staminaCost: 28, cooldown: 0.45 },
    defensive: { kind: 'block', damageReduction: 0.3, arcDeg: 120, staminaPerSec: 10, energyPerSec: 0, moveMult: 0.6 },
    starterItem: 'wpn_short_bow',
    skills: [
      { ...staffNormal, id: 'bow_triple_shot', name: 'Triple Shot', nameTh: 'ยิงสามดอก', type: 'weapon_skill', weapon: 'bow', element: 'none',
        description: 'ยิงลูกธนู 3 ดอกแบบพัด 30°', damage: { stat: 'patk', mult: 1.0, flat: 6 }, shape: { kind: 'projectile', speed: 17, range: 8, radius: 0.25, pierce: false },
        cooldown: 5, energyCost: 15, castTime: 0, animTime: 0.35, moveMultDuringAnim: 0.3, effects: [{ kind: 'spread', count: 3, angleDeg: 30 }], pvpMult: 0.75,
        vfx: 'arrow', sfx: 'bow_triple', upgradeScaling: { damagePerLevel: 0.05, maxLevel: 10 } },
      { ...staffNormal, id: 'bow_piercing_arrow', name: 'Piercing Arrow', nameTh: 'ศรทะลวง', type: 'weapon_skill', weapon: 'bow', element: 'none',
        description: 'ลูกธนูความเร็วสูงทะลุทุกเป้าหมายในแนว 12 ช่อง', damage: { stat: 'patk', mult: 1.8, flat: 12 },
        shape: { kind: 'projectile', speed: 26, range: 12, radius: 0.35, pierce: true }, cooldown: 8, energyCost: 20, castTime: 0.25, animTime: 0.45, moveMultDuringAnim: 0,
        effects: [], pvpMult: 0.8, vfx: 'arrow_pierce', sfx: 'bow_pierce', upgradeScaling: { damagePerLevel: 0.05, maxLevel: 10 } },
      { ...staffNormal, id: 'bow_evasive_shot', name: 'Evasive Shot', nameTh: 'ถอยยิง', type: 'weapon_skill', weapon: 'bow', element: 'none',
        description: 'กระโดดถอยหลัง 3 ช่องพร้อมยิงลูกธนูที่ทำให้ศัตรูช้าลง', damage: { stat: 'patk', mult: 1.2, flat: 8 },
        shape: { kind: 'projectile', speed: 18, range: 9, radius: 0.3, pierce: false }, cooldown: 9, energyCost: 15, castTime: 0, animTime: 0.3, moveMultDuringAnim: 0,
        effects: [{ kind: 'backdash', distance: 3, duration: 0.2 }, { kind: 'slow', mult: 0.55, duration: 2.5 }], pvpMult: 0.8, vfx: 'arrow', sfx: 'bow_evasive',
        validation: [...V, 'backdash collision-checked'], upgradeScaling: { damagePerLevel: 0.05, maxLevel: 10 } },
    ],
  },
  grimoire: {
    type: 'grimoire', name: 'Grimoire', nameTh: 'สมุดเวท', role: 'วางกับดักและควบคุมพื้นที่', enabled: true, damageStat: 'matk',
    normal: { ...staffNormal, id: 'grimoire_normal', name: 'Glyph', nameTh: 'อักขระเวท', weapon: 'grimoire', description: 'ระเบิดอักขระเวทขนาดเล็กข้างหน้า 3 ช่อง',
      damage: { stat: 'matk', mult: 0.85, flat: 0 }, shape: { kind: 'circle', radius: 1.0, forward: 3 }, cooldown: 0.75, animTime: 0.35, moveMultDuringAnim: 0.5, vfx: 'glyph', sfx: 'grim_cast' },
    heavy: { ...staffHeavy, id: 'grimoire_heavy', name: 'Seal Blast', nameTh: 'ผนึกระเบิด', weapon: 'grimoire', description: 'ผนึกวงใหญ่ข้างหน้า ทำให้ศัตรูช้าลง',
      damage: { stat: 'matk', mult: 1.7, flat: 0 }, shape: { kind: 'circle', radius: 1.8, forward: 3.5 }, cooldown: 1.8, staminaCost: 18, castTime: 0.5, animTime: 0.6,
      effects: [{ kind: 'slow', mult: 0.6, duration: 2 }], vfx: 'seal_blast', sfx: 'grim_heavy' },
    combo: { hits: 3, window: 1.1, finisherMult: 1.4 },
    dodge: { distance: 3.2, duration: 0.25, iframes: 0.2, staminaCost: 32, cooldown: 0.5 },
    defensive: { kind: 'mana_guard', damageReduction: 0.4, arcDeg: 360, staminaPerSec: 0, energyPerSec: 9, moveMult: 0.5 },
    starterItem: 'wpn_worn_grimoire',
    skills: [
      { ...staffNormal, id: 'grimoire_rune_trap', name: 'Rune Trap', nameTh: 'กับดักรูน', type: 'weapon_skill', weapon: 'grimoire',
        description: 'วางกับดักรูนข้างหน้า 2 ช่อง พร้อมใช้หลัง 0.6 วิ ระเบิดเมื่อศัตรูเหยียบ ตรึง 2 วินาที (สูงสุด 3 อัน, อยู่ 30 วิ)',
        damage: { stat: 'matk', mult: 2.0, flat: 12 }, shape: { kind: 'circle', radius: 1.6, forward: 2 }, cooldown: 3, energyCost: 15, castTime: 0, animTime: 0.3, moveMultDuringAnim: 0.3,
        effects: [{ kind: 'trap', radius: 1.6, armSec: 0.6, lifeSec: 30, maxActive: 3 }, { kind: 'root', duration: 2 }], pvpMult: 0.7, vfx: 'rune_trap', sfx: 'grim_trap',
        validation: [...V, 'max active traps per caster enforced', 'trap position = caster + aim × forward (server)'], upgradeScaling: { damagePerLevel: 0.05, maxLevel: 10 } },
      { ...staffNormal, id: 'grimoire_binding_script', name: 'Binding Script', nameTh: 'อักษรผนึก', type: 'weapon_skill', weapon: 'grimoire',
        description: 'ยิงอักษรผนึก ทำให้เป้าหมายแรกมึน 1.5 วินาที', damage: { stat: 'matk', mult: 1.2, flat: 6 },
        shape: { kind: 'projectile', speed: 12, range: 8, radius: 0.4, pierce: false }, cooldown: 10, energyCost: 20, castTime: 0.2, animTime: 0.4, moveMultDuringAnim: 0.3,
        effects: [{ kind: 'stun', duration: 1.5 }], pvpMult: 0.7, vfx: 'binding', sfx: 'grim_bind', upgradeScaling: { damagePerLevel: 0.05, maxLevel: 10 } },
      { ...staffNormal, id: 'grimoire_mana_burst', name: 'Mana Burst', nameTh: 'ระเบิดมานา', type: 'weapon_skill', weapon: 'grimoire',
        description: 'ร่าย 0.6 วิ ระเบิดพลังเวทรัศมี 2.6 ช่อง ที่ระยะ 4.5 ช่องข้างหน้า', damage: { stat: 'matk', mult: 2.4, flat: 15 },
        shape: { kind: 'circle', radius: 2.6, forward: 4.5 }, cooldown: 11, energyCost: 30, castTime: 0.6, animTime: 0.7, moveMultDuringAnim: 0,
        effects: [{ kind: 'knockback', distance: 1 }], pvpMult: 0.75, vfx: 'mana_burst', sfx: 'grim_burst', upgradeScaling: { damagePerLevel: 0.05, maxLevel: 10 } },
    ],
  },
  gauntlet: {
    type: 'gauntlet', name: 'Gauntlet', nameTh: 'ถุงมือ', role: 'ต่อสู้ด้วยหมัดและทำลายการป้องกัน', enabled: true, damageStat: 'patk',
    normal: { ...swordNormal, id: 'gauntlet_normal', name: 'Jab', nameTh: 'หมัดตรง', weapon: 'gauntlet', description: 'หมัดเร็ว คอมโบ 4 จังหวะ',
      damage: { stat: 'patk', mult: 0.8, flat: 0 }, shape: { kind: 'arc', range: 1.3, arcDeg: 70 }, cooldown: 0.38, animTime: 0.22, moveMultDuringAnim: 0.6, vfx: 'punch', sfx: 'gauntlet_jab' },
    heavy: { ...swordHeavy, id: 'gauntlet_heavy', name: 'Haymaker', nameTh: 'หมัดเหวี่ยง', weapon: 'gauntlet', description: 'หมัดหนักกระเด็นไกล',
      damage: { stat: 'patk', mult: 2.1, flat: 0 }, shape: { kind: 'arc', range: 1.5, arcDeg: 110 }, cooldown: 1.3, staminaCost: 22, castTime: 0.3, animTime: 0.55,
      effects: [{ kind: 'knockback', distance: 1.8 }], vfx: 'cleave_arc', sfx: 'gauntlet_heavy' },
    combo: { hits: 4, window: 0.8, finisherMult: 1.7 },
    dodge: { distance: 2.8, duration: 0.25, iframes: 0.22, staminaCost: 28, cooldown: 0.5 },
    defensive: { kind: 'block', damageReduction: 0.7, arcDeg: 160, staminaPerSec: 14, energyPerSec: 0, moveMult: 0.35 },
    starterItem: 'wpn_leather_gauntlet',
    skills: [
      { ...swordNormal, id: 'gauntlet_rapid_fist', name: 'Rapid Fist', nameTh: 'หมัดรัว', type: 'weapon_skill', weapon: 'gauntlet',
        description: 'ต่อยรัว 5 ครั้ง', damage: { stat: 'patk', mult: 0.55, flat: 3 }, shape: { kind: 'arc', range: 1.45, arcDeg: 90 }, cooldown: 6, energyCost: 15,
        castTime: 0, animTime: 0.6, moveMultDuringAnim: 0.2, effects: [{ kind: 'multi', hits: 5 }], pvpMult: 0.75, vfx: 'rapid_fist', sfx: 'gauntlet_rapid',
        upgradeScaling: { damagePerLevel: 0.05, maxLevel: 10 } },
      { ...swordNormal, id: 'gauntlet_meteor_punch', name: 'Meteor Punch', nameTh: 'หมัดอุกกาบาต', type: 'weapon_skill', weapon: 'gauntlet',
        description: 'พุ่ง 3.5 ช่องแล้วกระแทก มึน 0.8 วิ ผลักกระเด็น', damage: { stat: 'patk', mult: 2.0, flat: 14 }, shape: { kind: 'line', length: 3.5, width: 1.4 },
        cooldown: 9, energyCost: 22, castTime: 0, animTime: 0.35, moveMultDuringAnim: 0,
        effects: [{ kind: 'dash', distance: 3.5, duration: 0.2 }, { kind: 'stun', duration: 0.8 }, { kind: 'knockback', distance: 1.5 }], pvpMult: 0.75, vfx: 'meteor_punch', sfx: 'gauntlet_meteor',
        validation: [...V, 'dash path collision-checked on server'], upgradeScaling: { damagePerLevel: 0.05, maxLevel: 10 } },
      { ...swordNormal, id: 'gauntlet_iron_body', name: 'Iron Body', nameTh: 'กายเหล็ก', type: 'weapon_skill', weapon: 'gauntlet',
        description: 'ลดความเสียหายที่ได้รับ 40% และไม่ติดมึน/กระเด็น 4 วินาที', damage: undefined, target: 'self', shape: { kind: 'self' },
        cooldown: 16, energyCost: 25, castTime: 0, animTime: 0.3, moveMultDuringAnim: 0.5,
        effects: [{ kind: 'buff_dr', amount: 0.4, duration: 4, superArmor: true }], pvpMult: 0.7, vfx: 'iron_body', sfx: 'gauntlet_iron', upgradeScaling: { damagePerLevel: 0, maxLevel: 10 } },
    ],
  },
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
