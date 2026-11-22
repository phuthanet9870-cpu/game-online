import { CONTENT, getWeapon, type MapData } from '../../src/core/content';
import { GameSimulation, type ActionRequest, type PlayerInput } from '../../src/core/simulation';

export const DT = 1000 / 60;

/** Open 12x12 arena with a solid border; optional extra solid tiles. */
export function arenaMap(
  spawns: MapData['monsterSpawns'] = [],
  solids: Array<[number, number]> = [],
): MapData {
  const w = 12,
    h = 12,
    ts = 16;
  const collision = new Array(w * h).fill(0);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) collision[y * w + x] = 1;
  for (const [x, y] of solids) collision[y * w + x] = 1;
  return {
    mapId: 'TEST',
    displayName: 'Test Arena',
    width: w,
    height: h,
    tileSize: ts,
    ground: new Array(w * h).fill(0),
    collision,
    playerSpawn: { x: 3 * ts + 8, y: 6 * ts + 8 },
    npcs: [],
    portals: [],
    kind: 'dev',
    monsterSpawns: spawns,
  };
}

export function makeSim(map: MapData = arenaMap(), seed = 1): GameSimulation {
  return new GameSimulation({
    map,
    weapon: getWeapon('sword'),
    monsters: CONTENT.monsters,
    player: CONTENT.player,
    seed,
  });
}

export function run(sim: GameSimulation, ms: number, input: Partial<PlayerInput> = {}): void {
  const steps = Math.round(ms / DT);
  for (let i = 0; i < steps; i++)
    sim.step(DT, { move: input.move ?? { x: 0, y: 0 }, aim: input.aim ?? null, actions: [] });
}

export function press(sim: GameSimulation, req: ActionRequest, aim: PlayerInput['aim'] = null): void {
  sim.step(DT, { move: { x: 0, y: 0 }, aim, actions: [req] });
}
