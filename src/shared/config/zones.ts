/**
 * Zone (map) definitions. 32 zones are planned (see docs/WORLD_MAP_DESIGN.md);
 * the vertical slice implements 3: Aether Capital, Greenfall Plains and
 * Whispering Forest. Zones are data — adding one is a config change.
 */

export interface PortalDef { id: string; x: number; y: number; w: number; h: number; to: string; toX: number; toY: number; label: string }
export interface SpawnGroupDef { id: string; monsterId: string; x: number; y: number; radius: number; baseCount: number; perPlayer: number; maxCount: number }
export interface NpcDef { id: string; name: string; nameTh: string; role: 'shop' | 'info' | 'power' | 'ritual'; x: number; y: number; shopId?: string; dialogue: string[]; color: string }
export interface ResourceNodeDef { id: string; kind: 'herb' | 'ore'; x: number; y: number; itemId: string; min: number; max: number; respawnSec: number }
export interface HazardDef { id: string; kind: 'mud' | 'thorns'; x: number; y: number; radius: number; slowMult: number; dpsFraction: number }
export interface StructureDef { kind: 'house' | 'shop' | 'smithy' | 'hall' | 'wall' | 'fountain'; x: number; y: number; w: number; h: number }

export interface ZoneDef {
  id: string;
  name: string;
  nameTh: string;
  region: string;
  kind: 'city' | 'field';
  safe: boolean;
  levelRange: [number, number];
  width: number;
  height: number;
  seed: number;
  biome: 'city' | 'plains' | 'forest';
  spawnPoint: { x: number; y: number };
  portals: PortalDef[];
  spawnGroups: SpawnGroupDef[];
  npcs: NpcDef[];
  resourceNodes: ResourceNodeDef[];
  hazards: HazardDef[];
  structures: StructureDef[];
  /** Extra path waypoints carved by the generator (safe routes). */
  routes: { x: number; y: number }[][];
}

export const ZONES: Record<string, ZoneDef> = {
  aether_capital: {
    id: 'aether_capital', name: 'Aether Capital', nameTh: 'นครอีเธอร์', region: 'Capital', kind: 'city', safe: true,
    levelRange: [1, 100], width: 56, height: 56, seed: 1001, biome: 'city',
    spawnPoint: { x: 28, y: 33 },
    portals: [
      { id: 'east_gate', x: 54, y: 26, w: 2, h: 4, to: 'greenfall_plains', toX: 4.5, toY: 50, label: 'Greenfall Plains →' },
      { id: 'west_gate', x: 0, y: 27, w: 2, h: 4, to: 'warhaven_citadel', toX: 50.5, toY: 28.5, label: '← Warhaven Citadel' },
    ],
    spawnGroups: [],
    npcs: [
      { id: 'npc_merchant', name: 'Mira the Merchant', nameTh: 'มิร่า พ่อค้า', role: 'shop', shopId: 'aether_general', x: 21.5, y: 24.5, color: '#3b7dd8',
        dialogue: ['ยินดีต้อนรับสู่ร้านค้าทั่วไป! มียาฟื้นพลังและอาวุธเริ่มต้นจ้า'] },
      { id: 'npc_guard', name: 'Captain Roderic', nameTh: 'กัปตันโรเดอริก', role: 'info', x: 46.5, y: 28.5, color: '#c0392b',
        dialogue: ['ประตูตะวันออกพาไปสู่ Greenfall Plains', 'สไลม์และหมูป่าเหมาะกับมือใหม่ ส่วนหมาป่าจ่าฝูงทางตะวันออกเฉียงเหนือนั้นอันตราย', 'ไกลออกไปทางเหนือคือ Whispering Forest สำหรับเลเวล 6 ขึ้นไป'] },
      { id: 'npc_smith', name: 'Borin the Blacksmith', nameTh: 'โบริน ช่างตีเหล็ก', role: 'info', x: 34.5, y: 24.5, color: '#7f8c8d',
        dialogue: ['ระบบตีบวก +20 เจาะรูน และรีฟอร์จออปชั่น ยังไม่เปิดให้บริการ (Milestone 4)', 'เก็บแร่เหล็กไว้ก่อน เดี๋ยวได้ใช้แน่'] },
      { id: 'npc_sage', name: 'Elder Sage Ilya', nameTh: 'ปราชญ์อิลยา', role: 'power', x: 28.5, y: 20.5, color: '#8e44ad',
        dialogue: ['The Power คือพลังที่ต้องตามหาเองจากมอนสเตอร์และบอส', 'นำเศษพลัง 30 ชิ้นกับทอง 5,000 มา ข้าจะหลอมให้เป็นพลังที่เจ้าเลือก', 'ถ้าจะเปลี่ยนพลังที่ใช้อยู่ ต้องไปทำพิธีที่ Power Rebirth Temple ใน Warhaven Citadel'] },
    ],
    resourceNodes: [], hazards: [],
    structures: [
      { kind: 'wall', x: 0, y: 0, w: 56, h: 2 }, { kind: 'wall', x: 0, y: 54, w: 56, h: 2 },
      { kind: 'wall', x: 0, y: 0, w: 2, h: 27 }, { kind: 'wall', x: 0, y: 31, w: 2, h: 25 }, { kind: 'wall', x: 54, y: 0, w: 2, h: 26 }, { kind: 'wall', x: 54, y: 30, w: 2, h: 26 },
      { kind: 'shop', x: 18, y: 18, w: 7, h: 5 }, { kind: 'smithy', x: 31, y: 18, w: 7, h: 5 },
      { kind: 'hall', x: 24, y: 10, w: 9, h: 8 },
      { kind: 'house', x: 8, y: 8, w: 6, h: 5 }, { kind: 'house', x: 8, y: 20, w: 5, h: 5 }, { kind: 'house', x: 8, y: 36, w: 6, h: 5 },
      { kind: 'house', x: 40, y: 8, w: 6, h: 5 }, { kind: 'house', x: 42, y: 38, w: 6, h: 6 }, { kind: 'house', x: 18, y: 42, w: 5, h: 5 },
      { kind: 'house', x: 33, y: 43, w: 6, h: 5 },
      { kind: 'fountain', x: 27, y: 27, w: 3, h: 3 },
    ],
    routes: [],
  },
  greenfall_plains: {
    id: 'greenfall_plains', name: 'Greenfall Plains', nameTh: 'ทุ่งกรีนฟอลล์', region: 'Verdant Frontier', kind: 'field', safe: false,
    levelRange: [1, 8], width: 100, height: 100, seed: 2002, biome: 'plains',
    spawnPoint: { x: 5, y: 50 },
    portals: [
      { id: 'west_gate', x: 0, y: 48, w: 2, h: 4, to: 'aether_capital', toX: 51.5, toY: 28, label: '← Aether Capital' },
      { id: 'north_path', x: 48, y: 0, w: 4, h: 2, to: 'whispering_forest', toX: 50, toY: 95.5, label: 'Whispering Forest ↑' },
    ],
    spawnGroups: [
      { id: 'g_slime_a', monsterId: 'green_slime', x: 16, y: 44, radius: 6, baseCount: 6, perPlayer: 2, maxCount: 12 },
      { id: 'g_slime_b', monsterId: 'green_slime', x: 20, y: 62, radius: 6, baseCount: 5, perPlayer: 2, maxCount: 10 },
      { id: 'g_puff_a', monsterId: 'puffcap', x: 30, y: 30, radius: 6, baseCount: 4, perPlayer: 1, maxCount: 8 },
      { id: 'g_boar_a', monsterId: 'meadow_boar', x: 38, y: 60, radius: 7, baseCount: 5, perPlayer: 2, maxCount: 10 },
      { id: 'g_wisp_a', monsterId: 'field_wisp', x: 52, y: 38, radius: 7, baseCount: 4, perPlayer: 1, maxCount: 8 },
      { id: 'g_boar_b', monsterId: 'meadow_boar', x: 60, y: 72, radius: 7, baseCount: 4, perPlayer: 2, maxCount: 9 },
      { id: 'g_wolf_a', monsterId: 'plains_wolf', x: 70, y: 48, radius: 8, baseCount: 5, perPlayer: 2, maxCount: 10 },
      { id: 'g_wolf_b', monsterId: 'plains_wolf', x: 78, y: 28, radius: 7, baseCount: 4, perPlayer: 2, maxCount: 9 },
      { id: 'g_alpha', monsterId: 'alpha_wolf', x: 86, y: 14, radius: 2, baseCount: 1, perPlayer: 0, maxCount: 1 },
    ],
    npcs: [
      { id: 'npc_scout', name: 'Scout Fenn', nameTh: 'หน่วยลาดตระเวนเฟนน์', role: 'info', x: 8.5, y: 46.5, color: '#27ae60',
        dialogue: ['สไลม์ใกล้ประตูเมืองไม่โจมตีก่อน เหมาะสำหรับฝึกมือ', 'ระวังเห็ดพองลม! เมื่อมันพองตัว ให้กระโดดหลบ (Space) ออกจากวงสีแดง'] },
    ],
    resourceNodes: [
      { id: 'herb_1', kind: 'herb', x: 24, y: 52, itemId: 'mat_nature_herb', min: 1, max: 2, respawnSec: 60 },
      { id: 'herb_2', kind: 'herb', x: 44, y: 22, itemId: 'mat_nature_herb', min: 1, max: 2, respawnSec: 60 },
      { id: 'herb_3', kind: 'herb', x: 64, y: 86, itemId: 'mat_nature_herb', min: 1, max: 2, respawnSec: 60 },
      { id: 'ore_1', kind: 'ore', x: 58, y: 56, itemId: 'mat_iron_ore', min: 1, max: 2, respawnSec: 90 },
      { id: 'ore_2', kind: 'ore', x: 82, y: 62, itemId: 'mat_iron_ore', min: 1, max: 2, respawnSec: 90 },
      { id: 'ore_3', kind: 'ore', x: 74, y: 20, itemId: 'mat_iron_ore', min: 1, max: 3, respawnSec: 90 },
    ],
    hazards: [
      { id: 'mud_1', kind: 'mud', x: 34, y: 78, radius: 4, slowMult: 0.55, dpsFraction: 0 },
      { id: 'mud_2', kind: 'mud', x: 66, y: 36, radius: 3, slowMult: 0.55, dpsFraction: 0 },
    ],
    structures: [],
    routes: [[{ x: 5, y: 50 }, { x: 30, y: 50 }, { x: 50, y: 40 }, { x: 50, y: 4 }], [{ x: 50, y: 40 }, { x: 72, y: 46 }, { x: 86, y: 16 }]],
  },
  whispering_forest: {
    id: 'whispering_forest', name: 'Whispering Forest', nameTh: 'ป่ากระซิบ', region: 'Verdant Frontier', kind: 'field', safe: false,
    levelRange: [6, 14], width: 100, height: 100, seed: 3003, biome: 'forest',
    spawnPoint: { x: 50, y: 95 },
    portals: [{ id: 'south_path', x: 48, y: 98, w: 4, h: 2, to: 'greenfall_plains', toX: 50, toY: 4.5, label: '↓ Greenfall Plains' }],
    spawnGroups: [
      { id: 'f_moss_a', monsterId: 'moss_slime', x: 40, y: 82, radius: 6, baseCount: 6, perPlayer: 2, maxCount: 12 },
      { id: 'f_moss_b', monsterId: 'moss_slime', x: 64, y: 80, radius: 6, baseCount: 5, perPlayer: 2, maxCount: 10 },
      { id: 'f_spore_a', monsterId: 'sporeling', x: 28, y: 62, radius: 6, baseCount: 5, perPlayer: 1, maxCount: 9 },
      { id: 'f_boar_a', monsterId: 'thorn_boar', x: 56, y: 58, radius: 7, baseCount: 5, perPlayer: 2, maxCount: 10 },
      { id: 'f_wisp_a', monsterId: 'forest_wisp', x: 74, y: 44, radius: 7, baseCount: 4, perPlayer: 1, maxCount: 8 },
      { id: 'f_wolf_a', monsterId: 'shade_wolf', x: 36, y: 36, radius: 8, baseCount: 5, perPlayer: 2, maxCount: 10 },
      { id: 'f_wolf_b', monsterId: 'shade_wolf', x: 62, y: 24, radius: 7, baseCount: 4, perPlayer: 2, maxCount: 9 },
      { id: 'f_spore_b', monsterId: 'sporeling', x: 82, y: 66, radius: 6, baseCount: 4, perPlayer: 1, maxCount: 8 },
      { id: 'f_elder', monsterId: 'elder_sapling', x: 48, y: 12, radius: 2, baseCount: 1, perPlayer: 0, maxCount: 1 },
    ],
    npcs: [
      { id: 'npc_druid', name: 'Druid Saela', nameTh: 'ดรูอิดเซลา', role: 'info', x: 53.5, y: 92.5, color: '#16a085',
        dialogue: ['ป่านี้กระซิบเตือนผู้บุกรุก... ระวังพุ่มหนามที่ทำให้เดินช้าและบาดเจ็บ', 'ต้นกล้าผู้เฒ่าทางเหนือสุดแข็งแกร่งมาก ควรไปเป็นกลุ่ม'] },
    ],
    resourceNodes: [
      { id: 'herb_1', kind: 'herb', x: 22, y: 78, itemId: 'mat_nature_herb', min: 1, max: 3, respawnSec: 60 },
      { id: 'herb_2', kind: 'herb', x: 70, y: 66, itemId: 'mat_nature_herb', min: 1, max: 3, respawnSec: 60 },
      { id: 'herb_3', kind: 'herb', x: 48, y: 40, itemId: 'mat_nature_herb', min: 1, max: 3, respawnSec: 60 },
      { id: 'herb_4', kind: 'herb', x: 84, y: 30, itemId: 'mat_nature_herb', min: 1, max: 3, respawnSec: 60 },
      { id: 'ore_1', kind: 'ore', x: 20, y: 44, itemId: 'mat_iron_ore', min: 1, max: 3, respawnSec: 90 },
      { id: 'ore_2', kind: 'ore', x: 76, y: 18, itemId: 'mat_iron_ore', min: 2, max: 3, respawnSec: 90 },
    ],
    hazards: [
      { id: 'thorn_1', kind: 'thorns', x: 46, y: 70, radius: 3, slowMult: 0.6, dpsFraction: 0.02 },
      { id: 'thorn_2', kind: 'thorns', x: 30, y: 48, radius: 3.5, slowMult: 0.6, dpsFraction: 0.02 },
      { id: 'thorn_3', kind: 'thorns', x: 68, y: 34, radius: 3, slowMult: 0.6, dpsFraction: 0.02 },
    ],
    structures: [],
    routes: [[{ x: 50, y: 96 }, { x: 50, y: 70 }, { x: 40, y: 50 }, { x: 50, y: 30 }, { x: 48, y: 14 }], [{ x: 50, y: 70 }, { x: 72, y: 50 }, { x: 64, y: 24 }]],
  },
};

ZONES.warhaven_citadel = {
  id: 'warhaven_citadel', name: 'Warhaven Citadel', nameTh: 'ป้อมวอร์เฮเวน', region: 'Capital', kind: 'city', safe: true,
  levelRange: [1, 100], width: 56, height: 56, seed: 1002, biome: 'city',
  spawnPoint: { x: 46, y: 28.5 },
  portals: [{ id: 'east_gate', x: 54, y: 26, w: 2, h: 5, to: 'aether_capital', toX: 4.5, toY: 29, label: 'Aether Capital →' }],
  spawnGroups: [],
  npcs: [
    { id: 'npc_priestess', name: 'High Priestess Seren', nameTh: 'นักบวชสูงเซเรน', role: 'ritual', x: 27.5, y: 19.5, color: '#d0b050',
      dialogue: ['นี่คือ Power Rebirth Temple ผู้ที่ต้องการเปลี่ยนพลังต้องผ่านพิธีกรรม', 'พลังเดิมจะถูกเก็บไว้ใน Power Collection พร้อม Mastery ทั้งหมด ไม่มีวันสูญหาย', 'พิธีใช้วัตถุดิบหายากจากบอสและดันเจี้ยน และทำได้ทุก 12 ชั่วโมง'] },
    { id: 'npc_guildclerk', name: 'Guild Clerk Mara', nameTh: 'เสมียนกิลด์มาร่า', role: 'info', x: 16.5, y: 30.5, color: '#2c7a4a',
      dialogue: ['การจดทะเบียนกิลด์และ Guild War ยังไม่เปิด (Milestone 6–7)'] },
    { id: 'npc_warmaster', name: 'Warmaster Dorn', nameTh: 'แม่ทัพดอร์น', role: 'info', x: 38.5, y: 34.5, color: '#9a2a2a',
      dialogue: ['อันดับ PvP และ Castle War จะเปิดใน Milestone 7', 'ระหว่างนี้จงฝึกฝีมือในทุ่งให้เชี่ยวชาญ'] },
  ],
  resourceNodes: [], hazards: [],
  structures: [
    { kind: 'wall', x: 0, y: 0, w: 56, h: 2 }, { kind: 'wall', x: 0, y: 54, w: 56, h: 2 }, { kind: 'wall', x: 0, y: 0, w: 2, h: 56 },
    { kind: 'wall', x: 54, y: 0, w: 2, h: 26 }, { kind: 'wall', x: 54, y: 31, w: 2, h: 25 },
    { kind: 'hall', x: 22, y: 9, w: 11, h: 9 }, { kind: 'house', x: 10, y: 24, w: 6, h: 6 }, { kind: 'smithy', x: 40, y: 36, w: 6, h: 5 },
    { kind: 'house', x: 8, y: 40, w: 6, h: 6 }, { kind: 'house', x: 42, y: 8, w: 6, h: 6 }, { kind: 'house', x: 20, y: 42, w: 7, h: 5 },
    { kind: 'fountain', x: 27, y: 27, w: 3, h: 3 },
  ],
  routes: [],
};

export const START_ZONE = 'aether_capital';

export function getZone(id: string): ZoneDef | undefined {
  return Object.prototype.hasOwnProperty.call(ZONES, id) ? ZONES[id] : undefined;
}
