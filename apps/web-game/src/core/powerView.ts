import { CONTENT, rankFor, skillImplemented } from './content';
import type { PowerState } from './simulation';
import type { PowerSkillView, PowerView } from './worldSource';

/** Builds the HUD view of a bound Power (offline sandbox; online views come from the server). */
export function buildPowerView(ps: PowerState, weaponId: string): PowerView {
  const r = rankFor(ps.points);
  const next = CONTENT.powers.proficiency.ranks.find((x) => x.rank === r.rank + 1)?.points ?? 0;
  const map = (list: typeof ps.def.active, n: number): PowerSkillView[] =>
    list.map((s, i) => ({
      id: s.id,
      name: s.name,
      category: s.category ?? 'power-active',
      implemented: skillImplemented(s),
      unlocked: i < n,
      energyCost: s.energyCost,
      cooldownMs: s.cooldownMs,
      description: s.description,
    }));
  return {
    id: ps.def.id,
    name: ps.def.name,
    type: ps.def.type,
    allowedWeapons: ps.def.allowedWeapons,
    weaponOk: ps.def.allowedWeapons.includes(weaponId as never),
    stance: ps.stance,
    points: ps.points,
    rank: r.rank,
    nextRankPoints: next,
    loadout: { ...ps.loadout, actives: [...ps.loadout.actives], passives: [...ps.loadout.passives] },
    skills: [
      ...map(ps.def.active, r.active),
      ...map(ps.def.ultimate, r.ultimate),
      ...map(ps.def.passive, r.passive),
    ],
  };
}
