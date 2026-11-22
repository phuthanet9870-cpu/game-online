// Measures average snapshot payload per client in a busy field and a Rift (bytes of JSON per snapshot and per second).
import { GameCore, createCharacter, emptyAccount, type Persistence } from '../src/index.js';
const persist: Persistence = { saveCharacter: async () => {}, saveAccount: async () => {}, audit: () => {}, transact: async () => {}, loadShared: async () => ({ guilds: [], listings: [] }) };
for (const where of ['field', 'rift']) {
  const core = new GameCore(persist);
  let bytes = 0, snaps = 0;
  const r = createCharacter('a', 'Meter', 'necromancer', false); if (!r.ok) throw 0;
  r.value.level = 20;
  core.connect('s', 'a', r.value, emptyAccount(), (m: any) => { if (m.t === 'snap') { bytes += JSON.stringify(m).length; snaps++; } });
  const s = core.sessions.get('s')!;
  if (where === 'field') { (core as any).moveTo(s, 'field', { x: 40 * 32, y: 40 * 32 }); }
  else { const town = core.rooms.get('town')!; const p = town.world.map.interactables.find((i) => i.type === 'portal_dungeon')!; const e = town.world.ents.get(s.entId)!; e.x = p.x; e.y = p.y + 40; core.handle('s', { t: 'enter_dungeon', diff: 'normal' }); }
  bytes = 0; snaps = 0;
  for (let i = 0; i < 30 * 20; i++) { core.handle('s', { t: 'input', mx: Math.sin(i / 30), my: Math.cos(i / 40), ax: 0, ay: 0, atk: true }); if (i % 30 === 0) core.handle('s', { t: 'cast', k: 'a', s: 0, ax: 0, ay: 0 }); core.tick(1 / 30); }
  console.log(`${where}: ${snaps} snapshots, avg ${(bytes / snaps).toFixed(0)} B/snapshot, ${(bytes / 20 / 1024).toFixed(1)} KB/s`);
}
