// Live content tuning: staff-published patches over the shipped data (skills, enemies, item bases, loot).
// The same function runs on the server and every client, so tooltips always match the authoritative rules.
// A patch is applied on top of a frozen baseline, so publishing or rolling back is always deterministic.
import { SKILLS, SKILL_MAP } from './data/skills.js';
import { ENEMIES } from './data/enemies.js';
import { ITEM_BASES, ITEM_BASE_MAP, RARITY_DEFS } from './data/items.js';
import type { Rarity } from './types.js';
import { RARITIES } from './types.js';

export interface ContentPatch {
  skills?: Record<string, { cost?: number; cooldown?: number; cast?: number; coefMul?: number }>;
  enemies?: Record<string, { hp?: number; power?: number; armor?: number; xp?: number; speed?: number }>;
  items?: Record<string, { weaponPower?: number }>;
  loot?: { dropChance?: number; eliteRolls?: number; rarityWeights?: Partial<Record<Rarity, number>> };
}

/** Tunables read by the simulation that are not part of a specific content record. */
export const LOOT_TUNING = { dropChance: 0.22, eliteRolls: 2 };

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const BASE = {
  skills: Object.fromEntries(SKILLS.map((s) => [s.id, clone({ cost: s.cost, cooldown: s.cooldown, cast: s.cast, effects: s.effects })])),
  enemies: Object.fromEntries(Object.values(ENEMIES).map((e) => [e.id, { hp: e.hp, power: e.power, armor: e.armor, xp: e.xp, speed: e.speed }])),
  items: Object.fromEntries(ITEM_BASES.map((b) => [b.id, { weaponPower: b.weaponPower }])),
  rarity: Object.fromEntries(RARITIES.map((r) => [r, RARITY_DEFS[r].weight])) as Record<Rarity, number>,
  loot: { ...LOOT_TUNING },
};

export const CONTENT_LIMITS = {
  skill: { cost: [0, 300], cooldown: [0, 300], cast: [0, 5], coefMul: [0.2, 5] },
  enemy: { hp: [1, 1_000_000], power: [0, 1000], armor: [0, 2000], xp: [0, 100_000], speed: [0, 600] },
  item: { weaponPower: [1, 500] },
  loot: { dropChance: [0, 1], eliteRolls: [0, 6], rarityWeight: [0, 10_000] },
} as const;

export function validateContentPatch(raw: unknown): { ok: true; value: ContentPatch } | { ok: false; reason: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'Patch must be an object' };
  const r = raw as ContentPatch;
  const out: ContentPatch = {};
  const num = (v: unknown, [lo, hi]: readonly [number, number], label: string) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw new Error(`${label} must be between ${lo} and ${hi}`); return v; };
  try {
    for (const [id, p] of Object.entries(r.skills ?? {})) {
      if (!SKILL_MAP[id]) throw new Error(`Unknown skill ${id}`);
      const o: NonNullable<ContentPatch['skills']>[string] = {};
      for (const k of ['cost', 'cooldown', 'cast', 'coefMul'] as const) if (p[k] !== undefined) o[k] = num(p[k], CONTENT_LIMITS.skill[k], `${id}.${k}`);
      (out.skills ??= {})[id] = o;
    }
    for (const [id, p] of Object.entries(r.enemies ?? {})) {
      if (!ENEMIES[id]) throw new Error(`Unknown enemy ${id}`);
      const o: NonNullable<ContentPatch['enemies']>[string] = {};
      for (const k of ['hp', 'power', 'armor', 'xp', 'speed'] as const) if (p[k] !== undefined) o[k] = num(p[k], CONTENT_LIMITS.enemy[k], `${id}.${k}`);
      (out.enemies ??= {})[id] = o;
    }
    for (const [id, p] of Object.entries(r.items ?? {})) {
      if (!ITEM_BASE_MAP[id]) throw new Error(`Unknown item base ${id}`);
      if (p.weaponPower !== undefined && ITEM_BASE_MAP[id]!.weaponPower === undefined) throw new Error(`${id} is not a weapon`);
      (out.items ??= {})[id] = p.weaponPower !== undefined ? { weaponPower: num(p.weaponPower, CONTENT_LIMITS.item.weaponPower, `${id}.weaponPower`) } : {};
    }
    if (r.loot) {
      out.loot = {};
      if (r.loot.dropChance !== undefined) out.loot.dropChance = num(r.loot.dropChance, CONTENT_LIMITS.loot.dropChance, 'loot.dropChance');
      if (r.loot.eliteRolls !== undefined) out.loot.eliteRolls = Math.round(num(r.loot.eliteRolls, CONTENT_LIMITS.loot.eliteRolls, 'loot.eliteRolls'));
      for (const [k, v] of Object.entries(r.loot.rarityWeights ?? {})) { if (!RARITIES.includes(k as Rarity)) throw new Error(`Unknown rarity ${k}`); (out.loot.rarityWeights ??= {})[k as Rarity] = num(v, CONTENT_LIMITS.loot.rarityWeight, `rarity.${k}`); }
    }
    return { ok: true, value: out };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

const scaleCoefs = (effects: unknown, mul: number) => {
  const walk = (o: any) => { if (!o || typeof o !== 'object') return; if (typeof o.coef === 'number') o.coef *= mul; for (const v of Object.values(o)) walk(v); };
  walk(effects);
};

/** Reset all tunables to the shipped baseline, then apply the patch. */
export function applyContentPatch(patch: ContentPatch | null) {
  for (const s of SKILLS) { const b = BASE.skills[s.id]!; s.cost = b.cost; s.cooldown = b.cooldown; s.cast = b.cast; s.effects = clone(b.effects); }
  for (const [id, b] of Object.entries(BASE.enemies)) Object.assign(ENEMIES[id]!, b);
  for (const [id, b] of Object.entries(BASE.items)) if (b.weaponPower !== undefined) ITEM_BASE_MAP[id]!.weaponPower = b.weaponPower;
  for (const r of RARITIES) RARITY_DEFS[r].weight = BASE.rarity[r];
  Object.assign(LOOT_TUNING, BASE.loot);
  if (!patch) return;
  for (const [id, p] of Object.entries(patch.skills ?? {})) {
    const s = SKILL_MAP[id]; if (!s) continue;
    if (p.cost !== undefined) s.cost = p.cost;
    if (p.cooldown !== undefined) s.cooldown = p.cooldown;
    if (p.cast !== undefined) s.cast = p.cast;
    if (p.coefMul !== undefined) scaleCoefs(s.effects, p.coefMul);
  }
  for (const [id, p] of Object.entries(patch.enemies ?? {})) { const e = ENEMIES[id]; if (e) Object.assign(e, p); }
  for (const [id, p] of Object.entries(patch.items ?? {})) { const b = ITEM_BASE_MAP[id]; if (b && p.weaponPower !== undefined) b.weaponPower = p.weaponPower; }
  if (patch.loot?.dropChance !== undefined) LOOT_TUNING.dropChance = patch.loot.dropChance;
  if (patch.loot?.eliteRolls !== undefined) LOOT_TUNING.eliteRolls = patch.loot.eliteRolls;
  for (const [r, w] of Object.entries(patch.loot?.rarityWeights ?? {})) RARITY_DEFS[r as Rarity].weight = w!;
}

/** Catalog of editable records with baseline values (for the staff editor). */
export function contentCatalog() {
  return {
    skills: SKILLS.map((s) => ({ id: s.id, name: s.name, cls: s.cls, kind: s.kind, base: { cost: BASE.skills[s.id]!.cost, cooldown: BASE.skills[s.id]!.cooldown, cast: BASE.skills[s.id]!.cast, coefMul: 1 } })),
    enemies: Object.values(ENEMIES).map((e) => ({ id: e.id, name: e.name, family: e.family, base: BASE.enemies[e.id]! })),
    items: ITEM_BASES.filter((b) => b.weaponPower !== undefined).map((b) => ({ id: b.id, name: b.name, base: BASE.items[b.id]! })),
    loot: { base: { ...BASE.loot, rarityWeights: BASE.rarity } },
    limits: CONTENT_LIMITS,
  };
}
