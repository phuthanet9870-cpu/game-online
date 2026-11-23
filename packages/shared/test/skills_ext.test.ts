import { describe, expect, it } from 'vitest';
import { CLASS_IDS, CONTENT_TH, SKILLS, classSkills, type SkillDef, type SkillEffect } from '../src/index.js';

/** A skill's mechanic fingerprint: effect kinds + the switches that change how they play, damage types, statuses, targeting. */
function sig(sk: SkillDef): string {
  const f = (e: SkillEffect): string => {
    const x = e as Record<string, any>;
    const flags = ['count', 'pierce', 'chain', 'homing', 'returns', 'split', 'explode', 'trap', 'follow', 'duration', 'delay', 'pull', 'healPct', 'scatter', 'knock', 'invuln', 'backward', 'party', 'radius', 'times', 'secondary', 'resource']
      .filter((k) => x[k] !== undefined && x[k] !== false && x[k] !== 0).map((k) => k + (k === 'count' || k === 'times' ? `=${x[k]}` : ''));
    const dmg = x.dmg ? `${x.dmg.type}${x.dmg.status ? '+' + x.dmg.status.id : ''}${x.dmg.execute ? '+exec' : ''}` : '';
    const mods = x.mods ? x.mods.map((m: any) => m.stat).sort().join('/') : '';
    const extra = x.t === 'detonate' ? x.status : x.t === 'summon' ? x.minion : x.t === 'melee' ? (x.arc >= 300 ? 'ring' : x.arc >= 150 ? 'wide' : x.arc <= 60 ? 'narrow' : 'cone') : '';
    return [x.t, dmg, flags.join(','), mods, extra].join(':');
  };
  return `${sk.targeting}|${sk.effects.map(f).join('>')}`;
}

describe('extended skill library', () => {
  it('every class has 40 actives and 10 ultimates with unique ids, Thai text and unlocks within 1-100', () => {
    const ids = new Set<string>();
    for (const c of CLASS_IDS) {
      expect(classSkills(c, 'active').length, c).toBe(40);
      expect(classSkills(c, 'ultimate').length, c).toBe(10);
    }
    for (const s of SKILLS) {
      expect(ids.has(s.id), s.id).toBe(false); ids.add(s.id);
      expect(CONTENT_TH[`skill.${s.id}.name`], s.id).toBeTruthy();
      expect(s.unlockLevel).toBeGreaterThanOrEqual(1); expect(s.unlockLevel).toBeLessThanOrEqual(100);
      expect(s.effects.length).toBeGreaterThan(0);
    }
  });
  it('no two skills anywhere share the same mechanic fingerprint', () => {
    const seen = new Map<string, string>();
    const dup: string[] = [];
    for (const s of SKILLS) { const k = `${s.cls}|${sig(s)}`; if (seen.has(k)) dup.push(`${s.id} ≈ ${seen.get(k)}`); else seen.set(k, s.id); }
    expect(dup).toEqual([]);
  });
  it('no two skills share a name', () => {
    const names = new Map<string, string>(); const dup: string[] = [];
    for (const s of SKILLS) { if (names.has(s.name)) dup.push(`${s.id}/${names.get(s.name)}: ${s.name}`); names.set(s.name, s.id); }
    expect(dup).toEqual([]);
  });
});
