import type { ClassId, Mod, PassiveNode } from '../types.js';
import { CLASS_IDS } from '../types.js';

// Passive tree: six class trees on an outer ring + a shared central tree with Keystones.
// Content (names/mods) is hand-authored below; layout coordinates are computed deterministically.

interface NodeSpec { name: string; mods: Mod[]; kind?: 'minor' | 'notable' | 'keystone'; flags?: string[]; desc?: string }
type Branch = NodeSpec[];

const m = (stat: string, value: number): Mod => ({ stat, value });

const CLASS_TREES: Record<ClassId, { start: NodeSpec; branches: [Branch, Branch, Branch] }> = {
  warrior: {
    start: { name: 'Ironvale Oath', mods: [m('str', 5), m('maxHp', 20)] },
    branches: [
      [ { name: 'Heavy Grip', mods: [m('dmgPct.melee', 6)] }, { name: 'Bone Breaker', mods: [m('stunDurPct', 15)] }, { name: 'Mountain Splitter', kind: 'notable', mods: [m('dmgPct.aoe', 15), m('aoePct', 10)] }, { name: 'Brute Force', mods: [m('str', 8)] },
        { name: 'Crimson Tempo', kind: 'keystone', flags: ['rage_tempo'], mods: [], desc: 'Each point of Rage grants 0.4% attack speed. Rage decays twice as fast.' } ],
      [ { name: 'Quick Hands', mods: [m('atkSpeed', 5)] }, { name: 'Serrated Edge', mods: [m('onHitBleed', 0.08)] }, { name: 'Bladewind', kind: 'notable', mods: [m('atkSpeed', 10), m('basic.dmgPct', 15)] }, { name: 'Sharpened Steel', mods: [m('critChance', 3)] },
        { name: 'Twin Fang Discipline', kind: 'notable', mods: [m('basic.proj', 1), m('basic.dmgPct', -15)], desc: 'Basic attacks strike one additional time at reduced damage.' } ],
      [ { name: 'Tempered Plate', mods: [m('armorPct', 10)] }, { name: 'Shield Arm', mods: [m('block', 5)] }, { name: 'Iron Counter', kind: 'notable', mods: [m('block', 8), m('flagRetaliate', 1)], flags: ['retaliate'], desc: 'Blocking a hit deals 100% power physical damage back to the attacker.' }, { name: 'Thick Skin', mods: [m('maxHpPct', 6)] },
        { name: 'Unbreakable', kind: 'keystone', flags: ['unbreakable'], mods: [m('armorPct', 50)], desc: '+50% armor. You cannot dodge or be stunned, but move 10% slower.' } ],
    ],
  },
  mage: {
    start: { name: 'Conservatory Initiate', mods: [m('int', 5), m('maxRes', 10)] },
    branches: [
      [ { name: 'Kindling', mods: [m('dmgPct.fire', 8)] }, { name: 'Spreading Flames', mods: [m('onHitBurn', 0.08)] }, { name: 'Heart of the Pyre', kind: 'notable', mods: [m('dmgPct.fire', 15), m('critMult', 20)] }, { name: 'Searing Mind', mods: [m('int', 8)] },
        { name: 'Spell Echo', kind: 'keystone', flags: ['spell_echo'], mods: [m('castSpeed', -25)], desc: 'Projectile spells fire a second time at 50% damage. 25% slower casting.' } ],
      [ { name: 'Frostbite', mods: [m('dmgPct.ice', 8)] }, { name: 'Lingering Chill', mods: [m('statusDurPct', 15)] }, { name: 'Permafrost', kind: 'notable', mods: [m('dmgPct.ice', 12), m('flagShatter', 1)], flags: ['shatter'], desc: 'Frozen and Chilled enemies take 15% more damage from you.' }, { name: 'Cold Blood', mods: [m('barrierPct', 10)] },
        { name: 'Glacial Focus', kind: 'notable', mods: [m('maxRes', 30), m('resRegenPct', 20)] } ],
      [ { name: 'Static Field', mods: [m('dmgPct.lightning', 8)] }, { name: 'Overcharge', mods: [m('castSpeed', 5)] }, { name: 'Storm Tapestry', kind: 'notable', mods: [m('weaveMax', 2), m('dmgPct.lightning', 10)], desc: '+2 maximum Weave stacks.' }, { name: 'Arc Conduit', mods: [m('basic.chain', 1)] },
        { name: 'Living Conduit', kind: 'notable', mods: [m('basic.chain', 2), m('basic.dmgPct', 20)], desc: 'Basic attack bolts chain to 2 more enemies.' } ],
    ],
  },
  assassin: {
    start: { name: 'Veilblade Creed', mods: [m('dex', 5), m('critChance', 2)] },
    branches: [
      [ { name: 'Keen Edge', mods: [m('critMult', 12)] }, { name: 'Pressure Points', mods: [m('critChance', 3)] }, { name: 'Coup de Lune', kind: 'notable', mods: [m('finisherPct', 25), m('critMult', 20)] }, { name: 'Lethal Intent', mods: [m('dex', 8)] },
        { name: 'Thousand Cuts', kind: 'keystone', flags: ['thousand_cuts'], mods: [], desc: 'You cannot deal critical strikes. Hits deal 35% more damage and always apply Bleed.' } ],
      [ { name: 'Toxin Glands', mods: [m('dmgPct.poison', 10)] }, { name: 'Wicked Edge', mods: [m('onHitPoison', 0.1)] }, { name: 'Venom Sommelier', kind: 'notable', mods: [m('dotDmgPct', 25), m('statusDurPct', 15)] }, { name: 'Lacerate', mods: [m('onHitBleed', 0.08)] },
        { name: 'Septic Blades', kind: 'notable', mods: [m('basic.convert.poison', 1), m('basic.dmgPct', 15)], desc: 'Basic attacks deal Poison damage instead of Physical.' } ],
      [ { name: 'Light Feet', mods: [m('moveSpeedPct', 4)] }, { name: 'Slip Away', mods: [m('dodge', 4)] }, { name: 'Moonlit Dance', kind: 'notable', mods: [m('dodge', 8), m('cdr', 6)] }, { name: 'Flicker', mods: [m('atkSpeed', 5)] },
        { name: 'Combo Savant', kind: 'notable', mods: [m('secondaryMax', 2), m('basic.proj', 1), m('basic.dmgPct', -10)], desc: '+2 maximum Combo. Basic attacks hit one extra time.' } ],
    ],
  },
  ranger: {
    start: { name: 'Greenwatch Vigil', mods: [m('dex', 5), m('dmgPct.projectile', 4)] },
    branches: [
      [ { name: 'Nimble Draw', mods: [m('atkSpeed', 5)] }, { name: 'Split Fletching', mods: [m('basic.proj', 1), m('basic.dmgPct', -10)] }, { name: 'Storm of Feathers', kind: 'notable', mods: [m('projCount', 2), m('dmgPct.projectile', 8)] }, { name: 'Quiver Discipline', mods: [m('maxRes', 15)] },
        { name: 'Lone Arrow', kind: 'keystone', flags: ['lone_arrow'], mods: [], desc: 'Skills fire exactly one projectile, which deals 60% more damage per projectile removed (max +180%) and pierces.' } ],
      [ { name: 'Steady Aim', mods: [m('critChance', 3)] }, { name: 'Weak Spot', mods: [m('critMult', 15)] }, { name: 'Deadeye Training', kind: 'notable', mods: [m('markPct', 15), m('critChance', 5)] }, { name: 'Long Draw', mods: [m('dmgPct.projectile', 8)] },
        { name: 'Piercing Gaze', kind: 'notable', mods: [m('basic.pierce', 2), m('penetration', 10)] } ],
      [ { name: 'Trap Craft', mods: [m('dmgPct.trap', 12)] }, { name: 'Briar Roots', mods: [m('statusDurPct', 15)] }, { name: 'Field Engineer', kind: 'notable', mods: [m('minionDmgPct', 25), m('cdr', 6)] }, { name: 'Wild Bond', mods: [m('minionHpPct', 20)] },
        { name: 'Pack Leader', kind: 'notable', mods: [m('minionDmgPct', 30), m('minionCap', 1)], desc: '+1 maximum companion/turret.' } ],
    ],
  },
  paladin: {
    start: { name: 'Dawnspire Vow', mods: [m('str', 4), m('vit', 3)] },
    branches: [
      [ { name: 'Bulwark', mods: [m('block', 4)] }, { name: 'Steadfast', mods: [m('maxHpPct', 6)] }, { name: 'Living Fortress', kind: 'notable', mods: [m('armorPct', 25), m('threatPct', 50)] }, { name: 'Iron Prayer', mods: [m('res.all', 5)] },
        { name: 'Martyr’s Covenant', kind: 'keystone', flags: ['martyr'], mods: [], desc: '20% of damage taken by nearby allies is redirected to you. You take 15% less damage.' } ],
      [ { name: 'Radiance', mods: [m('dmgPct.holy', 8)] }, { name: 'Zeal', mods: [m('atkSpeed', 4)] }, { name: 'Dawnforged Hammer', kind: 'notable', mods: [m('dmgPct.holy', 15), m('basic.dmgPct', 15)] }, { name: 'Righteous Might', mods: [m('str', 8)] },
        { name: 'Sun Echo', kind: 'notable', mods: [m('basic.burst', 1)], desc: 'Your second basic strike releases a holy burst around the target.' } ],
      [ { name: 'Mending Hands', mods: [m('healPct', 10)] }, { name: 'Grace', mods: [m('hpRegen', 3)] }, { name: 'Judgement Day', kind: 'notable', mods: [m('flagRetaliate', 1), m('block', 5)], flags: ['retaliate'], desc: 'Blocking a hit deals 100% power damage back to the attacker.' }, { name: 'Halo', mods: [m('barrierPct', 15)] },
        { name: 'Saintly Presence', kind: 'notable', mods: [m('healPct', 25), m('auraRegen', 1)], desc: 'Allies within 300px regenerate 1% life per second.' } ],
    ],
  },
  necromancer: {
    start: { name: 'Gravewarden Pact', mods: [m('int', 5), m('minionDmgPct', 5)] },
    branches: [
      [ { name: 'Marrow Craft', mods: [m('minionHpPct', 15)] }, { name: 'Unholy Command', mods: [m('minionDmgPct', 10)] }, { name: 'Ossuary Lord', kind: 'notable', mods: [m('minionCap', 2), m('minionDmgPct', 10)] }, { name: 'Grave Tide', mods: [m('minionSpeedPct', 15)] },
        { name: 'Hollow Legion', kind: 'keystone', flags: ['hollow_legion'], mods: [m('minionCap', 3), m('minionHpPct', -30)], desc: '+3 maximum minions of each type. Minions have 30% less life. You deal 25% less damage.' } ],
      [ { name: 'Rot', mods: [m('dotDmgPct', 12)] }, { name: 'Lingering Hex', mods: [m('statusDurPct', 15)] }, { name: 'Plague Harvest', kind: 'notable', mods: [m('dmgPct.poison', 15), m('dmgPct.shadow', 10)] }, { name: 'Dread', mods: [m('int', 8)] },
        { name: 'Contagion', kind: 'notable', mods: [m('flagContagion', 1)], flags: ['contagion'], desc: 'Enemies that die while Cursed spread Curse to enemies nearby.' } ],
      [ { name: 'Blood Ink', mods: [m('lifeOnHitPct', 0.5)] }, { name: 'Soul Hunger', mods: [m('secondaryMax', 3)] }, { name: 'Sanguine Bargain', kind: 'notable', mods: [m('finisherPct', 30), m('maxHpPct', -5)] }, { name: 'Pale Vigor', mods: [m('maxHpPct', 6)] },
        { name: 'Death Rattle Shot', kind: 'notable', mods: [m('basic.proj', 2), m('basic.dmgPct', -20)], desc: 'Basic attacks fire 2 additional bolts.' } ],
    ],
  },
  chronomancer: {
    start: { name: 'Clockwork Vow', mods: [m('int', 5), m('castSpeed', 3)] },
    branches: [
      [ { name: 'Rime of Ages', mods: [m('dmgPct.ice', 8)] }, { name: 'Held Breath', mods: [m('statusDurPct', 15)] }, { name: 'Perfect Stillness', kind: 'notable', mods: [m('dmgPct.ice', 12), m('flagShatter', 1)], flags: ['shatter'], desc: 'Frozen and Chilled enemies take 15% more damage from you.' }, { name: 'Frozen Hourglass', mods: [m('barrierPct', 15)] },
        { name: 'Closed Loop', kind: 'keystone', flags: ['closed_loop'], mods: [], desc: 'Time Echo triggers on every second skill instead of every third, but echoes deal 35% instead of 50%.' } ],
      [ { name: 'Quickened Hands', mods: [m('castSpeed', 5)] }, { name: 'Borrowed Seconds', mods: [m('cdr', 3)] }, { name: 'Allegro', kind: 'notable', mods: [m('cdr', 6), m('castSpeed', 8)] }, { name: 'Flux Reservoir', mods: [m('maxRes', 20)] },
        { name: 'Resonant Echo', kind: 'notable', mods: [m('echoPct', 20)], desc: 'Time Echoes deal 20% more damage.' } ],
      [ { name: 'Rust', mods: [m('dotDmgPct', 12)] }, { name: 'Dusk Hours', mods: [m('dmgPct.shadow', 10)] }, { name: 'Heat Death', kind: 'notable', mods: [m('dotDmgPct', 20), m('statusDurPct', 10)] }, { name: 'Ageless', mods: [m('maxHpPct', 6)] },
        { name: 'Sands Run Deep', kind: 'notable', mods: [m('secondaryMax', 3), m('finisherPct', 20)], desc: '+3 maximum Sand. Finishers gain 20% more damage per Sand.' } ],
    ],
  },
};

const CENTRAL_RING: NodeSpec[] = [
  { name: 'Vigor', mods: [m('vit', 6)] }, { name: 'Might', mods: [m('str', 6)] }, { name: 'Grace', mods: [m('dex', 6)] }, { name: 'Insight', mods: [m('int', 6)] },
  { name: 'Hardened', mods: [m('armorPct', 8)] }, { name: 'Prismatic Skin', mods: [m('res.all', 5)] }, { name: 'Lifeblood', mods: [m('maxHpPct', 5)] }, { name: 'Swiftness', mods: [m('moveSpeedPct', 3)] },
  { name: 'Ferocity', mods: [m('dmgPct', 5)] }, { name: 'Precision', mods: [m('critChance', 2)] }, { name: 'Brutality', mods: [m('critMult', 10)] }, { name: 'Celerity', mods: [m('atkSpeed', 4)] },
  { name: 'Spellflow', mods: [m('castSpeed', 4)] }, { name: 'Clarity', mods: [m('resRegenPct', 10)] }, { name: 'Timebend', mods: [m('cdr', 3)] }, { name: 'Elemental Lore', mods: [m('dmgPct.fire', 5), m('dmgPct.ice', 5), m('dmgPct.lightning', 5)] },
  { name: 'Dark Lore', mods: [m('dmgPct.shadow', 6), m('dmgPct.poison', 6)] }, { name: 'Sacred Lore', mods: [m('dmgPct.holy', 6), m('dmgPct.physical', 4)] }, { name: 'Reach', mods: [m('aoePct', 6)] }, { name: 'Volley Lore', mods: [m('dmgPct.projectile', 6)] },
  { name: 'Close Quarters', mods: [m('dmgPct.melee', 6)] }, { name: 'Leech', mods: [m('lifeOnHitPct', 0.4)] }, { name: 'Regrowth', mods: [m('hpRegen', 2)] }, { name: 'Afflictor', mods: [m('dotDmgPct', 8)] },
];
const CENTRAL_NOTABLES: NodeSpec[] = [
  { name: 'Astral Heart', kind: 'notable', mods: [m('maxHpPct', 10), m('res.all', 8)] },
  { name: 'Eclipse Fury', kind: 'notable', mods: [m('dmgPct', 12), m('critChance', 3)] },
  { name: 'Celestial Tempo', kind: 'notable', mods: [m('atkSpeed', 8), m('castSpeed', 8), m('cdr', 5)] },
  { name: 'Hand of Ruin', kind: 'notable', mods: [m('basic.dmgPct', 25), m('basic.statusChance', 0.15)], desc: 'Basic attacks deal 25% more damage and gain 15% chance to apply their element’s status.' },
  { name: 'Covenant of Many', kind: 'notable', mods: [m('minionDmgPct', 15), m('minionHpPct', 15), m('healPct', 10)] },
  { name: 'Wanderer’s Stride', kind: 'notable', mods: [m('moveSpeedPct', 6), m('dodge', 5)] },
];
const CENTRAL_KEYSTONES: NodeSpec[] = [
  { name: 'Glass Constellation', kind: 'keystone', flags: ['glass'], mods: [], desc: 'You deal 40% more damage. You have 35% less maximum life.' },
  { name: 'Still Orbit', kind: 'keystone', flags: ['still_orbit'], mods: [m('moveSpeedPct', -10)], desc: 'While you have not moved for 0.6s: 30% more damage and +30% armor. 10% slower movement.' },
  { name: 'Twin Moon Echo', kind: 'keystone', flags: ['twin_moon'], mods: [m('costPct', 30)], desc: 'Basic attacks repeat once at 60% damage. Skills cost 30% more.' },
];

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function build(): PassiveNode[] {
  const nodes: PassiveNode[] = [];
  const add = (n: PassiveNode) => { nodes.push(n); return n; };
  const link = (a: PassiveNode, b: PassiveNode) => { if (!a.links.includes(b.id)) a.links.push(b.id); if (!b.links.includes(a.id)) b.links.push(a.id); };

  // Central ring (radius 330), notables (radius 200), keystones (radius 80)
  const ring: PassiveNode[] = CENTRAL_RING.map((spec, i) => {
    const a = (i / CENTRAL_RING.length) * Math.PI * 2 - Math.PI / 2;
    return add({ id: 'c_' + slug(spec.name), tree: 'central', x: Math.cos(a) * 330, y: Math.sin(a) * 330, name: spec.name, kind: 'minor', mods: spec.mods, links: [], desc: spec.desc });
  });
  ring.forEach((n, i) => link(n, ring[(i + 1) % ring.length]!));
  const notables = CENTRAL_NOTABLES.map((spec, i) => {
    const a = (i / CENTRAL_NOTABLES.length) * Math.PI * 2 - Math.PI / 2 + Math.PI / CENTRAL_NOTABLES.length;
    const n = add({ id: 'c_' + slug(spec.name), tree: 'central', x: Math.cos(a) * 225, y: Math.sin(a) * 225, name: spec.name, kind: 'notable', mods: spec.mods, links: [], desc: spec.desc });
    link(n, ring[(i * 4 + 2) % ring.length]!);
    return n;
  });
  CENTRAL_KEYSTONES.forEach((spec, i) => {
    const a = (i / CENTRAL_KEYSTONES.length) * Math.PI * 2 - Math.PI / 2 + Math.PI / 3;
    const k = add({ id: 'k_' + slug(spec.name), tree: 'central', x: Math.cos(a) * 110, y: Math.sin(a) * 110, name: spec.name, kind: 'keystone', mods: spec.mods, flags: spec.flags, links: [], desc: spec.desc });
    link(k, notables[(i * 2) % notables.length]!);
    link(k, notables[(i * 2 + 1) % notables.length]!);
  });

  // Class trees on the outer ring
  CLASS_IDS.forEach((cls, ci) => {
    const def = CLASS_TREES[cls];
    const a = (ci / CLASS_IDS.length) * Math.PI * 2 - Math.PI / 2;
    const cx = Math.cos(a) * 700, cy = Math.sin(a) * 700;
    const start = add({ id: `${cls}_start`, tree: cls, x: cx, y: cy, name: def.start.name, kind: 'start', mods: def.start.mods, links: [] });
    // bridge into the central ring (nearest ring node, index aligned with angle)
    const ringIdx = Math.round((ci / CLASS_IDS.length) * ring.length) % ring.length;
    const bridge = add({ id: `${cls}_bridge`, tree: cls, x: Math.cos(a) * 500, y: Math.sin(a) * 500, name: 'Astral Crossing', kind: 'minor', mods: [m('maxHp', 15)], links: [] });
    link(start, bridge);
    link(bridge, ring[ringIdx]!);
    def.branches.forEach((branch, bi) => {
      const spread = (bi - 1) * 0.42; // angular offset for branch
      let prev = start;
      branch.forEach((spec, ni) => {
        const r = 760 + (ni + 1) * 95;
        const ang = a + spread * (0.6 + ni * 0.12);
        const kind = spec.kind ?? 'minor';
        const id = kind === 'keystone' ? `k_${slug(spec.name)}` : `${cls}_${bi}_${ni}`;
        const n = add({ id, tree: cls, x: Math.cos(ang) * r, y: Math.sin(ang) * r, name: spec.name, kind, mods: spec.mods, flags: spec.flags, links: [], desc: spec.desc });
        link(prev, n);
        prev = n;
      });
    });
  });
  return nodes;
}

export const PASSIVE_NODES: PassiveNode[] = build();
export const PASSIVE_MAP: Record<string, PassiveNode> = Object.fromEntries(PASSIVE_NODES.map((n) => [n.id, n]));

/** Points available: 1 per level after 1, plus bonus points. */
export function passivePointsFor(level: number, bonus: number): number {
  return Math.max(0, level - 1) + bonus;
}

/** Validate a full allocation: every node must be reachable from the class start through allocated nodes, and only one class tree may be used. */
export function validatePassives(cls: ClassId, alloc: string[], level: number, bonus: number): { ok: true } | { ok: false; reason: string } {
  const set = new Set(alloc);
  if (set.size !== alloc.length) return { ok: false, reason: 'Duplicate node' };
  const startId = `${cls}_start`;
  for (const id of alloc) {
    const n = PASSIVE_MAP[id];
    if (!n) return { ok: false, reason: `Unknown node ${id}` };
    if (n.tree !== 'central' && n.tree !== cls) return { ok: false, reason: 'Node belongs to another class tree' };
    if (n.kind === 'start') return { ok: false, reason: 'Start node is free' };
  }
  if (alloc.length > passivePointsFor(level, bonus)) return { ok: false, reason: 'Not enough passive points' };
  // connectivity BFS from start through allocated
  const seen = new Set<string>([startId]);
  const q = [startId];
  while (q.length) {
    const id = q.shift()!;
    for (const l of PASSIVE_MAP[id]!.links) if (set.has(l) && !seen.has(l)) { seen.add(l); q.push(l); }
  }
  for (const id of alloc) if (!seen.has(id)) return { ok: false, reason: `Node ${PASSIVE_MAP[id]!.name} is not connected` };
  return { ok: true };
}

export function canAllocate(cls: ClassId, alloc: string[], nodeId: string): boolean {
  const n = PASSIVE_MAP[nodeId];
  if (!n || alloc.includes(nodeId) || n.kind === 'start') return false;
  if (n.tree !== 'central' && n.tree !== cls) return false;
  const have = new Set([...alloc, `${cls}_start`]);
  return n.links.some((l) => have.has(l));
}

/** Encode/decode a build string for sharing: "ASTRA1:<cls>:<ids joined by ,>" base64url. */
declare function btoa(s: string): string;
declare function atob(s: string): string;
export function encodeBuild(cls: ClassId, alloc: string[], active: (string | null)[], ultimate: (string | null)[]): string {
  const raw = JSON.stringify({ v: 1, c: cls, p: alloc, a: active, u: ultimate });
  const b64 = btoa(raw);
  return 'ASTRA1.' + b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeBuild(code: string): { c: ClassId; p: string[]; a: (string | null)[]; u: (string | null)[] } | null {
  try {
    if (!code.startsWith('ASTRA1.')) return null;
    const b = code.slice(7).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(b);
    const o = JSON.parse(raw);
    if (o.v !== 1 || !Array.isArray(o.p)) return null;
    return o;
  } catch { return null; }
}
