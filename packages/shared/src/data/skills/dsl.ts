// Compact authoring helpers for the extended skill library (40 active + 10 ultimate per class).
import type { ClassId, DamageType, Dmg, SkillDef, SkillEffect, StatusApply, StatusId, Targeting } from '../../types.js';

export const D = (coef: number, type: DamageType, status?: StatusApply, execute?: number): Dmg => ({ coef, type, ...(status ? { status } : {}), ...(execute ? { execute } : {}) });
export const St = (id: StatusId, chance: number, duration: number, power?: number): StatusApply => ({ id, chance, duration, ...(power !== undefined ? { power } : {}) });
export type Row = [id: string, kind: 'a' | 'u', lvl: number, tg: Targeting, cost: number, cd: number, cast: number, range: number, icon: string, tags: string, name: string, th: string, desc: string, thd: string, effects: SkillEffect[], extra?: Partial<SkillDef>];
export const TH: Record<string, string> = {};
export function build(cls: ClassId, rows: Row[]): SkillDef[] {
  return rows.map(([id, k, lvl, tg, cost, cd, cast, range, icon, tags, name, th, desc, thd, effects, extra]) => {
    TH[`skill.${id}.name`] = th; TH[`skill.${id}.desc`] = thd;
    return { id, cls, kind: k === 'a' ? 'active' : 'ultimate', name, desc, tags: tags ? tags.split(' ') : [], cost, cooldown: cd, cast, range, targeting: tg, unlockLevel: lvl, icon, effects, ...extra };
  });
}
