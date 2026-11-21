import { describe, expect, it } from "vitest";
import { GameMap, ITEM_OWNER_MS } from "../shared";
import { ITEMS, MONSTERS, SPAWNS, validateContent, type MonsterDef, type SpawnDef } from "../shared/content";
import { hitChance, rollAttack, seededRng } from "./combat";
import { WorldSim } from "./world";

const open = (w = 20, h = 20) => new GameMap({ id: "t", name: "t", spawn: { x: 1, y: 1 }, tiles: Array(h).fill(".".repeat(w)) });

const dummy = (over: Partial<MonsterDef> = {}): MonsterDef => ({
  id: "dummy", name: "Dummy", level: 1, hp: 30, atk: [5, 5], def: 0, hit: 100, flee: 0, attackDelayMs: 1000,
  attackRange: 1, walkSpeed: 3, sight: 0, chaseRange: 8,
  modes: { aggressive: false, assist: false, randomWalk: false },
  look: { shape: "blob", color: "#fff", size: 1 },
  drops: [{ item: "gloop_gel", rate: 10000 }],
  ...over,
});

/** Run the sim in 50 ms ticks until `done` or `ms` elapse. Returns the end time. */
function run(sim: WorldSim, start: number, ms: number, done: () => boolean = () => false, onTick?: (e: ReturnType<WorldSim["tick"]>) => void) {
  let now = start;
  for (; now < start + ms && !done(); now += 50) {
    const events = sim.tick(50, now);
    onTick?.(events);
  }
  return now;
}

describe("content", () => {
  it("is consistent", () => {
    expect(() => validateContent()).not.toThrow();
    expect(Object.keys(MONSTERS).length).toBeGreaterThan(0);
    expect(Object.keys(ITEMS).length).toBeGreaterThan(0);
    expect(SPAWNS["starter-field"].length).toBeGreaterThan(0);
  });
});

describe("combat", () => {
  it("clamps hit chance between 5% and 95%", () => {
    const s = (hit: number, flee: number) => ({ atk: [1, 1] as const, def: 0, hit, flee });
    expect(hitChance(s(0, 0), s(0, 0))).toBe(0.8);
    expect(hitChance(s(500, 0), s(0, 0))).toBe(0.95);
    expect(hitChance(s(0, 0), s(0, 500))).toBe(0.05);
  });

  it("rolls damage inside the ATK range minus DEF, never below 1", () => {
    const rng = seededRng(1);
    const a = { atk: [10, 20] as const, def: 0, hit: 1000, flee: 0 };
    for (let i = 0; i < 500; i++) {
      const r = rollAttack(a, { atk: [0, 0], def: 5, hit: 0, flee: 0 }, rng);
      if (!r.hit) continue; // 95% cap: an occasional miss is expected
      expect(r.damage).toBeGreaterThanOrEqual(5);
      expect(r.damage).toBeLessThanOrEqual(15);
    }
    const weak = Array.from({ length: 20 }, () => rollAttack({ ...a, atk: [1, 1] }, { atk: [0, 0], def: 99, hit: 0, flee: 0 }, rng));
    expect(weak.filter((r) => r.hit).every((r) => r.damage === 1)).toBe(true);
  });
});

describe("WorldSim", () => {
  const spawnAt = (x: number, y: number, over: Partial<SpawnDef> = {}): SpawnDef[] =>
    [{ monster: "dummy", count: 1, area: { x, y, w: 1, h: 1 }, respawnMs: [1000, 1000], ...over }];

  it("lets a player walk up to a monster, kill it and get first claim on the drop", () => {
    const sim = new WorldSim(open(), spawnAt(8, 1), { dummy: dummy() }, seededRng(2), 0);
    sim.addPlayer("p1", { x: 1, y: 1 });
    sim.addPlayer("p2", { x: 9, y: 2 });
    const [monsterId] = sim.monsters.monsters.keys();
    expect(sim.attack("p1", monsterId)).toBe(true);
    const kills: unknown[] = [];
    let end = run(sim, 0, 20_000, () => kills.length > 0, (e) => kills.push(...e.kills));
    expect(kills).toEqual([{ monsterId, monsterDef: "dummy", killer: "p1" }]);
    const [item] = sim.items.values();
    expect(item).toMatchObject({ itemId: "gloop_gel", ownerId: "p1" });

    // p2 is next to it but must wait for the owner window.
    expect(sim.pickup("p2", item.id)).toBe(true);
    const refused: unknown[] = [];
    end = run(sim, end, 200, () => refused.length > 0, (e) => refused.push(...e.refused));
    expect(refused).toEqual([{ playerId: "p2", itemId: "gloop_gel" }]);
    expect(sim.items.has(item.id)).toBe(true);

    // After the window anyone may take it, and only once.
    const pickups: Array<{ playerId: string }> = [];
    sim.pickup("p2", item.id);
    sim.pickup("p1", item.id);
    run(sim, end + ITEM_OWNER_MS, 20_000, () => !sim.items.has(item.id), (e) => pickups.push(...e.pickups));
    expect(pickups).toHaveLength(1);
    expect(sim.items.has(item.id)).toBe(false);
  });

  it("respawns a dead monster after its respawn time", () => {
    const sim = new WorldSim(open(), spawnAt(3, 1, { respawnMs: [2000, 2000] }), { dummy: dummy({ hp: 1 }) }, seededRng(3), 0);
    sim.addPlayer("p1", { x: 2, y: 1 });
    const [id] = sim.monsters.monsters.keys();
    sim.attack("p1", id);
    const end = run(sim, 0, 10_000, () => !sim.monsters.isAlive(id));
    expect(sim.monsters.isAlive(id)).toBe(false);
    run(sim, end, 2100);
    expect(sim.monsters.isAlive(id)).toBe(true);
  });

  it("aggressive monsters attack players in sight and can kill them", () => {
    const sim = new WorldSim(open(), spawnAt(6, 6), { dummy: dummy({ modes: { aggressive: true, assist: false, randomWalk: false }, sight: 5, atk: [40, 40] }) }, seededRng(4), 0);
    sim.addPlayer("p1", { x: 3, y: 6 });
    const deaths: string[] = [];
    run(sim, 0, 20_000, () => deaths.length > 0, (e) => deaths.push(...e.deaths));
    expect(deaths).toEqual(["p1"]);
    const p = sim.players.get("p1")!;
    expect(p.hp).toBe(0);
    expect(sim.moveTo("p1", { x: 1, y: 1 })).toBe(false);
    expect(sim.revive("p1", { x: 1, y: 1 })).toBe(true);
    expect(p.hp).toBe(Math.ceil(p.maxHp / 2));
  });

  it("passive monsters ignore players until hit, and give up past their chase range", () => {
    const sim = new WorldSim(open(40, 5), spawnAt(5, 2), { dummy: dummy({ chaseRange: 4, hp: 500, walkSpeed: 1 }) }, seededRng(5), 0);
    sim.addPlayer("p1", { x: 4, y: 2 });
    const m = [...sim.monsters.monsters.values()][0];
    run(sim, 0, 3000);
    expect(m.mode).toBe("idle");
    sim.attack("p1", m.id);
    let end = run(sim, 0, 2000, () => m.mode === "chase");
    expect(m.mode).toBe("chase");
    sim.moveTo("p1", { x: 30, y: 2 });
    end = run(sim, end, 20_000, () => m.mode === "idle");
    expect(m.mode).toBe("idle");
    expect(m.hp).toBe(500);
  });

  it("assist monsters join a fight against their kind", () => {
    const spawns: SpawnDef[] = [{ monster: "dummy", count: 2, area: { x: 5, y: 5, w: 2, h: 1 }, respawnMs: [1000, 1000] }];
    const sim = new WorldSim(open(), spawns, { dummy: dummy({ hp: 500, modes: { aggressive: false, assist: true, randomWalk: false } }) }, seededRng(6), 0);
    sim.addPlayer("p1", { x: 4, y: 5 });
    const [a, b] = sim.monsters.monsters.values();
    sim.attack("p1", a.id);
    run(sim, 0, 3000, () => b.mode === "chase");
    expect(b.targetId).toBe("p1");
  });

  it("sleeps monsters with no player nearby", () => {
    const sim = new WorldSim(open(60, 60), spawnAt(55, 55), { dummy: dummy({ modes: { aggressive: false, assist: false, randomWalk: true } }) }, seededRng(7), 0);
    sim.addPlayer("p1", { x: 1, y: 1 });
    const m = [...sim.monsters.monsters.values()][0];
    run(sim, 0, 20_000);
    expect({ x: m.walker.x, y: m.walker.y }).toEqual({ x: 55, y: 55 });
  });

  it("regenerates HP only out of combat", () => {
    const sim = new WorldSim(open(), [], {}, seededRng(8), 0);
    const p = sim.addPlayer("p1", { x: 1, y: 1 }, 50);
    run(sim, 0, 4100);
    expect(p.hp).toBeGreaterThan(50);
    p.lastHitAt = 8000;
    const hp = p.hp;
    run(sim, 8000, 4100);
    expect(p.hp).toBe(hp);
  });
});
