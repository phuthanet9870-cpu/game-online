import weaponsJson from '@data/weapons/weapons.json';
import monstersJson from '@data/monsters/phase1-monsters.json';
import playerJson from '@data/weapons/player-base.json';
import mapJson from '@data/maps/training-ground.json';
import cityJson from '@data/maps/aetheria-capital.json';
import farm01Json from '@data/maps/farm-01.json';
import farm02Json from '@data/maps/farm-02.json';
import farm03Json from '@data/maps/farm-03.json';
import mapIndexJson from '@data/maps/maps.json';
import itemsJson from '@data/items/phase2-items.json';
import statusesJson from '@data/weapons/statuses.json';
import powersJson from '@data/powers/powers.json';
import dropsJson from '@data/drops/phase2-drops.json';

export type WeaponType = 'staff' | 'sword' | 'dagger' | 'bow' | 'grimoire' | 'gauntlet';
export const WEAPON_TYPES: readonly WeaponType[] = [
  'staff',
  'sword',
  'dagger',
  'bow',
  'grimoire',
  'gauntlet',
];

/** Registry entry (statuses.json) and per-skill application (id + duration [+ overrides]). */
export interface StatusDef {
  id: string;
  durationMs?: number;
  defenseMultiplier?: number;
  speedMultiplier?: number;
  damageTakenMultiplier?: number;
  stun?: boolean;
  root?: boolean;
  stealth?: boolean;
  shieldPctMaxHp?: number;
  energyRegenPerSec?: number;
  staminaRegenPerSec?: number;
  dot?: { tickMs: number; modifier: number };
  atMs?: number;
}

export interface HitDef {
  atMs: number;
  shape: 'arc' | 'circle' | 'projectile';
  radius: number;
  arcDeg?: number;
  modifier: number;
  knockback: number;
  applyStatus?: StatusDef;
  interrupt?: boolean;
  speed?: number;
  range?: number;
  pierce?: boolean;
  atAim?: boolean;
  bonusBehind?: number;
}

export interface MoveDef {
  atMs: number;
  type: 'dash' | 'back' | 'blink';
  distance: number;
  durationMs: number;
  iframes: boolean;
  toAim?: boolean;
}

export interface PassiveEffects {
  powerDamageMult?: number;
  dotMult?: Record<string, number>;
  statusDurationAddMs?: Record<string, number>;
  stealthBonusMult?: number;
  backAttackMult?: number;
}

export interface CounterDef {
  stanceMs: number;
  radius: number;
  arcDeg: number;
  modifier: number;
  knockback: number;
}

export interface ActionDef {
  id: string;
  name: string;
  kind: string;
  description?: string;
  cooldownMs: number;
  staminaCost: number;
  windupMs: number;
  activeMs: number;
  recoveryMs: number;
  hits?: HitDef[];
  counter?: CounterDef;
  energyCost?: number;
  category?: 'power-active' | 'power-ultimate' | 'power-passive';
  move?: MoveDef;
  selfStatus?: StatusDef[];
  telegraph?: boolean;
  implemented?: boolean;
  effects?: PassiveEffects;
}

export interface PowerDef {
  id: string;
  name: string;
  type: string;
  allowedWeapons: WeaponType[];
  fruitItemId: string;
  obtainable: boolean;
  active: ActionDef[];
  ultimate: ActionDef[];
  passive: ActionDef[];
}

export interface RankDef {
  rank: number;
  points: number;
  active: number;
  ultimate: number;
  passive: number;
}

export interface PowerConfig {
  energy: { max: number; regenPerSec: number };
  proficiency: { ranks: RankDef[]; pointsPerCast: number; pointsPerHit: number; maxPointsPerCast: number };
  loadout: { active: number; ultimate: number; passive: number };
  powers: PowerDef[];
}

export interface Recipe {
  id: string;
  name: string;
  inputs: Array<{ itemId: string; quantity: number }>;
  output: { itemId: string; quantity: number };
}

export const skillImplemented = (a: ActionDef): boolean =>
  a.implemented ?? (a.cooldownMs > 0 || !!a.counter || (a.hits?.length ?? 0) > 0);

export interface WeaponSkillRef {
  id: string;
  name: string;
}

export interface WeaponDef {
  id: WeaponType;
  name: string;
  role: string;
  implemented: boolean;
  weaponCoefficient?: number;
  basicAttack?: ActionDef;
  skills: Array<WeaponSkillRef | ActionDef>;
}

export interface MonsterDef {
  id: string;
  name: string;
  tier: string;
  level: number;
  sprite: 'slime' | 'wolf' | 'dummy';
  maxHp: number;
  attack: number;
  defense: number;
  critChance: number;
  moveSpeed: number;
  chaseSpeed: number;
  radius: number;
  aggroRadius: number;
  leashRadius: number;
  attackRange: number;
  attackWindupMs: number;
  attackRecoveryMs: number;
  attackCooldownMs: number;
  alertMs: number;
  patrolRadius: number;
  respawnMs: number;
  corpseMs: number;
  passive?: boolean;
  noLoot?: boolean;
  tint?: string;
  scale?: number;
}

export interface PlayerBaseDef {
  level: number;
  maxHp: number;
  attack: number;
  defense: number;
  critChance: number;
  critMultiplier: number;
  moveSpeed: number;
  radius: number;
  stamina: { max: number; regenPerSec: number; regenDelayMs: number };
  dash: {
    staminaCost: number;
    distance: number;
    durationMs: number;
    cooldownMs: number;
    invulnerable: boolean;
  };
  outOfCombatMs: number;
  outOfCombatRegenPctPerSec: number;
  respawnDelayMs: number;
  spawnProtectionMs: number;
  defenseK: number;
  maxDamage: number;
}

export interface TiledObject {
  id: number;
  name: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  properties?: Array<{ name: string; type: string; value: string | number | boolean }>;
}

export interface PortalDef {
  id: string;
  label: string;
  targetMap: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MapData {
  mapId: string;
  displayName: string;
  width: number;
  height: number;
  tileSize: number;
  ground: number[]; // 0-based tile ids
  collision: number[];
  playerSpawn: { x: number; y: number };
  monsterSpawns: Array<{ id: string; monsterId: string; x: number; y: number }>;
  npcs: Array<{ id: string; name: string; x: number; y: number }>;
  portals: PortalDef[];
  kind: string;
}

interface RawLayer {
  name: string;
  type: string;
  data?: number[];
  objects?: TiledObject[];
}

export function parseTiledMap(raw: {
  width: number;
  height: number;
  tilewidth: number;
  properties?: Array<{ name: string; value: unknown }>;
  layers: RawLayer[];
}): MapData {
  const prop = (n: string) => raw.properties?.find((p) => p.name === n)?.value;
  const layer = (n: string) => {
    const l = raw.layers.find((x) => x.name === n);
    if (!l) throw new Error(`map layer '${n}' missing`);
    return l;
  };
  const ground = (layer('ground').data ?? []).map((gid) => gid - 1);
  const collision = layer('collision').data ?? [];
  const objects = layer('objects').objects ?? [];
  const ps = objects.find((o) => o.type === 'player_spawn');
  if (!ps) throw new Error('player_spawn missing');
  const monsterSpawns = objects
    .filter((o) => o.type === 'monster_spawn')
    .map((o) => ({
      id: o.name,
      monsterId: String(o.properties?.find((p) => p.name === 'monsterId')?.value ?? ''),
      x: o.x,
      y: o.y,
    }));
  const npcs = objects
    .filter((o) => o.type === 'npc')
    .map((o) => ({
      id: String(o.properties?.find((p) => p.name === 'npcId')?.value ?? ''),
      name: String(o.properties?.find((p) => p.name === 'displayName')?.value ?? ''),
      x: o.x,
      y: o.y,
    }));
  const portals = objects
    .filter((o) => o.type === 'portal')
    .map((o) => ({
      id: o.name,
      label: String(o.properties?.find((p) => p.name === 'label')?.value ?? ''),
      targetMap: String(o.properties?.find((p) => p.name === 'targetMap')?.value ?? ''),
      x: o.x,
      y: o.y,
      w: o.width ?? 32,
      h: o.height ?? 48,
    }));
  return {
    npcs,
    portals,
    kind: String(prop('kind') ?? ''),
    mapId: String(prop('mapId') ?? 'unknown'),
    displayName: String(prop('displayName') ?? 'Unknown'),
    width: raw.width,
    height: raw.height,
    tileSize: raw.tilewidth,
    ground,
    collision,
    playerSpawn: { x: ps.x, y: ps.y },
    monsterSpawns,
  };
}

export const isActionDef = (s: WeaponSkillRef | ActionDef): s is ActionDef => 'cooldownMs' in s;

/** Display-only copy of item templates; ownership/quantities always come from the server. */
export interface ItemTemplate {
  id: string;
  name: string;
  category: string;
  rarity: string;
  maxStack: number;
  sellPriceGold: number;
  tradable: boolean;
  gmOnly: boolean;
  weaponType?: WeaponType;
  powerId?: string;
  slot?: 'weapon' | 'helmet' | 'chest' | 'armguard' | 'legs' | 'boots';
  levelReq?: number;
  stats?: { attack?: number; defense?: number; maxHp?: number };
}

export const CONTENT = {
  items: itemsJson.items as unknown as ItemTemplate[],
  weapons: weaponsJson.weapons as unknown as WeaponDef[],
  monsters: monstersJson.monsters as unknown as MonsterDef[],
  player: playerJson as unknown as PlayerBaseDef,
  trainingMap: parseTiledMap(mapJson as unknown as Parameters<typeof parseTiledMap>[0]),
  statuses: statusesJson.statuses as unknown as StatusDef[],
  powers: powersJson as unknown as PowerConfig,
  recipes: (dropsJson as unknown as { recipes: Recipe[] }).recipes,
  startMap: mapIndexJson.startMap,
  maps: Object.fromEntries(
    [mapJson, cityJson, farm01Json, farm02Json, farm03Json].map((j) => {
      const m = parseTiledMap(j as unknown as Parameters<typeof parseTiledMap>[0]);
      if (!m.kind) m.kind = mapIndexJson.maps.find((x) => x.id === m.mapId)?.kind ?? '';
      return [m.mapId, m];
    }),
  ) as Record<string, MapData>,
};

export const getMap = (id: string): MapData =>
  CONTENT.maps[id] ?? (CONTENT.maps[CONTENT.startMap] as MapData);

export const getPower = (id: string): PowerDef | undefined => CONTENT.powers.powers.find((p) => p.id === id);
export const statusDef = (app: StatusDef): StatusDef => {
  const base = CONTENT.statuses.find((x) => x.id === app.id);
  if (!base) return app;
  return {
    ...base,
    durationMs: app.durationMs ?? base.durationMs,
    defenseMultiplier: app.defenseMultiplier ?? base.defenseMultiplier,
  };
};
export const rankFor = (points: number): RankDef => {
  let r = CONTENT.powers.proficiency.ranks[0] as RankDef;
  for (const x of CONTENT.powers.proficiency.ranks) if (points >= x.points) r = x;
  return r;
};

export const itemName = (id: string): string => CONTENT.items.find((i) => i.id === id)?.name ?? id;

export function getWeapon(id: WeaponType): WeaponDef {
  const w = CONTENT.weapons.find((x) => x.id === id);
  if (!w) throw new Error(`weapon ${id} not found`);
  return w;
}

/** Content integrity checks (spec §21.4 subset relevant to Phase 1). Returns a list of errors. */
export function validateContent(c: typeof CONTENT): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const seen = (id: string) => {
    if (ids.has(id)) errors.push(`duplicate id ${id}`);
    ids.add(id);
  };
  const types = c.weapons.map((w) => w.id).sort();
  if (JSON.stringify(types) !== JSON.stringify([...WEAPON_TYPES].sort()))
    errors.push(`weapon types must be exactly ${WEAPON_TYPES.join(',')}, got ${types.join(',')}`);
  for (const w of c.weapons) {
    seen(w.id);
    if (w.skills.length !== 3)
      errors.push(`${w.id} must have exactly 3 active skills, has ${w.skills.length}`);
    for (const s of w.skills) seen(s.id);
    if (w.implemented) {
      if (!w.basicAttack) errors.push(`${w.id} implemented but missing basicAttack`);
      for (const s of w.skills)
        if (!isActionDef(s)) errors.push(`${w.id}.${s.id} implemented weapon skill lacks numbers`);
    }
  }
  for (const m of c.monsters) {
    seen(m.id);
    if (m.maxHp <= 0 || m.attack < 0 || m.leashRadius <= m.aggroRadius)
      errors.push(`${m.id} invalid stats (hp>0, leash>aggro required)`);
  }
  for (const p of c.powers.powers) {
    if (p.active.length !== 15 || p.ultimate.length !== 5 || p.passive.length !== 5)
      errors.push(
        `power ${p.id} must be 15/5/5, has ${p.active.length}/${p.ultimate.length}/${p.passive.length}`,
      );
    for (const sk of [...p.active, ...p.ultimate, ...p.passive]) seen(sk.id);
  }
  const map = c.trainingMap;
  if (map.ground.length !== map.width * map.height) errors.push('map ground size mismatch');
  if (map.collision.length !== map.width * map.height) errors.push('map collision size mismatch');
  for (const s of map.monsterSpawns)
    if (!c.monsters.some((m) => m.id === s.monsterId))
      errors.push(`spawn ${s.id} references unknown ${s.monsterId}`);
  return errors;
}
