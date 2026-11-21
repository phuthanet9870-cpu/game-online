import { Simulation } from '../../client/src/core/simulation.js';
export { Simulation };
export const TILE = 16;
/** Simulation with only the first `keep` monsters (others removed) for isolated tests. */
export function makeSim({ seed = 1, keep = 1 } = {}) {
  const sim = new Simulation({ seed });
  for (const m of sim.monsters.slice(keep)) sim.entities.delete(m.id);
  sim.monsters = sim.monsters.slice(0, keep);
  sim.drainEvents();
  return sim;
}
export const run = (sim, seconds) => { const n = Math.round(seconds / sim.dt); for (let i = 0; i < n; i++) sim.step(); };
export const place = (e, x, y) => { e.x = x; e.y = y; if (e.anchor) { e.anchor.x = x; e.anchor.y = y; } };
/** Freeze a monster so it neither moves nor attacks (keeps it a passive target). */
export const freeze = (m) => { m.def = { ...m.def, aggroRadius: 0, patrolRadius: 0, idleTime: [999, 999] }; m.ai.idleFor = 999; };
