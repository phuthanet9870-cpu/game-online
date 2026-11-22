// Procedural bestiary: every farm zone gets its own monster family built from 10 body archetypes × 5 regional
// variants (name, colour, element, size, attacks), plus 3 field mini-bosses and 1 zone overlord. The output is
// deterministic (no RNG) so server, client and saves always agree on ids and stats.
import type { DamageType, EnemyAttack, EnemyDef, StatusId } from '../types.js';

export type EnemyLook = 'beast' | 'golem' | 'orb' | 'caster' | 'hollow' | 'tree';

export interface ZoneDef {
  id: string; name: string; th: string; palette: string; levelMin: number; levelMax: number; seed: number;
  family: string; familyName: string; elements: [DamageType, DamageType]; hue: number;
  prefixes: [string, string, string, string, string];
  /** Legacy hand-made monsters that also live in this zone (weight, pack size). */
  legacy?: Array<[string, number, [number, number]]>;
  nodes: Array<{ type: 'herb' | 'ore'; res: string; name: string; count: number; req?: number }>;
  fishing?: { res: string; name: string; count: number; req?: number };
  /** Zone-themed loot: rune / relic ids that drop more often here. */
  loot: string[];
}

/** 10 open-world farming zones, west → east, levels 1 → 100. Zone i's east gate leads to zone i+1. */
export const ZONES: ZoneDef[] = [
  { id: 'field', name: 'Duskmeadow', th: 'ทุ่งสนธยา', palette: 'field', levelMin: 1, levelMax: 10, seed: 1337, family: 'meadowkin', familyName: 'Meadowkin', elements: ['physical', 'poison'], hue: 110,
    prefixes: ['Dusk', 'Bramble', 'Moss', 'Thistle', 'Glade'], legacy: [['gloomfang', 3, [2, 4]], ['thornback', 2, [1, 2]], ['wisp', 3, [2, 4]]],
    nodes: [{ type: 'herb', res: 'moonpetal', name: 'Moonpetal Bloom', count: 30 }], fishing: { res: 'fish', name: 'Moonlake Shore', count: 10 }, loot: ['r_rune_vigor', 'r_rune_swift'] },
  { id: 'highlands', name: 'Ashen Highlands', th: 'ที่ราบสูงเถ้าถ่าน', palette: 'ash', levelMin: 10, levelMax: 20, seed: 4242, family: 'cinderkin', familyName: 'Cinderkin', elements: ['fire', 'physical'], hue: 15,
    prefixes: ['Cinder', 'Ember', 'Soot', 'Scorch', 'Magma'], legacy: [['ember_imp', 3, [2, 4]], ['flamecaller', 2, [1, 3]], ['magma_golem', 1, [1, 1]], ['cinder_drake', 2, [1, 2]]],
    nodes: [{ type: 'ore', res: 'iron_ore', name: 'Iron Vein', count: 26 }, { type: 'ore', res: 'starsteel', name: 'Starsteel Vein', count: 8, req: 4 }, { type: 'herb', res: 'emberbloom', name: 'Emberbloom', count: 18 }], fishing: { res: 'ember_eel', name: 'Lava Pool', count: 8, req: 3 }, loot: ['r_rune_blaze', 'r_rune_might'] },
  { id: 'wastes', name: 'Starfall Wastes', th: 'ดินแดนดาวตก', palette: 'star', levelMin: 20, levelMax: 30, seed: 9090, family: 'shardborn', familyName: 'Shardborn', elements: ['lightning', 'holy'], hue: 200,
    prefixes: ['Shard', 'Prism', 'Glass', 'Comet', 'Facet'], legacy: [['shard_stalker', 3, [2, 4]], ['prism_seer', 2, [1, 2]], ['glass_colossus', 1, [1, 1]], ['starling', 2, [3, 5]]],
    nodes: [{ type: 'ore', res: 'starglass', name: 'Starglass Cluster', count: 18, req: 6 }, { type: 'ore', res: 'starsteel', name: 'Starsteel Vein', count: 12, req: 4 }, { type: 'herb', res: 'starbloom', name: 'Starbloom', count: 18 }], loot: ['r_rune_storm', 'r_rune_focus'] },
  { id: 'mire', name: 'Sunken Mire', th: 'บึงจมดิ่ง', palette: 'mire', levelMin: 30, levelMax: 40, seed: 3131, family: 'mirespawn', familyName: 'Mirespawn', elements: ['poison', 'shadow'], hue: 95,
    prefixes: ['Bog', 'Rotting', 'Silt', 'Leech', 'Fen'], nodes: [{ type: 'herb', res: 'moonpetal', name: 'Bog Moonpetal', count: 24 }, { type: 'herb', res: 'starbloom', name: 'Marsh Starbloom', count: 12 }], fishing: { res: 'fish', name: 'Murky Pool', count: 10 }, loot: ['r_rune_venom', 'r_rune_leech'] },
  { id: 'frost', name: 'Frostpeak Tundra', th: 'ทุนดรายอดน้ำแข็ง', palette: 'frost', levelMin: 40, levelMax: 50, seed: 4141, family: 'rimeborn', familyName: 'Rimeborn', elements: ['ice', 'physical'], hue: 195,
    prefixes: ['Rime', 'Glacial', 'Hoarfrost', 'Blizzard', 'Snowdrift'], nodes: [{ type: 'ore', res: 'iron_ore', name: 'Frozen Iron', count: 20 }, { type: 'ore', res: 'starglass', name: 'Ice Starglass', count: 14, req: 6 }], fishing: { res: 'fish', name: 'Ice Hole', count: 8 }, loot: ['r_rune_frost', 'r_rune_bulwark'] },
  { id: 'dunes', name: 'Sandsea Dunes', th: 'ทะเลทรายคลื่นทราย', palette: 'sand', levelMin: 50, levelMax: 60, seed: 5151, family: 'dunekin', familyName: 'Dunekin', elements: ['fire', 'physical'], hue: 40,
    prefixes: ['Dune', 'Sunscorched', 'Mirage', 'Sandstorm', 'Scarab'], nodes: [{ type: 'ore', res: 'starsteel', name: 'Buried Starsteel', count: 16, req: 4 }, { type: 'herb', res: 'emberbloom', name: 'Desert Emberbloom', count: 18 }], loot: ['r_rune_blaze', 'r_rune_fortune'] },
  { id: 'hollows', name: 'Fungal Hollows', th: 'โพรงเห็ดยักษ์', palette: 'fungal', levelMin: 60, levelMax: 70, seed: 6161, family: 'sporeling', familyName: 'Sporelings', elements: ['poison', 'lightning'], hue: 290,
    prefixes: ['Spore', 'Mycel', 'Glowcap', 'Puffball', 'Rootrot'], nodes: [{ type: 'herb', res: 'starbloom', name: 'Glowcap Bloom', count: 26 }, { type: 'ore', res: 'starglass', name: 'Spore Crystal', count: 12, req: 6 }], fishing: { res: 'ember_eel', name: 'Spore Pool', count: 8, req: 3 }, loot: ['r_rune_venom', 'r_rune_storm'] },
  { id: 'abyss', name: 'Obsidian Abyss', th: 'ห้วงลึกออบซิเดียน', palette: 'abyss', levelMin: 70, levelMax: 80, seed: 7171, family: 'abyssal', familyName: 'Abyssal Horde', elements: ['shadow', 'fire'], hue: 330,
    prefixes: ['Obsidian', 'Void', 'Brimstone', 'Dread', 'Umbral'], nodes: [{ type: 'ore', res: 'starsteel', name: 'Abyssal Starsteel', count: 18, req: 4 }, { type: 'ore', res: 'iron_ore', name: 'Obsidian Iron', count: 16 }], fishing: { res: 'ember_eel', name: 'Magma Rift', count: 8, req: 3 }, loot: ['r_rune_shadow', 'r_rune_might'] },
  { id: 'celestial', name: 'Celestial Gardens', th: 'สวนสวรรค์', palette: 'celestial', levelMin: 80, levelMax: 90, seed: 8181, family: 'seraphic', familyName: 'Seraphic Host', elements: ['holy', 'lightning'], hue: 50,
    prefixes: ['Halo', 'Radiant', 'Aurora', 'Seraph', 'Dawn'], nodes: [{ type: 'herb', res: 'moonpetal', name: 'Heaven Moonpetal', count: 20 }, { type: 'herb', res: 'starbloom', name: 'Sun Starbloom', count: 20 }, { type: 'ore', res: 'starglass', name: 'Halo Starglass', count: 12, req: 6 }], fishing: { res: 'fish', name: 'Sky Pond', count: 8 }, loot: ['r_rune_holy', 'r_rune_focus'] },
  { id: 'eclipse', name: 'Eclipse Throne', th: 'บัลลังก์สุริยคราส', palette: 'eclipse', levelMin: 90, levelMax: 100, seed: 9191, family: 'eclipsed', familyName: 'Eclipsed', elements: ['shadow', 'holy'], hue: 265,
    prefixes: ['Eclipse', 'Penumbra', 'Corona', 'Nightfall', 'Twilight'], nodes: [{ type: 'ore', res: 'starsteel', name: 'Eclipse Starsteel', count: 18, req: 4 }, { type: 'ore', res: 'starglass', name: 'Corona Glass', count: 16, req: 6 }, { type: 'herb', res: 'starbloom', name: 'Night Starbloom', count: 16 }], loot: ['r_rune_shadow', 'r_rune_holy', 'r_rune_fortune'] },
];
export const ZONE_MAP: Record<string, ZoneDef> = Object.fromEntries(ZONES.map((z) => [z.id, z]));

interface Arch { key: string; noun: string; look: EnemyLook; role: EnemyDef['role']; hp: number; power: number; armor: number; speed: number; radius: number; xp: number; aggro: number; prefer?: number; atk: (el: DamageType, st: StatusId) => EnemyAttack[] }
const ARCH: Arch[] = [
  { key: 'stalker', noun: 'Stalker', look: 'beast', role: 'flanker', hp: 62, power: 10, armor: 18, speed: 190, radius: 13, xp: 18, aggro: 340, atk: (el, st) => [{ id: 'rend', kind: 'melee', range: 46, cooldown: 1.1, windup: 0.32, dmg: 0.95, type: el, status: { id: st, chance: 0.25, duration: 3, power: 0.15 } }, { id: 'pounce', kind: 'charge', range: 260, cooldown: 6.5, windup: 0.6, dmg: 1.1, type: 'physical' }] },
  { key: 'brute', noun: 'Brute', look: 'golem', role: 'tank', hp: 230, power: 14, armor: 70, speed: 88, radius: 22, xp: 46, aggro: 300, atk: (el) => [{ id: 'quake', kind: 'slam', range: 90, cooldown: 3.1, windup: 0.9, dmg: 1.6, type: el, radius: 105, status: { id: 'stun', chance: 0.4, duration: 0.7 } }, { id: 'smash', kind: 'melee', range: 62, cooldown: 1.9, windup: 0.5, dmg: 0.9, type: 'physical' }] },
  { key: 'wisp', noun: 'Wisp', look: 'orb', role: 'ranged', hp: 40, power: 9, armor: 6, speed: 135, radius: 11, xp: 14, aggro: 420, prefer: 280, atk: (el, st) => [{ id: 'bolt', kind: 'projectile', range: 420, cooldown: 2.0, windup: 0.55, dmg: 1, type: el, speed: 360, status: { id: st, chance: 0.2, duration: 2, power: 0.1 } }] },
  { key: 'shaman', noun: 'Shaman', look: 'caster', role: 'summoner', hp: 58, power: 10, armor: 10, speed: 105, radius: 14, xp: 24, aggro: 420, prefer: 260, atk: (el) => [{ id: 'pillar', kind: 'eruption', range: 380, cooldown: 3.6, windup: 1.0, dmg: 1.5, type: el, radius: 70 }, { id: 'call', kind: 'summon', range: 400, cooldown: 14, windup: 1, dmg: 0, type: el, summon: '', count: 2 }] },
  { key: 'archer', noun: 'Skirmisher', look: 'hollow', role: 'ranged', hp: 52, power: 9, armor: 12, speed: 118, radius: 14, xp: 17, aggro: 430, prefer: 300, atk: (el) => [{ id: 'volley', kind: 'projectile', range: 430, cooldown: 2.1, windup: 0.6, dmg: 1, type: el, speed: 400 }] },
  { key: 'knight', noun: 'Warden', look: 'hollow', role: 'melee', hp: 90, power: 11, armor: 34, speed: 122, radius: 16, xp: 20, aggro: 310, atk: (el) => [{ id: 'cut', kind: 'cleave', range: 96, cooldown: 2.4, windup: 0.6, dmg: 1.2, type: el }, { id: 'jab', kind: 'melee', range: 52, cooldown: 1.5, windup: 0.4, dmg: 0.9, type: 'physical' }] },
  { key: 'treant', noun: 'Ancient', look: 'tree', role: 'tank', hp: 260, power: 13, armor: 60, speed: 70, radius: 24, xp: 50, aggro: 280, atk: (el) => [{ id: 'roots', kind: 'slam', range: 100, cooldown: 3.4, windup: 1.0, dmg: 1.5, type: el, radius: 120, status: { id: 'slow', chance: 0.8, duration: 2, power: 0.3 } }] },
  { key: 'swarm', noun: 'Mite', look: 'orb', role: 'melee', hp: 28, power: 7, armor: 4, speed: 210, radius: 9, xp: 8, aggro: 300, atk: (el, st) => [{ id: 'nip', kind: 'melee', range: 36, cooldown: 0.9, windup: 0.25, dmg: 0.7, type: el, status: { id: st, chance: 0.15, duration: 2, power: 0.1 } }] },
  { key: 'hulk', noun: 'Behemoth', look: 'beast', role: 'tank', hp: 280, power: 15, armor: 55, speed: 110, radius: 24, xp: 55, aggro: 320, atk: (el) => [{ id: 'gore', kind: 'charge', range: 320, cooldown: 6, windup: 0.8, dmg: 1.4, type: 'physical', status: { id: 'stun', chance: 0.6, duration: 0.6 } }, { id: 'maul', kind: 'melee', range: 64, cooldown: 1.8, windup: 0.5, dmg: 1.1, type: el }] },
  { key: 'seer', noun: 'Oracle', look: 'caster', role: 'caster', hp: 55, power: 11, armor: 8, speed: 100, radius: 14, xp: 22, aggro: 440, prefer: 270, atk: (el) => [{ id: 'nova', kind: 'nova', range: 420, cooldown: 4.5, windup: 0.9, dmg: 0.8, type: el, count: 8, speed: 240 }, { id: 'zap', kind: 'projectile', range: 420, cooldown: 2.2, windup: 0.5, dmg: 0.9, type: el, speed: 380 }] },
];
const ELEM_ST: Record<DamageType, StatusId> = { physical: 'bleed', fire: 'burn', ice: 'chill', lightning: 'shock', holy: 'weaken', shadow: 'curse', poison: 'poison' };
const RESIST: Record<DamageType, DamageType> = { physical: 'lightning', fire: 'ice', ice: 'fire', lightning: 'physical', holy: 'shadow', shadow: 'holy', poison: 'holy' };
const BOSS_NOUN = ['Matriarch', 'Warlord', 'Hierophant'];

function hsl(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))))).toString(16).padStart(2, '0');
  return `#${f(0)}${f(8)}${f(4)}`;
}

export interface BestiaryEntry extends EnemyDef { look: EnemyLook; zone: string }
function build(): Record<string, BestiaryEntry> {
  const out: Record<string, BestiaryEntry> = {};
  ZONES.forEach((z, zi) => {
    z.prefixes.forEach((pre, pi) => {
      ARCH.forEach((a, ai) => {
        const el = (pi + ai) % 3 === 2 ? z.elements[1] : z.elements[0];
        const id = `${z.id}_${a.key}_${pi}`;
        const size = 1 + ((pi * 7 + ai * 3) % 5 - 2) * 0.06; // ±12% body size, so variants look different
        const atk = a.atk(el, ELEM_ST[el]).map((x) => x.kind === 'summon' ? { ...x, summon: `${z.id}_swarm_${pi}` } : x);
        out[id] = {
          id, name: `${pre} ${a.noun}`, family: z.family, role: a.role, zone: z.id, look: a.look,
          hp: Math.round(a.hp * size * (1 + pi * 0.04)), power: Math.round(a.power * (1 + pi * 0.03) * 10) / 10, armor: Math.round(a.armor * size), speed: Math.round(a.speed / Math.sqrt(size)),
          radius: Math.round(a.radius * size), xp: Math.round(a.xp * (1 + pi * 0.05)), aggroRange: a.aggro, preferRange: a.prefer,
          res: { [el]: 35 + pi * 5, [RESIST[el]]: -25 } as EnemyDef['res'], attacks: atk,
          color: hsl((z.hue + pi * 14 + ai * 5) % 360, 45 + (ai % 3) * 12, 32 + (pi % 3) * 8 + (a.look === 'orb' ? 14 : 0)), lootBonus: a.role === 'tank' ? 1 : undefined,
        };
      });
    });
    // 3 field mini-bosses + 1 overlord per zone
    for (let b = 0; b < 4; b++) {
      const over = b === 3, a = ARCH[[1, 8, 9, 6][b]!]!, el = z.elements[b % 2]!;
      const id = over ? `${z.id}_overlord` : `${z.id}_boss_${b}`;
      const base = a.atk(el, ELEM_ST[el]);
      const attacks: EnemyAttack[] = [...base.filter((x) => x.kind !== 'summon'),
        { id: 'wrath', kind: 'nova', range: 520, cooldown: 7, windup: 1.0, dmg: 1.0, type: el, count: over ? 16 : 10, speed: 230, phase: 1 },
        { id: 'brood', kind: 'summon', range: 420, cooldown: 16, windup: 1, dmg: 0, type: el, summon: `${z.id}_swarm_${b}`, count: over ? 4 : 2 },
        ...(over ? [{ id: 'cataclysm', kind: 'eruption' as const, range: 520, cooldown: 6, windup: 1.1, dmg: 2.0, type: el, radius: 95, count: 4, phase: 1 }] : [])];
      out[id] = {
        id, name: over ? `${z.prefixes[0]} Overlord` : `${z.prefixes[b + 1]} ${BOSS_NOUN[b]}`, family: z.family, role: 'boss', zone: z.id, look: a.look,
        hp: over ? 4200 : 1100 + b * 150, power: over ? 16 : 14.5, armor: over ? 70 : 55, speed: over ? 110 : 115, radius: over ? 36 : 28, xp: over ? 700 : 180, aggroRange: 420,
        res: { [el]: 45, [RESIST[el]]: -15 } as EnemyDef['res'], attacks, color: hsl((z.hue + 180 + b * 20) % 360, 55, over ? 30 : 38),
        boss: { phases: over ? [0.66, 0.33] : [0.5], breakGauge: over ? 900 : 400, title: over ? `Overlord of ${z.name}` : 'Field Boss' }, lootBonus: over ? 4 : 2, enrage: over ? 150 : undefined,
      };
    }
    void zi;
  });
  return out;
}
export const BESTIARY: Record<string, BestiaryEntry> = build();
/** Spawn pool for a zone: monster ids with their level offset inside the zone's band (0..1, west → east). */
export function zonePool(zoneId: string): Array<{ id: string; at: number; pack: [number, number] }> {
  return Object.values(BESTIARY).filter((e) => e.zone === zoneId && e.role !== 'boss').map((e) => {
    const pi = Number(e.id.slice(-1)), key = e.id.split('_').slice(-2, -1)[0]!;
    return { id: e.id, at: pi / 5, pack: key === 'swarm' ? [3, 5] : key === 'brute' || key === 'treant' || key === 'hulk' ? [1, 1] : key === 'wisp' || key === 'stalker' ? [2, 3] : [1, 2] };
  });
}
/** Waymaster fare from Lumenhold: free to Duskmeadow, then 60 gold per zone further east. */
export function waypointCost(zoneId: string): number { return Math.max(0, ZONES.findIndex((z) => z.id === zoneId)) * 60; }

// ── Thai names (procedural: prefix + archetype noun) ──
const PREFIX_TH: Record<string, string> = {
  Dusk: 'สนธยา', Bramble: 'พุ่มหนาม', Moss: 'ตะไคร่', Thistle: 'หนามป่า', Glade: 'ลานป่า', Cinder: 'ถ่านไฟ', Ember: 'เถ้าเพลิง', Soot: 'เขม่า', Scorch: 'เผาไหม้', Magma: 'หินหนืด',
  Shard: 'เศษผลึก', Prism: 'ปริซึม', Glass: 'แก้ว', Comet: 'ดาวหาง', Facet: 'เหลี่ยมผลึก', Bog: 'หนองบึง', Rotting: 'เน่าเปื่อย', Silt: 'ตะกอน', Leech: 'ปลิง', Fen: 'ที่ลุ่ม',
  Rime: 'น้ำค้างแข็ง', Glacial: 'ธารน้ำแข็ง', Hoarfrost: 'เกล็ดน้ำแข็ง', Blizzard: 'พายุหิมะ', Snowdrift: 'กองหิมะ', Dune: 'เนินทราย', Sunscorched: 'แดดแผดเผา', Mirage: 'ภาพลวงตา', Sandstorm: 'พายุทราย', Scarab: 'แมลงสคารับ',
  Spore: 'สปอร์', Mycel: 'เส้นใยเห็ด', Glowcap: 'เห็ดเรืองแสง', Puffball: 'เห็ดลูกฟู', Rootrot: 'รากเน่า', Obsidian: 'ออบซิเดียน', Void: 'ความว่างเปล่า', Brimstone: 'กำมะถัน', Dread: 'สยองขวัญ', Umbral: 'เงามืด',
  Halo: 'รัศมี', Radiant: 'เจิดจ้า', Aurora: 'แสงเหนือ', Seraph: 'เซราฟ', Dawn: 'รุ่งอรุณ', Eclipse: 'สุริยคราส', Penumbra: 'เงามัว', Corona: 'โคโรนา', Nightfall: 'ราตรี', Twilight: 'โพล้เพล้',
};
const NOUN_TH: Record<string, string> = { Stalker: 'นักล่า', Brute: 'ยักษ์', Wisp: 'ดวงวิญญาณ', Shaman: 'หมอผี', Skirmisher: 'พลธนู', Warden: 'ผู้พิทักษ์', Ancient: 'พฤกษาโบราณ', Mite: 'ไรฝูง', Behemoth: 'อสุรกาย', Oracle: 'ผู้หยั่งรู้', Matriarch: 'ราชินี', Warlord: 'ขุนศึก', Hierophant: 'มหาปุโรหิต', Overlord: 'จอมราชัน' };
export const BESTIARY_TH: Record<string, string> = Object.fromEntries(Object.values(BESTIARY).map((e) => {
  const [pre, noun] = e.name.split(' ') as [string, string];
  return [`enemy.${e.id}`, `${NOUN_TH[noun] ?? noun}${PREFIX_TH[pre] ?? pre}`];
}));
