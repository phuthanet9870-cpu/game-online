/**
 * Procedural pixel-art sprite generation. No external assets: every sprite
 * is painted from small templates at load time and cached.
 */
import { APPEARANCE, type Appearance } from '../../shared/config/appearance.ts';
import type { MonsterDef } from '../../shared/config/monsters.ts';
import type { ItemIcon } from '../../shared/config/items.ts';
import { T } from '../../shared/mapgen.ts';
import { makeCanvas, outlined, paint, pnoise, shade, hexToRgb } from './pixel.ts';
import { TW, TH } from './iso.ts';

const cache = new Map<string, HTMLCanvasElement>();
function cached(key: string, make: () => HTMLCanvasElement): HTMLCanvasElement {
  let c = cache.get(key);
  if (!c) { c = make(); cache.set(key, c); }
  return c;
}

// ---------------------------------------------------------------- characters
const HEAD_FRONT = [
  '....SSSS....',
  '...SSSSSS...',
  '..SSSSSSSS..',
  '..SSSSSSSS..',
  '..SSSSSSSS..',
  '..SSSSSSSS..',
  '...SSSSSS...',
];
const EYES = ['..SESSSSES..', '..SEESSEES..', '..SWESSEWS..', '..SESSSSES..'];
const BROWS = [null, null, null, '..SDDSSDDS..'];

const HAIR_FRONT: string[][] = [
  ['....HHHH....', '...HHHHHH...', '..HHHHHHHH..', '..H......H..'],
  ['..H.HH.H.H..', '..HHHHHHHH..', '..HHHHHHHH..', '..H......H..'],
  ['....HHHH....', '...HHHHHH...', '..HHHHHHHH..', '.HHH....HHH.', '.HH......HH.', '.HH......HH.', '.HH......HH.', '.HH........H', '.H..........'],
  ['....HHHH....', '...HHHHHH...', '..HHHHHHHHH.', '..H......HHH', '..........HH', '..........HH', '...........H'],
  ['....HHHH....', '..HHHHHHHH..', '.HHHHHHHHHH.', '.HH......HH.', '.HH......HH.', '.HH......HH.'],
  ['.....HH.....', '....HHHH....', '....HHHH....', '............'],
];

const BODY = [
  '...AOOOOA...',
  '..AOOTTOOA..',
  '.AAOOTTOOAA.',
  '.AAOOOOOOAA.',
  '.SS.OOOO.SS.',
  '...TTTTTT...',
  '...PPPPPP...',
];
const LEGS = [
  ['...PP..PP...', '...PP..PP...', '...BB..BB...'],
  ['...PP...PP..', '...PP...PP..', '...BB...BB..'],
  ['..PP...PP...', '..PP...PP...', '..BB...BB...'],
];

export interface CharPalette { skin: string; hair: string; main: string; trim: string; pants: string; female: boolean; face: number; hairStyle: number }

export function paletteFor(app: Appearance): CharPalette {
  const o = APPEARANCE.outfits[app.outfit] ?? APPEARANCE.outfits[0];
  return { skin: APPEARANCE.skin[app.skin] ?? '#eac096', hair: APPEARANCE.hairColor[app.hairColor] ?? '#2b1d14', main: o.main, trim: o.trim, pants: o.pants, female: app.gender === 'female', face: app.face, hairStyle: app.hairStyle };
}

/** frame: 0 idle, 1/2 walk. back: facing away from camera. */
export function characterSprite(p: CharPalette, frame: number, back: boolean, flip: boolean): HTMLCanvasElement {
  const key = `ch|${JSON.stringify(p)}|${frame}|${back}|${flip}`;
  return cached(key, () => {
    const [c, ctx] = makeCanvas(12, 18);
    const pal: Record<string, string> = {
      S: p.skin, H: p.hair, D: shade(p.hair, -0.35), E: '#1b1430', W: '#ffffff', M: p.female ? '#d86a7a' : shade(p.skin, -0.25),
      O: p.main, A: shade(p.main, -0.22), T: p.trim, P: p.pants, B: '#3a2a1e',
    };
    const bob = frame === 0 ? 0 : 0;
    // head
    if (back) {
      paint(ctx, HEAD_FRONT.map((r) => r.replace(/S/g, 'H')), pal, 0, bob);
      paint(ctx, ['............', '............', '............', '............', '............', '............', '...SSSSSS...'], pal, 0, bob);
    } else {
      paint(ctx, HEAD_FRONT, pal, 0, bob);
      paint(ctx, [EYES[p.face] ?? EYES[0]], pal, 0, 4 + bob);
      const brow = BROWS[p.face];
      if (brow) paint(ctx, [brow], pal, 0, 3 + bob);
      paint(ctx, [p.female ? '.....MM.....' : '.....MM.....'], { M: pal.M }, 0, 6 + bob);
      if (p.female) paint(ctx, ['.E........E.'], { E: '#1b1430' }, 0, 3 + bob);
    }
    const hair = HAIR_FRONT[p.hairStyle] ?? HAIR_FRONT[0];
    paint(ctx, hair, pal, 0, bob);
    // body
    paint(ctx, BODY, pal, 0, 7);
    paint(ctx, LEGS[frame] ?? LEGS[0], pal, 0, 14);
    if (back) paint(ctx, ['...AOOOOA...'], pal, 0, 7);
    let out = outlined(c);
    if (flip) {
      const [f, fctx] = makeCanvas(out.width, out.height);
      fctx.translate(out.width, 0); fctx.scale(-1, 1); fctx.drawImage(out, 0, 0);
      out = f;
    }
    return out;
  });
}

export function npcPalette(color: string, seed: number): CharPalette {
  return { skin: APPEARANCE.skin[seed % 4], hair: APPEARANCE.hairColor[(seed * 3) % 8], main: color, trim: '#e8d8a0', pants: shade(color, -0.5), female: seed % 2 === 0, face: seed % 4, hairStyle: seed % 6 };
}

// ---------------------------------------------------------------- weapons
export function weaponSprite(type: string): HTMLCanvasElement {
  return cached(`wpn|${type}`, () => {
    const [c, ctx] = makeCanvas(16, 16);
    if (type === 'dagger') {
      paint(ctx, ['............', '..........WW', '.........WLW', '........WLW.', '.......WLW..', '....G.WLW...', '.....GLW....', '.....HG.....', '....H..G....', '...P........'], { W: '#e8eef4', L: '#9aa8b8', G: '#c9a35a', H: '#3a2a1e', P: '#c9a35a' }, 2, 4);
    } else if (type === 'bow') {
      paint(ctx, ['......BB.....', '.....B..S....', '....B....S...', '...B.....S...', '..B......S...', '..B......S...', '..B......S...', '...B.....S...', '....B....S...', '.....B..S....', '......BB.....'], { B: '#8a5a2b', S: '#e8e0c8' }, 1, 2);
    } else if (type === 'grimoire') {
      paint(ctx, ['.DDDDDDDD.', 'DCCCCCCCCW', 'DCWWCCCCCW', 'DCCCLLCCCW', 'DCCCLLCCCW', 'DCCCCCWWCW', 'DCCCCCCCCW', '.DDDDDDDD.'], { D: '#3a2050', C: '#7a4a9a', W: '#f0e6d0', L: '#ffd27a' }, 3, 6);
    } else if (type === 'gauntlet') {
      paint(ctx, ['.CC.CC.', 'CCCCCCC', 'CLCCLCC', 'CCCCCCC', '.CCCCC.', '.SSSSS.'], { C: '#9aa4ad', L: '#e0e6ee', S: '#5a3a22' }, 6, 8);
    } else if (type === 'staff') {
      paint(ctx, [
        '............OO..',
        '...........OWWO.',
        '...........OWLO.',
        '............OO..',
        '...........B....',
        '..........B.....',
        '.........B......',
        '........B.......',
        '.......B........',
        '......B.........',
        '.....B..........',
        '....B...........',
        '...B............',
      ], { O: '#6a3fd0', W: '#e8e0ff', L: '#a080ff', B: '#8a5a2b' }, 0, 1);
    } else {
      paint(ctx, [
        '.............WW.',
        '............WLW.',
        '...........WLW..',
        '..........WLW...',
        '.........WLW....',
        '........WLW.....',
        '.......WLW......',
        '....G.WLW.......',
        '.....GLW........',
        '.....HG.........',
        '....H..G........',
        '...H............',
        '..P.............',
      ], { W: '#e8eef4', L: '#9aa8b8', G: '#c9a35a', H: '#6b4a2c', P: '#c9a35a' }, 0, 1);
    }
    return c;
  });
}

// ---------------------------------------------------------------- monsters
const MONSTER_TEMPLATES: Record<string, string[][]> = {
  slime: [[
    '.....LLLL.....', '...LLBBBBLL...', '..LBBBBBBBBL..', '.LBBBBBBBBBBL.', '.BBBEBBBBEBBB.',
    'BBBBEBBBBEBBBB', 'BBBBBBBBBBBBBB', 'BBBBBBBBBBBBBB', '.DDDDDDDDDDDD.', '..DDDDDDDDDD..',
  ], [
    '..............', '......LL......', '...LLBBBBLL...', '.LLBBBBBBBBLL.', 'LBBBEBBBBEBBBL',
    'BBBBEBBBBEBBBB', 'BBBBBBBBBBBBBB', 'BBBBBBBBBBBBBB', 'DDDDDDDDDDDDDD', '.DDDDDDDDDDDD.',
  ]],
  boar: [[
    '................', '...DDDDDDDD.....', '..DBBBBBBBBDD...', '.DBBBBBBBBBBBD..', '.BBBBBBBBBBBBBBL',
    '.BBBBBBBBBBBEBLL', '.BBBBBBBBBBBBBBW', '..BBBBBBBBBBBB..', '..DD.DD..DD.DD..', '..DD.DD..DD.DD..',
  ], [
    '................', '...DDDDDDDD.....', '..DBBBBBBBBDD...', '.DBBBBBBBBBBBD..', '.BBBBBBBBBBBBBBL',
    '.BBBBBBBBBBBEBLL', '.BBBBBBBBBBBBBBW', '..BBBBBBBBBBBB..', '...DD.DD.DD.DD..', '...D..D...D..D..',
  ]],
  wolf: [[
    '............D...', '...........DBD..', '..D.......DBBBD.', '.DBDDDDDDDBBEBBL', 'DBBBBBBBBBBBBBLL',
    '.DBBBBBBBBBBBD..', '..BBBBBBBBBBB...', '..BL.BB...BB.L..', '..B..B....B..B..', '..D..D....D..D..',
  ], [
    '............D...', '...........DBD..', '..D.......DBBBD.', '.DBDDDDDDDBBEBBL', 'DBBBBBBBBBBBBBLL',
    '.DBBBBBBBBBBBD..', '..BBBBBBBBBBB...', '...BLBB..BB.L...', '...B.B...B..B...', '...D.D...D..D...',
  ]],
  mushroom: [[
    '....DDDD....', '..DBBBBBBD..', '.DBBLBBBBBD.', 'DBBLLBBBLBBD', 'DBBBBBBBLLBD', 'DDDDDDDDDDDD',
    '...WWWWWW...', '...WEWWEW...', '...WWWWWW...', '...WWWWWW...', '..WWWWWWWW..', '..DD....DD..',
  ], [
    '............', '....DDDD....', '..DBBBBBBD..', '.DBBLBBBBBD.', 'DBBLLBBBLBBD', 'DDDDDDDDDDDD',
    '...WWWWWW...', '...WEWWEW...', '...WWWWWW...', '..WWWWWWWW..', '..WWWWWWWW..', '...DD..DD...',
  ]],
  wisp: [[
    '...LLLL...', '..LBBBBL..', '.LBBLLBBL.', 'LBBLWWLBBL', 'LBBEWWEBBL', 'LBBLWWLBBL', '.LBBLLBBL.', '..LBBBBL..', '...L..L...', '....LL....',
  ], [
    '...LLLL...', '..LBBBBL..', '.LBBLLBBL.', 'LBBLWWLBBL', 'LBBEWWEBBL', 'LBBLWWLBBL', '.LBBLLBBL.', '..LBBBBL..', '..L....L..', '...L..L...',
  ]],
  sapling: [[
    '....LLLLLL....', '..LLLLBLLLLL..', '.LLBLLLLLBLLL.', 'LLLLLLBLLLLLLL', '.LLLLLLLLLLLL.', '...LLLLLLLL...',
    '.....BBBB.....', '....BBBBBB....', '...BEBBBBEB...', '...BBBBBBBB...', '..DBBDDDDBBD..', '.DB.BBBBBB.BD.',
    'D...BBBBBB...D', '....BBBBBB....', '....BB..BB....', '...BB....BB...', '..DD......DD..',
  ], [
    '....LLLLLL....', '..LLLLBLLLLL..', '.LLBLLLLLBLLL.', 'LLLLLLBLLLLLLL', '.LLLLLLLLLLLL.', '...LLLLLLLL...',
    '.....BBBB.....', '....BBBBBB....', '...BEBBBBEB...', '...BBBBBBBB...', '.DBBBDDDDBBBD.', 'D...BBBBBB...D',
    '....BBBBBB....', '....BBBBBB....', '....BB..BB....', '....BB..BB....', '...DD....DD...',
  ]],
};

export function monsterSprite(def: MonsterDef, frame: number, flip: boolean, hurt = false): HTMLCanvasElement {
  return cached(`mon|${def.id}|${frame}|${flip}|${hurt}`, () => {
    const frames = MONSTER_TEMPLATES[def.family] ?? MONSTER_TEMPLATES.slime;
    const rows = frames[frame % frames.length];
    const w = Math.max(...rows.map((r) => r.length));
    const [c, ctx] = makeCanvas(w, rows.length);
    const p = def.palette;
    const pal = hurt
      ? { B: '#ffffff', D: '#ffdddd', L: '#ffffff', E: '#ff3030', W: '#ffffff' }
      : { B: p.body, D: p.dark, L: p.light, E: p.eye, W: def.family === 'mushroom' ? '#f6e7c8' : '#ffffff' };
    // subtle shading: dither lower half darker
    paint(ctx, rows, pal, 0, 0, flip);
    if (!hurt) {
      const img = ctx.getImageData(0, 0, w, rows.length);
      for (let y = Math.floor(rows.length * 0.6); y < rows.length; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (img.data[i + 3] > 0 && (x + y) % 2 === 0) { img.data[i] *= 0.85; img.data[i + 1] *= 0.85; img.data[i + 2] *= 0.85; }
      }
      ctx.putImageData(img, 0, 0);
    }
    return outlined(c, def.tier === 'normal' ? '#16101e' : '#3a0a0a');
  });
}

// ---------------------------------------------------------------- tiles
type RGB = [number, number, number];
const GROUND: Record<number, { base: string; alt: string; spec?: string; specRate?: number }> = {
  [T.GRASS]: { base: '#4f9a3c', alt: '#5aa845', spec: '#7cc75a', specRate: 0.06 },
  [T.GRASS2]: { base: '#468d36', alt: '#51993f', spec: '#3a7a2c', specRate: 0.08 },
  [T.DIRT]: { base: '#a07a4a', alt: '#93703f', spec: '#b8925c', specRate: 0.08 },
  [T.STONE]: { base: '#8f8e93', alt: '#a3a2a8', spec: '#6f6e75', specRate: 0.12 },
  [T.WATER]: { base: '#2f6db5', alt: '#3a7cc4', spec: '#8fc4ff', specRate: 0.03 },
  [T.SAND]: { base: '#d8c487', alt: '#cdb877', spec: '#eadba4', specRate: 0.08 },
  [T.FOREST]: { base: '#2f6a32', alt: '#357539', spec: '#4c8a3a', specRate: 0.07 },
  [T.FLOWERS]: { base: '#4f9a3c', alt: '#5aa845', spec: '#f0e060', specRate: 0.1 },
  [T.BUSH]: { base: '#3d7f30', alt: '#468d36', spec: '#2c5f23', specRate: 0.3 },
};

function groundColor(type: number): { base: string; alt: string; spec?: string; specRate?: number } {
  return GROUND[type] ?? GROUND[T.GRASS];
}

export function groundTile(type: number, variant: number): HTMLCanvasElement {
  return cached(`tile|${type}|${variant}`, () => {
    const [c, ctx] = makeCanvas(TW, TH);
    const g = groundColor(type);
    const base = hexToRgb(g.base), alt = hexToRgb(g.alt), spec = g.spec ? hexToRgb(g.spec) : base;
    const flowerCols: RGB[] = [[240, 224, 96], [240, 120, 160], [255, 255, 255], [160, 140, 255]];
    const img = ctx.createImageData(TW, TH);
    for (let y = 0; y < TH; y++) {
      const hw = y < TH / 2 ? (y + 1) * 2 : (TH - y) * 2;
      for (let x = TW / 2 - hw; x < TW / 2 + hw; x++) {
        const n = pnoise(x, y, variant * 31 + type * 7);
        let col: RGB = n < 0.5 ? base : alt;
        if (n > 1 - (g.specRate ?? 0)) col = type === T.FLOWERS ? flowerCols[Math.floor(pnoise(x, y, 99 + variant) * 4)] : spec;
        if (type === T.WATER && (x + y * 3 + variant * 5) % 11 === 0 && y % 3 === 0) col = spec;
        const i = (y * TW + x) * 4;
        img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  });
}

export const BLOCK_STYLE: Record<number, { top: string; side: string; height: number }> = {
  [T.WALL]: { top: '#9a9aa2', side: '#6d6d78', height: 18 },
  [T.HOUSE]: { top: '#b04a3a', side: '#d8c8a8', height: 24 },
  [T.ROOF_SHOP]: { top: '#3a6ab0', side: '#e0d0b0', height: 24 },
  [T.ROOF_SMITH]: { top: '#4a4a52', side: '#a89880', height: 24 },
  [T.ROOF_HALL]: { top: '#7a4ab0', side: '#e8dcc0', height: 32 },
  [T.FOUNTAIN]: { top: '#4a9ae0', side: '#b8b8c0', height: 6 },
};

/** Iso cube for wall/building tiles; anchor = tile center at bottom diamond. */
export function blockSprite(type: number, variant: number): HTMLCanvasElement {
  return cached(`block|${type}|${variant}`, () => {
    const st = BLOCK_STYLE[type];
    const H = st.height;
    const [c, ctx] = makeCanvas(TW, TH + H);
    const top = hexToRgb(st.top), side = hexToRgb(st.side);
    const img = ctx.createImageData(TW, TH + H);
    const put = (x: number, y: number, col: RGB, f: number) => {
      const i = (y * TW + x) * 4;
      img.data[i] = Math.min(255, col[0] * f); img.data[i + 1] = Math.min(255, col[1] * f); img.data[i + 2] = Math.min(255, col[2] * f); img.data[i + 3] = 255;
    };
    // side faces: left (x<16) and right (x>=16) parallelograms
    for (let x = 0; x < TW; x++) {
      const left = x < TW / 2;
      const yTop = left ? TH / 2 + Math.floor(x / 2) : TH / 2 + Math.floor((TW - 1 - x) / 2);
      for (let y = yTop; y < yTop + H; y++) {
        const n = pnoise(x, y, variant + type * 13);
        let f = left ? 0.78 : 0.62;
        if (type === T.WALL && (y - yTop) % 6 === 0) f *= 0.8; // brick lines
        if (type === T.WALL && (x + Math.floor((y - yTop) / 6) * 4) % 8 === 0) f *= 0.85;
        if (type !== T.WALL && type !== T.FOUNTAIN && (y - yTop) > H - 10 && (y - yTop) < H - 3 && x % 10 > 3 && x % 10 < 7) f *= 0.45; // windows
        put(x, y, side, f * (0.94 + n * 0.12));
      }
    }
    // top diamond
    for (let y = 0; y < TH; y++) {
      const hw = y < TH / 2 ? (y + 1) * 2 : (TH - y) * 2;
      for (let x = TW / 2 - hw; x < TW / 2 + hw; x++) {
        const n = pnoise(x, y, variant * 3 + type);
        let f = 1 + (n - 0.5) * 0.16;
        if (type !== T.WALL && type !== T.FOUNTAIN && (x + y) % 4 === 0) f *= 0.9; // roof tiles
        put(x, y, top, f);
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  });
}

export function treeSprite(variant: number, pine: boolean, forest: boolean): HTMLCanvasElement {
  return cached(`tree|${variant}|${pine}|${forest}`, () => {
    const w = 26, h = 38;
    const [c, ctx] = makeCanvas(w, h);
    const leaf = hexToRgb(forest ? '#2e7a3a' : '#3f8f3a'), leafD = hexToRgb(forest ? '#1d5428' : '#2c6a2a'), leafL = hexToRgb(forest ? '#4aa04a' : '#68b84e');
    const img = ctx.createImageData(w, h);
    const put = (x: number, y: number, col: RGB) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 4; img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255; };
    // trunk
    for (let y = 26; y < 36; y++) for (let x = 11; x < 15; x++) put(x, y, x === 11 ? [70, 44, 24] : [104, 68, 38]);
    if (pine) {
      for (let layer = 0; layer < 4; layer++) {
        const y0 = 2 + layer * 6, hh = 10;
        for (let y = 0; y < hh; y++) {
          const half = Math.floor((y / hh) * (5 + layer * 2.2)) + 1;
          for (let x = 13 - half; x <= 13 + half; x++) {
            const n = pnoise(x, y0 + y, variant);
            put(x, y0 + y, x < 13 - half / 3 ? leafL : n < 0.3 || x > 13 + half / 2 ? leafD : leaf);
          }
        }
      }
    } else {
      const blobs = [[13, 12, 10], [7, 17, 6], [19, 17, 6], [13, 20, 7]];
      for (const [cx, cy, r] of blobs) for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
        const d = (x - cx) ** 2 + (y - cy) ** 2;
        if (d > r * r + pnoise(x, y, variant) * r) continue;
        const lit = (x - cx) + (y - cy) < -r * 0.4;
        const dark = (x - cx) + (y - cy) > r * 0.5;
        put(x, y, lit ? leafL : dark ? leafD : pnoise(x, y, variant + 5) < 0.15 ? leafD : leaf);
      }
      if (variant % 3 === 0) for (const [x, y] of [[9, 12], [17, 10], [14, 18]]) put(x, y, [220, 60, 60]); // fruit
    }
    ctx.putImageData(img, 0, 0);
    return outlined(c, '#10200e');
  });
}

export function rockSprite(variant: number): HTMLCanvasElement {
  return cached(`rock|${variant}`, () => {
    const [c, ctx] = makeCanvas(18, 12);
    paint(ctx, ['.....LLLLL........', '...LLLBBBBLL......', '..LLBBBBBBBBL.....', '.LBBBBBBBBBBBD....', 'LBBBBBBBBBBBBBD...', 'BBBBBBBBBBBBBBBD..', 'DBBBBBBBBBBBBBDD..', '.DDDDDDDDDDDDDD...'],
      { L: '#c8c8d0', B: '#9a9aa6', D: '#6a6a78' }, variant % 2, 3);
    return outlined(c);
  });
}

export function nodeSprite(kind: string, ready: boolean): HTMLCanvasElement {
  return cached(`node|${kind}|${ready}`, () => {
    const [c, ctx] = makeCanvas(16, 14);
    if (kind === 'herb') {
      paint(ctx, ['....F...F.....', '...FGF.FGF....', '....G...G..F..', '..G.GG.GG.FGF.', '.GGGGGGGGG.G..', 'GGLGGGLGGGGG..', '.GGGGGGGGGG...', '..DDDDDDDD....'],
        { F: ready ? '#ff70b0' : '#7a6a6a', G: ready ? '#3fa040' : '#5a6a50', L: ready ? '#70d060' : '#6a7a60', D: '#2a5020' }, 1, 5);
    } else {
      paint(ctx, ['.....LLLL.....', '...LLBBBBL....', '..LBBSBBBBD...', '.LBBBBBBSBBD..', 'LBSBBBBBBBBBD.', 'BBBBBBSBBBBBD.', 'DBBBBBBBBBBDD.', '.DDDDDDDDDDD..'],
        { L: '#b8b8c8', B: '#7a7a8a', D: '#55556a', S: ready ? '#ffd27a' : '#8a8a98' }, 1, 5);
    }
    return outlined(c);
  });
}

// ---------------------------------------------------------------- icons
const ICONS: Record<ItemIcon, string[]> = {
  dagger: ['........WW', '.......WLW', '......WLW.', '.....WLW..', '..G.WLW...', '...GLW....', '...HG.....', '..H..G....', '.P........'],
  bow: ['....BBS...', '...B..S...', '..B...S...', '.B....S...', '.B..LLSL>.', '.B....S...', '..B...S...', '...B..S...', '....BBS...'],
  grimoire: ['.DDDDDDD.', 'DCCCCCCCW', 'DCWWCCCCW', 'DCCLLCCCW', 'DCCLLCCCW', 'DCCCCWWCW', 'DCCCCCCCW', '.DDDDDDD.'],
  gauntlet: ['.CC.CC.CC', 'CCCCCCCCC', 'CLCCLCCLC', 'CCCCCCCCC', '.CCCCCCC.', '.SSSSSS..', '.DDDDDD..'],
  sword: ['..........WW', '.........WLW', '........WLW.', '.......WLW..', '......WLW...', '..G..WLW....', '...GWLW.....', '...HG.......', '..H..G......', '.H..........', 'P...........'],
  staff: ['.........OO.', '........OWWO', '........OLLO', '.........OO.', '........B...', '.......B....', '......B.....', '.....B......', '....B.......', '...B........', '..B.........'],
  armor: ['.CC....CC.', 'CCCCCCCCCC', 'CCCCDDCCCC', '.CCCCCCCC.', '.CCCDDCCC.', '.CCCCCCCC.', '.CCCCCCCC.', '.DDDDDDDD.'],
  helmet: ['...CCCC...', '..CCCCCC..', '.CCCLLCCC.', '.CCCCCCCC.', '.CD....DC.', '.C......C.'],
  gloves: ['.CC.CC.', 'CCCCCCC', 'CCCCCCC', 'CCCCCC.', '.CCCC..', '.DDDD..'],
  boots: ['..CCC...', '..CCC...', '..CCC...', '..CCCCC.', '.CCCCCCC', '.DDDDDDD'],
  ring: ['...WW...', '..CLLC..', '.C....C.', '.C....C.', '.C....C.', '..CCCC..'],
  necklace: ['C......C', '.C....C.', '..C..C..', '...CC...', '...LL...', '...LL...'],
  potion: ['...BB...', '...WW...', '..WCCW..', '.WCCCCW.', '.WCLCCW.', '.WCCCCW.', '..WWWW..'],
  ore: ['...LLL..', '..LCCCL.', '.LCCSCCD', '.CCSCCCD', '.CCCCCDD', '..DDDDD.'],
  gel: ['...LL...', '..LCCL..', '.LCCCCL.', '.CCWCCC.', '.CCCCCC.', '..DDDD..'],
  hide: ['.CCCCCC.', 'CCDCCCCC', 'CCCCCDCC', 'CCCCCCCC', '.CCDCCC.', '..C..C..'],
  essence: ['...WW...', '..WCCW..', '.WCLLCW.', '.WCLLCW.', '..WCCW..', '...WW...'],
  fragment: ['....L...', '...LCL..', '..LCCCL.', '.LCCWCCL', '..LCCCL.', '...LCL..', '....L...'],
  herb: ['..L..L..', '.LCLLCL.', '..LCCL..', '...CC...', '..DCCD..', '...DD...'],
  rune: ['.DDDDDD.', 'DCCCCCCD', 'DCWCCWCD', 'DCCWWCCD', 'DCWCCWCD', 'DCCCCCCD', '.DDDDDD.'],
  dust: ['.L...L..', '...L...L', 'L.CC.L..', '.CCCC...', 'CCWCCC.L', '.CCCC...'],
  cap: ['..CCCC..', '.CCWCCC.', 'CCCCCWCC', 'DDDDDDDD', '..LLLL..', '..LLLL..'],
};

export function itemIcon(icon: ItemIcon, color: string, size = 16): HTMLCanvasElement {
  return cached(`icon|${icon}|${color}|${size}`, () => {
    const rows = ICONS[icon] ?? ICONS.ore;
    const w = Math.max(...rows.map((r) => r.length)), h = rows.length;
    const [c, ctx] = makeCanvas(w, h);
    paint(ctx, rows, { C: color, D: shade(color, -0.4), L: shade(color, 0.4), W: '#ffffff', S: '#ffd27a', G: '#c9a35a', H: '#6b4a2c', P: '#c9a35a', O: color, B: '#8a5a2b' });
    const o = outlined(c);
    const [out, octx] = makeCanvas(size, size);
    octx.drawImage(o, Math.floor((size - o.width) / 2), Math.floor((size - o.height) / 2));
    return out;
  });
}

export function goldIcon(): HTMLCanvasElement {
  return cached('icon|gold', () => {
    const [c, ctx] = makeCanvas(10, 8);
    paint(ctx, ['..LLLL....', '.LCCCCL...', '.CCWCCD.LL', '.DCCCDD.CD', '..DDDD.LCD', '.......DD.'], { C: '#f0c040', L: '#ffe080', D: '#a07010', W: '#ffffff' });
    return outlined(c);
  });
}
