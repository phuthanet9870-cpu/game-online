import { describe, expect, it } from 'vitest';
import { GameCore, TUTORIAL, createCharacter, emptyAccount, type Persistence } from '../src/index.js';
const persist: Persistence = { saveCharacter: async () => {}, saveAccount: async () => {}, audit: () => {}, transact: async () => {}, loadShared: async () => ({ guilds: [], listings: [] }) };
describe('tutorial', () => {
  it('advances only on the matching observed action, pays gold, and can be skipped', () => {
    const core = new GameCore(persist);
    const inbox: any[] = [];
    const r = createCharacter('a', 'Newbie', 'ranger', false); if (!r.ok) throw 0;
    core.connect('s', 'a', r.value, emptyAccount(), (m) => inbox.push(m));
    const s = core.sessions.get('s')!;
    expect(s.char.tutorial).toBe(0);
    const g0 = s.char.gold;
    core.handle('s', { t: 'dodge', dx: 1, dy: 0 }); // wrong step: nothing happens
    for (let i = 0; i < 15; i++) core.tick(1 / 30); // let the roll finish
    expect(s.char.tutorial).toBe(0);
    core.handle('s', { t: 'input', mx: 1, my: 0, ax: 0, ay: 0, atk: false });
    expect(s.char.tutorial).toBe(1);
    expect(s.char.gold).toBe(g0 + TUTORIAL[0]!.gold);
    const town = core.rooms.get('town')!;
    const dummy = [...town.world.ents.values()].find((x) => x.e?.def.id === 'dummy')!;
    const e = town.world.ents.get(s.entId)!; e.x = dummy.x + 60; e.y = dummy.y;
    core.handle('s', { t: 'input', mx: 0, my: 0, ax: dummy.x, ay: dummy.y, atk: true });
    for (let i = 0; i < 60 && s.char.tutorial === 1; i++) core.tick(1 / 30);
    expect(s.char.tutorial).toBe(2); // hit the dummy
    core.handle('s', { t: 'tutorial_skip' });
    expect(s.char.tutorial).toBe(-1);
    expect(inbox.filter((m) => m.t === 'tutorial').pop().cur).toBeNull();
  });
  it('existing veterans are not dragged into the tutorial', () => {
    const core = new GameCore(persist);
    const r = createCharacter('a', 'Veteran', 'mage', false); if (!r.ok) throw 0;
    r.value.level = 12; delete (r.value as any).tutorial;
    core.connect('s', 'a', r.value, emptyAccount(), () => {});
    expect(core.sessions.get('s')!.char.tutorial).toBe(-1);
  });
});
