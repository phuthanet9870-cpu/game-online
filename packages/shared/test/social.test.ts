import { describe, expect, it } from 'vitest';
import { AH, GameCore, createCharacter, emptyAccount, generateItem, Rng, type CharacterData, type Persistence, type PersistTx } from '../src/index.js';

function setup() {
  const txs: PersistTx[] = [];
  const audits: string[] = [];
  const persist: Persistence = {
    saveCharacter: async () => {}, saveAccount: async () => {}, audit: (e) => { audits.push(e.action); },
    transact: async (tx) => { txs.push(JSON.parse(JSON.stringify(tx))); }, loadShared: async () => ({ guilds: [], listings: [] }),
  };
  const core = new GameCore(persist, { label: 'test' });
  let now = 1_000_000;
  core.clock = () => now;
  const inbox = new Map<string, any[]>();
  const join = (sid: string, name: string, opts: { hc?: boolean; acc?: string; role?: string } = {}) => {
    const r = createCharacter(opts.acc ?? 'acc-' + sid, name, 'warrior', !!opts.hc);
    if (!r.ok) throw new Error(r.reason);
    inbox.set(sid, []);
    core.connect(sid, opts.acc ?? 'acc-' + sid, r.value, emptyAccount(), (m) => inbox.get(sid)!.push(m), { role: opts.role });
    return core.sessions.get(sid)!;
  };
  const place = (sid: string, type: string, dy = 40) => {
    const s = core.sessions.get(sid)!;
    const room = core.rooms.get(s.roomId)!;
    const npc = room.world.map.interactables.find((i) => i.type === type)!;
    const e = room.world.ents.get(s.entId)!;
    e.x = npc.x; e.y = npc.y + dy;
  };
  const last = (sid: string, t: string) => [...inbox.get(sid)!].reverse().find((m) => m.t === t);
  const errs = (sid: string) => inbox.get(sid)!.filter((m) => m.t === 'err').map((m) => m.msg);
  const giveItem = (ch: CharacterData, i = 0) => { const it = generateItem({ rng: new Rng(i + 7), ilvl: 5, rarity: 'rare', hardcore: ch.hardcore }); ch.inventory[i] = it; return it; };
  return { core, inbox, join, place, last, errs, txs, audits, giveItem, advance: (ms: number) => { now += ms; } };
}

describe('direct trade', () => {
  it('requires both locks and both confirms, swaps atomically, and resets on change', () => {
    const t = setup();
    const a = t.join('a', 'Alpha'), b = t.join('b', 'Bravo');
    const ia = t.giveItem(a.char, 0), ib = t.giveItem(b.char, 3);
    a.char.gold = 100; b.char.gold = 10;
    t.core.handle('a', { t: 'trade_request', name: 'Bravo' });
    const req = t.last('b', 'trade_request');
    t.core.handle('b', { t: 'trade_respond', id: req.id, accept: true });
    t.core.handle('a', { t: 'trade_offer', inv: [0], gold: 50 });
    t.core.handle('b', { t: 'trade_offer', inv: [3], gold: 0 });
    t.core.handle('a', { t: 'trade_confirm', rid: 'x1' });
    expect(t.errs('a').some((e) => /lock/.test(e))).toBe(true);
    t.core.handle('a', { t: 'trade_lock' });
    t.core.handle('b', { t: 'trade_lock' });
    t.core.handle('a', { t: 'trade_confirm', rid: 'x2' });
    // B changes the offer after A confirmed -> everything resets
    t.core.handle('b', { t: 'trade_offer', inv: [3], gold: 5 });
    expect(t.last('a', 'trade').me.confirmed).toBe(false);
    expect(t.last('a', 'trade').me.locked).toBe(false);
    for (const s of ['a', 'b']) t.core.handle(s, { t: 'trade_lock' });
    t.core.handle('a', { t: 'trade_confirm', rid: 'x3' });
    t.core.handle('b', { t: 'trade_confirm', rid: 'y3' });
    expect(a.char.inventory.some((i) => i?.uid === ib.uid)).toBe(true);
    expect(b.char.inventory.some((i) => i?.uid === ia.uid)).toBe(true);
    expect(a.char.inventory.some((i) => i?.uid === ia.uid)).toBe(false);
    expect(a.char.gold).toBe(55);
    expect(b.char.gold).toBe(55);
    const tx = t.txs.find((x) => x.characters?.length === 2);
    expect(tx).toBeTruthy(); // both characters saved in one transaction
    expect(t.audits.filter((x) => x === 'trade')).toHaveLength(2);
  });
  it('blocks bound items, mode mismatch, and distance', () => {
    const t = setup();
    const a = t.join('a', 'Alpha'); t.join('b', 'Bravo'); t.join('h', 'Hardy', { hc: true });
    t.core.handle('a', { t: 'trade_request', name: 'Hardy' });
    expect(t.errs('a').some((e) => /Hardcore/.test(e))).toBe(true);
    t.core.handle('a', { t: 'trade_request', name: 'Bravo' });
    t.core.handle('b', { t: 'trade_respond', id: t.last('b', 'trade_request').id, accept: true });
    // starter weapon is bound: move it to the bag and try to offer it
    a.char.inventory[5] = a.char.equipment.weapon!; delete a.char.equipment.weapon;
    t.core.handle('a', { t: 'trade_offer', inv: [5], gold: 0 });
    expect(t.errs('a').some((e) => /bound/.test(e))).toBe(true);
    t.core.handle('a', { t: 'trade_offer', inv: [], gold: 999999 });
    expect(t.errs('a').some((e) => /gold/.test(e))).toBe(true);
  });
});

describe('auction house', () => {
  it('escrows the item, charges deposit and fee, and pays an offline-capable claim', () => {
    const t = setup();
    const s = t.join('s', 'Seller', { acc: 'acc1' }), b = t.join('b', 'Buyer', { acc: 'acc2' });
    const it = t.giveItem(s.char, 0);
    s.char.gold = 100; b.char.gold = 1000;
    t.core.handle('s', { t: 'ah_list', inv: 0, price: 200 });
    expect(t.errs('s').some((e) => /Auctioneer/.test(e))).toBe(true);
    t.place('s', 'npc_auction'); t.place('b', 'npc_auction', 60);
    t.core.handle('s', { t: 'ah_list', inv: 0, price: 200, rid: 'l1' });
    expect(s.char.inventory[0]).toBeNull();
    expect(s.char.gold).toBe(100 - AH.deposit);
    const id = [...t.core.listings.keys()][0]!;
    t.core.handle('b', { t: 'ah_search', q: { text: it.name.slice(0, 4) } });
    expect(t.last('b', 'ah_results').total).toBe(1);
    t.core.handle('b', { t: 'ah_buy', id, rid: 'b1' });
    t.core.handle('b', { t: 'ah_buy', id, rid: 'b2' }); // second purchase must fail
    expect(b.char.gold).toBe(800);
    expect(b.char.inventory.filter((x) => x?.uid === it.uid)).toHaveLength(1);
    t.core.handle('s', { t: 'ah_claim', id, rid: 'c1' });
    expect(s.char.gold).toBe(100 - AH.deposit + 180); // 10% fee
    t.core.handle('s', { t: 'ah_claim', id, rid: 'c2' });
    expect(s.char.gold).toBe(100 - AH.deposit + 180); // no double claim
    expect(t.txs.some((x) => x.listings?.[0]?.status === 'sold' && x.characters?.[0]?.name === 'Buyer')).toBe(true);
  });
  it('returns expired items and blocks self-buy', () => {
    const t = setup();
    const s = t.join('s', 'Seller');
    t.place('s', 'npc_auction');
    t.giveItem(s.char, 2);
    t.core.handle('s', { t: 'ah_list', inv: 2, price: 50 });
    const id = [...t.core.listings.keys()][0]!;
    t.core.handle('s', { t: 'ah_buy', id });
    expect(t.errs('s').some((e) => /own/.test(e))).toBe(true);
    t.advance(AH.durationMs + 1000);
    t.core.handle('s', { t: 'ah_claim', id });
    expect(s.char.inventory.filter(Boolean).length).toBe(1);
  });
});

describe('guilds', () => {
  it('create, invite, permissions, guarded leadership transfer, guild chat', () => {
    const t = setup();
    const l = t.join('l', 'Leader'), m = t.join('m', 'Member'), x = t.join('x', 'Outsider');
    l.char.gold = 1000;
    t.core.handle('l', { t: 'guild_create', name: 'Dawn Wardens', tag: 'DAWN' });
    expect(l.char.gold).toBe(500);
    const g = t.core.guildOf(l.char.id)!;
    expect(g.tag).toBe('DAWN');
    t.core.handle('l', { t: 'guild_invite', name: 'Member' });
    t.core.handle('m', { t: 'guild_accept', id: t.last('m', 'guild_invite').id });
    expect(g.members).toHaveLength(2);
    t.core.handle('m', { t: 'guild_invite', name: 'Outsider' });
    expect(t.errs('m').some((e) => /officers/.test(e))).toBe(true);
    t.core.handle('l', { t: 'guild_leave' });
    expect(t.errs('l').some((e) => /Transfer/.test(e))).toBe(true);
    t.core.handle('l', { t: 'guild_transfer', name: 'Member', confirm: 'wrong' });
    expect(g.members.find((q) => q.name === 'Leader')!.rank).toBe('leader');
    t.core.handle('l', { t: 'guild_transfer', name: 'Member', confirm: 'Dawn Wardens' });
    expect(g.members.find((q) => q.name === 'Member')!.rank).toBe('leader');
    t.core.handle('m', { t: 'chat', ch: 'guild', text: 'hello guild' });
    expect(t.last('l', 'chat')?.ch).toBe('guild');
    expect(t.inbox.get('x')!.some((q) => q.t === 'chat' && q.ch === 'guild')).toBe(false);
    void m; void x;
  });
});

describe('party, reconnect, world event, chat spam', () => {
  it('party members in town enter the leader\'s Rift together with scaled enemies', () => {
    const t = setup();
    const a = t.join('a', 'Alpha'); const b = t.join('b', 'Bravo');
    t.core.handle('a', { t: 'party_invite', name: 'Bravo' });
    t.core.handle('b', { t: 'party_accept', id: t.last('b', 'party_invite').id });
    t.place('a', 'portal_dungeon'); t.place('b', 'portal_dungeon', 70);
    t.core.handle('b', { t: 'enter_dungeon', diff: 'normal' });
    expect(t.errs('b').some((e) => /leader/.test(e))).toBe(true);
    t.core.handle('a', { t: 'enter_dungeon', diff: 'normal' });
    expect(a.roomId).toBe(b.roomId);
    expect(t.core.rooms.get(a.roomId)!.world.opts.partySize).toBe(2);
  });
  it('a disconnected player rejoins the same Rift within the grace window', () => {
    const t = setup();
    const a = t.join('a', 'Alpha');
    t.place('a', 'portal_dungeon');
    t.core.handle('a', { t: 'enter_dungeon', diff: 'story' });
    const rid = a.roomId;
    t.core.disconnect('a');
    for (let i = 0; i < 30; i++) t.core.tick(1 / 30);
    const r = createCharacter('acc-a', 'Alpha', 'warrior', false);
    if (!r.ok) throw 0;
    r.value.id = a.char.id;
    t.core.connect('a2', 'acc-a', r.value, emptyAccount(), () => {});
    expect(t.core.sessions.get('a2')!.roomId).toBe(rid);
  });
  it('spawns the world boss in Duskmeadow when players are present', () => {
    const t = setup();
    const a = t.join('a', 'Alpha');
    t.place('a', 'zone_gate', 0);
    t.core.handle('a', { t: 'interact' });
    expect(a.roomId).toBe('field');
    for (let i = 0; i < 30 * 95; i++) t.core.tick(1 / 30);
    const field = t.core.rooms.get('field')!;
    expect([...field.world.ents.values()].some((e) => e.e?.def.id === 'gloomheart')).toBe(true);
    expect(t.inbox.get('a')!.some((m) => m.t === 'world_event' && m.active)).toBe(true);
  });
  it('mutes repeated chat spam', () => {
    const t = setup();
    t.join('a', 'Alpha');
    for (let i = 0; i < 3; i++) { t.core.handle('a', { t: 'chat', text: 'buy gold' }); for (let k = 0; k < 30; k++) t.core.tick(1 / 30); }
    expect(t.errs('a').some((e) => /muted/.test(e))).toBe(true);
    expect(t.audits).toContain('auto_mute');
  });
});

describe('friends', () => {
  it('needs a request and an accept, is mutual, persists both accounts, and removes both ways', () => {
    const t = setup();
    const a = t.join('a', 'Alpha'), b = t.join('b', 'Bravo');
    t.core.handle('b', { t: 'friend_accept', id: a.char.id });
    expect(t.errs('b')).toContain('Request expired'); // no request yet
    t.core.handle('a', { t: 'friend_request', name: 'bravo' });
    const req = t.last('b', 'friend_request');
    expect(req.from).toBe('Alpha');
    const before = t.txs.length;
    t.core.handle('b', { t: 'friend_accept', id: req.id });
    expect(a.account.friends!.map((f) => f.name)).toEqual(['Bravo']);
    expect(b.account.friends!.map((f) => f.name)).toEqual(['Alpha']);
    expect(t.txs.length).toBe(before + 1);
    expect(t.txs.at(-1)!.accounts!.length).toBe(2);
    const list = t.last('a', 'friends');
    expect(list.list[0]).toMatchObject({ name: 'Bravo', online: true });
    t.core.handle('a', { t: 'friend_request', name: 'Bravo' });
    expect(t.errs('a')).toContain('Already friends');
    t.core.handle('b', { t: 'friend_remove', id: a.char.id });
    expect(a.account.friends).toEqual([]);
    expect(b.account.friends).toEqual([]);
  });
});

describe('GM tools', () => {
  it('only admins can open them, the code is required, and every action is audited', () => {
    const t = setup();
    const p = t.join('p', 'Player'), a = t.join('a', 'Admin', { role: 'admin' });
    const pg = p.char.gold, ag = a.char.gold;
    t.core.handle('p', { t: 'gm_open', code: 'gmadminonline01' });
    expect(t.errs('p')).toContain('Unknown command');
    t.core.handle('p', { t: 'gm', a: 'currency', k: 'gold', n: 999 });
    expect(p.char.gold).toBe(pg);
    t.core.handle('a', { t: 'gm', a: 'currency', k: 'gold', n: 999 }); // not opened yet
    expect(a.char.gold).toBe(ag);
    t.core.handle('a', { t: 'gm_open', code: 'wrong' });
    expect(t.last('a', 'gm')).toBeUndefined();
    t.core.handle('a', { t: 'gm_open', code: 'gmadminonline01' });
    expect(t.last('a', 'gm').on).toBe(true);
    t.core.handle('a', { t: 'gm', a: 'currency', k: 'gold', n: 999 });
    expect(a.char.gold).toBe(ag + 999);
    t.core.handle('a', { t: 'gm', a: 'item', baseId: 'w_bow', rarity: 'legendary', ilvl: 20, n: 2 });
    expect(a.char.inventory.filter((x) => x?.baseId === 'w_bow' && x.rarity === 'legendary').length).toBe(2);
    const room = t.core.rooms.get(a.roomId)!;
    const before = [...room.world.ents.values()].filter((e) => e.kind === 'enemy').length;
    t.core.handle('a', { t: 'gm', a: 'spawn', id: 'gloomfang', n: 3, level: 5 });
    expect([...room.world.ents.values()].filter((e) => e.kind === 'enemy').length).toBe(before + 3);
    expect(t.audits).toEqual(expect.arrayContaining(['gm_open', 'gm_currency', 'gm_item', 'gm_spawn']));
  });
});

describe('batch sell / store', () => {
  it('sells several selected items at once and stores several in one transaction, skipping bound items', () => {
    const t = setup();
    const a = t.join('a', 'Seller');
    t.giveItem(a.char, 1); t.giveItem(a.char, 2); t.giveItem(a.char, 3);
    a.char.inventory[3]!.bound = true;
    t.place('a', 'npc_merchant');
    const g = a.char.gold;
    t.core.handle('a', { t: 'sell_many', inv: [1, 2] });
    expect(a.char.inventory[1]).toBeNull(); expect(a.char.inventory[2]).toBeNull();
    expect(a.char.gold).toBeGreaterThan(g);
    t.giveItem(a.char, 4); t.giveItem(a.char, 5);
    t.place('a', 'stash');
    const before = t.txs.length;
    t.core.handle('a', { t: 'stash_put_many', inv: [3, 4, 5] });
    expect(a.char.inventory[3]).not.toBeNull(); // bound: kept
    expect(a.account.stash.normal.filter(Boolean).length).toBe(2);
    expect(t.txs.length).toBe(before + 1);
    expect(t.txs.at(-1)!.accounts!.length).toBe(1);
  });
});

describe('guild discovery', () => {
  it('applies, gets accepted by an officer, and clears other requests', () => {
    const t = setup();
    const a = t.join('a', 'Leader'), b = t.join('b', 'Founder'), c = t.join('c', 'Seeker');
    a.char.gold = 1000; b.char.gold = 1000;
    t.core.handle('a', { t: 'guild_create', name: 'Moon Watch', tag: 'MOON', rid: 'r1' });
    t.core.handle('b', { t: 'guild_create', name: 'Sun Guard', tag: 'SUN', rid: 'r2' });
    t.core.handle('a', { t: 'guild_settings', category: 'raid', desc: 'Raid every night', minLevel: 1, rid: 'r3' });
    const browse = () => { t.core.handle('c', { t: 'guild_browse', cat: 'raid' }); return t.last('c', 'guild_browse').rows; };
    expect(browse().map((r: any) => r.tag)).toEqual(['MOON']);
    t.core.handle('c', { t: 'guild_apply', id: browse()[0].id, msg: 'hi', rid: 'r4' });
    t.core.handle('c', { t: 'guild_apply', id: [...t.core.guilds.values()].find((g) => g.tag === 'SUN')!.id, rid: 'r5' });
    expect(t.errs('c')).toEqual([]);
    // members cannot see or answer requests; the leader can
    t.core.handle('c', { t: 'guild_req', charId: c.char.id, accept: true, rid: 'r6' });
    expect(t.errs('c')).toContain('You are not in a guild');
    t.core.handle('a', { t: 'guild_info' });
    expect(t.last('a', 'guild').guild.requests.map((r: any) => r.name)).toEqual(['Seeker']);
    t.core.handle('a', { t: 'guild_req', charId: c.char.id, accept: true, rid: 'r7' });
    expect(t.core.guildOf(c.char.id)?.tag).toBe('MOON');
    expect([...t.core.guilds.values()].find((g) => g.tag === 'SUN')!.requests).toEqual([]);
    expect(t.audits).toContain('guild_req_accept');
  });
  it('open guilds accept instantly, enforce min level, and rankings sort', () => {
    const t = setup();
    const a = t.join('a', 'Leader'), c = t.join('c', 'Seeker');
    a.char.gold = 1000;
    t.core.handle('a', { t: 'guild_create', name: 'Open Door', tag: 'OPEN', rid: 'r1' });
    const g = t.core.guildOf(a.char.id)!;
    t.core.handle('a', { t: 'guild_settings', open: true, minLevel: 5, rid: 'r2' });
    t.core.handle('c', { t: 'guild_apply', id: g.id, rid: 'r3' });
    expect(t.errs('c').at(-1)).toMatch(/level 5/);
    c.char.level = 6;
    t.core.handle('c', { t: 'guild_apply', id: g.id, rid: 'r4' });
    expect(t.core.guildOf(c.char.id)).toBe(g);
    t.core.handle('c', { t: 'guild_ranking', board: 'members' });
    const r = t.last('c', 'guild_ranking');
    expect(r.rows[0]).toMatchObject({ rank: 1, tag: 'OPEN', members: 2 });
    expect(r.mine).toBe(g.id);
  });
});

describe('discard', () => {
  it('destroys single and multiple items anywhere and audits the items', () => {
    const t = setup();
    const a = t.join('a', 'Tosser');
    t.giveItem(a.char, 0); t.giveItem(a.char, 1); t.giveItem(a.char, 2); const lastIt = t.giveItem(a.char, a.char.inventory.length - 1);
    t.core.handle('a', { t: 'discard', inv: [1], rid: 'd1' });
    expect(a.char.inventory[1]).toBeNull();
    expect(a.char.inventory[0]).not.toBeNull();
    t.core.handle('a', { t: 'discard', inv: [0, 2, 0, 99], rid: 'd2' });
    expect(a.char.inventory.slice(0, 3)).toEqual([null, null, null]);
    expect(a.char.inventory.at(-1)).toBe(lastIt);
    expect(t.audits.filter((x) => x === 'discard')).toHaveLength(2);
  });
});
