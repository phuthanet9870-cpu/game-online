import { PROGRESSION, expToNext, masteryToNext } from '../shared/config/progression.ts';
import type { WeaponType } from '../shared/config/weapons.ts';
import type { CharacterRecord } from './storage/types.ts';

export interface ExpResult { gained: number; restedUsed: number; levelsGained: number }

/** Apply EXP (already scaled for level difference) with rested bonus and level-ups. */
export function grantExp(rec: CharacterRecord, amount: number, cfg = PROGRESSION): ExpResult {
  const res: ExpResult = { gained: 0, restedUsed: 0, levelsGained: 0 };
  if (amount <= 0 || rec.level >= cfg.maxLevel) return res;
  const bonus = Math.min(rec.restedExp, Math.round(amount * cfg.rested.bonusMult));
  rec.restedExp -= bonus;
  const total = Math.round(amount) + bonus;
  res.gained = total;
  res.restedUsed = bonus;
  rec.exp += total;
  while (rec.level < cfg.maxLevel && rec.exp >= expToNext(rec.level, cfg)) {
    rec.exp -= expToNext(rec.level, cfg);
    rec.level++;
    res.levelsGained++;
  }
  if (rec.level >= cfg.maxLevel) rec.exp = 0;
  return res;
}

/** Called when a character logs in: accrue rested EXP from offline time. */
export function accrueRested(rec: CharacterRecord, now: number, cfg = PROGRESSION): number {
  const minutes = (now - rec.lastSeen) / 60000;
  if (minutes < cfg.rested.minOfflineMinutes || rec.level >= cfg.maxLevel) return 0;
  const need = expToNext(rec.level, cfg);
  const add = Math.round((minutes / 60) * cfg.rested.perOfflineHour * need);
  const cap = Math.round(need * cfg.rested.maxPoolFraction);
  const before = rec.restedExp;
  rec.restedExp = Math.min(cap, rec.restedExp + add);
  return rec.restedExp - before;
}

export function deathPenalty(rec: CharacterRecord, cfg = PROGRESSION): number {
  const loss = Math.floor(rec.exp * cfg.deathExpLossFraction);
  rec.exp -= loss;
  return loss;
}

export function addMastery(rec: CharacterRecord, weapon: WeaponType, xp: number, cfg = PROGRESSION): boolean {
  const m = rec.mastery[weapon] ?? { level: 0, xp: 0 };
  let leveled = false;
  if (m.level >= cfg.weaponMastery.maxLevel) { rec.mastery[weapon] = m; return false; }
  m.xp += xp;
  while (m.level < cfg.weaponMastery.maxLevel && m.xp >= masteryToNext(m.level, cfg)) {
    m.xp -= masteryToNext(m.level, cfg);
    m.level++;
    leveled = true;
  }
  if (m.level >= cfg.weaponMastery.maxLevel) m.xp = 0;
  rec.mastery[weapon] = m;
  return leveled;
}

export function masteryDamageMult(rec: CharacterRecord, weapon: WeaponType | undefined, cfg = PROGRESSION): number {
  if (!weapon) return 1;
  return 1 + (rec.mastery[weapon]?.level ?? 0) * cfg.weaponMastery.damageBonusPerLevel;
}
