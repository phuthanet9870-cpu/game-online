// ASTRA icon engine — glossy vector icons for every item, material, consumable, skill, menu entry, currency and
// status. Each icon is an SVG built from shapes that carry a "material" (metal, gold, wood, gem, cloth, …); a
// material becomes a 3-stop gradient, every shape gets a dark ink outline, and a gloss layer lights the upper
// half. Tiles get a rarity / element frame. SVGs are cached as data URLs and shown as <img>.
import { CLASSES, ITEM_BASE_MAP, SKILL_MAP, type Item, type SkillDef } from '@astra/shared';

type V = [number, number];
type Mat = 'metal' | 'gold' | 'wood' | 'leather' | 'bone' | 'paper' | 'dark' | 'meat' | 'white' | `c:${string}` | `gem:${string}` | `glow:${string}`;
interface Sh { k: 'poly' | 'circle' | 'ellipse' | 'rect' | 'path' | 'line'; m: Mat; p?: V[]; c?: V; r?: number; rx?: number; ry?: number; x?: number; y?: number; w?: number; h?: number; d?: string; sw?: number; noGloss?: boolean; noLine?: boolean }

// ── colour helpers ─────────────────────────────────────────
const hx = (h: string) => { const n = parseInt(h.slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toH = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export const lighten = (h: string, f: number) => { const [r, g, b] = hx(h); return toH(r! + (255 - r!) * f, g! + (250 - g!) * f, b! + (240 - b!) * f); };
export const darken = (h: string, f: number) => { const [r, g, b] = hx(h); return toH(r! + (20 - r!) * f, g! + (12 - g!) * f, b! + (36 - b!) * f); };
const MATS: Record<string, [string, string, string]> = {
  metal: ['#ffffff', '#b8c4dc', '#46506c'], gold: ['#fff6c8', '#f2c445', '#7a4a12'], wood: ['#d8a068', '#8a5a34', '#40200e'],
  leather: ['#c88a58', '#7e4a2a', '#341a0c'], bone: ['#fffcf2', '#e2d6b2', '#7a6a48'], paper: ['#fffaf0', '#ead4a4', '#9a7440'],
  dark: ['#6a5a8a', '#2c2044', '#0e0818'], meat: ['#ffb4a4', '#d24c3c', '#5a1410'], white: ['#ffffff', '#e8eef8', '#8a94b0'],
};
function stops(m: Mat): [string, string, string] {
  if (m.startsWith('c:')) { const c = m.slice(2); return [lighten(c, 0.45), c, darken(c, 0.55)]; }
  if (m.startsWith('gem:')) { const c = m.slice(4); return ['#ffffff', lighten(c, 0.15), darken(c, 0.5)]; }
  if (m.startsWith('glow:')) { const c = m.slice(5); return ['#ffffff', lighten(c, 0.3), c]; }
  return MATS[m] ?? MATS.metal!;
}

// ── geometry helpers (64×64 space) ─────────────────────────
/** Points in a diagonal frame: u runs bottom-left → top-right, v across it; (0,0) is the centre. */
const diag = (pts: V[], cx = 32, cy = 32): V[] => pts.map(([u, v]) => [cx + (u - v) * 0.7071, cy - (u + v) * 0.7071]);
const P = (m: Mat, p: V[], o: Partial<Sh> = {}): Sh => ({ k: 'poly', m, p, ...o });
const C = (m: Mat, x: number, y: number, r: number, o: Partial<Sh> = {}): Sh => ({ k: 'circle', m, c: [x, y], r, ...o });
const E = (m: Mat, x: number, y: number, rx: number, ry: number, o: Partial<Sh> = {}): Sh => ({ k: 'ellipse', m, c: [x, y], rx, ry, ...o });
const R = (m: Mat, x: number, y: number, w: number, h: number, r = 2, o: Partial<Sh> = {}): Sh => ({ k: 'rect', m, x, y, w, h, r, ...o });
const D = (m: Mat, d: string, o: Partial<Sh> = {}): Sh => ({ k: 'path', m, d, ...o });
const L = (m: Mat, a: V, b: V, sw = 3, o: Partial<Sh> = {}): Sh => ({ k: 'line', m, p: [a, b], sw, ...o });
const star = (cx: number, cy: number, r1: number, r2: number, n = 4, rot = -Math.PI / 2): V[] => Array.from({ length: n * 2 }, (_, i) => { const a = rot + (i * Math.PI) / n, r = i % 2 ? r2 : r1; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as V; });
const gem = (cx: number, cy: number, w: number, h: number): V[] => [[cx, cy - h], [cx + w, cy - h * 0.3], [cx + w * 0.6, cy + h], [cx - w * 0.6, cy + h], [cx - w, cy - h * 0.3]];
const crystal = (cx: number, cy: number, w: number, h: number, lean = 0): V[] => [[cx + lean, cy - h], [cx + w, cy - h * 0.55], [cx + w * 0.8, cy + h], [cx - w * 0.8, cy + h], [cx - w, cy - h * 0.55]];

// ── glyph library ──────────────────────────────────────────
const sword = (bl: Mat = 'metal', guard: Mat = 'gold'): Sh[] => [
  P(bl, diag([[-6, -3.6], [22, -3.6], [28, 0], [22, 3.6], [-6, 3.6]])), L('dark', diag([[-4, 0], [21, 0]])[0]!, diag([[-4, 0], [21, 0]])[1]!, 1, { noLine: true }),
  P(guard, diag([[-9, -11], [-5, -11], [-5, 11], [-9, 11]])), P('leather', diag([[-22, -2.6], [-9, -2.6], [-9, 2.6], [-22, 2.6]])), C(guard, ...diag([[-24, 0]])[0]!, 4),
];
const GLYPH: Record<string, (c: string) => Sh[]> = {
  trash: () => [R('metal', 18, 20, 28, 34, 3), R('metal', 13, 13, 38, 6, 2), R('dark', 27, 8, 10, 6, 2), R('dark', 24, 25, 3, 24, 1), R('dark', 31, 25, 3, 24, 1), R('dark', 38, 25, 3, 24, 1)],
  // weapons
  sword: () => sword(), greatsword: () => [P('metal', diag([[-8, -5], [21, -5], [29, 0], [21, 5], [-8, 5]])), P('gold', diag([[-11, -13], [-6, -13], [-6, 13], [-11, 13]])), C('gem:#d03040', ...diag([[-8.5, 0]])[0]!, 3), P('leather', diag([[-24, -3], [-11, -3], [-11, 3], [-24, 3]])), C('gold', ...diag([[-26, 0]])[0]!, 4)],
  axe: () => [P('wood', diag([[-27, -2.5], [20, -2.5], [20, 2.5], [-27, 2.5]])), D('metal', 'M30 10 C46 6 56 16 54 30 C48 26 40 26 36 30 Z'), D('metal', 'M30 10 C22 18 22 26 26 32 L36 30 Z', { noGloss: true }), C('gold', 31, 31, 3)],
  staff: (c) => [P('wood', diag([[-28, -2.4], [14, -2.4], [14, 2.4], [-28, 2.4]])), D('gold', 'M40 22 C36 12 46 4 54 10 C48 8 42 12 44 20 Z'), C(`glow:${c}`, 47, 17, 7), ...star(47, 17, 10, 2, 4).length ? [P('white', star(47, 17, 11, 2.2, 4), { noLine: true })] : []],
  wand: (c) => [P('wood', diag([[-24, -2], [10, -2], [10, 2], [-24, 2]])), P(`gem:${c}`, crystal(44, 20, 7, 11, 2)), P('white', star(44, 14, 7, 1.6), { noLine: true })],
  daggers: () => [...[-7, 7].flatMap((o) => [P('metal', diag([[-2, o - 2.6], [18, o - 2.6], [24, o], [18, o + 2.6], [-2, o + 2.6]])), P('gold', diag([[-5, o - 7], [-2, o - 7], [-2, o + 7], [-5, o + 7]])), P('leather', diag([[-15, o - 2], [-5, o - 2], [-5, o + 2], [-15, o + 2]]))])],
  claw: () => [P('leather', [[14, 44], [30, 36], [36, 46], [22, 54]]), ...[0, 1, 2].map((i) => D('metal', `M${24 + i * 7} 40 C${28 + i * 7} 26 ${36 + i * 6} 14 ${46 + i * 4} 8 C${40 + i * 5} 18 ${34 + i * 6} 30 ${30 + i * 7} 42 Z`))],
  bow: () => [D('wood', 'M18 6 C44 12 54 34 50 58 L46 56 C48 36 40 18 16 10 Z'), L('white', [17, 8], [48, 57], 1.5), P('metal', [[22, 38], [46, 14], [50, 16], [26, 42]]), P('c:#d03030', [[18, 40], [24, 38], [26, 44], [20, 46]])],
  crossbow: () => [P('wood', [[14, 40], [42, 12], [48, 18], [20, 46]]), D('metal', 'M10 22 C24 18 40 30 42 46 L38 48 C36 34 24 26 12 26 Z'), L('white', [11, 24], [40, 47], 1.4), P('metal', [[24, 28], [44, 8], [48, 10], [28, 32]])],
  mace: (c) => [P('wood', diag([[-28, -2.6], [6, -2.6], [6, 2.6], [-28, 2.6]])), C('gold', 42, 22, 11), ...star(42, 22, 16, 9, 6).length ? [P('gold', star(42, 22, 16, 9, 6))] : [], C(`gem:${c}`, 42, 22, 5)],
  sword_shield: (c) => [...sword(), D(`c:${c}`, 'M6 22 L22 16 L38 22 C38 40 30 50 22 56 C14 50 6 40 6 22 Z'), D('gold', 'M22 22 L22 50 M12 30 L32 30', { noGloss: true, sw: 3 })],
  scythe: () => [P('dark', diag([[-28, -2.2], [24, -2.2], [24, 2.2], [-28, 2.2]])), D('metal', 'M46 10 C58 18 58 34 46 44 C50 32 46 22 34 18 Z'), C('bone', 46, 14, 4)],
  hourglass: (c) => [R('gold', 16, 6, 32, 6, 2), R('gold', 16, 52, 32, 6, 2), D('gem:#c8f8ff', 'M20 12 L44 12 C44 24 34 28 34 32 C34 36 44 40 44 52 L20 52 C20 40 30 36 30 32 C30 28 20 24 20 12 Z'), D(`c:${c}`, 'M24 46 L40 46 L36 40 C34 38 30 38 28 40 Z', { noLine: true }), P(`c:${c}`, [[30, 30], [34, 30], [33, 38], [31, 38]], { noLine: true })],
  chrono_staff: (c) => [P('gold', diag([[-28, -2.3], [12, -2.3], [12, 2.3], [-28, 2.3]])), C('gold', 44, 20, 12), C(`c:${c}`, 44, 20, 9), L('white', [44, 20], [44, 13], 2, { noLine: true }), L('white', [44, 20], [49, 23], 2, { noLine: true })],
  tome: (c) => [R(`c:${c}`, 12, 10, 38, 46, 4), R('paper', 16, 14, 32, 6, 1, { noGloss: true }), R('gold', 12, 10, 6, 46, 2), C('gold', 33, 34, 8), P(`gem:${c}`, star(33, 34, 7, 3, 4))],
  // armour
  helm: () => [D('metal', 'M12 38 C12 18 22 8 32 8 C42 8 52 18 52 38 L52 48 L40 48 L40 34 L24 34 L24 48 L12 48 Z'), P('gold', [[30, 6], [34, 6], [34, 32], [30, 32]]), R('dark', 24, 34, 16, 6, 1, { noGloss: true })],
  hood: (c) => [D(`c:${c}`, 'M10 54 C8 30 18 8 32 8 C46 8 56 30 54 54 L44 54 C44 40 40 28 32 28 C24 28 20 40 20 54 Z'), E('dark', 32, 40, 10, 12, { noGloss: true }), C('glow:#ffd36a', 28, 38, 1.6, { noLine: true }), C('glow:#ffd36a', 36, 38, 1.6, { noLine: true })],
  circlet: (c) => [D('gold', 'M8 38 C8 30 56 30 56 38 C56 44 8 44 8 38 Z M14 38 C14 42 50 42 50 38 C50 35 14 35 14 38 Z'), P('gold', [[26, 34], [32, 18], [38, 34]]), P(`gem:${c}`, gem(32, 30, 5, 6))],
  chest_plate: () => [D('metal', 'M14 12 L24 8 C28 12 36 12 40 8 L50 12 L54 26 L46 28 L46 56 L18 56 L18 28 L10 26 Z'), D('gold', 'M32 14 L32 52 M22 30 L42 30', { noGloss: true, sw: 2 }), C('gem:#5aa8ff', 32, 22, 3)],
  chest_leather: () => [D('leather', 'M14 12 L24 8 C28 13 36 13 40 8 L50 12 L54 26 L46 28 L46 56 L18 56 L18 28 L10 26 Z'), R('dark', 18, 38, 28, 5, 1), R('gold', 29, 37, 6, 7, 1)],
  robe: (c) => [D(`c:${c}`, 'M16 10 L26 6 C29 10 35 10 38 6 L48 10 L52 30 L56 58 L8 58 L12 30 Z'), D('gold', 'M32 10 L32 58', { noGloss: true, sw: 2 }), R('gold', 14, 32, 36, 4, 1), P('gem:#ffd36a', star(32, 22, 5, 2))],
  gauntlets: () => [D('metal', 'M18 58 L18 34 L12 26 L16 22 L22 28 L22 12 L28 12 L28 26 L30 8 L36 8 L36 26 L38 10 L44 10 L44 28 L48 18 L54 20 L48 40 L46 58 Z'), R('gold', 16, 46, 32, 5, 1)],
  wraps: (c) => [D(`c:${c}`, 'M18 58 L18 34 L12 26 L16 22 L22 28 L22 12 L28 12 L28 26 L30 8 L36 8 L36 26 L38 10 L44 10 L44 28 L48 18 L54 20 L48 40 L46 58 Z'), ...[30, 38, 46].map((y) => L('white', [18, y], [46, y - 4], 1.5, { noLine: true }))],
  greaves: () => [D('metal', 'M20 6 L40 6 L40 38 L54 46 L54 58 L20 58 Z'), R('gold', 18, 34, 24, 5, 1), C('gold', 30, 20, 3)],
  treads: (c) => [D(`c:${c}`, 'M20 6 L38 6 L38 38 L54 46 L54 58 L20 58 Z'), D('white', 'M24 12 L36 12 M24 20 L36 20 M24 28 L36 28', { noGloss: true, sw: 1.5 }), D('glow:#8fe8ff', 'M44 40 C50 34 58 36 60 30 C58 40 52 44 46 44 Z', { noLine: true })],
  ring: (c) => [D('gold', 'M32 24 C46 24 52 34 52 42 C52 52 44 58 32 58 C20 58 12 52 12 42 C12 34 18 24 32 24 Z M32 31 C24 31 19 36 19 42 C19 48 24 51 32 51 C40 51 45 48 45 42 C45 36 40 31 32 31 Z'), P(`gem:${c}`, gem(32, 18, 9, 10)), P('white', star(29, 14, 4, 1), { noLine: true })],
  amulet: (c) => [D('gold', 'M12 6 C14 26 50 26 52 6', { noGloss: true, sw: 2.4 }), C('gold', 32, 40, 15), C(`gem:${c}`, 32, 40, 10), P('white', star(28, 36, 5, 1.2), { noLine: true })],
  choker: (c) => [D('dark', 'M10 22 C14 36 50 36 54 22 L54 28 C50 42 14 42 10 28 Z'), P(`gem:${c}`, gem(32, 40, 7, 9)), C('gold', 32, 32, 3)],
  relic_star: (c) => [P(`gem:${c}`, star(32, 32, 26, 9, 4)), P('white', star(32, 32, 12, 3, 4, -Math.PI / 4), { noLine: true }), C('glow:#ffffff', 32, 32, 4, { noLine: true })],
  relic_bone: () => [D('bone', 'M18 12 C10 12 10 22 16 24 L40 48 C38 54 48 58 50 50 C58 50 54 40 48 40 L24 16 C26 10 18 6 18 12 Z'), C('gold', 32, 32, 4)],
  rune: (c) => [D('dark', 'M14 8 L50 8 L56 32 L50 56 L14 56 L8 32 Z'), D(`glow:${c}`, 'M24 18 L40 18 L28 32 L40 46 L24 46', { noGloss: true, sw: 4, noLine: true })],
  // materials & consumables
  flower: (c) => [...[0, 1, 2, 3, 4].map((i) => { const a = (i / 5) * Math.PI * 2 - Math.PI / 2; return E(`c:${c}`, 32 + Math.cos(a) * 12, 30 + Math.sin(a) * 12, 9, 6, {}); }), C('gold', 32, 30, 6), D('c:#4aa02a', 'M32 40 C30 48 26 54 20 58 L24 58 C30 54 34 48 34 40 Z')],
  ore: (c) => [D('dark', 'M8 46 L16 22 L30 12 L48 16 L58 34 L52 52 L22 56 Z'), P(`gem:${c}`, crystal(26, 30, 6, 10, -2)), P(`gem:${c}`, crystal(42, 34, 5, 8, 2)), P(`gem:${c}`, crystal(34, 44, 4, 6))],
  core: (c) => [C('dark', 32, 32, 22), C(`glow:${c}`, 32, 32, 13), ...[0, 1, 2, 3].map((i) => L(`glow:${c}`, [32 + Math.cos(i * 1.57 + 0.6) * 14, 32 + Math.sin(i * 1.57 + 0.6) * 14], [32 + Math.cos(i * 1.57 + 0.6) * 21, 32 + Math.sin(i * 1.57 + 0.6) * 21], 3, { noLine: true }))],
  meat: () => [D('meat', 'M14 40 C8 24 24 10 40 14 C54 18 56 36 44 46 C34 54 20 52 14 40 Z'), D('bone', 'M40 42 L52 54 C56 52 60 56 56 60 C54 62 50 60 50 58 L38 46 Z'), E('white', 28, 26, 6, 4, { noLine: true })],
  fish: (c) => [D(`c:${c}`, 'M8 32 C18 16 40 16 50 32 C40 48 18 48 8 32 Z'), D(`c:${c}`, 'M48 32 L60 20 L58 32 L60 44 Z'), C('white', 18, 29, 3), C('dark', 18, 29, 1.4, { noLine: true }), D('white', 'M28 24 C32 30 32 34 28 40', { noGloss: true, sw: 1.4 })],
  crystal: (c) => [P(`gem:${c}`, crystal(24, 36, 8, 18, -4)), P(`gem:${c}`, crystal(40, 32, 9, 22, 3)), P(`gem:${c}`, crystal(32, 46, 6, 10)), P('white', star(42, 16, 5, 1.2), { noLine: true })],
  map: () => [D('paper', 'M8 12 L24 8 L40 14 L56 10 L56 52 L40 56 L24 50 L8 54 Z'), D('c:#c83030', 'M30 26 L38 34 M38 26 L30 34', { noGloss: true, sw: 3 }), D('c:#8a5a34', 'M14 44 C20 36 22 40 28 32', { noGloss: true, sw: 1.6 })],
  potion: (c) => [R('wood', 26, 6, 12, 8, 2), D('gem:#e8f8ff', 'M24 14 L40 14 L40 22 C50 26 54 34 54 42 C54 52 44 58 32 58 C20 58 10 52 10 42 C10 34 14 26 24 22 Z'), D(`glow:${c}`, 'M12 40 C20 36 44 44 52 38 C52 50 44 56 32 56 C20 56 12 50 12 40 Z', { noLine: true }), E('white', 22, 32, 4, 6, { noLine: true })],
  skewer: () => [L('wood', [8, 56], [56, 8], 3), ...[0, 1, 2].map((i) => R('meat', 18 + i * 10, 34 - i * 10, 12, 10, 3))],
  plate: (c) => [E('white', 32, 42, 26, 12), E(`c:${c}`, 32, 34, 16, 10), C('c:#4aa02a', 26, 28, 4), C('c:#ff9a3a', 38, 30, 4)],
  coin: () => [C('gold', 32, 32, 22), C('gold', 32, 32, 16), P('c:#fff4c0', star(32, 32, 10, 4, 4), { noLine: true })],
  dust: (c) => [P(`gem:${c}`, crystal(32, 32, 14, 24)), P('white', star(36, 18, 6, 1.4), { noLine: true })],
  shard: (c) => [P(`gem:${c}`, [[32, 6], [46, 26], [40, 58], [24, 58], [18, 26]]), P('white', [[32, 10], [38, 26], [32, 50]], { noLine: true })],
  chestbox: () => [R('wood', 8, 26, 48, 30, 3), D('wood', 'M8 26 C8 12 56 12 56 26 Z'), R('gold', 8, 24, 48, 5, 1), R('gold', 28, 30, 8, 10, 2), C('dark', 32, 36, 1.6, { noLine: true })],
  key: () => [C('gold', 18, 24, 11), C('dark', 18, 24, 4, { noGloss: true }), P('gold', [[26, 30], [54, 50], [50, 56], [44, 52], [42, 56], [38, 52], [22, 36]])],
  scroll: () => [R('paper', 12, 14, 40, 36, 2), C('paper', 12, 32, 6), C('paper', 52, 32, 6), D('c:#8a5a34', 'M20 24 L44 24 M20 32 L44 32 M20 40 L38 40', { noGloss: true, sw: 1.6 }), C('c:#c83030', 40, 46, 5)],
  // menu & UI
  bag: () => [D('leather', 'M12 26 C12 18 20 14 32 14 C44 14 52 18 52 26 L54 54 L10 54 Z'), D('leather', 'M24 14 C24 6 40 6 40 14', { noGloss: true, sw: 3 }), R('gold', 26, 28, 12, 9, 2)],
  book: (c) => [R(`c:${c}`, 10, 10, 44, 44, 4), R('paper', 14, 14, 36, 6, 1), P('gold', star(32, 36, 10, 4))],
  tree: () => [C('gold', 32, 32, 7), ...[0, 1, 2, 3, 4, 5].flatMap((i) => { const a = (i / 6) * Math.PI * 2; return [L('gold', [32, 32], [32 + Math.cos(a) * 20, 32 + Math.sin(a) * 20], 2.4), C('gem:#9b6cff', 32 + Math.cos(a) * 21, 32 + Math.sin(a) * 21, 5)]; })],
  person: (c) => [C('c:#ffd8c0', 32, 20, 10), D(`c:${c}`, 'M12 56 C12 40 20 32 32 32 C44 32 52 40 52 56 Z')],
  people: (c) => [C('c:#ffd8c0', 22, 22, 8), D(`c:${c}`, 'M6 52 C6 40 12 32 22 32 C32 32 38 40 38 52 Z'), C('c:#ffd8c0', 42, 20, 9), D('c:#5a8ad8', 'M26 56 C26 42 32 32 42 32 C52 32 58 42 58 56 Z')],
  crest: (c) => [D(`c:${c}`, 'M32 6 L54 14 C54 36 46 50 32 58 C18 50 10 36 10 14 Z'), D('gold', 'M32 14 L46 20 C46 36 40 44 32 50 C24 44 18 36 18 20 Z', { noGloss: true, sw: 2 }), P('gold', star(32, 30, 9, 3.5))],
  trophy: () => [D('gold', 'M18 8 L46 8 L44 28 C42 36 36 40 32 40 C28 40 22 36 20 28 Z'), D('gold', 'M18 12 C8 12 8 26 20 26 M46 12 C56 12 56 26 44 26', { noGloss: true, sw: 3 }), R('gold', 28, 40, 8, 8, 1), R('wood', 18, 48, 28, 8, 2)],
  pass: (c) => [D(`c:${c}`, 'M10 10 L54 10 L54 54 L32 46 L10 54 Z'), P('gold', star(32, 28, 13, 5, 5)), R('gold', 10, 10, 44, 5, 1)],
  house: () => [D('c:#c83a3a', 'M6 30 L32 8 L58 30 Z'), R('c:#e8d0a0', 12, 30, 40, 26, 1), R('wood', 27, 40, 10, 16, 1), R('gem:#8fd0ff', 16, 36, 7, 7, 1), R('gem:#8fd0ff', 41, 36, 7, 7, 1)],
  mapicon: () => [D('paper', 'M8 12 L24 8 L40 14 L56 10 L56 52 L40 56 L24 50 L8 54 Z'), D('c:#d83030', 'M38 18 C46 18 48 26 44 32 L38 42 L32 32 C28 26 30 18 38 18 Z'), C('white', 38, 26, 3, { noLine: true })],
  gear: () => [P('metal', star(32, 32, 26, 19, 8, 0)), C('metal', 32, 32, 18), C('dark', 32, 32, 7, { noGloss: true })],
  anvil: () => [D('dark', 'M8 18 L52 18 C56 18 58 22 54 26 L42 28 L42 40 L50 50 L14 50 L22 40 L22 28 L8 26 Z'), P('metal', [[30, 4], [36, 4], [36, 14], [30, 14]]), L('wood', [33, 14], [50, 2], 3)],
  hammer: () => [P('wood', diag([[-28, -2.6], [10, -2.6], [10, 2.6], [-28, 2.6]])), R('metal', 30, 8, 26, 14, 3), R('gold', 40, 8, 6, 14, 1)],
  gavel: () => [P('wood', [[14, 52], [36, 30], [40, 34], [18, 56]]), R('wood', 30, 8, 26, 14, 4), R('gold', 30, 12, 4, 6, 1), R('gold', 52, 12, 4, 6, 1), R('wood', 8, 54, 30, 6, 2)],
  trade: () => [D('gold', 'M8 24 L40 24 L40 16 L56 28 L40 40 L40 32 L8 32 Z'), D('c:#5aa8ff', 'M56 40 L24 40 L24 32 L8 44 L24 56 L24 48 L56 48 Z')],
  calendar: (c) => [R('white', 8, 12, 48, 44, 4), R(`c:${c}`, 8, 12, 48, 12, 4), R('dark', 18, 6, 4, 12, 2), R('dark', 42, 6, 4, 12, 2), P('gold', star(32, 40, 10, 4, 5))],
  shop: () => [D('c:#c83a3a', 'M6 22 L14 8 L50 8 L58 22 Z'), R('c:#e8d0a0', 10, 22, 44, 34, 1), R('wood', 18, 34, 12, 22, 1), R('gem:#8fd0ff', 36, 30, 12, 12, 1), D('white', 'M6 22 C10 28 18 28 22 22 C26 28 34 28 38 22 C42 28 50 28 58 22', { noGloss: true, sw: 2 })],
  gift: (c) => [R(`c:${c}`, 8, 26, 48, 30, 2), R(`c:${c}`, 6, 18, 52, 10, 2), R('gold', 28, 18, 8, 38, 1), D('gold', 'M32 18 C24 4 12 10 20 18 Z M32 18 C40 4 52 10 44 18 Z')],
  events: (c) => [R('white', 10, 14, 44, 40, 4), R(`c:${c}`, 10, 14, 44, 10, 4), P('c:#ff4f6a', star(32, 40, 12, 5, 5))],
  crown: () => [D('gold', 'M8 48 L12 18 L24 32 L32 10 L40 32 L52 18 L56 48 Z'), R('gold', 8, 46, 48, 8, 2), C('gem:#ff4f6a', 32, 40, 4), C('gem:#5aa8ff', 18, 42, 3), C('gem:#5aa8ff', 46, 42, 3)],
  mount: () => [D('white', 'M10 44 C10 32 18 26 30 26 L40 26 L46 14 L54 16 L52 26 C56 30 56 36 52 38 L46 36 L44 44 L40 58 L34 58 L34 46 L22 46 L20 58 L14 58 Z'), D('c:#9b6cff', 'M40 26 C36 18 42 10 48 10 L46 14 Z'), C('dark', 50, 22, 1.4, { noLine: true }), P('gold', [[48, 14], [52, 4], [53, 15]])],
  costume: (c) => [D(`c:${c}`, 'M20 8 L26 6 C28 10 36 10 38 6 L44 8 L54 20 L46 26 L46 58 L18 58 L18 26 L10 20 Z'), D('gold', 'M32 10 L32 58', { noGloss: true, sw: 2 }), P('gold', star(32, 34, 6, 2.4))],
  emblem: (c) => [P('gold', star(32, 32, 26, 20, 8, 0)), C(`c:${c}`, 32, 32, 17), P('gold', star(32, 32, 12, 4, 4))],
  awaken: (c) => [P(`glow:${c}`, star(32, 32, 28, 8, 4)), P('gold', star(32, 32, 16, 6, 4, -Math.PI / 4)), C('white', 32, 32, 5, { noLine: true })],
  gacha: (c) => [C(`gem:${c}`, 32, 30, 22), D('gold', 'M10 34 C18 40 46 40 54 34 L54 38 C46 46 18 46 10 38 Z'), R('gold', 22, 50, 20, 8, 2), P('white', star(26, 22, 6, 1.6), { noLine: true })],
  mail: () => [R('white', 8, 14, 48, 36, 3), D('c:#c8c8d8', 'M8 16 L32 36 L56 16', { noGloss: true, sw: 2.4 })],
  chat: (c) => [D(`c:${c}`, 'M8 14 C8 10 12 8 16 8 L48 8 C52 8 56 10 56 14 L56 38 C56 42 52 44 48 44 L26 44 L14 56 L16 44 C12 44 8 42 8 38 Z'), C('white', 22, 26, 3, { noLine: true }), C('white', 32, 26, 3, { noLine: true }), C('white', 42, 26, 3, { noLine: true })],
  grid: (c) => [R(`c:${c}`, 8, 8, 21, 21, 3), R(`c:${c}`, 35, 8, 21, 21, 3), R(`c:${c}`, 8, 35, 21, 21, 3), R(`c:${c}`, 35, 35, 21, 21, 3)],
  dodge: (c) => [D(`glow:${c}`, 'M14 48 C20 26 36 14 54 12 C42 20 36 30 34 44 Z'), D('white', 'M8 36 L22 36 M6 44 L20 44 M10 52 L24 52', { noGloss: true, sw: 2.4, noLine: true })],
  crossed: () => [L('metal', [10, 52], [50, 12], 4.5), L('metal', [54, 52], [14, 12], 4.5), L('gold', [14, 42], [24, 52], 4), L('gold', [50, 42], [40, 52], 4), C('gold', 8, 56, 3.5), C('gold', 56, 56, 3.5)],
  rug: (c) => [E(`c:${c}`, 32, 36, 28, 16), E('gold', 32, 36, 20, 11, { noGloss: true }), E(`c:${c}`, 32, 36, 16, 8), P('gold', star(32, 36, 8, 3, 4), { noLine: true })],
  lantern: (c) => [R('dark', 22, 8, 20, 6, 2), D('gold', 'M24 14 L40 14 L44 48 L20 48 Z'), D(`glow:${c}`, 'M27 18 L37 18 L40 44 L24 44 Z', { noLine: true }), R('dark', 18, 48, 28, 8, 2), C('white', 32, 30, 3, { noLine: true })],
  plant: (c) => [D('c:#b85a3a', 'M18 40 L46 40 L42 58 L22 58 Z'), ...[0, 1, 2, 3, 4].map((i) => { const a = (i / 5) * Math.PI * 2 - Math.PI / 2; return E(`c:${c}`, 32 + Math.cos(a) * 9, 22 + Math.sin(a) * 9, 7, 5); }), C('gold', 32, 22, 4), L('c:#4aa02a', [32, 30], [32, 40], 2.4)],
  table: () => [R('wood', 6, 20, 52, 12, 3), R('wood', 10, 32, 6, 24, 2), R('wood', 48, 32, 6, 24, 2), R('c:#c8905a', 8, 20, 48, 4, 2, { noLine: true })],
  bed: (c) => [R('wood', 6, 14, 52, 42, 4), R(`c:${c}`, 10, 28, 44, 26, 3), R('white', 12, 18, 18, 10, 4), R('white', 34, 18, 18, 10, 4), R(`c:${c}`, 10, 34, 44, 4, 1, { noGloss: true })],
  bookshelf: () => [R('wood', 8, 6, 48, 52, 3), ...[14, 30, 46].flatMap((y) => [R('dark', 12, y - 4, 40, 12, 1, { noGloss: true }), ...[0, 1, 2, 3, 4].map((i) => R(['c:#c83a3a', 'c:#3a5ab0', 'c:#5bd16a', 'c:#e8c062', 'c:#9b6cff'][(i + y) % 5] as `c:${string}`, 14 + i * 7, y - 3, 6, 11, 1))])],
  throne: (c) => [P(`gem:${c}`, crystal(32, 34, 12, 22)), P(`gem:${c}`, crystal(18, 40, 6, 12, -3)), P(`gem:${c}`, crystal(46, 40, 6, 12, 3)), R('dark', 10, 50, 44, 8, 2)],
  skull: () => [D('bone', 'M32 8 C46 8 54 18 54 30 C54 38 50 42 46 44 L46 54 L18 54 L18 44 C14 42 10 38 10 30 C10 18 18 8 32 8 Z'), E('dark', 23, 32, 6, 7, { noGloss: true }), E('dark', 41, 32, 6, 7, { noGloss: true }), P('dark', [[32, 38], [35, 45], [29, 45]], { noGloss: true })],
  sigil: (c) => [C(`c:${c}`, 32, 32, 26), C('dark', 32, 32, 20, { noGloss: true }), P(`glow:${c}`, star(32, 32, 16, 6.5, 6)), C('dark', 32, 32, 4, { noGloss: true })],
};

// ── skill glyphs: each skill's icon draws what the skill does ──
const SKILL_GLYPH: Record<string, (c: string) => Sh[]> = {
  arc: (c) => [D(`glow:${c}`, 'M8 50 C10 24 30 8 56 8 C34 16 22 30 20 54 Z'), ...sword('metal').map((s) => s)],
  slash: (c) => [D(`glow:${c}`, 'M6 56 L46 6 L56 8 L14 58 Z'), D('white', 'M14 56 L54 8', { noGloss: true, sw: 2, noLine: true }), D(`glow:${c}`, 'M24 58 L58 18 L58 26 L30 58 Z', { noLine: true })],
  leap: (c) => [D(`glow:${c}`, 'M6 54 C14 20 36 8 52 16 L46 24 C36 18 22 26 14 56 Z'), P('dark', [[30, 52], [48, 34], [56, 54]]), D('c:#b8a27e', 'M14 58 L58 58 L52 52 L22 52 Z')],
  shout: (c) => [C('c:#ffd8c0', 22, 32, 12), D('dark', 'M28 30 L34 26 L34 38 L28 34 Z', { noGloss: true }), ...[0, 1, 2].map((i) => D(`glow:${c}`, `M${40 + i * 7} ${18 - i * 4} C${48 + i * 8} ${26} ${48 + i * 8} ${38} ${40 + i * 7} ${46 + i * 4}`, { noGloss: true, sw: 3, noLine: true }))],
  spin: (c) => [...[0, 1, 2].map((i) => { const a = (i / 3) * Math.PI * 2; return D(`glow:${c}`, `M32 32 C${32 + Math.cos(a) * 26} ${32 + Math.sin(a) * 26} ${32 + Math.cos(a + 1.4) * 30} ${32 + Math.sin(a + 1.4) * 30} ${32 + Math.cos(a + 1.9) * 24} ${32 + Math.sin(a + 1.9) * 24} Z`); }), C('metal', 32, 32, 6)],
  dash: (c) => [D(`glow:${c}`, 'M20 20 L44 32 L20 44 L28 32 Z'), D('white', 'M6 24 L20 24 M4 32 L22 32 M6 40 L20 40', { noGloss: true, sw: 2.4, noLine: true }), D(`c:${c}`, 'M40 18 L58 32 L40 46 L46 32 Z')],
  shield: (c) => [D(`c:${c}`, 'M32 6 L54 14 C54 36 46 50 32 58 C18 50 10 36 10 14 Z'), D('gold', 'M32 12 L32 52 M18 26 L46 26', { noGloss: true, sw: 3 }), C('gem:#ffffff', 32, 26, 4)],
  slam: (c) => [P('metal', [[24, 6], [40, 6], [40, 20], [24, 20]]), P('wood', [[30, 20], [34, 20], [34, 36], [30, 36]]), D(`glow:${c}`, 'M6 50 L18 40 L24 46 L32 36 L40 46 L46 40 L58 50 L46 56 L18 56 Z'), D('dark', 'M20 58 L28 48 L34 54 L40 46', { noGloss: true, sw: 1.6 })],
  crown: () => GLYPH.crown!(''),
  axe: (c) => GLYPH.axe!(c),
  banner: (c) => [L('wood', [16, 6], [16, 58], 3), D(`c:${c}`, 'M18 8 L54 8 L46 20 L54 32 L18 32 Z'), P('gold', star(32, 20, 6, 2.4))],
  fire: () => [D('c:#c02a1a', 'M32 4 C38 16 54 22 52 40 C50 52 42 58 32 58 C22 58 12 52 12 40 C12 30 18 26 22 18 C24 26 28 28 30 28 C28 18 30 10 32 4 Z'), D('c:#ff9230', 'M32 22 C36 30 44 34 42 44 C40 52 36 54 32 54 C26 54 22 50 22 44 C22 38 26 36 28 32 C30 36 32 36 32 36 Z', { noLine: true }), D('c:#fff6c8', 'M32 38 C34 42 38 44 36 50 C34 52 30 52 29 49 C28 46 30 44 32 38 Z', { noLine: true })],
  ice: () => [P('gem:#6ccdf2', crystal(32, 32, 10, 26)), P('gem:#b0eeff', crystal(18, 40, 6, 14, -3)), P('gem:#b0eeff', crystal(46, 40, 6, 14, 3)), P('white', star(34, 14, 6, 1.4), { noLine: true })],
  bolt: (c) => [P(`glow:${c}`, [[36, 4], [14, 36], [28, 36], [22, 60], [50, 24], [34, 24], [44, 4]]), P('white', [[36, 10], [22, 32], [32, 32]], { noLine: true })],
  blink: (c) => [C(`glow:${c}`, 32, 32, 10), ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => { const a = (i / 8) * Math.PI * 2; return L(`glow:${c}`, [32 + Math.cos(a) * 14, 32 + Math.sin(a) * 14], [32 + Math.cos(a) * (i % 2 ? 20 : 26), 32 + Math.sin(a) * (i % 2 ? 20 : 26)], 2.4, { noLine: true }); }), C('white', 32, 32, 4, { noLine: true })],
  spear: (c) => [P(`c:${c}`, diag([[-26, -2.6], [16, -2.6], [16, 2.6], [-26, 2.6]])), P('bone', diag([[14, -6], [28, 0], [14, 6]])), D(`glow:${c}`, 'M6 58 L12 50 L16 54 Z', { noLine: true })],
  orb: (c) => [C(`gem:${c}`, 32, 32, 20), ...[0, 1, 2].map((i) => { const a = (i / 3) * Math.PI * 2; return C('white', 32 + Math.cos(a) * 24, 32 + Math.sin(a) * 24, 3, { noLine: true }); }), P('white', star(26, 26, 7, 1.6), { noLine: true })],
  meteor: () => [D('c:#ff9230', 'M4 4 L40 30 L30 40 Z', { noLine: true }), D('c:#ffe98a', 'M14 10 L38 32 L32 38 Z', { noLine: true }), C('c:#5a4030', 42, 42, 14), D('c:#ff5a1c', 'M30 36 C34 30 42 28 50 32', { noGloss: true, sw: 2.4, noLine: true }), C('glow:#ffc845', 38, 38, 4, { noLine: true })],
  star: (c) => [P(`glow:${c}`, star(32, 32, 26, 9, 4)), P('gold', star(32, 32, 14, 5, 4, -Math.PI / 4)), C('white', 32, 32, 4, { noLine: true })],
  knives: () => [...[-10, 0, 10].map((o) => P('metal', [[32 + o - 3, 54], [32 + o * 1.6, 8], [32 + o + 3, 54]])), R('leather', 16, 50, 32, 6, 2)],
  poison: () => [D('c:#4aa02a', 'M32 4 C40 18 52 28 52 40 C52 52 42 58 32 58 C22 58 12 52 12 40 C12 28 24 18 32 4 Z'), C('c:#b8f070', 26, 36, 4), C('c:#b8f070', 38, 44, 3), C('c:#b8f070', 34, 28, 2.4)],
  smoke: () => [C('c:#7a7072', 22, 38, 12), C('c:#9a9094', 38, 32, 14), C('c:#5c5660', 44, 44, 10), C('c:#b8b0b4', 28, 24, 9)],
  mark: (c) => [C(`c:${c}`, 32, 32, 24), C('dark', 32, 32, 18, { noGloss: true }), C(`c:${c}`, 32, 32, 11), C('dark', 32, 32, 5, { noGloss: true }), D('white', 'M32 2 L32 14 M32 50 L32 62 M2 32 L14 32 M50 32 L62 32', { noGloss: true, sw: 2.4 })],
  moon: (c) => [D(`glow:${c}`, 'M42 6 C26 8 14 20 14 34 C14 48 26 58 40 58 C48 58 54 54 58 48 C42 50 30 40 30 26 C30 16 36 10 42 6 Z'), P('white', star(46, 22, 5, 1.2), { noLine: true })],
  clone: (c) => [C('dark', 22, 20, 8), D('dark', 'M8 54 C8 40 14 30 22 30 C30 30 36 40 36 54 Z'), C(`c:${c}`, 42, 22, 9), D(`c:${c}`, 'M26 58 C26 42 34 32 42 32 C50 32 58 42 58 58 Z')],
  dagger: () => [P('metal', diag([[-4, -4], [20, -4], [28, 0], [20, 4], [-4, 4]])), P('gold', diag([[-8, -10], [-4, -10], [-4, 10], [-8, 10]])), P('leather', diag([[-22, -3], [-8, -3], [-8, 3], [-22, 3]])), D('c:#c42030', 'M42 26 C44 30 44 34 42 36 C40 34 40 30 42 26 Z', { noLine: true })],
  arrows: () => [...[-10, 0, 10].flatMap((o) => [L('wood', [10 + o, 54], [46 + o, 18], 2.4), P('metal', [[46 + o, 10], [54 + o, 12], [50 + o, 20]]), P('c:#d03030', [[10 + o, 50], [14 + o, 58], [6 + o, 56]])])],
  trap: () => [D('metal', 'M6 44 L14 22 L20 40 L26 18 L32 40 L38 18 L44 40 L50 22 L58 44 Z'), R('dark', 6, 44, 52, 10, 2), C('gold', 32, 49, 3)],
  rain: () => [...[0, 1, 2, 3].map((i) => L('metal', [12 + i * 12, 6 + (i % 2) * 6], [6 + i * 12, 34 + (i % 2) * 6], 2.4)), D('c:#b8a27e', 'M4 56 C14 46 24 46 32 52 C40 46 50 46 60 56 Z')],
  bird: (c) => [D(`c:${c}`, 'M4 30 C16 18 26 22 32 30 C38 22 48 18 60 30 C48 28 40 32 34 40 L30 40 C24 32 16 28 4 30 Z'), C(`c:${c}`, 32, 32, 6), P('gold', [[32, 36], [36, 40], [32, 42]])],
  eye: (c) => [D('white', 'M4 32 C14 16 50 16 60 32 C50 48 14 48 4 32 Z'), C(`c:${c}`, 32, 32, 11), C('dark', 32, 32, 5, { noGloss: true }), C('white', 28, 28, 2.4, { noLine: true })],
  hammer: (c) => [P('wood', diag([[-28, -2.6], [8, -2.6], [8, 2.6], [-28, 2.6]])), R('gold', 28, 6, 28, 16, 3), C(`glow:${c}`, 42, 14, 4, { noLine: true }), D(`glow:${c}`, 'M44 24 L50 34 M52 20 L60 26', { noGloss: true, sw: 2.4, noLine: true })],
  heal: (c) => [C(`glow:${c}`, 32, 32, 24), P('white', [[26, 10], [38, 10], [38, 26], [54, 26], [54, 38], [38, 38], [38, 54], [26, 54], [26, 38], [10, 38], [10, 26], [26, 26]])],
  sun: () => [P('gold', star(32, 32, 28, 16, 12, 0)), C('glow:#ffe070', 32, 32, 14), C('white', 32, 32, 6, { noLine: true })],
  pillar: (c) => [R(`glow:${c}`, 22, 4, 20, 56, 4), R('white', 28, 4, 8, 56, 2, { noLine: true }), E('gold', 32, 56, 22, 6)],
  skull: () => GLYPH.skull!(''),
  curse: (c) => GLYPH.sigil!(c),
  soul: (c) => [D(`glow:${c}`, 'M32 6 C44 18 50 28 50 38 C50 50 42 58 32 58 C22 58 14 50 14 38 C14 28 20 18 32 6 Z'), E('dark', 26, 38, 3, 4, { noGloss: true }), E('dark', 38, 38, 3, 4, { noGloss: true })],
  drain: (c) => [C('c:#c42030', 14, 32, 9), C(`glow:${c}`, 50, 32, 9), D('c:#ec4a50', 'M22 28 C30 20 38 20 42 26 M22 36 C30 44 38 44 42 38', { noGloss: true, sw: 3 }), P('c:#ec4a50', [[40, 22], [46, 28], [38, 30]])],
  ghost: (c) => [D(`c:${c}`, 'M14 58 L14 28 C14 14 22 6 32 6 C42 6 50 14 50 28 L50 58 L44 52 L38 58 L32 52 L26 58 L20 52 Z'), E('dark', 26, 28, 4, 6, { noGloss: true }), E('dark', 38, 28, 4, 6, { noGloss: true })],
};
/** Small corner motif telling what kind of skill it is, so skills sharing a glyph stay distinct. */
function motif(sk: SkillDef, c: string): Sh[] {
  const e = sk.effects[0];
  if (sk.kind === 'ultimate') return [P('gold', star(52, 12, 9, 3.5, 4)), C('white', 52, 12, 2, { noLine: true })];
  switch (e?.t) {
    case 'projectile': return (e.count ?? 1) > 1 ? [0, 1, 2].map((i) => C(`glow:${c}`, 46 + i * 6, 10 + i * 2, 2.4, { noLine: true })) : [C(`glow:${c}`, 54, 10, 4, { noLine: true })];
    case 'area': return e.duration ? [E(`glow:${c}`, 50, 54, 10, 4, { noLine: true })] : e.delay ? [D(`glow:${c}`, 'M46 4 L54 4 L50 14 Z', { noLine: true })] : [];
    case 'buff': return [P('gold', [[50, 4], [58, 14], [53, 14], [53, 20], [47, 20], [47, 14], [42, 14]])];
    case 'summon': return [P(`glow:${c}`, star(52, 52, 8, 3, 5))];
    case 'dash': return [D('white', 'M42 8 L58 8 M46 14 L60 14', { noGloss: true, sw: 2, noLine: true })];
    default: return [];
  }
}

// ── SVG rendering ──────────────────────────────────────────
function shapeSvg(s: Sh, fill: string, outline: boolean): string {
  const st = outline ? ` stroke="#170c24" stroke-width="${s.k === 'line' ? (s.sw ?? 3) + 2.4 : 2.4}" stroke-linejoin="round" stroke-linecap="round"` : '';
  const f = s.k === 'line' ? ` fill="none"` : ` fill="${fill}"`;
  switch (s.k) {
    case 'poly': return `<polygon points="${s.p!.map((q) => q.map((v) => v.toFixed(1)).join(',')).join(' ')}"${f}${st}/>`;
    case 'circle': return `<circle cx="${s.c![0]}" cy="${s.c![1]}" r="${s.r}"${f}${st}/>`;
    case 'ellipse': return `<ellipse cx="${s.c![0]}" cy="${s.c![1]}" rx="${s.rx}" ry="${s.ry}"${f}${st}/>`;
    case 'rect': return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${s.r}"${f}${st}/>`;
    case 'line': return outline ? `<line x1="${s.p![0]![0]}" y1="${s.p![0]![1]}" x2="${s.p![1]![0]}" y2="${s.p![1]![1]}"${st}/>` : `<line x1="${s.p![0]![0]}" y1="${s.p![0]![1]}" x2="${s.p![1]![0]}" y2="${s.p![1]![1]}" stroke="${fill}" stroke-width="${s.sw ?? 3}" stroke-linecap="round"/>`;
    case 'path': { const open = s.sw !== undefined; return open ? (outline ? `<path d="${s.d}" fill="none"${st.replace(/stroke-width="[\d.]+"/, `stroke-width="${(s.sw ?? 0) + 2.4}"`)}/>` : `<path d="${s.d}" fill="none" stroke="${fill}" stroke-width="${s.sw}" stroke-linecap="round" stroke-linejoin="round"/>`) : `<path d="${s.d}"${f}${st}/>`; }
  }
}
function glyphSvg(shapes: Sh[], prefix: string): { defs: string; body: string } {
  const grads = new Map<string, string>();
  let defs = '';
  const gid = (m: Mat) => {
    let id = grads.get(m);
    if (!id) { id = `${prefix}g${grads.size}`; grads.set(m, id); const [a, b, c] = stops(m); defs += `<linearGradient id="${id}" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".45" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>`; }
    return id;
  };
  defs += `<linearGradient id="${prefix}gl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>`;
  let body = '';
  for (const s of shapes) {
    const fill = `url(#${gid(s.m)})`;
    const solid = stops(s.m)[1];
    if (!s.noLine) body += shapeSvg(s, fill, true);
    body += shapeSvg(s, s.k === 'line' || (s.k === 'path' && s.sw !== undefined) ? solid : fill, false);
    if (!s.noGloss && s.k !== 'line' && !(s.k === 'path' && s.sw !== undefined)) body += shapeSvg(s, `url(#${prefix}gl)`, false);
  }
  return { defs, body };
}
const RARITY_FRAME: Record<string, [string, string]> = { common: ['#8a8aa0', '#2a2a38'], uncommon: ['#5bd16a', '#123a1c'], rare: ['#4f9dff', '#0f2450'], epic: ['#b36cff', '#2a1050'], legendary: ['#ffb02e', '#4a2a06'], ancient: ['#ff4f5a', '#4a0a14'], none: ['#c9a24a', '#1c1430'], skill: ['#c9a24a', '#1c1430'], ult: ['#ffd36a', '#3a2008'] };
function tileSvg(shapes: Sh[], frame: string, tint: string | null, key: string): string {
  const pre = key.replace(/[^a-z0-9]/gi, '').slice(0, 10);
  const { defs, body } = glyphSvg(shapes, pre);
  const [fc, bg] = RARITY_FRAME[frame] ?? RARITY_FRAME.none!;
  const inner = tint ? darken(tint, 0.72) : bg;
  const gold = frame === 'legendary' || frame === 'ancient' || frame === 'ult';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs>${defs}<radialGradient id="${pre}bg" cx=".5" cy=".38" r=".75"><stop offset="0" stop-color="${lighten(inner, 0.22)}"/><stop offset="1" stop-color="${darken(inner, 0.45)}"/></radialGradient><linearGradient id="${pre}fr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${lighten(fc, 0.45)}"/><stop offset=".5" stop-color="${fc}"/><stop offset="1" stop-color="${darken(fc, 0.45)}"/></linearGradient><filter id="${pre}sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.2" flood-color="#000" flood-opacity=".6"/></filter></defs>`
    + `<rect x="1" y="1" width="62" height="62" rx="9" fill="#0b0712"/><rect x="2.5" y="2.5" width="59" height="59" rx="8" fill="url(#${pre}bg)" stroke="url(#${pre}fr)" stroke-width="3"/>`
    + `<g transform="translate(6 6) scale(.8125)" filter="url(#${pre}sh)">${body}</g>`
    + `<path d="M8 6 H56 C58 6 58 8 58 10 C40 16 24 16 6 22 V10 C6 8 6 6 8 6 Z" fill="#fff" opacity=".09"/>`
    + (gold ? `<circle cx="6" cy="6" r="2.6" fill="#ffe08a" stroke="#4a2a06"/><circle cx="58" cy="6" r="2.6" fill="#ffe08a" stroke="#4a2a06"/><circle cx="6" cy="58" r="2.6" fill="#ffe08a" stroke="#4a2a06"/><circle cx="58" cy="58" r="2.6" fill="#ffe08a" stroke="#4a2a06"/>` : '')
    + `</svg>`;
}
function bareSvg(shapes: Sh[], key: string): string {
  const pre = key.replace(/[^a-z0-9]/gi, '').slice(0, 10);
  const { defs, body } = glyphSvg(shapes, pre);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs>${defs}<filter id="${pre}sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="1.6" flood-color="#000" flood-opacity=".7"/></filter></defs><g filter="url(#${pre}sh)">${body}</g></svg>`;
}
const urlCache = new Map<string, string>();
function img(key: string, make: () => string, size: number, cls = 'ico'): HTMLImageElement {
  let u = urlCache.get(key);
  if (!u) { u = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(make()); urlCache.set(key, u); }
  const el = document.createElement('img');
  el.src = u; el.width = size; el.height = size; el.className = cls; el.alt = ''; el.draggable = false;
  return el;
}

// ── public API ─────────────────────────────────────────────
const ITEM_GLYPH: Record<string, [string, string]> = {
  w_greatsword: ['greatsword', '#c83030'], w_axe: ['axe', '#c83030'], w_staff: ['staff', '#7fd3ff'], w_wand: ['wand', '#c890ee'], w_daggers: ['daggers', '#ff5fa2'], w_claw: ['claw', '#ff5fa2'],
  w_bow: ['bow', '#5bd16a'], w_crossbow: ['crossbow', '#5bd16a'], w_mace: ['mace', '#ffd85a'], w_sword_shield: ['sword_shield', '#3a5ab0'], w_scythe: ['scythe', '#7be0b5'], w_hourglass: ['hourglass', '#5fe0d0'],
  w_chrono_staff: ['chrono_staff', '#1f8a80'], w_tome: ['tome', '#3b2b4a'], a_helm_plate: ['helm', ''], a_hood: ['hood', '#2f4a3a'], a_circlet: ['circlet', '#9b6cff'], a_chest_plate: ['chest_plate', ''],
  a_chest_leather: ['chest_leather', ''], a_robe: ['robe', '#3a2a7a'], a_gauntlets: ['gauntlets', ''], a_wraps: ['wraps', '#c8b0e8'], a_greaves: ['greaves', ''], a_treads: ['treads', '#3a6a8a'],
  j_ring_gold: ['ring', '#ffd36a'], j_ring_moon: ['ring', '#b8d8ff'], j_ring_ember: ['ring', '#ff6a3a'], j_amulet: ['amulet', '#9b6cff'], j_choker: ['choker', '#c42030'],
  r_relic_star: ['relic_star', '#ffe070'], r_relic_bone: ['relic_bone', ''], r_rune_fire: ['rune', '#ff8a2a'], r_rune_frost: ['rune', '#6ccdf2'], r_rune_venom: ['rune', '#7ed23c'],
};
const MAT_GLYPH: Record<string, [string, string, string]> = { // glyph, colour, rarity frame
  moonpetal: ['flower', '#b8c8ff', 'common'], emberbloom: ['flower', '#ff7a3a', 'uncommon'], iron_ore: ['ore', '#c8d0e0', 'common'], starsteel: ['ore', '#8fb8ff', 'rare'], cinder_core: ['core', '#ff6a2a', 'rare'],
  beast_meat: ['meat', '', 'common'], fish: ['fish', '#8ab0d8', 'common'], starglass: ['crystal', '#a8e0ff', 'epic'], starbloom: ['flower', '#fff0a0', 'epic'], treasure_map: ['map', '', 'rare'],
  golden_carp: ['fish', '#ffc845', 'legendary'], ember_eel: ['fish', '#ff5a2a', 'rare'], elixir_fury: ['potion', '#ff4a3a', 'rare'], elixir_stone: ['potion', '#c8a878', 'rare'], elixir_swift: ['potion', '#5fe0d0', 'rare'],
  ember_skewers: ['skewer', '', 'uncommon'], star_tonic: ['potion', '#fff0a0', 'epic'], grilled_trout: ['plate', '#c8a070', 'uncommon'], golden_feast: ['plate', '#ffc845', 'legendary'], eel_skewer: ['skewer', '', 'rare'],
};
const ELEM_COL: Record<string, string> = { physical: '#c8bca8', fire: '#ff7a2e', ice: '#6ccdf2', lightning: '#a896ff', holy: '#ffd84a', shadow: '#a86ae0', poison: '#7ed23c' };

/** Icon for an equipment item (frame = rarity). */
export function itemIcon(it: Pick<Item, 'baseId' | 'rarity'> | string, size = 48): HTMLImageElement {
  const baseId = typeof it === 'string' ? it : it.baseId, rarity = typeof it === 'string' ? 'none' : it.rarity;
  const [g, c] = ITEM_GLYPH[baseId] ?? [ITEM_BASE_MAP[baseId]?.icon ?? 'relic_star', '#9b6cff'];
  return img(`i|${baseId}|${rarity}`, () => tileSvg((GLYPH[g] ?? GLYPH.relic_star!)(c || '#9b6cff'), rarity, null, `i${baseId}${rarity}`), size);
}
/** Icon for a material / consumable. */
export function matIcon(id: string, size = 48): HTMLImageElement {
  const [g, c, r] = MAT_GLYPH[id] ?? ['crystal', '#9b6cff', 'common'];
  return img(`m|${id}`, () => tileSvg(GLYPH[g]!(c), r, null, `m${id}`), size);
}
export function skillElement(sk: SkillDef): string {
  for (const f of sk.effects) { const d = (f as { dmg?: { type: string } }).dmg; if (d?.type) return d.type; }
  return ['fire', 'ice', 'lightning', 'holy', 'shadow', 'poison'].find((t) => sk.tags.includes(t)) ?? 'physical';
}
/** Icon for a skill: its glyph in its element colour, an element-tinted tile, gold frame for ultimates, plus a motif. */
export function skillIcon(sk: SkillDef | string, size = 48): HTMLImageElement {
  const s = typeof sk === 'string' ? SKILL_MAP[sk]! : sk;
  const el = skillElement(s), c = s.tags.includes('heal') ? '#5bd16a' : el === 'physical' ? CLASSES[s.cls].colors.accent : ELEM_COL[el] ?? '#c8bca8';
  const g = SKILL_GLYPH[s.icon] ?? GLYPH[s.icon] ?? SKILL_GLYPH.star!;
  return img(`s|${s.id}`, () => tileSvg([...g(c), ...motif(s, c)], s.kind === 'ultimate' ? 'ult' : 'skill', c, `s${s.id}`), size);
}
/** Menu / UI icon without a tile (top bar, bottom-right buttons, hotbar utilities). */
export function uiIcon(name: string, size = 40, color = '#9b6cff'): HTMLImageElement {
  const g = GLYPH[name] ?? SKILL_GLYPH[name] ?? GLYPH.sigil!;
  return img(`u|${name}|${color}`, () => bareSvg(g(color), `u${name}`), size, 'ico ui');
}
/** Tiled icon for an arbitrary glyph (blessings, relics, rewards). */
export function tileIcon(name: string, color: string, frame = 'none', size = 48): HTMLImageElement {
  const g = GLYPH[name] ?? SKILL_GLYPH[name] ?? GLYPH.sigil!;
  return img(`t|${name}|${color}|${frame}`, () => tileSvg(g(color), frame, color, `t${name}`), size);
}
export const currencyIcon = (k: 'gold' | 'dust' | 'shard', size = 22) => uiIcon(k === 'gold' ? 'coin' : k === 'dust' ? 'dust' : 'shard', size, k === 'dust' ? '#6aa8ff' : '#b36cff');
/** Every glyph name (used by the icon gallery test). */
export const ALL_GLYPHS = () => [...Object.keys(GLYPH), ...Object.keys(SKILL_GLYPH)];
