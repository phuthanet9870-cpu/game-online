import { World, generateDungeon, createCharacter, lineOfSight, findPath } from '@astra/shared';
const map = generateDungeon({ seed: 1856716021, level: 1, difficulty: 'story' });
const w = new World(map, { difficulty: 'story', partySize: 1, seed: 1, kind: 'dungeon' });
const ch = createCharacter('a', 'Dbgx', 'warrior', false); if (!ch.ok) throw 0;
const p = w.addPlayer(ch.value, 's');
const r1 = map.rooms[1]!;
console.log('room1', r1.type, 'player', p.x|0, p.y|0, 'r1 center', r1.cx*32, r1.cy*32);
let t = 0; let kills = 0;
for (let i = 0; i < 30 * 60; i++) {
  const foes = [...w.ents.values()].filter(e => e.kind === 'enemy' && !e.dead && lineOfSight(map, p.x, p.y, e.x, e.y)).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y));
  const f = foes[0];
  let tx = r1.cx*32+16, ty = r1.cy*32+16, atk = false;
  if (f && Math.hypot(f.x-p.x,f.y-p.y) < 400) { tx = f.x; ty = f.y; atk = true; }
  const path = findPath(map, p.x, p.y, tx, ty, 20000); const wp = path?.find(q => Math.hypot(q[0]-p.x,q[1]-p.y) > 20) ?? [tx,ty];
  let dx = wp[0]-p.x, dy = wp[1]-p.y; const l = Math.hypot(dx,dy)||1; const d = f ? Math.hypot(f.x-p.x,f.y-p.y) : 999;
  w.setInput(p.id, { mx: atk && d < 50 ? 0 : dx/l, my: atk && d < 50 ? 0 : dy/l, ax: tx, ay: ty, attack: atk });
  w.tick(1/30); t += 1/30;
  for (const ev of w.events) { if (ev.t === 'kill') kills++; }
  w.events = [];
  if (i % 90 === 0) console.log(t.toFixed(1), 'p', p.x|0, p.y|0, 'hp', p.hp|0, 'dead', p.dead, 'foe', f ? `${f.e!.def.id} ${f.hp|0}/${f.maxHp} d=${d|0}` : '-', 'kills', kills, 'lock', p.lock.toFixed(2), 'basicT', p.p!.basicT.toFixed(2));
}
