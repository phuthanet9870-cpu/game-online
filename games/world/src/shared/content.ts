import itemFile from "../../data/items.json";
import monsterFile from "../../data/monsters.json";
import starterSpawns from "../../data/spawns/starter-field.json";

/** Fields follow rAthena's mob_db shape loosely; every value is our own. */
export interface MonsterDef {
  id: string;
  name: string;
  level: number;
  hp: number;
  atk: [number, number];
  def: number;
  hit: number;
  flee: number;
  attackDelayMs: number;
  /** In cells, Chebyshev distance (1 = adjacent, diagonals included). */
  attackRange: number;
  /** Cells per second. */
  walkSpeed: number;
  /** Aggressive monsters notice players this close (cells). */
  sight: number;
  /** How far from home a monster chases before giving up. */
  chaseRange: number;
  modes: { aggressive: boolean; assist: boolean; randomWalk: boolean };
  look: { shape: "blob" | "hopper" | "shell" | "flyer"; color: string; size: number };
  /** `rate` is out of 10000, as in rAthena. */
  drops: Array<{ item: string; rate: number }>;
}

export interface ItemDef {
  id: string;
  name: string;
  kind: "etc" | "consumable";
  color: string;
}

export interface SpawnDef {
  monster: string;
  count: number;
  area: { x: number; y: number; w: number; h: number };
  respawnMs: [number, number];
}

export const ITEMS: Record<string, ItemDef> = Object.fromEntries((itemFile as ItemDef[]).map((i) => [i.id, i]));
export const MONSTERS: Record<string, MonsterDef> = Object.fromEntries((monsterFile as MonsterDef[]).map((m) => [m.id, m]));
export const SPAWNS: Record<string, SpawnDef[]> = { "starter-field": starterSpawns as SpawnDef[] };

/** Throws on content errors so a bad data file fails at startup and in tests, not mid-game. */
export function validateContent() {
  const problems: string[] = [];
  for (const m of Object.values(MONSTERS)) {
    if (m.hp <= 0 || m.atk[0] > m.atk[1] || m.attackDelayMs < 200 || m.walkSpeed <= 0) problems.push(`monster ${m.id}: bad stats`);
    for (const d of m.drops) {
      if (!ITEMS[d.item]) problems.push(`monster ${m.id}: unknown drop ${d.item}`);
      if (d.rate <= 0 || d.rate > 10000) problems.push(`monster ${m.id}: drop rate ${d.rate} out of 1..10000`);
    }
  }
  for (const [mapId, spawns] of Object.entries(SPAWNS)) {
    for (const s of spawns) {
      if (!MONSTERS[s.monster]) problems.push(`spawn on ${mapId}: unknown monster ${s.monster}`);
      if (s.respawnMs[0] > s.respawnMs[1]) problems.push(`spawn on ${mapId}: respawnMs min > max`);
    }
  }
  if (problems.length) throw new Error(`content errors:\n${problems.join("\n")}`);
}
