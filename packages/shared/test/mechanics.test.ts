import { describe, expect, it } from 'vitest';
import { SKILLS, SKILL_MAP, World, buildArena, createCharacter, normalizeCharacter, type ClassId, type SkillDef } from '../src/index.js';

/** Flat arena, a level-100 caster with one skill slotted, enemies placed relative to the caster. */
function rig(skillId: string, foes: Array<[number, number]> = [[150, 0]], enemy = 'hollow_brute') {
  const sk = SKILL_MAP[skillId]!;
  const r = createCharacter('acc', 'Mech', sk.cls as ClassId, false); if (!r.ok) throw new Error(r.reason);
  const ch = normalizeCharacter(r.value); ch.level = 100;
  if (sk.kind === 'active') ch.loadout.active[0] = sk.id; else ch.loadout.ultimate[0] = sk.id;
  const map = buildArena('arena', 1, 50); map.spawns = [];
  const w = new World(map, { difficulty: 'normal', partySize: 1, seed: 7, kind: 'dungeon' });
  const p = w.addPlayer(ch, 's');
  p.x = map.w * 16 - 200; p.y = map.h * 16; p.invuln = 0;
  for (let i = 0; i < 30; i++) w.tick(1 / 30); // let stats settle
  p.p!.res = 999; p.p!.sec = 10; p.invuln = 0;
  const es = foes.map(([dx, dy]) => w.spawnEnemy(enemy, p.x + dx, p.y + dy, 50, false)!);
  for (const e of es) { e.hp = e.maxHp = 1e7; e.e!.awake = false; e.speed = 0; }
  const cast = (ax = es[0]?.x ?? p.x + 100, ay = es[0]?.y ?? p.y, tid = es[0]?.id ?? 0) => w.castSkill(p.id, sk.kind, 0, ax, ay, tid);
  const run = (sec: number) => { for (let i = 0; i < sec * 30; i++) w.tick(1 / 30); };
  return { w, p, es, cast, run, sk };
}
const dmgTaken = (e: { hp: number; maxHp: number }) => e.maxHp - e.hp;

describe('new skill mechanics', () => {
  it('every one of the 350 skills casts without errors and the simulation keeps running', () => {
    const fails: string[] = [];
    for (const sk of SKILLS as SkillDef[]) {
      const r = rig(sk.id, [[140, 0], [-120, 60]]);
      const err = r.cast();
      if (err) { fails.push(`${sk.id}: ${err}`); continue; }
      try { r.run(2); } catch (e) { fails.push(`${sk.id}: crash ${(e as Error).message}`); }
    }
    expect(fails).toEqual([]);
  });
  it('beam hits enemies on its line and misses those beside it', () => {
    const r = rig('war_earthsplit', [[200, 0], [200, 160]]);
    expect(r.cast(r.p.x + 300, r.p.y)).toBeNull(); r.run(0.3);
    expect(dmgTaken(r.es[0]!)).toBeGreaterThan(0); expect(dmgTaken(r.es[1]!)).toBe(0);
  });
  it('trap waits until an enemy steps in', () => {
    const r = rig('war_seismic_trap', [[600, 0]]);
    expect(r.cast(r.p.x + 200, r.p.y)).toBeNull(); r.run(2);
    expect(dmgTaken(r.es[0]!)).toBe(0);
    r.es[0]!.x = r.p.x + 200; r.run(0.5);
    expect(dmgTaken(r.es[0]!)).toBeGreaterThan(0);
  });
  it('pull drags enemies toward the point; swap trades places; blink teleports', () => {
    let r = rig('war_maelstrom', [[180, 0]]);
    const d0 = Math.hypot(r.es[0]!.x - r.p.x, r.es[0]!.y - r.p.y); r.cast(); const d1 = Math.hypot(r.es[0]!.x - r.p.x, r.es[0]!.y - r.p.y);
    expect(d1).toBeLessThan(d0 - 50);
    r = rig('war_brazen_swap', [[200, 0]]);
    const [px, ex] = [r.p.x, r.es[0]!.x]; expect(r.cast()).toBeNull();
    expect(Math.round(r.p.x)).toBe(Math.round(ex)); expect(Math.round(r.es[0]!.x)).toBe(Math.round(px));
    r = rig('mag_mirror_ice', []);
    const x0 = r.p.x; expect(r.cast(r.p.x + 100, r.p.y)).toBeNull(); expect(r.p.x).toBeLessThan(x0 - 100);
  });
  it('echo repeats the damage; detonate consumes a status for burst damage', () => {
    const r = rig('chr_u_timeline_split', [[200, 0]]);
    r.cast(); r.run(0.3); const first = dmgTaken(r.es[0]!); r.run(2.5);
    expect(dmgTaken(r.es[0]!)).toBeGreaterThan(first * 2);
    const d = rig('war_bloodrite', [[100, 0]]);
    d.es[0]!.statuses.push({ id: 'bleed', t: 3, power: 0.2, src: d.p.id, dps: 1 } as never);
    expect(d.cast()).toBeNull();
    expect(d.es[0]!.statuses.some((s) => s.id === 'bleed')).toBe(false); expect(dmgTaken(d.es[0]!)).toBeGreaterThan(0);
  });
  it('returning projectiles come back; split projectiles multiply on hit', () => {
    const r = rig('war_return_axe', []);
    r.cast(r.p.x + 300, r.p.y); r.run(0.9);
    expect(r.w.projs.some((pr) => pr.back)).toBe(true);
    const s = rig('war_hurricane_axe', [[200, 0]]);
    s.cast(); let max = 0; for (let i = 0; i < 20; i++) { s.run(1 / 30); max = Math.max(max, s.w.projs.length); }
    expect(max).toBeGreaterThanOrEqual(6);
  });
  it('execute deals more to wounded enemies', () => {
    const hi = rig('war_headsman', [[60, 0]]); hi.cast(); hi.run(0.2);
    const lo = rig('war_headsman', [[60, 0]]); lo.es[0]!.hp = lo.es[0]!.maxHp * 0.2; const before = lo.es[0]!.hp; lo.cast(); lo.run(0.2);
    expect(before - lo.es[0]!.hp).toBeGreaterThan(dmgTaken(hi.es[0]!) * 1.8);
  });
  it('debuffs raise damage taken; reflect hurts attackers; stealth stops aggro; cleanse clears ailments', () => {
    const base = rig('war_ironfist', [[50, 0]]); base.cast(); base.run(0.2);
    const deb = rig('war_ironfist', [[50, 0]]); deb.w.addBuff(deb.es[0]!, 'Sundered', 10, [{ stat: 'dmgTakenPct', value: 50 }]); deb.cast(); deb.run(0.2);
    expect(dmgTaken(deb.es[0]!)).toBeGreaterThan(dmgTaken(base.es[0]!) * 1.3);
    const rf = rig('war_ironskin', [[40, 0]]); rf.cast(); rf.p.invuln = 0;
    rf.w.applyHit(rf.p, { amount: 100, type: 'physical', critChance: 0, critMult: 1, src: rf.es[0]!.id, tags: [] }); rf.run(0.1);
    expect(dmgTaken(rf.es[0]!)).toBeGreaterThan(0);
    const st = rig('asn_vanish', [[150, 0]], 'hollow_grunt'); st.es[0]!.speed = 100; st.cast(); st.run(1);
    expect(st.es[0]!.e!.awake).toBe(false);
    const cl = rig('war_unstoppable', []); cl.p.statuses.push({ id: 'slow', t: 5, power: 0.5, src: 0 } as never); cl.cast();
    expect(cl.p.statuses.length).toBe(0);
  });
});
