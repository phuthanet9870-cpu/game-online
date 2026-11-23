import { describe, expect, it } from 'vitest';
import { GameCore, PVP, createCharacter, emptyAccount, rpChange, pvpTier, type Persistence } from '../src/index.js';

function setup() {
  const audits: string[] = [];
  const persist: Persistence = { saveCharacter: async () => {}, saveAccount: async () => {}, audit: (e) => { audits.push(e.action); }, transact: async () => {}, loadShared: async () => ({ guilds: [], listings: [] }) };
  const core = new GameCore(persist, { label: 'test' });
  const inbox = new Map<string, any[]>();
  const join = (sid: string, name: string, hc = false) => {
    const r = createCharacter('acc-' + sid, name, 'warrior', hc); if (!r.ok) throw new Error(r.reason);
    inbox.set(sid, []); core.connect(sid, 'acc-' + sid, r.value, emptyAccount(), (m) => inbox.get(sid)!.push(m));
    const s = core.sessions.get(sid)!;
    const room = core.rooms.get('town')!; const npc = room.world.map.interactables.find((i) => i.type === 'npc_arena')!;
    const e = room.world.ents.get(s.entId)!; e.x = npc.x; e.y = npc.y + 40;
    return s;
  };
  const tick = (sec: number) => { for (let i = 0; i < sec * 30; i++) core.tick(1 / 30); };
  return { core, inbox, join, tick, audits };
}

describe('ranked arena', () => {
  it('rating math: favourite gains less, floor 0, tiers', () => {
    expect(rpChange(1000, 1000, true, 0)).toBe(16);
    expect(rpChange(1400, 1000, true, 0)).toBeLessThan(rpChange(1000, 1400, true, 0));
    expect(pvpTier(1000).id).toBe('bronze'); expect(pvpTier(2100).id).toBe('astral');
  });
  it('1v1 between two players: rounds to 3, RP changes, hardcore deaths do not count, everyone returns to town', () => {
    const t = setup();
    const a = t.join('a', 'Alpha', true), b = t.join('b', 'Bravo');
    t.core.handle('a', { t: 'pvp_queue', size: 1, rid: 'q1' }); t.core.handle('b', { t: 'pvp_queue', size: 1, rid: 'q2' });
    t.tick(1);
    expect(a.roomId).toBe(b.roomId); expect(a.roomId.startsWith('pvp')).toBe(true);
    const room = t.core.rooms.get(a.roomId)!;
    const ea = () => room.world.ents.get(a.entId)!, eb = () => room.world.ents.get(b.entId)!;
    expect(ea().team).not.toBe(eb().team);
    for (let r = 0; r < 3; r++) { t.tick(PVP.prep + 0.5); eb().hp = 1; room.world.applyHit(eb(), { amount: 9999, type: 'physical', critChance: 0, critMult: 1, src: ea().id, tags: [] }); t.tick(1); expect(eb().dead).toBe(true); t.tick(3); }
    expect(room.pvp!.score).toEqual([a === a && room.pvp!.teams[0].includes('a') ? 3 : 0, room.pvp!.teams[0].includes('a') ? 0 : 3]);
    expect(a.char.pvp!.rp).toBeGreaterThan(1000); expect(b.char.pvp!.rp).toBeLessThan(1000);
    expect(a.char.pvp!.wins).toBe(1); expect(b.char.pvp!.losses).toBe(1);
    expect(a.char.dead).toBeFalsy();
    t.tick(7);
    expect(a.roomId).toBe('town'); expect(b.roomId).toBe('town');
    expect(t.core.ladder().pvp?.normal.some((r) => r.name === 'Bravo')).toBe(true);
  });
  it('a solo queue is filled with AI champions after the wait, and leaving forfeits', () => {
    const t = setup();
    const a = t.join('a', 'Solo');
    t.core.handle('a', { t: 'pvp_queue', size: 3, rid: 'q' });
    t.tick(PVP.botWait + 1);
    const room = t.core.rooms.get(a.roomId)!;
    expect(room.pvp).toBeTruthy();
    const bots = [...room.world.ents.values()].filter((e) => e.e?.def.look === 'chibi');
    expect(bots.length).toBe(5);
    expect(bots.filter((b) => b.team === room.world.ents.get(a.entId)!.team).length).toBe(2);
    t.core.handle('a', { t: 'leave' });
    expect(a.roomId).toBe('town');
    expect(a.char.pvp!.losses).toBe(1);
    expect(t.audits).toContain('pvp_forfeit');
  });
  it('rejects queueing away from the Arena Master', () => {
    const t = setup();
    const a = t.join('a', 'Far');
    const e = t.core.rooms.get('town')!.world.ents.get(a.entId)!; e.x = 200; e.y = 200;
    t.core.handle('a', { t: 'pvp_queue', size: 1, rid: 'q' });
    expect(t.inbox.get('a')!.some((m) => m.t === 'err')).toBe(true);
  });
});
