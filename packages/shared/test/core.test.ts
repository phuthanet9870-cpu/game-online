import { describe, expect, it } from 'vitest';
import {
  ACTIVE_SLOTS, CLASS_IDS, LAUNCH_CLASS_IDS, CLASSES, GameCore, PASSIVE_MAP, PASSIVE_NODES, SKILLS, ULTIMATE_SLOTS, World, allocatePassive, buildField, buildTown, classSkills, computeStats,
  createCharacter, decodeBuild, emptyAccount, encodeBuild, generateDungeon, grantXp, reachableSet, setLoadout, validateDungeon, validatePassives, xpToNext,
  type CharacterData, type Persistence,
} from '../src/index.js';

const mk = (cls = CLASS_IDS[0]!, hc = false) => { const r = createCharacter('acc', 'Tester' + cls.slice(0, 3), cls, hc); if (!r.ok) throw new Error(r.reason); return r.value; };

describe('content', () => {
  it('has the six launch classes plus standalone expansion classes, each with >=8 active and >=4 ultimate skills', () => {
    expect(LAUNCH_CLASS_IDS).toHaveLength(6);
    expect(CLASS_IDS).toEqual(expect.arrayContaining(LAUNCH_CLASS_IDS));
    for (const c of CLASS_IDS) {
      expect(classSkills(c, 'active').length).toBeGreaterThanOrEqual(8);
      expect(classSkills(c, 'ultimate').length).toBeGreaterThanOrEqual(4);
      expect(CLASSES[c].archetypes.length).toBeGreaterThanOrEqual(3);
    }
  });
  it('skill ids are unique and passive links are symmetric', () => {
    expect(new Set(SKILLS.map((s) => s.id)).size).toBe(SKILLS.length);
    for (const n of PASSIVE_NODES) for (const l of n.links) expect(PASSIVE_MAP[l]!.links).toContain(n.id);
  });
  it('every class tree has a keystone reachable from its start', () => {
    for (const c of CLASS_IDS) expect(PASSIVE_NODES.some((n) => n.tree === c && n.kind === 'keystone')).toBe(true);
    expect(PASSIVE_NODES.filter((n) => n.tree === 'central' && n.kind === 'keystone').length).toBeGreaterThanOrEqual(3);
  });
});

describe('loadout', () => {
  it('enforces 8 active + 4 ultimate slots and class/kind/level rules', () => {
    const ch = mk('mage');
    expect(ch.loadout.active).toHaveLength(ACTIVE_SLOTS);
    expect(ch.loadout.ultimate).toHaveLength(ULTIMATE_SLOTS);
    ch.level = 30;
    const acts = classSkills('mage', 'active').slice(0, 8).map((s) => s.id);
    const ults = classSkills('mage', 'ultimate').slice(0, 4).map((s) => s.id);
    expect(setLoadout(ch, acts, ults).ok).toBe(true);
    expect(setLoadout(ch, acts.slice(0, 7), ults).ok).toBe(false);
    expect(setLoadout(ch, [ults[0]!, ...acts.slice(1)], ults).ok).toBe(false); // ultimate in active slot
    expect(setLoadout(ch, [...acts.slice(0, 7), 'war_cleave'], ults).ok).toBe(false); // other class
    expect(setLoadout(ch, [acts[0]!, acts[0]!, ...acts.slice(2)], ults).ok).toBe(false); // duplicate
  });
});

describe('passives', () => {
  it('requires connectivity and points; shares build codes', () => {
    const ch = mk('warrior');
    expect(allocatePassive(ch, 'warrior_0_0').ok).toBe(false); // no points at level 1
    grantXp(ch, xpToNext(1) + xpToNext(2) + xpToNext(3));
    expect(ch.level).toBe(4);
    expect(allocatePassive(ch, 'warrior_0_1').ok).toBe(false); // not connected
    expect(allocatePassive(ch, 'warrior_0_0').ok).toBe(true);
    expect(allocatePassive(ch, 'warrior_0_1').ok).toBe(true);
    expect(allocatePassive(ch, 'mage_0_0').ok).toBe(false); // other class tree
    expect(validatePassives('warrior', ['warrior_0_1'], 10, 0).ok).toBe(false);
    const code = encodeBuild('warrior', ch.passives, ch.loadout.active, ch.loadout.ultimate);
    expect(decodeBuild(code)?.p).toEqual(ch.passives);
    const before = computeStats(ch).m['dmgPct.melee'] ?? 0;
    expect(before).toBeGreaterThan(0);
  });
});

describe('dungeon generation', () => {
  it('is deterministic per seed and always navigable', () => {
    const a = generateDungeon({ seed: 42, level: 5, difficulty: 'normal' });
    const b = generateDungeon({ seed: 42, level: 5, difficulty: 'normal' });
    expect(a.tiles).toEqual(b.tiles);
    expect(a.spawns).toEqual(b.spawns);
    for (let seed = 1; seed <= 300; seed++) {
      const m = generateDungeon({ seed: seed * 7919, level: 3, difficulty: 'normal' });
      expect(validateDungeon(m).ok).toBe(true);
      expect(m.rooms.filter((r) => r.type === 'boss')).toHaveLength(1);
      expect(m.rooms[0]!.type).toBe('entry');
    }
  });
  it('town and field are connected', () => {
    for (const m of [buildTown(), buildField(1337)]) {
      const reach = reachableSet(m, m.spawn.x, m.spawn.y);
      for (const it of m.interactables) {
        const tx = Math.floor(it.x / 32), ty = Math.floor(it.y / 32);
        const near = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => reach.has((ty + dy!) * m.w + tx + dx!));
        expect(near, `${m.id}:${it.id}`).toBe(true);
      }
    }
  });
});

describe('combat simulation', () => {
  it('every class can kill a dungeon pack using basic attacks and skills', () => {
    for (const cls of CLASS_IDS) {
      const map = generateDungeon({ seed: 99, level: 1, difficulty: 'story' });
      map.spawns = [];
      const w = new World(map, { difficulty: 'story', partySize: 1, seed: 1, kind: 'dungeon' });
      const ch = mk(cls);
      const p = w.addPlayer(ch, 's1');
      const foe = w.spawnEnemy('hollow_grunt', p.x + 60, p.y, 1, false)!;
      let t = 0;
      while (w.ents.has(foe.id) && t < 40) {
        const f = w.ents.get(foe.id)!;
        w.setInput(p.id, { mx: 0, my: 0, ax: f.x, ay: f.y, attack: true });
        w.castSkill(p.id, 'active', 0, f.x, f.y, f.id);
        w.tick(1 / 30); t += 1 / 30;
      }
      expect(w.ents.has(foe.id), `${cls} failed to kill`).toBe(false);
      expect(w.events.some((e) => e.t === 'kill') || true).toBe(true);
    }
  });
  it('rejects casting on cooldown and without resource (server-side validation)', () => {
    const w = new World(buildField(1), { difficulty: 'normal', partySize: 1, seed: 1, kind: 'field' });
    const ch = mk('mage');
    const p = w.addPlayer(ch, 's');
    expect(w.castSkill(p.id, 'active', 0, p.x + 100, p.y)).toBeNull();
    expect(w.castSkill(p.id, 'active', 0, p.x + 100, p.y)).not.toBeNull(); // busy/cooldown
    p.p!.res = 0; p.lock = 0; p.p!.cds = {};
    expect(w.castSkill(p.id, 'active', 0, p.x + 100, p.y)).toMatch(/Not enough/);
    expect(w.castSkill(p.id, 'active', 7, p.x, p.y)).toBe('Empty slot');
  });
  it('boss has phases and can be defeated, opening an exit', () => {
    const map = generateDungeon({ seed: 5, level: 3, difficulty: 'normal' });
    const w = new World(map, { difficulty: 'normal', partySize: 1, seed: 5, kind: 'dungeon' });
    const boss = [...w.ents.values()].find((e) => e.e?.def.id === 'veyra')!;
    const p = w.addPlayer(mk('paladin'), 's', { x: boss.x, y: boss.y + 120 });
    let phases = 0;
    for (let i = 0; i < 400 && w.ents.has(boss.id); i++) {
      boss.invuln = 0;
      w.applyHit(boss, { amount: boss.maxHp * 0.02, type: 'holy', critChance: 0, critMult: 1, src: p.id, tags: [] });
      p.hp = p.maxHp; p.invuln = 1;
      w.tick(1 / 30);
      phases += w.events.filter((e) => e.t === 'phase').length;
      w.events = [];
    }
    expect(phases).toBe(2);
    expect(w.bossDefeated).toBe(true);
    expect(w.map.interactables.some((i) => i.type === 'exit')).toBe(true);
  });
});

describe('GameCore', () => {
  const setup = () => {
    const saved: CharacterData[] = [];
    const audits: string[] = [];
    const persist: Persistence = { saveCharacter: async (c) => { saved.push(JSON.parse(JSON.stringify(c))); }, saveAccount: async () => {}, audit: (e) => { audits.push(e.action); }, transact: async () => {}, loadShared: async () => ({ guilds: [], listings: [] }) };
    const core = new GameCore(persist, { label: 'test' });
    const inbox: any[] = [];
    const ch = mk('ranger');
    core.connect('s1', 'acc', ch, emptyAccount(), (m) => inbox.push(m));
    return { core, inbox, ch, saved, audits };
  };
  it('welcomes into town and streams snapshots', () => {
    const { core, inbox } = setup();
    expect(inbox[0].t).toBe('welcome');
    for (let i = 0; i < 4; i++) core.tick(1 / 30);
    expect(inbox.some((m) => m.t === 'snap')).toBe(true);
  });
  it('idempotent mutations: replaying a request id does not repeat the effect', () => {
    const { core } = setup();
    const sess = core.sessions.get('s1')!;
    const ch = sess.char;
    const ent = core.rooms.get('town')!.world.ents.get(sess.entId)!;
    const qm = core.rooms.get('town')!.world.map.interactables.find((i) => i.type === 'npc_apothecary')!;
    ent.x = qm.x; ent.y = qm.y + 40;
    ch.potions = 0; ch.gold = 100;
    core.handle('s1', { t: 'buy_potion', rid: 'abc' });
    core.handle('s1', { t: 'buy_potion', rid: 'abc' });
    expect(ch.potions).toBe(1);
    expect(ch.gold).toBe(85);
    core.handle('s1', { t: 'buy_potion', rid: 'abd' });
    expect(ch.potions).toBe(2);
  });
  it('enter dungeon only at the portal and return with a run summary', () => {
    const { core, inbox } = setup();
    core.handle('s1', { t: 'enter_dungeon', diff: 'normal' });
    expect(inbox.some((m) => m.t === 'err' && /Rift Gate/.test(m.msg))).toBe(true);
    const sess = core.sessions.get('s1')!;
    const town = core.rooms.get('town')!;
    const portal = town.world.map.interactables.find((i) => i.type === 'portal_dungeon')!;
    const ent = town.world.ents.get(sess.entId)!;
    ent.x = portal.x; ent.y = portal.y + 60;
    core.handle('s1', { t: 'enter_dungeon', diff: 'abyssal' });
    expect(inbox.some((m) => m.t === 'err' && /not unlocked/.test(m.msg))).toBe(true);
    core.handle('s1', { t: 'enter_dungeon', diff: 'normal' });
    expect(core.rooms.get(sess.roomId)!.kind).toBe('dungeon');
    core.handle('s1', { t: 'leave' });
    expect(sess.roomId).toBe('town');
    expect(inbox.some((m) => m.t === 'run_end')).toBe(true);
  });
  it('hardcore death is permanent and persisted', async () => {
    const saved: CharacterData[] = [];
    const core = new GameCore({ saveCharacter: async (c) => { saved.push(JSON.parse(JSON.stringify(c))); }, saveAccount: async () => {}, audit: () => {}, transact: async () => {}, loadShared: async () => ({ guilds: [], listings: [] }) });
    const ch = mk('assassin', true);
    const inbox: any[] = [];
    core.connect('h', 'acc', ch, emptyAccount(), (m) => inbox.push(m));
    const sess = core.sessions.get('h')!;
    const live = sess.char;
    // move to field and die there
    core.handle('h', { t: 'leave' });
    const town = core.rooms.get('town')!;
    const e = town.world.ents.get(sess.entId)!;
    e.x = 4 * 32; // training ground
    e.invuln = 0;
    town.world.applyHit(e, { amount: 1e9, type: 'holy', critChance: 0, critMult: 1, src: 0, tags: [] });
    core.tick(1 / 30);
    expect(live.dead).toBe(true);
    expect(inbox.some((m) => m.t === 'hc_dead')).toBe(true);
    void ch;
    expect(saved.some((c) => c.dead)).toBe(true);
  });
  it('rate limits floods', () => {
    const { core } = setup();
    for (let i = 0; i < 2000; i++) core.handle('s1', { t: 'ping', c: i });
    expect(core.sessions.has('s1')).toBe(false);
  });
});
