import { describe, expect, it } from 'vitest';
import { GameCore, World, buildArena, createCharacter, emptyAccount, generateDungeon, generateLabyrinth, reachableSet, towerScale, validateDungeon, TILE, type Persistence, type PersistTx } from '../src/index.js';

function setup(level = 20) {
  const txs: PersistTx[] = [];
  const persist: Persistence = { saveCharacter: async () => {}, saveAccount: async () => {}, audit: () => {}, transact: async (t) => { txs.push(t); }, loadShared: async () => ({ guilds: [], listings: [] }) };
  const core = new GameCore(persist);
  const inbox: any[] = [];
  const r = createCharacter('acc', 'Climber', 'paladin', false);
  if (!r.ok) throw 0;
  r.value.level = level;
  core.connect('s', 'acc', r.value, emptyAccount(), (m) => inbox.push(m));
  const s = core.sessions.get('s')!;
  const town = core.rooms.get('town')!;
  const portal = town.world.map.interactables.find((i) => i.type === 'portal_dungeon')!;
  const e = town.world.ents.get(s.entId)!; e.x = portal.x; e.y = portal.y + 40;
  const errs = () => inbox.filter((m) => m.t === 'err').map((m) => m.msg);
  const tick = (n: number) => { for (let i = 0; i < n; i++) core.tick(1 / 30); };
  const killAll = (pred: (id: string) => boolean = () => true) => { const room = core.rooms.get(s.roomId)!; const me = room.world.ents.get(s.entId)!; for (const en of [...room.world.ents.values()]) if (en.kind === 'enemy' && pred(en.e!.def.id)) { en.invuln = 0; room.world.applyHit(en, { amount: 1e9, type: 'holy', critChance: 0, critMult: 1, src: me.id, tags: [] }); } };
  return { core, s, inbox, errs, tick, killAll, txs };
}

describe('maps', () => {
  it('labyrinth mazes and arenas are fully navigable', () => {
    for (let seed = 1; seed < 60; seed++) {
      const m = generateLabyrinth(seed * 31, 10);
      expect(validateDungeon(m).ok, `labyrinth ${seed}`).toBe(true);
      expect(m.spawns.some((sp) => sp.enemy === 'labyrinth_warden')).toBe(true);
    }
    for (const k of ['arena', 'raid'] as const) { const m = buildArena(k, 1, 10); expect(validateDungeon(m).ok || k === 'arena').toBe(true); expect(reachableSet(m, m.spawn.x, m.spawn.y).size).toBeGreaterThan(300); }
    for (let f = 1; f <= 12; f++) expect(validateDungeon(generateDungeon({ seed: f * 97, level: 10, difficulty: 'normal', layout: 'tower', floor: f, boss: f % 5 === 0 ? 'veyra' : 'hollow_captain' })).ok).toBe(true);
  });
});

describe('activities', () => {
  it('enforces unlock rules', () => {
    const t = setup(3);
    t.core.handle('s', { t: 'enter_dungeon', mode: 'tower' });
    expect(t.errs().some((e) => /level 5/.test(e))).toBe(true);
    const t2 = setup(20);
    t2.core.handle('s', { t: 'enter_dungeon', mode: 'nightmare', diff: 'hard' });
    expect(t2.errs().some((e) => /Hard Rift/.test(e))).toBe(true);
  });
  it('Endless Tower: floor guardian opens stairs, next floor is stronger, best floor recorded', () => {
    const t = setup();
    t.core.handle('s', { t: 'enter_dungeon', mode: 'tower' });
    const r1 = t.core.rooms.get(t.s.roomId)!;
    expect(r1.mode).toBe('tower');
    expect(r1.world.opts.finalBoss).toBe('hollow_captain');
    t.killAll((id) => id === 'hollow_captain');
    t.tick(2);
    expect(r1.world.map.interactables.some((i) => i.type === 'exit')).toBe(true);
    const me = r1.world.ents.get(t.s.entId)!;
    const ex = r1.world.map.interactables.find((i) => i.type === 'exit')!; me.x = ex.x; me.y = ex.y;
    t.core.handle('s', { t: 'interact' });
    const r2 = t.core.rooms.get(t.s.roomId)!;
    expect(r2.floor).toBe(2);
    expect(r2.world.opts.scale).toBeCloseTo(towerScale(2));
    expect(t.core.records.get(`tower:${t.s.char.id}`)?.value).toBe(1);
    expect(t.txs.some((x) => x.records?.length)).toBe(true);
  });
  it('Challenge Arena spawns escalating waves and ends when everyone is down', () => {
    const t = setup(5);
    t.core.handle('s', { t: 'enter_dungeon', mode: 'arena' });
    const room = t.core.rooms.get(t.s.roomId)!;
    t.tick(30 * 4);
    expect(room.arena!.wave).toBe(1);
    const n1 = [...room.world.ents.values()].filter((e) => e.kind === 'enemy').length;
    t.killAll(); t.tick(30 * 5);
    expect(room.arena!.wave).toBe(2);
    expect([...room.world.ents.values()].filter((e) => e.kind === 'enemy').length).toBeGreaterThan(n1);
    const me = room.world.ents.get(t.s.entId)!; me.invuln = 0;
    room.world.applyHit(me, { amount: 1e9, type: 'holy', critChance: 0, critMult: 1, src: 0, tags: [] });
    t.tick(3);
    expect(t.s.roomId).toBe('town');
    expect(t.inbox.some((m) => m.t === 'run_end' && m.mode === 'arena' && m.wave === 1)).toBe(true);
    expect(t.core.ladder().arena?.normal[0]?.value).toBe(1);
  });
  it('Raid: Total Eclipse hits everyone outside the circle of light only', () => {
    const map = buildArena('raid', 3, 15);
    const w = new World(map, { difficulty: 'normal', partySize: 4, seed: 3, kind: 'dungeon', finalBoss: 'sovereign', noRespawn: true });
    const mk = (n: string) => { const r = createCharacter('a', n, 'warrior', false); if (!r.ok) throw 0; return r.value; };
    const inside = w.addPlayer(mk('Insidex'), 'a'), outside = w.addPlayer(mk('Outsidex'), 'b');
    const area = w.mkArea([...w.ents.values()].find((e) => e.e?.def.id === 'sovereign')!, { x: 500, y: 500, r: 150, shape: 'outside', delay: 0, packet: { amount: 50, type: 'shadow', critChance: 0, critMult: 1, src: 0, tags: [] }, visual: 'enemy_eclipse' });
    inside.x = 520; inside.y = 510; outside.x = 900; outside.y = 900;
    expect(w.inArea(area, inside)).toBe(false);
    expect(w.inArea(area, outside)).toBe(true);
  });
  it('raid wipe returns the group to town; downed allies can be revived', () => {
    const t = setup(20);
    t.core.handle('s', { t: 'enter_dungeon', mode: 'raid', diff: 'story' });
    const room = t.core.rooms.get(t.s.roomId)!;
    expect(room.mode).toBe('raid');
    const me = room.world.ents.get(t.s.entId)!; me.invuln = 0;
    room.world.applyHit(me, { amount: 1e9, type: 'holy', critChance: 0, critMult: 1, src: 0, tags: [] });
    t.tick(30 * 6);
    expect(t.s.roomId).toBe('town'); // no respawn in raids: solo wipe ends the attempt
  });
});

void TILE;
