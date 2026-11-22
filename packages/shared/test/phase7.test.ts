import { describe, expect, it } from 'vitest';
import { GameCore, GUILD_VAULT_SIZE, VAULT_LIMITS, World, addMember, buildField, createCharacter, createGuild, emptyAccount, generateDungeon, generateItem, Rng, vaultDeposit, vaultWithdraw, type Persistence, type PersistTx } from '../src/index.js';

const persistWith = (txs: PersistTx[] = []): Persistence => ({ saveCharacter: async () => {}, saveAccount: async () => {}, audit: () => {}, transact: async (t) => { txs.push(t); }, loadShared: async () => ({ guilds: [], listings: [] }) });
const mk = (name: string, cls: any = 'warrior') => { const r = createCharacter('acc-' + name, name, cls, false); if (!r.ok) throw new Error(r.reason); return r.value; };

describe('Chronomancer Time Echo', () => {
  it('every third skill echoes its damage 1s later at half power', () => {
    const map = generateDungeon({ seed: 3, level: 5, difficulty: 'story' }); map.spawns = [];
    const w = new World(map, { difficulty: 'story', partySize: 1, seed: 3, kind: 'dungeon' });
    const p = w.addPlayer(mk('Tempus', 'chronomancer'), 's');
    const foe = w.spawnEnemy('dummy', p.x + 120, p.y, 1, false)!;
    const hits: number[] = [];
    const cast = () => { p.lock = 0; p.p!.cds = {}; p.p!.res = 100; w.castSkill(p.id, 'active', 0, foe.x, foe.y, foe.id); };
    for (let n = 0; n < 3; n++) { cast(); for (let i = 0; i < 25; i++) { w.tick(1 / 30); for (const ev of w.events) if (ev.t === 'dmg' && ev.id === foe.id) hits.push(ev.v); w.events = []; } }
    for (let i = 0; i < 45; i++) { w.tick(1 / 30); for (const ev of w.events) if (ev.t === 'dmg' && ev.id === foe.id) hits.push(ev.v); w.events = []; }
    expect(hits.length).toBe(4); // three casts + one echo
    expect(p.p!.sec).toBeGreaterThanOrEqual(3); // Sand gathered
  });
});

describe('Eclipse Dimension', () => {
  it('pressure stacks over time and increases enemy damage and loot', () => {
    const map = generateDungeon({ seed: 9, level: 15, difficulty: 'normal' }); map.spawns = [];
    const w = new World(map, { difficulty: 'normal', partySize: 1, seed: 9, kind: 'dungeon', pressureEvery: 1 });
    w.addPlayer(mk('Diver'), 's');
    for (let i = 0; i < 95; i++) w.tick(1 / 30);
    expect(w.pressure).toBe(3);
    expect(w.events.some((e) => e.t === 'msg' && /Eclipse Pressure 3/.test(e.text))).toBe(true);
  });
});

describe('guild vault', () => {
  it('members are limited per day; officers more; items move atomically', () => {
    const lead = mk('Leadr'); lead.gold = 1000;
    const g = createGuild(lead, 'Vault Keepers', 'VK', [], 0, 'g1'); if (!g.ok) throw 0;
    const mem = mk('Membr'); addMember(g.value, mem, 0);
    for (let i = 0; i < 5; i++) { lead.inventory[i] = generateItem({ rng: new Rng(i + 1), ilvl: 5, rarity: 'rare' }); expect(vaultDeposit(g.value, lead, i, 0).ok).toBe(true); }
    expect(g.value.vault!.filter(Boolean)).toHaveLength(5);
    const day = 86400_000 * 10;
    for (let i = 0; i < VAULT_LIMITS.member; i++) expect(vaultWithdraw(g.value, mem, i, day).ok).toBe(true);
    expect(vaultWithdraw(g.value, mem, 3, day).ok).toBe(false); // limit reached
    expect(vaultWithdraw(g.value, mem, 3, day + 86400_000).ok).toBe(true); // next day
    expect(GUILD_VAULT_SIZE).toBe(30);
  });
  it('core commits the guild and character in one transaction', () => {
    const txs: PersistTx[] = [];
    const core = new GameCore(persistWith(txs));
    const ch = mk('Saver'); ch.gold = 1000;
    core.connect('s', 'acc-Saver', ch, emptyAccount(), () => {});
    const s = core.sessions.get('s')!;
    core.handle('s', { t: 'guild_create', name: 'Atomic Order', tag: 'AO' });
    s.char.inventory[0] = generateItem({ rng: new Rng(5), ilvl: 5, rarity: 'rare' });
    const town = core.rooms.get('town')!; const v = town.world.map.interactables.find((i) => i.type === 'stash')!;
    const e = town.world.ents.get(s.entId)!; e.x = v.x; e.y = v.y + 40;
    core.handle('s', { t: 'guild_vault_put', inv: 0 });
    expect(txs.some((t) => t.guilds?.length && t.characters?.length)).toBe(true);
    expect(s.char.inventory[0]).toBeNull();
  });
});

describe('pets and fishing', () => {
  it('a companion widens gold pickup', () => {
    const w = new World(buildField(1), { difficulty: 'normal', partySize: 1, seed: 1, kind: 'field' });
    const p = w.addPlayer(mk('Petty'), 's');
    w.addDrop(p, p.x + 150, p.y, undefined, 10);
    w.tick(1 / 30);
    expect(w.drops).toHaveLength(1);
    p.p!.pet = 'lumi_fox';
    w.tick(1 / 30);
    expect(w.drops).toHaveLength(0);
  });
  it('fishing: too early fails, pressing during the bite catches, prof XP granted', () => {
    const core = new GameCore(persistWith());
    const ch = mk('Angler');
    core.connect('s', 'acc', ch, emptyAccount(), () => {});
    const s = core.sessions.get('s')!;
    const field = core.rooms.get('field')!;
    const spot = field.world.map.interactables.find((i) => i.type === 'fishing')!;
    (core as any).moveTo(s, 'field', { x: spot.x, y: spot.y });
    core.handle('s', { t: 'interact' }); // cast
    core.handle('s', { t: 'interact' }); // too early
    expect(s.fishing).toBeNull();
    core.handle('s', { t: 'interact' });
    for (let i = 0; i < 30 * 6 && !s.fishing?.bit; i++) core.tick(1 / 30);
    expect(s.fishing?.bit).toBe(true);
    core.handle('s', { t: 'interact' });
    expect((s.char.mats.fish ?? 0) + (s.char.mats.golden_carp ?? 0)).toBe(1);
    expect(s.char.prof.fishing!.xp).toBeGreaterThan(0);
  });
});
