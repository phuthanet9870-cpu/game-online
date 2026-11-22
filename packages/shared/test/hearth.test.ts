import { describe, expect, it } from 'vitest';
import { ENEMIES, GameCore, HOUSE, buildHouse, buildWastes, createCharacter, emptyAccount, emptyHouse, reachableSet, validatePlacement, type Persistence, type PersistTx } from '../src/index.js';

const persist = (txs: PersistTx[] = []): Persistence => ({ saveCharacter: async () => {}, saveAccount: async () => {}, audit: () => {}, transact: async (t) => { txs.push(t); }, loadShared: async () => ({ guilds: [], listings: [] }) });
const mk = (name: string, acc = 'acc-' + name) => { const r = createCharacter(acc, name, 'paladin', false); if (!r.ok) throw new Error(r.reason); return r.value; };

describe('Starfall Wastes', () => {
  it('is connected, Shardborn only, levels 20-30, has starglass', () => {
    const m = buildWastes();
    const reach = reachableSet(m, m.spawn.x, m.spawn.y);
    for (const it of m.interactables) { const tx = Math.floor(it.x / 32), ty = Math.floor(it.y / 32); expect([[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => reach.has((ty + dy!) * m.w + tx + dx!)), it.id).toBe(true); }
    expect(m.spawns.every((s) => ENEMIES[s.enemy]!.family === 'shardborn' && s.level! >= 20 && s.level! <= 30)).toBe(true);
    expect(m.interactables.some((i) => i.res === 'starglass')).toBe(true);
  });
});

describe('Hearth placement rules', () => {
  it('rejects unowned, out-of-bounds, overlapping, doorway-blocking and access-blocking placements', () => {
    const h = emptyHouse();
    expect(validatePlacement(h, 'table', 3, 3)).toMatch(/none of that/);
    h.owned = { table: 1, bed: 2, chest: 1, bookshelf: 20 };
    expect(validatePlacement(h, 'table', HOUSE.w - 2, 3)).toMatch(/fit/);
    expect(validatePlacement(h, 'table', 3, 3)).toBeNull();
    h.placed.push({ id: 'table', x: 3, y: 3 });
    expect(validatePlacement(h, 'bed', 4, 3)).toMatch(/Overlaps/);
    expect(validatePlacement(h, 'bed', HOUSE.doorX - 1, HOUSE.h - 4)).toMatch(/doorway/);
    // wall the chest into a corner with bookshelves
    h.placed.push({ id: 'chest', x: 1, y: 1 });
    expect(validatePlacement(h, 'bookshelf', 1, 2)).toBeNull(); // chest still reachable from below
    h.placed.push({ id: 'bookshelf', x: 1, y: 2 });
    expect(validatePlacement(h, 'bookshelf', 1, 3)).toMatch(/block access/); // this would seal it in
  });
  it('functional furniture becomes the right interactable; dummy spawns an enemy', () => {
    const h = emptyHouse(); h.owned = { chest: 1, anvil: 1, dummy: 1, rug: 1 };
    h.placed = [{ id: 'chest', x: 2, y: 2 }, { id: 'anvil', x: 5, y: 2 }, { id: 'dummy', x: 9, y: 4 }, { id: 'rug', x: 10, y: 7 }];
    const m = buildHouse('a', 'Owner', h);
    expect(m.interactables.some((i) => i.type === 'stash')).toBe(true);
    expect(m.interactables.some((i) => i.type === 'npc_smith')).toBe(true);
    expect(m.interactables.find((i) => i.furn === 'rug')!.deco).toBe(true);
    expect(m.spawns.some((s) => s.enemy === 'dummy')).toBe(true);
  });
});

describe('Hearth in the core', () => {
  it('buy at the carpenter (one transaction), place at home, visitors need permission', () => {
    const txs: PersistTx[] = [];
    const core = new GameCore(persist(txs));
    const owner = mk('Homey'); owner.gold = 5000; owner.mats = { iron_ore: 10 };
    core.connect('o', 'acc-Homey', owner, emptyAccount(), () => {});
    const visitor = mk('Guesty');
    const vin: any[] = [];
    core.connect('v', 'acc-Guesty', visitor, emptyAccount(), (m) => vin.push(m));
    const s = core.sessions.get('o')!;
    const town = core.rooms.get('town')!;
    const carp = town.world.map.interactables.find((i) => i.type === 'npc_carpenter')!;
    const e = town.world.ents.get(s.entId)!; e.x = carp.x; e.y = carp.y + 40;
    core.handle('o', { t: 'house_buy', id: 'chest' });
    core.handle('o', { t: 'house_buy', id: 'table' });
    expect(s.account.house!.owned.chest).toBe(1);
    expect(txs.some((t) => t.characters?.length && t.accounts?.length)).toBe(true);
    core.handle('o', { t: 'house_place', id: 'table', x: 3, y: 3 });
    expect(s.account.house!.placed).toHaveLength(0); // must be inside the Hearth
    const door = town.world.map.interactables.find((i) => i.type === 'house_door')!;
    const e2 = town.world.ents.get(s.entId)!; e2.x = door.x; e2.y = door.y + 20;
    core.handle('o', { t: 'interact' });
    expect(s.roomId).toBe('house:acc-Homey');
    core.handle('o', { t: 'house_place', id: 'chest', x: 2, y: 2 });
    core.handle('o', { t: 'house_place', id: 'table', x: 6, y: 3 });
    expect(s.account.house!.placed).toHaveLength(2);
    const home = core.rooms.get(s.roomId)!;
    expect(home.world.map.interactables.some((i) => i.type === 'stash')).toBe(true);
    core.handle('v', { t: 'house_visit', name: 'Homey' });
    expect(vin.some((m) => m.t === 'err' && /private/.test(m.msg))).toBe(true);
    core.handle('o', { t: 'house_perm', perm: 'public' });
    core.handle('v', { t: 'house_visit', name: 'Homey' });
    expect(core.sessions.get('v')!.roomId).toBe('house:acc-Homey');
    core.handle('v', { t: 'house_place', id: 'chest', x: 8, y: 8 });
    expect(vin.some((m) => m.t === 'err' && /your Hearth/.test(m.msg))).toBe(true);
  });
  it('treasure: map read in the open world, exact spot hidden from the client, dig rewards', () => {
    const core = new GameCore(persist());
    const ch = mk('Digger'); ch.mats = { treasure_map: 1 }; ch.level = 10;
    const inbox: any[] = [];
    core.connect('s', 'acc-Digger', ch, emptyAccount(), (m) => inbox.push(m));
    const s = core.sessions.get('s')!;
    core.handle('s', { t: 'use_map' });
    expect(inbox.some((m) => m.t === 'err' && /open world/.test(m.msg))).toBe(true);
    (core as any).moveTo(s, 'field');
    core.handle('s', { t: 'use_map' });
    const tr = s.char.treasure!;
    expect(tr.zone).toBe('field');
    const last = [...inbox].reverse().find((m) => m.t === 'char');
    expect(last.char.treasure.x).toBe(-1); // exact spot never sent
    const field = core.rooms.get('field')!;
    const e = field.world.ents.get(s.entId)!;
    e.x = tr.x + 500; e.y = tr.y; core.handle('s', { t: 'interact' });
    expect(s.char.treasure).not.toBeNull();
    e.x = tr.x; e.y = tr.y;
    field.world.map.interactables = field.world.map.interactables.filter((i) => Math.hypot(i.x - tr.x, i.y - tr.y) > 120);
    core.handle('s', { t: 'interact' });
    expect(s.char.treasure).toBeNull();
    expect(field.world.drops.filter((d) => d.owner === e.id).length).toBeGreaterThanOrEqual(3);
  });
});
