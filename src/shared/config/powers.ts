/**
 * The Power — 6 powers × (15 active + 5 ultimate + 5 passive) = 150 abilities.
 * Every ability is a full SkillDef (PART 5.7 fields) resolved by the server's
 * generic effect engine. Balance numbers live only here.
 */
import { COMMON_VALIDATION, type Element, type HitShape, type SkillDef, type SkillEffect } from './skills.ts';
import type { StatKey } from './stats.ts';
import type { WeaponType } from './weapons.ts';

export interface PassiveMods {
  /** +damage vs targets under 50% HP */
  lowHpBonus?: number;
  /** heal this fraction of max HP on kill */
  healOnKill?: number;
  /** +DoT damage */
  dotBonus?: number;
  /** +damage for skills of this power's element */
  elementBonus?: number;
  energyRegenPct?: number;
  /** extra Static Charge per charging hit */
  chargeBonus?: number;
  /** +damage vs frozen/rooted/stunned */
  shatterBonus?: number;
  /** +CC duration applied */
  ccBonus?: number;
  /** in-combat HP regen per second (fraction of max HP) */
  regenPct?: number;
  /** +summon damage */
  summonBonus?: number;
}

export interface PassiveDef {
  id: string;
  name: string;
  nameTh: string;
  description: string;
  type: 'power_passive';
  stats?: Partial<Record<StatKey, number>>;
  statsPct?: Partial<Record<StatKey, number>>;
  mods?: PassiveMods;
  /** chance per hit to apply effects to the target */
  onHit?: { chance: number; effects: SkillEffect[] };
}

export interface PowerDef {
  id: string;
  name: string;
  nameTh: string;
  element: Element;
  type: string;
  color: string;
  /** null = every weapon */
  weapons: WeaponType[] | null;
  strengths: string[];
  weaknesses: string[];
  counterplay: string;
  teamRole: string;
  pve: string;
  pvp: string;
  guildWar: string;
  actives: SkillDef[];
  ultimates: SkillDef[];
  passives: PassiveDef[];
  /** Power-specific Rebirth Ritual material + trial (PART 8.3). */
  ritualItem: string;
  ritualTrial: string;
}

export const POWER_CONFIG = {
  loadout: { actives: 5, ultimates: 1, passives: 3 },
  /** Awakening tiers: how many of each list (in order) are unlocked. */
  awakening: [
    { tier: 1, name: 'Awakening I', actives: 5, ultimates: 1, passives: 2, cost: null },
    { tier: 2, name: 'Awakening II', actives: 10, ultimates: 3, passives: 3, cost: { items: { mat_power_fragment: 20, mat_soul_essence: 60, mat_ancient_rune_dust: 10 }, gold: 30_000, masteryLevel: 5 } },
    { tier: 3, name: 'Awakening III', actives: 15, ultimates: 5, passives: 5, cost: { items: { mat_power_fragment: 40, mat_soul_essence: 150, mat_ancient_rune_dust: 30, mat_ritual_crystal: 5 }, gold: 120_000, masteryLevel: 12 } },
  ] as const,
  /** Guaranteed progress: trade Power Fragments for a Power of your choice at the Sage. */
  exchange: { fragments: 30, gold: 5_000 },
  mastery: { maxLevel: 20, base: 60, exponent: 1.5, xpPerCast: 2, xpPerKill: 3, damagePerLevel: 0.01 },
  ritual: {
    items: { mat_soul_essence: 100, mat_ancient_rune_dust: 50, mat_ritual_crystal: 10, mat_power_soul_fragment: 5, mat_rebirth_core: 1 } as Record<string, number>,
    powerItemQty: 10,
    gold: 100_000,
    cooldownSec: 12 * 3600,
  },
  maxCharges: 10,
  freezeAtStacks: 5,
  freezeDuration: 1.5,
  frostStackDuration: 6,
};

export function masteryXpToNext(level: number): number {
  if (level >= POWER_CONFIG.mastery.maxLevel) return Infinity;
  return Math.round(POWER_CONFIG.mastery.base * Math.pow(level + 1, POWER_CONFIG.mastery.exponent));
}

// ------------------------------------------------------------------ builders
const arc = (range: number, arcDeg: number): HitShape => ({ kind: 'arc', range, arcDeg });
const circ = (radius: number, forward = 0): HitShape => ({ kind: 'circle', radius, forward });
const line = (length: number, width: number): HitShape => ({ kind: 'line', length, width });
const proj = (speed: number, range: number, radius = 0.35, pierce = false): HitShape => ({ kind: 'projectile', speed, range, radius, pierce });
const self: HitShape = { kind: 'self' };

interface Opt {
  dmg?: [number, number];
  shape: HitShape;
  cd: number;
  en: number;
  cast?: number;
  anim?: number;
  move?: number;
  fx?: SkillEffect[];
  pvp?: number;
  counter?: string;
  val?: string[];
}

function mk(power: string, element: Element, type: SkillDef['type'], id: string, name: string, nameTh: string, description: string, o: Opt): SkillDef {
  return {
    id: `${power}_${id}`, name, nameTh, description, type, element, weapon: null, unlockLevel: 1,
    damage: o.dmg ? { stat: 'weapon', mult: o.dmg[0], flat: o.dmg[1] } : undefined,
    target: o.shape.kind === 'self' ? 'self' : 'enemy', shape: o.shape,
    cooldown: o.cd, energyCost: o.en, staminaCost: 0, castTime: o.cast ?? 0, animTime: o.anim ?? (type === 'power_ultimate' ? 0.6 : 0.35),
    moveMultDuringAnim: o.move ?? (o.cast ? 0 : 0.3), effects: o.fx ?? [],
    pvpMult: o.pvp ?? (type === 'power_ultimate' ? 0.5 : 0.7), pveMult: 1,
    vfx: `${power}_${id}`, sfx: `${power}_${id}`,
    validation: [...COMMON_VALIDATION, 'power equipped, ability unlocked by awakening and slotted in loadout', 'power weapon restriction satisfied', ...(o.val ?? [])],
    upgradeScaling: { damagePerLevel: 0.01, maxLevel: POWER_CONFIG.mastery.maxLevel },
    counterplay: o.counter,
  };
}

function builders(power: string, element: Element) {
  return {
    A: (id: string, name: string, nameTh: string, d: string, o: Opt) => mk(power, element, 'power_active', id, name, nameTh, d, o),
    U: (id: string, name: string, nameTh: string, d: string, o: Opt) => mk(power, element, 'power_ultimate', id, name, nameTh, d, o),
    P: (id: string, name: string, nameTh: string, d: string, p: Omit<PassiveDef, 'id' | 'name' | 'nameTh' | 'description' | 'type'>): PassiveDef =>
      ({ id: `${power}_${id}`, name, nameTh, description: d, type: 'power_passive', ...p }),
  };
}

const burn = (dps = 0.15, dur = 3): SkillEffect => ({ kind: 'dot', dpsMult: dps, duration: dur, label: 'burn' });
const poison = (dps = 0.12, dur = 4): SkillEffect => ({ kind: 'dot', dpsMult: dps, duration: dur, label: 'poison' });
const slow = (mult: number, duration: number): SkillEffect => ({ kind: 'slow', mult, duration });
const stun = (duration: number): SkillEffect => ({ kind: 'stun', duration });
const root = (duration: number): SkillEffect => ({ kind: 'root', duration });
const kb = (distance: number): SkillEffect => ({ kind: 'knockback', distance });
const zone = (radius: number, forward: number, duration: number, tick: number, follow = false, healPct?: number): SkillEffect => ({ kind: 'zone', radius, forward, duration, tick, follow, healPct });
const frost = (stacks: number): SkillEffect => ({ kind: 'frost', stacks });
const charge = (gain = 1): SkillEffect => ({ kind: 'charge', gain });
const shield = (hpFraction: number, statMult = 1, duration = 5): SkillEffect => ({ kind: 'shield', hpFraction, stat: 'matk', statMult, duration });
const heal = (pct: number, statMult = 0.5, radius = 0): SkillEffect => ({ kind: 'heal', pct, statMult, radius });
const buff = (duration: number, statsPct?: Partial<Record<StatKey, number>>, stats?: Partial<Record<StatKey, number>>): SkillEffect => ({ kind: 'buff', duration, statsPct, stats });

// ------------------------------------------------------------------ 1. Shadow of Abyss
const S = builders('shadow', 'dark');
const SHADOW: PowerDef = {
  id: 'shadow', name: 'Shadow of Abyss', nameTh: 'เงาแห่งห้วงลึก', element: 'dark', type: 'Darkness / Assassin / Burst', color: '#8a5ad8',
  weapons: ['dagger'],
  strengths: ['ลอบโจมตี', 'ความเร็ว', 'โจมตีด้านหลัง', 'กำจัดตัวทำดาเมจแนวหลัง'],
  weaknesses: ['HP ต่ำ', 'แพ้สกิลตรวจจับ', 'แพ้ AoE', 'ต้องเข้าใกล้เป้าหมาย'],
  counterplay: 'อยู่รวมกลุ่ม ใช้ AoE/CC ใส่ทันทีที่โผล่จากล่องหน, หันหน้าเข้าหา (ลด backstab)',
  teamRole: 'Assassin / Pick-off', pve: 'เคลียร์เป้าเดี่ยวเร็ว เน้นบอสด้วย backstab', pvp: 'ไล่ฆ่าสายเวทและฮีลเลอร์', guildWar: 'อ้อมหลังตัดแนวหลัง',
  ritualItem: 'mat_shadow_fang', ritualTrial: 'ต้องใช้อาวุธ Dagger ในภารกิจ',
  actives: [
    S.A('shadow_dash', 'Shadow Dash', 'พุ่งผ่านเงา', 'พุ่ง 5 ช่องผ่านศัตรู ฟันทุกตัวในเส้นทาง', { dmg: [1.4, 10], shape: line(5, 1.2), cd: 6, en: 15, move: 0, fx: [{ kind: 'dash', distance: 5, duration: 0.22 }] }),
    S.A('dark_kunai', 'Dark Kunai', 'ดาวกระจายแห่งความมืด', 'ปาคุไน 3 อันแบบพัด 30°', { dmg: [0.9, 5], shape: proj(18, 8, 0.25), cd: 4, en: 12, fx: [{ kind: 'spread', count: 3, angleDeg: 30 }] }),
    S.A('smoke_veil', 'Smoke Veil', 'หมอกบดบัง', 'ปล่อยหมอกรอบตัว ศัตรูช้าลง และล่องหน 3 วินาที', { shape: circ(2.5), cd: 14, en: 20, fx: [slow(0.5, 2), { kind: 'stealth', duration: 3 }] }),
    S.A('silent_kill', 'Silent Kill', 'สังหารเงียบ', 'แทงรุนแรง ×2 ถ้าเป้าหมาย HP < 30%, +50% จากด้านหลัง', { dmg: [2.2, 20], shape: arc(1.5, 80), cd: 12, en: 25, fx: [{ kind: 'execute', threshold: 0.3, mult: 2 }, { kind: 'backstab', mult: 1.5 }] }),
    S.A('shadow_clone', 'Shadow Clone', 'ร่างแยกเงา', 'อัญเชิญร่างแยก 1 ตัว ช่วยโจมตี 8 วินาที', { shape: self, cd: 18, en: 25, fx: [{ kind: 'summon', summon: 'shadow_clone', count: 1, duration: 8, atkMult: 0.5, interval: 0.8, range: 5 }] }),
    S.A('night_fang', 'Night Fang', 'เขี้ยวราตรี', 'แทงต่อเนื่อง 3 ครั้ง', { dmg: [0.7, 4], shape: arc(1.5, 90), cd: 6, en: 15, fx: [{ kind: 'multi', hits: 3 }, { kind: 'backstab', mult: 1.3 }] }),
    S.A('dark_trap', 'Dark Trap', 'กับดักเงา', 'วางกับดักเงา (สูงสุด 2) ตรึงศัตรู 2.5 วินาที', { dmg: [1.6, 10], shape: circ(1.5, 2), cd: 10, en: 15, fx: [{ kind: 'trap', radius: 1.5, armSec: 0.5, lifeSec: 20, maxActive: 2 }, root(2.5)] }),
    S.A('abyss_pull', 'Abyss Pull', 'ดึงสู่ห้วงลึก', 'โซ่เงาดึงเป้าหมายแรกเข้าหาตัว 4 ช่อง', { dmg: [0.8, 5], shape: proj(14, 7, 0.4), cd: 9, en: 15, fx: [{ kind: 'pull', distance: 4 }] }),
    S.A('phantom_walk', 'Phantom Walk', 'ย่างภูต', 'ความเร็วเคลื่อนที่ +40% 5 วินาที และล่องหน 2 วินาที', { shape: self, cd: 15, en: 15, fx: [buff(5, { moveSpeed: 0.4 }), { kind: 'stealth', duration: 2 }] }),
    S.A('shadow_swap', 'Shadow Swap', 'สลับเงา', 'วาร์ปไปข้างหน้า 6 ช่องผ่านเงา', { shape: self, cd: 8, en: 10, fx: [{ kind: 'blink', distance: 6 }], val: ['blink destination collision-checked'] }),
    S.A('dark_mark', 'Dark Mark', 'ตราแห่งความมืด', 'ตราที่ทำให้เป้าหมายรับดาเมจ +20% 6 วินาที', { dmg: [0.5, 0], shape: proj(20, 9, 0.3), cd: 10, en: 10, fx: [{ kind: 'vuln', amount: 0.2, duration: 6 }] }),
    S.A('black_shuriken', 'Black Shuriken', 'ดาวกระจายดำ', 'ดาวกระจายหมุนรอบตัวรัศมี 3 ช่อง', { dmg: [1.3, 8], shape: circ(3), cd: 8, en: 20 }),
    S.A('nightmare_strike', 'Nightmare Strike', 'ฝันร้าย', 'แทงทะลุเกราะ 50%', { dmg: [1.8, 12], shape: arc(1.6, 90), cd: 9, en: 20, fx: [{ kind: 'pierce_def', amount: 0.5 }] }),
    S.A('shadow_bind', 'Shadow Bind', 'พันธนาการเงา', 'ตรึงเป้าหมายแรก 2.5 วินาที', { dmg: [0.6, 0], shape: proj(16, 7, 0.4), cd: 12, en: 15, fx: [root(2.5)] }),
    S.A('vanish', 'Vanish', 'หายตัว', 'ล่องหน 4 วินาที และล้างสถานะช้า/ตรึง', { shape: self, cd: 20, en: 20, fx: [{ kind: 'stealth', duration: 4 }, { kind: 'cleanse' }] }),
  ],
  ultimates: [
    S.U('domain_of_darkness', 'Domain of Darkness', 'อาณาเขตแห่งความมืด', 'สร้างอาณาเขตความมืดรัศมี 5 ช่องรอบตัว 6 วินาที ดาเมจทุก 0.5 วิ และทำให้ช้า', { dmg: [0.5, 4], shape: self, cd: 60, en: 50, cast: 0.3, fx: [zone(5, 0, 6, 0.5, true), slow(0.6, 1)], counter: 'เดินออกจากอาณาเขต (ขอบมองเห็นได้) หรือ cleanse' }),
    S.U('thousand_shadow_cuts', 'Thousand Shadow Cuts', 'พันคมเงา', 'ฟันรอบตัว 8 ครั้งรัศมี 3.5 ช่อง', { dmg: [0.6, 4], shape: circ(3.5), cd: 50, en: 45, cast: 0.2, fx: [{ kind: 'multi', hits: 8 }], counter: 'ร่าย 0.2 วิ — dodge ออกจากรัศมี หรือ stun ขัด' }),
    S.U('abyss_execution', 'Abyss Execution', 'ประหารห้วงลึก', 'วาร์ปหลังเป้าหมายในระยะ 6 แล้วแทงประหาร ×2.5 ถ้า HP < 40%', { dmg: [4, 40], shape: arc(1.6, 100), cd: 45, en: 40, fx: [{ kind: 'blink_behind', range: 6, coneDeg: 90 }, { kind: 'execute', threshold: 0.4, mult: 2.5 }, { kind: 'backstab', mult: 1.3 }], counter: 'รักษา HP ไว้เหนือ 40% และหันหลังชิดกำแพง (ไม่มีที่ให้วาร์ป)' }),
    S.U('night_army', 'Night Army', 'กองทัพราตรี', 'อัญเชิญร่างแยกเงา 3 ตัว 10 วินาที', { shape: self, cd: 75, en: 60, fx: [{ kind: 'summon', summon: 'shadow_clone', count: 3, duration: 10, atkMult: 0.6, interval: 0.8, range: 6 }], counter: 'ใช้ AoE ใส่ผู้ใช้ — ร่างแยกหายเมื่อผู้ใช้ตาย' }),
    S.U('shadow_monarch', 'Shadow Monarch', 'จักรพรรดิเงา', 'แปลงร่าง 10 วินาที: ATK +30%, ความเร็วโจมตี +25%, คริ +15%', { shape: self, cd: 90, en: 60, fx: [buff(10, { patk: 0.3, matk: 0.3, atkSpd: 0.25 }, { critRate: 0.15 }), { kind: 'stealth', duration: 1 }], counter: 'ถอยและใช้ CC ประวิงเวลา 10 วินาที' }),
  ],
  passives: [
    S.P('shadow_predator', 'Shadow Predator', 'นักล่าแห่งเงา', 'ดาเมจ +20% ต่อเป้าหมาย HP ต่ำกว่า 50%', { mods: { lowHpBonus: 0.2 } }),
    S.P('silent_assassin', 'Silent Assassin', 'นักฆ่าเงียบ', 'อัตราคริติคอล +8%', { stats: { critRate: 0.08 } }),
    S.P('dark_recovery', 'Dark Recovery', 'ฟื้นฟูแห่งความมืด', 'ฟื้น HP 3% เมื่อสังหารศัตรู', { mods: { healOnKill: 0.03 } }),
    S.P('evasion_master', 'Evasion Master', 'ปรมาจารย์การหลบ', 'หลบหลีก +6%', { stats: { evasion: 0.06 } }),
    S.P('night_hunter', 'Night Hunter', 'นักล่ารัตติกาล', 'Physical ATK +8%, ความเร็ว +0.3', { statsPct: { patk: 0.08 }, stats: { moveSpeed: 0.3 } }),
  ],
};

// ------------------------------------------------------------------ 2. Solar Inferno
const F = builders('solar', 'fire');
const SOLAR: PowerDef = {
  id: 'solar', name: 'Solar Inferno', nameTh: 'อัคคีสุริยะ', element: 'fire', type: 'Fire / AoE / Burn', color: '#ff7a2a', weapons: null,
  strengths: ['AoE สูง', 'Burn Damage', 'เคลียร์มอนสเตอร์', 'สงครามพื้นที่'],
  weaknesses: ['ใช้ Energy สูง', 'ต้องบริหารเวลาร่าย', 'แพ้ Fire Resistance'],
  counterplay: 'ขัดจังหวะตอนร่าย, เดินออกจากพื้นที่ไฟ, ใส่ Fire Resistance',
  teamRole: 'AoE DPS / Zone control', pve: 'เคลียร์ฝูงมอนเร็วที่สุด', pvp: 'บีบพื้นที่ บังคับให้ศัตรูขยับ', guildWar: 'ปิดทางเข้า/จุดยึดด้วยพื้นที่ไฟ',
  ritualItem: 'mat_solar_ember', ritualTrial: 'ต้องจุดแท่นไฟ 3 จุด',
  actives: [
    F.A('fire_bullet', 'Fire Bullet', 'กระสุนไฟ', 'ยิงลูกไฟ ติดไฟ 3 วินาที', { dmg: [1.2, 6], shape: proj(16, 8), cd: 2.5, en: 10, fx: [burn()] }),
    F.A('flame_dash', 'Flame Dash', 'พุ่งเปลวไฟ', 'พุ่ง 4 ช่องทิ้งเปลวไฟ ติดไฟศัตรูในเส้นทาง', { dmg: [1.1, 6], shape: line(4, 1.2), cd: 7, en: 15, move: 0, fx: [{ kind: 'dash', distance: 4, duration: 0.2 }, burn()] }),
    F.A('burning_ground', 'Burning Ground', 'พื้นลุกไหม้', 'พื้นไฟรัศมี 2.2 ข้างหน้า 3 ช่อง 5 วินาที', { dmg: [0.3, 2], shape: self, cd: 10, en: 20, fx: [zone(2.2, 3, 5, 0.5), burn(0.1, 2)] }),
    F.A('fire_wall', 'Fire Wall', 'กำแพงไฟ', 'กำแพงไฟข้างหน้า 2.5 ช่อง 6 วินาที ผลักศัตรูที่เข้ามา', { dmg: [0.35, 2], shape: self, cd: 12, en: 25, fx: [zone(1.6, 2.5, 6, 0.5), kb(0.6)] }),
    F.A('inferno_punch', 'Inferno Punch', 'หมัดนรก', 'หมัดไฟกระแทกแรง ผลักกระเด็น', { dmg: [1.8, 10], shape: arc(1.6, 100), cd: 7, en: 15, fx: [kb(1.5), burn()] }),
    F.A('flame_spear', 'Flame Spear', 'หอกเพลิง', 'หอกไฟทะลุทุกเป้าหมาย 10 ช่อง', { dmg: [1.6, 12], shape: proj(20, 10, 0.4, true), cd: 6, en: 18, fx: [burn(0.1, 2)] }),
    F.A('heat_wave', 'Heat Wave', 'คลื่นความร้อน', 'คลื่นความร้อนรอบตัว ผลักศัตรู', { dmg: [1.0, 8], shape: circ(3), cd: 9, en: 20, fx: [kb(1.8)] }),
    F.A('ember_rain', 'Ember Rain', 'ฝนถ่านเพลิง', 'ฝนถ่านไฟที่ระยะ 4 ช่อง 3 วินาที', { dmg: [0.45, 3], shape: self, cd: 12, en: 25, cast: 0.3, fx: [zone(2.5, 4, 3, 0.5)] }),
    F.A('fire_shield', 'Fire Shield', 'โล่เพลิง', 'โล่ดูดซับ 12% HP และไอร้อนเผาศัตรูรอบตัว 4 วินาที', { dmg: [0.2, 0], shape: self, cd: 15, en: 20, fx: [shield(0.12, 1, 4), zone(1.5, 0, 4, 0.5, true)] }),
    F.A('flame_tornado', 'Flame Tornado', 'ทอร์นาโดเพลิง', 'ทอร์นาโดไฟเคลื่อนช้า ทะลุศัตรู', { dmg: [1.4, 8], shape: proj(6, 8, 0.8, true), cd: 11, en: 25, fx: [burn()] }),
    F.A('solar_mark', 'Solar Mark', 'ตราสุริยะ', 'ทำให้เป้าหมายรับดาเมจ +20% 6 วินาที', { dmg: [0.5, 0], shape: proj(20, 9, 0.3), cd: 10, en: 10, fx: [{ kind: 'vuln', amount: 0.2, duration: 6 }] }),
    F.A('explosive_flame', 'Explosive Flame', 'เปลวระเบิด', 'ร่าย 0.5 วิ ระเบิดไฟที่ระยะ 3.5 ช่อง', { dmg: [2.4, 16], shape: circ(2, 3.5), cd: 10, en: 25, cast: 0.5, fx: [burn()] }),
    F.A('phoenix_step', 'Phoenix Step', 'ก้าวหงส์ไฟ', 'วาร์ปไปข้างหน้า 5 ช่อง และฟื้น HP 5%', { shape: self, cd: 9, en: 15, fx: [{ kind: 'blink', distance: 5 }, heal(0.05, 0)] }),
    F.A('lava_burst', 'Lava Burst', 'ลาวาปะทุ', 'ร่าย 0.4 วิ ลาวาปะทุรอบตัว ทำให้มึน', { dmg: [2.0, 14], shape: circ(2.6), cd: 12, en: 30, cast: 0.4, fx: [stun(0.5), burn()] }),
    F.A('flame_chain', 'Flame Chain', 'โซ่เพลิง', 'ไฟกระโดดไปยังศัตรูใกล้เคียง 3 ครั้ง', { dmg: [1.2, 6], shape: proj(18, 8), cd: 8, en: 18, fx: [{ kind: 'chain', jumps: 3, range: 4 }, burn()] }),
  ],
  ultimates: [
    F.U('miniature_sun', 'Miniature Sun', 'ดวงอาทิตย์จิ๋ว', 'สร้างดวงอาทิตย์ที่ระยะ 4 ช่อง เผาทุกอย่างรัศมี 4 เป็นเวลา 6 วินาที', { dmg: [0.7, 6], shape: self, cd: 60, en: 55, cast: 0.5, fx: [zone(4, 4, 6, 0.5), burn(0.15, 2)], counter: 'ร่าย 0.5 วิ — ออกจากรัศมีหรือขัดด้วย stun' }),
    F.U('phoenix_rebirth', 'Phoenix Rebirth', 'หงส์คืนชีพ', 'ภายใน 20 วินาที ถ้าจะตายจะฟื้นทันทีด้วย HP 50%', { shape: self, cd: 120, en: 40, fx: [{ kind: 'cheat_death', duration: 20, hpPct: 0.5 }], counter: 'บีบให้ใช้ก่อน แล้วรอ 20 วินาทีหรือใช้ burst สองระลอก' }),
    F.U('hellfire_domain', 'Hellfire Domain', 'อาณาเขตนรก', 'อาณาเขตนรกรัศมี 6 รอบตัว 8 วินาที ทำให้ช้า', { dmg: [0.5, 4], shape: self, cd: 75, en: 60, cast: 0.3, fx: [zone(6, 0, 8, 0.5, true), burn(0.1, 2), slow(0.7, 1)], counter: 'ตัดระยะออกจากผู้ใช้ — อาณาเขตตามตัวผู้ใช้' }),
    F.U('solar_dragon', 'Solar Dragon', 'มังกรสุริยะ', 'มังกรไฟพุ่งทะลุทุกอย่าง 14 ช่อง', { dmg: [4, 40], shape: proj(12, 14, 1.2, true), cd: 50, en: 50, cast: 0.5, fx: [burn(0.2, 4)], counter: 'ร่าย 0.5 วิ และพุ่งเป็นเส้นตรง — dodge ด้านข้าง' }),
    F.U('inferno_awakening', 'Inferno Awakening', 'ปลุกนรก', 'ATK +35% 12 วินาที พร้อมออร่าไฟรอบตัว', { dmg: [0.25, 2], shape: self, cd: 90, en: 60, fx: [buff(12, { patk: 0.35, matk: 0.35 }), zone(2, 0, 12, 0.5, true)], counter: 'ประวิงเวลาด้วยระยะห่างและ CC' }),
  ],
  passives: [
    F.P('burning_soul', 'Burning Soul', 'วิญญาณลุกโชน', 'ดาเมจ Burn +30%', { mods: { dotBonus: 0.3 } }),
    F.P('flame_mastery', 'Flame Mastery', 'ปรมาจารย์เพลิง', 'ดาเมจธาตุไฟ +10%', { mods: { elementBonus: 0.1 } }),
    F.P('heat_resistance', 'Heat Resistance', 'ทนความร้อน', 'ต้านทานธาตุ +10%, HP +5%', { stats: { elemRes: 0.1 }, statsPct: { hp: 0.05 } }),
    F.P('chain_burn', 'Chain Burn', 'ไฟลามทุ่ง', 'การโจมตีมีโอกาส 15% ติดไฟ', { onHit: { chance: 0.15, effects: [burn(0.12, 3)] } }),
    F.P('solar_energy', 'Solar Energy', 'พลังสุริยะ', 'ฟื้นฟู Energy +30%', { mods: { energyRegenPct: 0.3 } }),
  ],
};

// ------------------------------------------------------------------ 3. Thunder Sovereign
const T = builders('thunder', 'lightning');
const THUNDER: PowerDef = {
  id: 'thunder', name: 'Thunder Sovereign', nameTh: 'จักรพรรดิอสนี', element: 'lightning', type: 'Lightning / Speed / Combo', color: '#ffe14a', weapons: null,
  strengths: ['คอมโบเร็ว', 'ความเร็วสูง', 'ระเบิดประจุ Static Charge'],
  weaknesses: ['ต้องสะสมประจุก่อนระเบิด', 'ถูกตัดคอมโบด้วย CC', 'ทนทานปานกลาง'],
  counterplay: 'ใช้ CC ตัดจังหวะก่อนประจุเต็ม, ถอยออกนอกระยะ chain',
  teamRole: 'Skirmisher / Burst', pve: 'คอมโบไล่ฝูงด้วย chain', pvp: 'เข้า-ออกเร็ว ระเบิดประจุจบ', guildWar: 'วิ่งแย่งจุดยึด ทำดาเมจกระจาย',
  ritualItem: 'mat_thunder_heart', ritualTrial: 'ป้องกันเสาสายฟ้า',
  actives: [
    T.A('lightning_bolt', 'Lightning Bolt', 'สายฟ้าฟาด', 'ยิงสายฟ้าเร็ว +1 ประจุ', { dmg: [1.2, 6], shape: proj(24, 9, 0.3), cd: 2.5, en: 8, fx: [charge()] }),
    T.A('thunder_step', 'Thunder Step', 'ก้าวอสนี', 'วาร์ป 6 ช่อง ปล่อยไฟฟ้ารอบตัวทำให้มึน', { dmg: [0.8, 4], shape: circ(1.6), cd: 8, en: 15, fx: [{ kind: 'blink', distance: 6 }, stun(0.5), charge()] }),
    T.A('electric_chain', 'Electric Chain', 'โซ่ไฟฟ้า', 'สายฟ้ากระโดด 4 เป้าหมาย', { dmg: [1.1, 6], shape: proj(22, 8, 0.3), cd: 6, en: 15, fx: [{ kind: 'chain', jumps: 4, range: 4.5 }, charge()] }),
    T.A('volt_strike', 'Volt Strike', 'โวลต์สไตรก์', 'ฟาดไฟฟ้า ทำให้มึนสั้นๆ', { dmg: [1.6, 8], shape: arc(1.7, 110), cd: 5, en: 12, fx: [stun(0.4), charge()] }),
    T.A('static_field', 'Static Field', 'สนามไฟฟ้าสถิต', 'สนามไฟฟ้ารอบตัว 5 วินาที สะสมประจุ', { dmg: [0.3, 2], shape: self, cd: 12, en: 20, fx: [zone(2.5, 0, 5, 0.5, true), charge()] }),
    T.A('thunder_kick', 'Thunder Kick', 'เตะอสนี', 'เตะผลักกระเด็น 2 ช่อง', { dmg: [1.5, 8], shape: arc(1.6, 100), cd: 6, en: 12, fx: [kb(2), charge()] }),
    T.A('flash_counter', 'Flash Counter', 'สวนกลับแสงวาบ', 'ตั้งรับ 0.8 วิ ถ้าถูกโจมตีจะสวนไฟฟ้ารอบตัวและทำให้มึน', { dmg: [2.2, 10], shape: self, cd: 12, en: 15, anim: 0.8, move: 0, fx: [{ kind: 'counter', window: 0.8, damageMult: 2.2, range: 2.5, stunDuration: 0.6 }] }),
    T.A('lightning_spear', 'Lightning Spear', 'หอกสายฟ้า', 'หอกสายฟ้าทะลุ 11 ช่อง', { dmg: [1.7, 12], shape: proj(28, 11, 0.35, true), cd: 7, en: 18, fx: [charge()] }),
    T.A('thunder_trap', 'Thunder Trap', 'กับดักอสนี', 'วางกับดักที่ทำให้มึน 1.5 วินาที', { dmg: [1.5, 8], shape: circ(1.6, 2), cd: 10, en: 15, fx: [{ kind: 'trap', radius: 1.6, armSec: 0.5, lifeSec: 20, maxActive: 2 }, stun(1.5)] }),
    T.A('overcharge', 'Overcharge', 'ประจุเกิน', 'ความเร็วโจมตี +30% 6 วินาที และ +3 ประจุ', { shape: self, cd: 18, en: 20, fx: [buff(6, { atkSpd: 0.3 }), charge(3)] }),
    T.A('shock_pulse', 'Shock Pulse', 'คลื่นช็อก', 'คลื่นไฟฟ้ารอบตัว ทำให้ช้า', { dmg: [1.1, 6], shape: circ(2.8), cd: 8, en: 18, fx: [slow(0.6, 2), charge()] }),
    T.A('storm_arrow', 'Storm Arrow', 'ศรพายุ', 'ยิงสายฟ้า 3 ลำแบบพัด', { dmg: [0.9, 5], shape: proj(22, 9, 0.25), cd: 6, en: 15, fx: [{ kind: 'spread', count: 3, angleDeg: 20 }, charge()] }),
    T.A('volt_armor', 'Volt Armor', 'เกราะโวลต์', 'โล่ 10% HP และความเร็ว +20% 5 วินาที', { shape: self, cd: 15, en: 20, fx: [shield(0.1, 1, 5), buff(5, { moveSpeed: 0.2 })] }),
    T.A('electric_prison', 'Electric Prison', 'คุกไฟฟ้า', 'ขังศัตรูที่ระยะ 3.5 ช่อง ตรึง 2.5 วินาที', { dmg: [0.8, 4], shape: circ(2, 3.5), cd: 14, en: 25, cast: 0.3, fx: [root(2.5), charge()] }),
    T.A('thunder_burst', 'Thunder Burst', 'ระเบิดอสนี', 'ระเบิดประจุทั้งหมด +35% ดาเมจต่อประจุ', { dmg: [1.0, 8], shape: circ(3), cd: 10, en: 20, fx: [{ kind: 'consume_charge', multPer: 0.35 }] }),
  ],
  ultimates: [
    T.U('thunder_god_form', 'Thunder God Form', 'ร่างเทพอสนี', 'แปลงร่าง 12 วินาที: ATK +25%, ความเร็วโจมตี +30%, ความเร็ว +30%', { shape: self, cd: 90, en: 60, fx: [buff(12, { patk: 0.25, matk: 0.25, atkSpd: 0.3, moveSpeed: 0.3 }), charge(5)], counter: 'ถอยและใช้ slow/root ทำให้ความเร็วไร้ผล' }),
    T.U('judgment_lightning', 'Judgment Lightning', 'สายฟ้าพิพากษา', 'ร่าย 0.7 วิ สายฟ้าลงที่ระยะ 5 ช่อง รัศมี 3 มึน 1 วินาที', { dmg: [4.5, 40], shape: circ(3, 5), cd: 55, en: 50, cast: 0.7, fx: [stun(1)], counter: 'มีวงเตือน 0.7 วิ — ออกจากวง' }),
    T.U('storm_domain', 'Storm Domain', 'อาณาเขตพายุ', 'พายุรัศมี 6 รอบตัว 8 วินาที สะสมประจุ', { dmg: [0.5, 4], shape: self, cd: 75, en: 60, cast: 0.3, fx: [zone(6, 0, 8, 0.5, true), charge()], counter: 'ออกจากรัศมี — พายุตามตัวผู้ใช้' }),
    T.U('one_million_volts', 'One Million Volts', 'ล้านโวลต์', 'ร่าย 0.8 วิ ระเบิดไฟฟ้ารัศมี 4.5 ใช้ประจุทั้งหมด +40%/ประจุ', { dmg: [5, 50], shape: circ(4.5), cd: 60, en: 60, cast: 0.8, fx: [{ kind: 'consume_charge', multPer: 0.4 }, stun(0.8)], counter: 'ร่ายนาน 0.8 วิ — ขัดด้วย stun หรือ dodge ออก' }),
    T.U('lightning_clone_army', 'Lightning Clone Army', 'กองทัพร่างอสนี', 'อัญเชิญร่างสายฟ้า 3 ตัว 10 วินาที', { shape: self, cd: 75, en: 60, fx: [{ kind: 'summon', summon: 'lightning_clone', count: 3, duration: 10, atkMult: 0.55, interval: 0.7, range: 6 }], counter: 'โฟกัสผู้ใช้ — ร่างหายเมื่อผู้ใช้ตาย' }),
  ],
  passives: [
    T.P('lightning_reflex', 'Lightning Reflex', 'ปฏิกิริยาสายฟ้า', 'ความเร็วโจมตี +8%', { stats: { atkSpd: 0.08 } }),
    T.P('static_charge', 'Static Charge', 'ประจุสถิต', 'ได้ประจุเพิ่ม +1 ทุกครั้งที่สะสม', { mods: { chargeBonus: 1 } }),
    T.P('thunder_blood', 'Thunder Blood', 'โลหิตอสนี', 'HP +6%, ความเร็ว +0.2', { statsPct: { hp: 0.06 }, stats: { moveSpeed: 0.2 } }),
    T.P('electric_critical', 'Electric Critical', 'คริติคอลไฟฟ้า', 'ดาเมจคริติคอล +20%', { stats: { critDmg: 0.2 } }),
    T.P('storm_runner', 'Storm Runner', 'นักวิ่งพายุ', 'ความเร็ว +0.4, หลบหลีก +3%', { stats: { moveSpeed: 0.4, evasion: 0.03 } }),
  ],
};

// ------------------------------------------------------------------ 4. Eternal Frost
const I = builders('frost', 'ice');
const FROST: PowerDef = {
  id: 'frost', name: 'Eternal Frost', nameTh: 'น้ำแข็งนิรันดร์', element: 'ice', type: 'Ice / Control / Defense', color: '#7ad8ff', weapons: null,
  strengths: ['ควบคุม (Frost Stack → Freeze)', 'ป้องกัน/โล่', 'ชะลอศัตรู'],
  weaknesses: ['Burst ต่ำ', 'ต้องสะสม stack ก่อน freeze', 'PvP มี Diminishing Returns ของ Freeze'],
  counterplay: 'cleanse/CC resist, หลบ projectile เพื่อไม่ให้สะสม stack',
  teamRole: 'Controller / Off-tank', pve: 'คุมฝูงให้ทีมปลอดภัย', pvp: 'ล็อกเป้าให้ทีมจบ (มี DR)', guildWar: 'ชะลอการบุก ป้องกันจุด',
  ritualItem: 'mat_frozen_tear', ritualTrial: 'ทำลายผลึกน้ำแข็งต้องสาป',
  actives: [
    I.A('ice_shard', 'Ice Shard', 'เกล็ดน้ำแข็ง', 'ยิงเกล็ดน้ำแข็ง +1 Frost Stack', { dmg: [1.1, 6], shape: proj(18, 9, 0.3), cd: 2.5, en: 8, fx: [frost(1)] }),
    I.A('frost_nova', 'Frost Nova', 'โนวาน้ำแข็ง', 'ระเบิดความเย็นรอบตัว +2 Stack และทำให้ช้า', { dmg: [1.0, 6], shape: circ(2.8), cd: 9, en: 20, fx: [frost(2), slow(0.6, 2)] }),
    I.A('ice_wall', 'Ice Wall', 'กำแพงน้ำแข็ง', 'กำแพงน้ำแข็งข้างหน้า 6 วินาที ทำให้ช้ามาก', { dmg: [0.1, 0], shape: self, cd: 14, en: 20, fx: [zone(1.8, 2.5, 6, 0.5), slow(0.3, 1)] }),
    I.A('frozen_spear', 'Frozen Spear', 'หอกเยือกแข็ง', 'หอกน้ำแข็งทะลุ +2 Stack', { dmg: [1.5, 10], shape: proj(20, 10, 0.4, true), cd: 7, en: 18, fx: [frost(2)] }),
    I.A('snow_dash', 'Snow Dash', 'พุ่งหิมะ', 'พุ่ง 4 ช่อง +1 Stack ให้ศัตรูในเส้นทาง', { dmg: [0.8, 4], shape: line(4, 1.2), cd: 7, en: 12, move: 0, fx: [{ kind: 'dash', distance: 4, duration: 0.2 }, frost(1)] }),
    I.A('crystal_shield', 'Crystal Shield', 'โล่ผลึก', 'โล่ 18% HP 6 วินาที', { shape: self, cd: 14, en: 20, fx: [shield(0.18, 1.2, 6)] }),
    I.A('ice_prison', 'Ice Prison', 'คุกน้ำแข็ง', 'ตรึงเป้าหมายแรก 3 วินาที +2 Stack', { dmg: [0.6, 0], shape: proj(16, 8, 0.4), cd: 14, en: 20, fx: [root(3), frost(2)] }),
    I.A('blizzard', 'Blizzard', 'พายุหิมะ', 'พายุหิมะที่ระยะ 4 ช่อง 6 วินาที', { dmg: [0.35, 2], shape: self, cd: 14, en: 30, cast: 0.4, fx: [zone(3, 4, 6, 0.5), frost(1), slow(0.6, 1)] }),
    I.A('frozen_ground', 'Frozen Ground', 'พื้นเยือกแข็ง', 'พื้นน้ำแข็งรอบตัว 5 วินาที', { dmg: [0.15, 0], shape: self, cd: 12, en: 15, fx: [zone(2.5, 0, 5, 0.5), slow(0.5, 1), frost(1)] }),
    I.A('frost_blade', 'Frost Blade', 'ใบมีดเยือกแข็ง', 'ฟันด้วยใบมีดน้ำแข็ง +2 Stack', { dmg: [1.7, 10], shape: arc(1.8, 120), cd: 6, en: 15, fx: [frost(2)] }),
    I.A('ice_mirror', 'Ice Mirror', 'กระจกน้ำแข็ง', 'สร้างร่างกระจกช่วยโจมตี 6 วินาที และล่องหน 2 วินาที', { shape: self, cd: 18, en: 20, fx: [{ kind: 'summon', summon: 'ice_mirror', count: 1, duration: 6, atkMult: 0.4, interval: 1, range: 5 }, { kind: 'stealth', duration: 2 }] }),
    I.A('crystal_spike', 'Crystal Spike', 'หนามผลึก', 'หนามน้ำแข็งพุ่งจากพื้นเป็นแนว 6 ช่อง ทำให้มึน', { dmg: [1.6, 10], shape: line(6, 1), cd: 9, en: 20, fx: [stun(0.5), frost(1)] }),
    I.A('cold_snap', 'Cold Snap', 'เยือกฉับพลัน', 'ดาเมจ ×2 ต่อศัตรูที่แข็ง/ถูกตรึง', { dmg: [0.8, 6], shape: circ(3), cd: 8, en: 15, fx: [{ kind: 'shatter', mult: 2 }] }),
    I.A('snowfall', 'Snowfall', 'หิมะโปรย', 'หิมะตกที่ระยะ 3 ช่อง 4 วินาที', { dmg: [0.2, 0], shape: self, cd: 12, en: 20, fx: [zone(3.5, 3, 4, 1), slow(0.5, 1.5), frost(1)] }),
    I.A('frozen_pulse', 'Frozen Pulse', 'ชีพจรน้ำแข็ง', 'คลื่นน้ำแข็งรอบตัว +2 Stack', { dmg: [1.3, 8], shape: circ(2.2), cd: 8, en: 15, fx: [frost(2)] }),
  ],
  ultimates: [
    I.U('absolute_zero', 'Absolute Zero', 'ศูนย์สัมบูรณ์', 'ร่าย 0.8 วิ แช่แข็งทุกอย่างรัศมี 5 (+5 Stack)', { dmg: [3.5, 30], shape: circ(5), cd: 70, en: 60, cast: 0.8, fx: [frost(5)], counter: 'ร่าย 0.8 วิ — ออกจากรัศมี; PvP มี DR ของ Freeze' }),
    I.U('ice_kingdom', 'Ice Kingdom', 'อาณาจักรน้ำแข็ง', 'อาณาเขตน้ำแข็งรัศมี 6 รอบตัว 8 วินาที', { dmg: [0.3, 2], shape: self, cd: 75, en: 60, cast: 0.3, fx: [zone(6, 0, 8, 0.5, true), frost(1), slow(0.6, 1)], counter: 'ออกจากอาณาเขตก่อน stack ครบ 5' }),
    I.U('frost_titan', 'Frost Titan', 'ไททันน้ำแข็ง', 'แปลงร่าง 12 วินาที: DEF +50%, ATK +20%, ไม่ติดมึน/กระเด็น', { shape: self, cd: 90, en: 60, fx: [buff(12, { pdef: 0.5, mdef: 0.5, patk: 0.2, matk: 0.2 }), { kind: 'buff_dr', amount: 0.15, duration: 12, superArmor: true }], counter: 'ไม่ต้องปะทะตรงๆ ใช้ระยะและ kite' }),
    I.U('eternal_blizzard', 'Eternal Blizzard', 'พายุหิมะนิรันดร์', 'พายุหิมะรุนแรงที่ระยะ 4 ช่อง รัศมี 5 เป็นเวลา 8 วินาที', { dmg: [0.55, 4], shape: self, cd: 70, en: 60, cast: 0.6, fx: [zone(5, 4, 8, 0.5), frost(1), slow(0.5, 1)], counter: 'ร่าย 0.6 วิ ตำแหน่งตายตัว — ออกจากพื้นที่' }),
    I.U('crystal_awakening', 'Crystal Awakening', 'ปลุกผลึก', 'ATK +30% 12 วินาที และโล่ 15% HP', { shape: self, cd: 90, en: 60, fx: [buff(12, { patk: 0.3, matk: 0.3 }), shield(0.15, 1, 12)], counter: 'ทำลายโล่ก่อนแล้วจึง burst' }),
  ],
  passives: [
    I.P('frost_mastery', 'Frost Mastery', 'ปรมาจารย์น้ำแข็ง', 'ดาเมจธาตุน้ำแข็ง +10%', { mods: { elementBonus: 0.1 } }),
    I.P('ice_armor', 'Ice Armor', 'เกราะน้ำแข็ง', 'PDEF/MDEF +12%', { statsPct: { pdef: 0.12, mdef: 0.12 } }),
    I.P('frozen_heart', 'Frozen Heart', 'หัวใจน้ำแข็ง', 'ต้านทาน CC +10%, HP +5%', { stats: { ccRes: 0.1 }, statsPct: { hp: 0.05 } }),
    I.P('cold_blood', 'Cold Blood', 'เลือดเย็น', 'อัตราคริติคอล +5%', { stats: { critRate: 0.05 } }),
    I.P('shatter', 'Shatter', 'แตกละเอียด', 'ดาเมจ +30% ต่อศัตรูที่แข็ง/ถูกตรึง/มึน', { mods: { shatterBonus: 0.3 } }),
  ],
};

// ------------------------------------------------------------------ 5. Gravity Dominion
const G = builders('gravity', 'gravity');
const GRAVITY: PowerDef = {
  id: 'gravity', name: 'Gravity Dominion', nameTh: 'ผู้ครองแรงโน้มถ่วง', element: 'gravity', type: 'Gravity / Tank / Control', color: '#9a7aff',
  weapons: ['sword', 'staff', 'gauntlet'],
  strengths: ['เปิดการต่อสู้', 'ดึงศัตรูรวมกลุ่ม', 'ควบคุมพื้นที่', 'แทงก์ Guild War'],
  weaknesses: ['คูลดาวน์สูง', 'โจมตีระยะไกลได้จำกัด', 'ความคล่องตัวต่ำในรูปแบบป้องกัน'],
  counterplay: 'กระจายตัวไม่ให้ถูกดึงรวม, รอคูลดาวน์หลังเปิดไฟต์แล้วสวน',
  teamRole: 'Tank / Initiator', pve: 'ดึงมอนรวมให้ทีม AoE', pvp: 'ดึงเป้าเข้าทีม', guildWar: 'แทงก์แนวหน้า เปิดประตู',
  ritualItem: 'mat_gravity_stone', ritualTrial: 'แก้ปริศนาแรงโน้มถ่วง',
  actives: [
    G.A('gravity_pull', 'Gravity Pull', 'ดึงโน้มถ่วง', 'ดึงศัตรูรัศมี 4 เข้าหาตัว 3 ช่อง', { dmg: [0.8, 4], shape: circ(4), cd: 8, en: 15, fx: [{ kind: 'pull', distance: 3 }] }),
    G.A('gravity_push', 'Gravity Push', 'ผลักโน้มถ่วง', 'ผลักศัตรูรอบตัว 3 ช่อง', { dmg: [1.0, 6], shape: circ(2.5), cd: 8, en: 15, fx: [kb(3)] }),
    G.A('heavy_strike', 'Heavy Strike', 'ฟาดหนัก', 'ฟาดหนักทำให้มึนและช้า', { dmg: [2.0, 12], shape: arc(1.8, 120), cd: 7, en: 15, fx: [stun(0.6), slow(0.6, 2)] }),
    G.A('gravity_field', 'Gravity Field', 'สนามโน้มถ่วง', 'สนามแรงโน้มถ่วงที่ระยะ 3 ช่อง 5 วินาที ทำให้ช้ามาก', { dmg: [0.25, 2], shape: self, cd: 12, en: 20, fx: [zone(2.5, 3, 5, 0.5), slow(0.4, 1)] }),
    G.A('floating_step', 'Floating Step', 'ก้าวลอย', 'ลอยไปข้างหน้า 4 ช่อง', { shape: self, cd: 8, en: 10, fx: [{ kind: 'blink', distance: 4 }] }),
    G.A('crush_zone', 'Crush Zone', 'เขตบดขยี้', 'ร่าย 0.5 วิ บดขยี้ที่ระยะ 3 ช่อง ทำให้มึน', { dmg: [2.2, 14], shape: circ(2.2, 3), cd: 11, en: 25, cast: 0.5, fx: [stun(0.8)] }),
    G.A('orbit_shield', 'Orbit Shield', 'โล่วงโคจร', 'หินโคจรเป็นโล่ 20% HP', { shape: self, cd: 15, en: 20, fx: [shield(0.2, 1, 6)] }),
    G.A('gravity_chain', 'Gravity Chain', 'โซ่โน้มถ่วง', 'โซ่กระโดด 3 เป้าหมาย ดึงและตรึง', { dmg: [1.0, 6], shape: proj(16, 7, 0.35), cd: 10, en: 18, fx: [{ kind: 'chain', jumps: 3, range: 4 }, { kind: 'pull', distance: 1.5 }, root(1)] }),
    G.A('meteor_rock', 'Meteor Rock', 'หินอุกกาบาต', 'ร่าย 0.7 วิ หินตกที่ระยะ 4.5 ช่อง', { dmg: [2.6, 18], shape: circ(2, 4.5), cd: 10, en: 25, cast: 0.7, fx: [kb(1)] }),
    G.A('anti_gravity', 'Anti-Gravity', 'ไร้แรงโน้มถ่วง', 'ทำให้ศัตรูรอบตัวลอย (มึน) 1.2 วินาที', { dmg: [0.6, 4], shape: circ(2.5), cd: 14, en: 20, fx: [stun(1.2)] }),
    G.A('pressure_wave', 'Pressure Wave', 'คลื่นแรงกดดัน', 'คลื่นแรงกดเป็นแนว 6 ช่อง ผลักกระเด็น', { dmg: [1.4, 8], shape: line(6, 2), cd: 9, en: 20, fx: [kb(2)] }),
    G.A('gravity_prison', 'Gravity Prison', 'คุกโน้มถ่วง', 'ตรึงเป้าหมายแรก 3 วินาที', { dmg: [0.5, 0], shape: proj(14, 7, 0.4), cd: 14, en: 20, fx: [root(3)] }),
    G.A('ground_slam', 'Ground Slam', 'ทุบพื้น', 'ทุบพื้นรอบตัว ทำให้มึน', { dmg: [1.6, 10], shape: circ(2.6), cd: 9, en: 20, fx: [stun(0.5)] }),
    G.A('mass_shift', 'Mass Shift', 'เปลี่ยนมวล', 'ลดความเสียหาย 25% และไม่ติด CC 5 วินาที', { shape: self, cd: 16, en: 20, fx: [{ kind: 'buff_dr', amount: 0.25, duration: 5, superArmor: true }] }),
    G.A('singularity_seed', 'Singularity Seed', 'เมล็ดเอกฐาน', 'วางเมล็ดที่ระเบิดดึงศัตรูเข้าหาและทำให้มึน', { dmg: [1.8, 10], shape: circ(2, 2), cd: 12, en: 20, fx: [{ kind: 'trap', radius: 2, armSec: 0.5, lifeSec: 20, maxActive: 2 }, { kind: 'pull', distance: 3 }, stun(0.8)] }),
  ],
  ultimates: [
    G.U('black_hole', 'Black Hole', 'หลุมดำ', 'ร่าย 0.5 วิ หลุมดำที่ระยะ 4 ช่อง ดึงและทำดาเมจ 5 วินาที', { dmg: [0.45, 4], shape: self, cd: 70, en: 55, cast: 0.5, fx: [zone(4, 4, 5, 0.4), { kind: 'pull', distance: 1.2 }], counter: 'dodge ออกนอกขอบทันทีที่เริ่ม — แรงดึงต่อ tick มีจำกัด' }),
    G.U('meteor_judgment', 'Meteor Judgment', 'อุกกาบาตพิพากษา', 'ร่าย 1 วิ อุกกาบาตยักษ์ที่ระยะ 5 ช่อง รัศมี 4 มึน 1.5 วินาที', { dmg: [5, 50], shape: circ(4, 5), cd: 65, en: 60, cast: 1, fx: [stun(1.5)], counter: 'ร่าย 1 วินาที — ออกจากวงหรือขัด' }),
    G.U('gravity_emperor', 'Gravity Emperor', 'จักรพรรดิโน้มถ่วง', 'แปลงร่าง 10 วินาที: ลดดาเมจ 35%, DEF +40%, สนามทำให้ศัตรูรอบตัวช้า', { dmg: [0.2, 0], shape: self, cd: 90, en: 60, fx: [{ kind: 'buff_dr', amount: 0.35, duration: 10, superArmor: true }, buff(10, { pdef: 0.4, mdef: 0.4 }), zone(3, 0, 10, 0.5, true), slow(0.6, 1)], counter: 'อย่าปะทะ 10 วินาทีนี้ เปลี่ยนเป้าหมาย' }),
    G.U('world_collapse', 'World Collapse', 'โลกถล่ม', 'ร่าย 0.8 วิ ดึงศัตรูรัศมี 6 เข้าหาตัวแล้วบดขยี้ มึน 1.2 วินาที', { dmg: [3.5, 30], shape: circ(6), cd: 75, en: 60, cast: 0.8, fx: [{ kind: 'pull', distance: 4 }, stun(1.2)], counter: 'ร่าย 0.8 วิ — ขัดหรือ dodge ออกนอก 6 ช่อง' }),
    G.U('zero_gravity_domain', 'Zero Gravity Domain', 'อาณาเขตไร้น้ำหนัก', 'อาณาเขตรัศมี 6 รอบตัว 8 วินาที ตรึงศัตรูเป็นจังหวะ', { dmg: [0.2, 2], shape: self, cd: 80, en: 60, cast: 0.3, fx: [zone(6, 0, 8, 0.5, true), root(0.6)], counter: 'ออกจากอาณาเขต; มี CC resist จะหลุดเร็วขึ้น' }),
  ],
  passives: [
    G.P('heavy_body', 'Heavy Body', 'กายหนัก', 'HP +10% แต่ความเร็ว -0.2', { statsPct: { hp: 0.1 }, stats: { moveSpeed: -0.2 } }),
    G.P('gravity_core', 'Gravity Core', 'แกนโน้มถ่วง', 'ดาเมจธาตุโน้มถ่วง +10%', { mods: { elementBonus: 0.1 } }),
    G.P('pressure_master', 'Pressure Master', 'ปรมาจารย์แรงกด', 'ระยะเวลา CC ที่ทำ +20%', { mods: { ccBonus: 0.2 } }),
    G.P('unshakable', 'Unshakable', 'ไม่สั่นคลอน', 'ต้านทาน CC +15%', { stats: { ccRes: 0.15 } }),
    G.P('mass_control', 'Mass Control', 'ควบคุมมวล', 'PDEF/MDEF +10%', { statsPct: { pdef: 0.1, mdef: 0.1 } }),
  ],
};

// ------------------------------------------------------------------ 6. Genesis Bloom
const N = builders('genesis', 'nature');
const GENESIS: PowerDef = {
  id: 'genesis', name: 'Genesis Bloom', nameTh: 'ปฐมบุปผา', element: 'nature', type: 'Nature / Healing / Summon', color: '#5ad86a', weapons: null,
  strengths: ['Healing', 'Party Support', 'Summoning', 'Sustain', 'Control'],
  weaknesses: ['Burst Damage ต่ำ', 'เสี่ยงถูกลอบสังหาร', 'ถูกลดประสิทธิภาพการรักษาได้'],
  counterplay: 'ลอบสังหารผู้ใช้ก่อน, ใช้ healing reduction (PvP)',
  teamRole: 'Healer / Support / Summoner', pve: 'ฟาร์มยาวโดยไม่ต้องกลับเมือง', pvp: 'ค้ำทีม ฮีลต่อเนื่อง', guildWar: 'ฮีลกลุ่มแนวหน้า',
  ritualItem: 'mat_life_seed', ritualTrial: 'ปกป้องต้นไม้ศักดิ์สิทธิ์',
  actives: [
    N.A('vine_whip', 'Vine Whip', 'แส้เถาวัลย์', 'แส้เถาวัลย์เป็นแนว 4 ช่อง ทำให้ช้า', { dmg: [1.2, 6], shape: line(4, 1), cd: 3, en: 10, fx: [slow(0.7, 1.5)] }),
    N.A('healing_bloom', 'Healing Bloom', 'บุปผาเยียวยา', 'ฟื้น HP 18% + 0.8×ATK ให้ตัวเองและพันธมิตรรัศมี 4', { shape: self, cd: 8, en: 20, fx: [heal(0.18, 0.8, 4)] }),
    N.A('thorn_trap', 'Thorn Trap', 'กับดักหนาม', 'กับดักหนามตรึงและติดพิษ', { dmg: [1.4, 8], shape: circ(1.6, 2), cd: 10, en: 15, fx: [{ kind: 'trap', radius: 1.6, armSec: 0.5, lifeSec: 20, maxActive: 2 }, root(2), poison()] }),
    N.A('root_bind', 'Root Bind', 'รากพันธนาการ', 'รากไม้ตรึงเป้าหมายแรก 2.5 วินาที', { dmg: [0.6, 0], shape: proj(14, 8, 0.4), cd: 12, en: 15, fx: [root(2.5)] }),
    N.A('nature_shield', 'Nature Shield', 'โล่ธรรมชาติ', 'โล่ 15% HP ให้ตัวเอง + ฟื้นพันธมิตรรอบตัว 5%', { shape: self, cd: 14, en: 20, fx: [shield(0.15, 1, 6), heal(0.05, 0, 4)] }),
    N.A('poison_flower', 'Poison Flower', 'บุปผาพิษ', 'ดอกไม้พิษที่ระยะ 3 ช่อง 6 วินาที', { dmg: [0.3, 2], shape: self, cd: 10, en: 18, fx: [zone(2, 3, 6, 1), poison()] }),
    N.A('seed_explosion', 'Seed Explosion', 'เมล็ดระเบิด', 'ร่าย 0.4 วิ เมล็ดระเบิดที่ระยะ 3 ช่อง', { dmg: [1.8, 12], shape: circ(2, 3), cd: 9, en: 20, cast: 0.4 }),
    N.A('forest_dash', 'Forest Dash', 'พุ่งพงไพร', 'พุ่ง 4 ช่อง และฟื้น HP 5%', { dmg: [0.8, 4], shape: line(4, 1.2), cd: 8, en: 15, move: 0, fx: [{ kind: 'dash', distance: 4, duration: 0.2 }, heal(0.05, 0)] }),
    N.A('life_drain', 'Life Drain', 'ดูดชีวิต', 'ดูดชีวิต 50% ของดาเมจ', { dmg: [1.3, 8], shape: proj(16, 8, 0.35), cd: 7, en: 15, fx: [{ kind: 'lifesteal', fraction: 0.5 }] }),
    N.A('healing_rain', 'Healing Rain', 'ฝนเยียวยา', 'ฝนฟื้นฟูรอบตัว 5 วินาที (4% ต่อวินาที)', { shape: self, cd: 16, en: 25, fx: [zone(3, 0, 5, 1, true, 0.04)] }),
    N.A('thorn_armor', 'Thorn Armor', 'เกราะหนาม', 'สะท้อนดาเมจ 30% และ PDEF +20% 6 วินาที', { shape: self, cd: 15, en: 20, fx: [{ kind: 'reflect', fraction: 0.3, duration: 6 }, buff(6, { pdef: 0.2 })] }),
    N.A('summon_wolf', 'Summon Wolf', 'อัญเชิญหมาป่า', 'อัญเชิญหมาป่าวิญญาณ 15 วินาที', { shape: self, cd: 20, en: 25, fx: [{ kind: 'summon', summon: 'wolf', count: 1, duration: 15, atkMult: 0.6, interval: 0.9, range: 6 }] }),
    N.A('spore_cloud', 'Spore Cloud', 'เมฆสปอร์', 'สปอร์พิษรอบตัว ทำให้ช้า', { dmg: [0.6, 4], shape: circ(2.8), cd: 9, en: 18, fx: [poison(0.15, 4), slow(0.6, 2)] }),
    N.A('nature_pulse', 'Nature Pulse', 'ชีพจรธรรมชาติ', 'คลื่นพลังรอบตัว ทำดาเมจศัตรูและฟื้นพันธมิตร 6%', { dmg: [1.0, 6], shape: circ(3), cd: 9, en: 20, fx: [heal(0.06, 0.3, 3)] }),
    N.A('spirit_flower', 'Spirit Flower', 'บุปผาวิญญาณ', 'ปลูกดอกไม้ฟื้นฟูที่ระยะ 2 ช่อง 8 วินาที (3% ต่อวินาที)', { shape: self, cd: 18, en: 20, fx: [zone(2.5, 2, 8, 1, false, 0.03)] }),
  ],
  ultimates: [
    N.U('world_tree', 'World Tree', 'พฤกษาโลก', 'ต้นไม้โลกฟื้นฟูรัศมี 5 รอบตัว 10 วินาที (5%/วิ) และลดดาเมจ 15%', { shape: self, cd: 80, en: 55, cast: 0.5, fx: [zone(5, 0, 10, 1, true, 0.05), { kind: 'buff_dr', amount: 0.15, duration: 10, superArmor: false }], counter: 'ดึงเป้าหมายออกจากรัศมี หรือฆ่าผู้ใช้' }),
    N.U('forest_guardian', 'Forest Guardian', 'ผู้พิทักษ์พงไพร', 'อัญเชิญเทรนต์ผู้พิทักษ์ 15 วินาที', { shape: self, cd: 75, en: 55, fx: [{ kind: 'summon', summon: 'treant', count: 1, duration: 15, atkMult: 1.2, interval: 1.2, range: 4 }], counter: 'โฟกัสผู้ใช้ — ผู้พิทักษ์หายเมื่อผู้ใช้ตาย' }),
    N.U('genesis_awakening', 'Genesis Awakening', 'ปลุกปฐมกาล', 'ฟื้น HP 30% + พลังรักษา +50% และ ATK +20% 12 วินาที', { shape: self, cd: 90, en: 60, fx: [heal(0.3, 1, 5), buff(12, { patk: 0.2, matk: 0.2 }, { healPower: 0.5 })], counter: 'burst ก่อนใช้ หรือรอให้หมดเวลา' }),
    N.U('thousand_thorn_forest', 'Thousand Thorn Forest', 'ป่าพันหนาม', 'ป่าหนามที่ระยะ 3 ช่อง รัศมี 5 เป็นเวลา 6 วินาที ตรึงและติดพิษ', { dmg: [0.45, 4], shape: self, cd: 70, en: 55, cast: 0.5, fx: [zone(5, 3, 6, 0.5), root(0.5), poison(0.1, 2)], counter: 'ร่าย 0.5 วิ — ออกจากพื้นที่' }),
    N.U('life_miracle', 'Life Miracle', 'ปาฏิหาริย์แห่งชีวิต', 'ฟื้น HP เต็มทันที และถ้าจะตายภายใน 30 วินาทีจะฟื้นด้วย HP 40%', { shape: self, cd: 150, en: 60, fx: [heal(1, 0, 5), { kind: 'cheat_death', duration: 30, hpPct: 0.4 }], counter: 'บีบให้ใช้ก่อน แล้วโจมตีสองระลอก' }),
  ],
  passives: [
    N.P('nature_blessing', 'Nature Blessing', 'พรแห่งธรรมชาติ', 'พลังรักษา +15%', { stats: { healPower: 0.15 } }),
    N.P('regeneration', 'Regeneration', 'ฟื้นฟูตนเอง', 'ฟื้น HP 1% ต่อวินาทีแม้ในการต่อสู้', { mods: { regenPct: 0.01 } }),
    N.P('poison_mastery', 'Poison Mastery', 'ปรมาจารย์พิษ', 'ดาเมจพิษ +30%', { mods: { dotBonus: 0.3 } }),
    N.P('guardian_bond', 'Guardian Bond', 'พันธะผู้พิทักษ์', 'ดาเมจสัตว์อัญเชิญ +30%', { mods: { summonBonus: 0.3 } }),
    N.P('life_energy', 'Life Energy', 'พลังชีวิต', 'HP +8%, Energy +10', { statsPct: { hp: 0.08 }, stats: { energy: 10 } }),
  ],
};

export const POWERS: Record<string, PowerDef> = { shadow: SHADOW, solar: SOLAR, thunder: THUNDER, frost: FROST, gravity: GRAVITY, genesis: GENESIS };
export const POWER_IDS = Object.keys(POWERS);

export function getPower(id: string | null | undefined): PowerDef | undefined {
  return id && Object.prototype.hasOwnProperty.call(POWERS, id) ? POWERS[id] : undefined;
}

export function powerAllowsWeapon(p: PowerDef, w: WeaponType | null | undefined): boolean {
  return !p.weapons || (!!w && p.weapons.includes(w));
}

/** Abilities unlocked at an awakening tier (lists are unlocked in order). */
export function unlockedAbilities(p: PowerDef, awakening: number) {
  const t = POWER_CONFIG.awakening[Math.max(0, Math.min(2, awakening - 1))];
  return { actives: p.actives.slice(0, t.actives), ultimates: p.ultimates.slice(0, t.ultimates), passives: p.passives.slice(0, t.passives) };
}

export function findPowerSkill(id: string): { power: PowerDef; skill: SkillDef } | undefined {
  for (const p of Object.values(POWERS)) {
    const s = p.actives.find((x) => x.id === id) ?? p.ultimates.find((x) => x.id === id);
    if (s) return { power: p, skill: s };
  }
  return undefined;
}
