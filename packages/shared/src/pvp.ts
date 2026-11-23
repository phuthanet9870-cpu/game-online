// Ranked Arena: 1v1 / 3v3 / 5v5, best of 5 rounds (first to 3). Missing players are filled with AI champions.
// Rating (RP) is per character; arena deaths never count as Hardcore deaths and drop nothing.
import { CLASSES } from './data/classes.js';
import { CLASS_IDS, type ClassId, type EnemyAttack, type EnemyDef } from './types.js';

export const PVP_SIZES = [1, 3, 5] as const;
export type PvpSize = typeof PVP_SIZES[number];
export const PVP = { roundsToWin: 3, prep: 5, roundTime: 90, botWait: 10, offlineBotWait: 3, dmgMul: 0.35, healMul: 0.6, startRp: 1000 };
export const PVP_TIERS: Array<{ id: string; name: string; th: string; min: number; color: string }> = [
  { id: 'bronze', name: 'Bronze', th: 'บรอนซ์', min: 0, color: '#c8844a' }, { id: 'silver', name: 'Silver', th: 'ซิลเวอร์', min: 1100, color: '#c8d0dc' },
  { id: 'gold', name: 'Gold', th: 'โกลด์', min: 1250, color: '#ffd36a' }, { id: 'platinum', name: 'Platinum', th: 'แพลทินัม', min: 1450, color: '#7fe0d0' },
  { id: 'diamond', name: 'Diamond', th: 'ไดมอนด์', min: 1700, color: '#8ab8ff' }, { id: 'astral', name: 'Astral', th: 'แอสทรัล', min: 2000, color: '#c58cff' },
];
export const pvpTier = (rp: number) => [...PVP_TIERS].reverse().find((t) => rp >= t.min)!;
export interface PvpRecord { rp: number; wins: number; losses: number; best: number; streak: number }
export const emptyPvp = (): PvpRecord => ({ rp: PVP.startRp, wins: 0, losses: 0, best: PVP.startRp, streak: 0 });
/** Elo-style change: 32 × (result − expected), with a small win-streak bonus and a floor of 0 RP. */
export function rpChange(my: number, opp: number, won: boolean, streak: number): number {
  const expected = 1 / (1 + 10 ** ((opp - my) / 400));
  const base = Math.round(32 * ((won ? 1 : 0) - expected));
  return won ? base + Math.min(10, Math.max(0, streak) * 2) : base;
}
export function applyResult(r: PvpRecord, opp: number, won: boolean): number {
  const d = rpChange(r.rp, opp, won, r.streak);
  r.rp = Math.max(0, r.rp + d); r.best = Math.max(r.best, r.rp);
  if (won) { r.wins++; r.streak = Math.max(1, r.streak + 1); } else { r.losses++; r.streak = Math.min(-1, r.streak - 1); }
  return d;
}

// ── AI champions (one per class) ──
const BOT_ATTACKS: Record<ClassId, EnemyAttack[]> = {
  warrior: [{ id: 'b_cleave', kind: 'cleave', range: 100, cooldown: 2.2, windup: 0.45, dmg: 1.3, type: 'physical' }, { id: 'b_charge', kind: 'charge', range: 300, cooldown: 7, windup: 0.5, dmg: 1.1, type: 'physical', status: { id: 'stun', chance: 1, duration: 0.6 } }],
  mage: [{ id: 'b_bolt', kind: 'projectile', range: 460, cooldown: 1.6, windup: 0.4, dmg: 1.1, type: 'fire', speed: 460 }, { id: 'b_meteor', kind: 'eruption', range: 460, cooldown: 6, windup: 0.9, dmg: 1.8, type: 'fire', radius: 85 }],
  assassin: [{ id: 'b_stab', kind: 'melee', range: 44, cooldown: 0.8, windup: 0.2, dmg: 0.9, type: 'physical', status: { id: 'bleed', chance: 0.4, duration: 3, power: 0.2 } }, { id: 'b_shadowstep', kind: 'charge', range: 340, cooldown: 5, windup: 0.3, dmg: 1.2, type: 'shadow' }],
  ranger: [{ id: 'b_arrow', kind: 'projectile', range: 500, cooldown: 1.1, windup: 0.3, dmg: 0.9, type: 'physical', speed: 560 }, { id: 'b_volley', kind: 'nova', range: 460, cooldown: 7, windup: 0.7, dmg: 0.6, type: 'physical', count: 9, speed: 420 }],
  paladin: [{ id: 'b_smite', kind: 'melee', range: 60, cooldown: 1.5, windup: 0.4, dmg: 1.1, type: 'holy' }, { id: 'b_consecrate', kind: 'slam', range: 100, cooldown: 6, windup: 0.8, dmg: 1.3, type: 'holy', radius: 110 }],
  necromancer: [{ id: 'b_bone', kind: 'projectile', range: 440, cooldown: 1.5, windup: 0.4, dmg: 1.0, type: 'shadow', speed: 420, status: { id: 'curse', chance: 0.3, duration: 4, power: 0.15 } }, { id: 'b_raise', kind: 'summon', range: 400, cooldown: 14, windup: 1, dmg: 0, type: 'shadow', summon: 'hollow_grunt', count: 2 }],
  chronomancer: [{ id: 'b_shard', kind: 'projectile', range: 440, cooldown: 1.4, windup: 0.35, dmg: 1.0, type: 'lightning', speed: 480, status: { id: 'slow', chance: 0.4, duration: 2, power: 0.3 } }, { id: 'b_rift', kind: 'nova', range: 420, cooldown: 6, windup: 0.8, dmg: 0.7, type: 'lightning', count: 10, speed: 300 }],
};
const BOT_ROLE: Record<ClassId, EnemyDef['role']> = { warrior: 'tank', mage: 'caster', assassin: 'flanker', ranger: 'ranged', paladin: 'melee', necromancer: 'summoner', chronomancer: 'caster' };
export const PVP_BOTS: Record<string, EnemyDef> = Object.fromEntries(CLASS_IDS.map((c) => {
  const d = CLASSES[c], ranged = ['mage', 'ranger', 'necromancer', 'chronomancer'].includes(c);
  return [`pvp_bot_${c}`, {
    id: `pvp_bot_${c}`, name: `${d.name} Champion`, family: c, role: BOT_ROLE[c], hp: Math.round(d.base.hp * 1.3), power: 9, armor: Math.round(d.base.armor * 2), res: {}, speed: d.base.moveSpeed, radius: 14, xp: 0,
    aggroRange: 900, preferRange: ranged ? 300 : undefined, attacks: BOT_ATTACKS[c], color: d.colors.body, look: 'chibi',
  } as EnemyDef];
}));
const CLS_TH: Record<ClassId, string> = { warrior: 'นักรบ', mage: 'จอมเวท', assassin: 'นักฆ่า', ranger: 'นักธนู', paladin: 'อัศวินศักดิ์สิทธิ์', necromancer: 'จอมเวทวิญญาณ', chronomancer: 'จอมเวทกาลเวลา' };
export const PVP_BOT_TH: Record<string, string> = Object.fromEntries(CLASS_IDS.map((c) => [`enemy.pvp_bot_${c}`, `แชมเปี้ยน${CLS_TH[c]}`]));
