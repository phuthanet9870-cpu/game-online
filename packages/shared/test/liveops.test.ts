import { describe, expect, it } from 'vitest';
import { DEFAULT_LIVE, GameCore, SEASON_XP_PER_TIER, createCharacter, currentSeason, emptyAccount, validateLiveConfig, weekIndex, weeklyEvent, weeklyObjectives, type Persistence } from '../src/index.js';

const NOW = Date.parse('2026-11-22T12:00:00Z');
function setup() {
  const persist: Persistence = { saveCharacter: async () => {}, saveAccount: async () => {}, audit: () => {}, transact: async () => {}, loadShared: async () => ({ guilds: [], listings: [] }) };
  const core = new GameCore(persist);
  core.clock = () => NOW;
  const inbox: any[] = [];
  const r = createCharacter('acc', 'Seasoned', 'mage', false); if (!r.ok) throw 0;
  core.connect('s', 'acc', r.value, emptyAccount(), (m) => inbox.push(m));
  return { core, inbox, s: core.sessions.get('s')! };
}

describe('seasons & weekly', () => {
  it('season 1 is active now; weekly rotation is deterministic', () => {
    expect(currentSeason(NOW)?.id).toBe('s1');
    expect(weeklyObjectives(NOW)).toHaveLength(3);
    expect(weeklyObjectives(NOW)).toEqual(weeklyObjectives(NOW + 3600_000));
    expect(weeklyEvent(NOW).id).toBe(weeklyEvent(NOW + 60_000).id); // same week, same event
    expect(weekIndex(NOW + 7 * 86400_000)).toBe(weekIndex(NOW) + 1);
    expect(weeklyEvent(NOW, 'golden_rifts').id).toBe('golden_rifts');
  });
  it('weekly objective completion grants Season XP; tiers gate claims; rewards are applied once', () => {
    const { core, inbox, s } = setup();
    core.sendSeason(s);
    const info = inbox.filter((m) => m.t === 'season').pop();
    expect(info.season.id).toBe('s1');
    core.handle('s', { t: 'season_claim', tier: 1 });
    expect(inbox.some((m) => m.t === 'err' && /not reached/.test(m.msg))).toBe(true);
    s.account.season!.xp = SEASON_XP_PER_TIER * 3;
    const dust = s.char.dust;
    core.handle('s', { t: 'season_claim', tier: 1, rid: 'a' });
    core.handle('s', { t: 'season_claim', tier: 1, rid: 'b' });
    expect(s.char.dust).toBe(dust + 20);
    core.handle('s', { t: 'season_claim', tier: 3 });
    expect(s.account.auras).toContain('ember');
    core.handle('s', { t: 'set_aura', id: 'ember' });
    expect(s.account.aura).toBe('ember');
    core.handle('s', { t: 'set_aura', id: 'eclipse' });
    expect(inbox.some((m) => m.t === 'err' && /not unlocked/.test(m.msg))).toBe(true);
  });
  it('live config validation rejects bad input and feature flags close activities', () => {
    expect(validateLiveConfig({ ...DEFAULT_LIVE, xpMul: 10 }).ok).toBe(false);
    expect(validateLiveConfig({ ...DEFAULT_LIVE, weeklyOverride: 'nope' }).ok).toBe(false);
    const v = validateLiveConfig({ ...DEFAULT_LIVE, xpMul: 2, flags: { ...DEFAULT_LIVE.flags, tower: false } });
    expect(v.ok).toBe(true);
    const { core, inbox, s } = setup();
    if (v.ok) core.setLive(v.value);
    expect(core.effects().xpMul).toBeGreaterThanOrEqual(2);
    s.char.level = 10;
    const town = core.rooms.get('town')!;
    const portal = town.world.map.interactables.find((i) => i.type === 'portal_dungeon')!;
    const e = town.world.ents.get(s.entId)!; e.x = portal.x; e.y = portal.y + 40;
    core.handle('s', { t: 'enter_dungeon', mode: 'tower' });
    expect(inbox.some((m) => m.t === 'err' && /temporarily closed/.test(m.msg))).toBe(true);
  });
});
