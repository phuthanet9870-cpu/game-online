/**
 * PLACEHOLDER pixel art generated at runtime (no external art yet — clearly labelled in UI).
 * Replace with real atlases in the asset pipeline (spec §22). Every generator draws into a canvas so
 * the same code feeds Phaser textures and the React HUD portrait.
 */
import { DIR8, type Dir8 } from '../core/direction';

export const PLAYER_FRAME = { w: 24, h: 32 };
/** Column layout of the player sheet (one row per direction in DIR8 order). */
export const PLAYER_COLS = {
  idle0: 0,
  idle1: 1,
  walk0: 2,
  walk1: 3,
  walk2: 4,
  walk3: 5,
  hit: 6,
  dead: 7,
} as const;
export const PLAYER_COL_COUNT = 8;

export const SLIME_FRAME = { w: 16, h: 14 };
export const SLIME_COLS = { idle0: 0, idle1: 1, windup: 2, dead: 3 } as const;
export const WOLF_FRAME = { w: 26, h: 18 };
export const WOLF_COLS = { idle0: 0, run0: 1, run1: 2, windup: 3, dead: 4 } as const;
export const TILE = 16;

type Ctx = CanvasRenderingContext2D;
const px = (c: Ctx, x: number, y: number, w: number, h: number, color: string) => {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), w, h);
};

const PAL = {
  outline: '#1a1024',
  skin: '#f3cba8',
  skinShade: '#d9a383',
  hair: '#eceaf7',
  hairShade: '#b3aed0',
  hairDark: '#8b86ad',
  coat: '#b02a3e',
  coatShade: '#6e1527',
  coatLight: '#d8495b',
  gold: '#f0c24b',
  goldShade: '#b0812a',
  pants: '#2c2038',
  boots: '#3b2a1e',
  eye: '#2a1840',
  iris: '#9b6cff',
  cape: '#3a1630',
};

interface View {
  lateral: number; // -1 (W) .. 1 (E)
  front: boolean; // face visible
  back: boolean;
}

function viewFor(d: Dir8): View {
  switch (d) {
    case 'S':
      return { lateral: 0, front: true, back: false };
    case 'SE':
      return { lateral: 0.6, front: true, back: false };
    case 'E':
      return { lateral: 1, front: true, back: false };
    case 'NE':
      return { lateral: 0.6, front: false, back: true };
    case 'N':
      return { lateral: 0, front: false, back: true };
    case 'NW':
      return { lateral: -0.6, front: false, back: true };
    case 'W':
      return { lateral: -1, front: true, back: false };
    case 'SW':
      return { lateral: -0.6, front: true, back: false };
  }
}

/** Draws one 24x32 player frame with its top-left at (ox, oy). */
export function drawPlayerFrame(c: Ctx, ox: number, oy: number, dir: Dir8, col: number): void {
  const v = viewFor(dir);
  const L = Math.round(v.lateral * 2); // lateral pixel shift for face/details
  const side = Math.abs(v.lateral) > 0.9;
  if (col === PLAYER_COLS.dead) {
    // lying down
    px(c, ox + 3, oy + 27, 18, 3, 'rgba(0,0,0,0.35)');
    px(c, ox + 4, oy + 22, 12, 6, PAL.coatShade);
    px(c, ox + 5, oy + 23, 10, 4, PAL.coat);
    px(c, ox + 15, oy + 21, 6, 7, PAL.hair);
    px(c, ox + 16, oy + 23, 4, 4, PAL.skin);
    px(c, ox + 1, oy + 24, 4, 3, PAL.boots);
    return;
  }
  const walkFrame = col >= PLAYER_COLS.walk0 && col <= PLAYER_COLS.walk3 ? col - PLAYER_COLS.walk0 : -1;
  const bob = col === PLAYER_COLS.idle1 ? 1 : walkFrame === 1 || walkFrame === 3 ? 1 : 0;
  const liftL = walkFrame === 1 ? 2 : walkFrame === 0 ? 0 : 0;
  const liftR = walkFrame === 3 ? 2 : 0;
  const armSwing = walkFrame === 1 ? 1 : walkFrame === 3 ? -1 : 0;
  const hitShift = col === PLAYER_COLS.hit ? -1 : 0;
  const x0 = ox + hitShift;
  const y0 = oy + bob;

  // shadow
  px(c, ox + 6, oy + 29, 12, 2, 'rgba(0,0,0,0.35)');
  px(c, ox + 7, oy + 28, 10, 1, 'rgba(0,0,0,0.2)');

  // legs + boots
  const legW = side ? 3 : 3;
  const lx = side ? 9 + L : 8;
  const rx = side ? 12 + L : 13;
  px(c, x0 + lx, oy + 24 - liftL, legW, 4, PAL.pants);
  px(c, x0 + lx, oy + 27 - liftL, legW, 2, PAL.boots);
  px(c, x0 + rx, oy + 24 - liftR, legW, 4, PAL.pants);
  px(c, x0 + rx, oy + 27 - liftR, legW, 2, PAL.boots);

  // cape (visible from back / sides)
  if (v.back || side) px(c, x0 + 7 - (side ? L : 0), y0 + 15, 10, 9, PAL.cape);

  // torso coat
  px(c, x0 + 6, y0 + 15, 12, 10, PAL.outline);
  px(c, x0 + 7, y0 + 15, 10, 9, PAL.coat);
  px(c, x0 + 7, y0 + 20, 10, 4, PAL.coatShade);
  if (!v.back) {
    px(c, x0 + 11 + Math.sign(L), y0 + 15, 2, 9, PAL.coatLight); // front opening
    px(c, x0 + 10 + Math.sign(L), y0 + 16, 1, 1, PAL.gold);
    px(c, x0 + 13 + Math.sign(L), y0 + 16, 1, 1, PAL.gold);
  }
  px(c, x0 + 7, y0 + 21, 10, 1, PAL.gold); // belt
  px(c, x0 + 11, y0 + 21, 2, 1, PAL.goldShade);
  // shoulders (gold pauldrons)
  px(c, x0 + 5, y0 + 15, 3, 2, PAL.gold);
  px(c, x0 + 16, y0 + 15, 3, 2, PAL.gold);

  // arms
  if (!side || v.lateral < 0) px(c, x0 + 5, y0 + 17 + armSwing, 2, 6, PAL.coatShade);
  if (!side || v.lateral > 0) px(c, x0 + 17, y0 + 17 - armSwing, 2, 6, PAL.coatShade);
  if (!side || v.lateral < 0) px(c, x0 + 5, y0 + 23 + armSwing, 2, 1, PAL.skin);
  if (!side || v.lateral > 0) px(c, x0 + 17, y0 + 23 - armSwing, 2, 1, PAL.skin);

  // head
  px(c, x0 + 6, y0 + 5, 12, 11, PAL.outline);
  px(c, x0 + 7, y0 + 6, 10, 9, PAL.skin);
  px(c, x0 + 7, y0 + 13, 10, 2, PAL.skinShade);

  // hair (spiky silver)
  px(c, x0 + 6, y0 + 3, 12, 5, PAL.hair);
  px(c, x0 + 5, y0 + 5, 2, 6, PAL.hairShade);
  px(c, x0 + 17, y0 + 5, 2, 6, PAL.hairShade);
  px(c, x0 + 7, y0 + 1, 2, 3, PAL.hair);
  px(c, x0 + 11, y0 + 0, 2, 4, PAL.hair);
  px(c, x0 + 15, y0 + 1, 2, 3, PAL.hair);
  px(c, x0 + 9, y0 + 2, 1, 2, PAL.hairShade);
  px(c, x0 + 14, y0 + 2, 1, 2, PAL.hairShade);
  if (v.back) {
    px(c, x0 + 7, y0 + 6, 10, 8, PAL.hair);
    px(c, x0 + 8, y0 + 11, 8, 3, PAL.hairShade);
    px(c, x0 + 11, y0 + 12, 2, 2, PAL.hairDark);
  } else {
    // fringe
    px(c, x0 + 7 + Math.min(0, L), y0 + 7, 4, 2, PAL.hair);
    px(c, x0 + 13 + Math.max(0, L), y0 + 7, 4, 2, PAL.hair);
    px(c, x0 + 11 + L, y0 + 7, 2, 3, PAL.hairShade);
    if (side) {
      // single eye on the facing side
      const ex = v.lateral > 0 ? 14 : 8;
      px(c, x0 + ex, y0 + 10, 2, 2, PAL.eye);
      px(c, x0 + ex + (v.lateral > 0 ? 1 : 0), y0 + 10, 1, 1, PAL.iris);
      // back hair on the far side
      px(c, x0 + (v.lateral > 0 ? 6 : 14), y0 + 6, 4, 6, PAL.hair);
    } else {
      px(c, x0 + 9 + L, y0 + 10, 2, 2, PAL.eye);
      px(c, x0 + 13 + L, y0 + 10, 2, 2, PAL.eye);
      px(c, x0 + 9 + L, y0 + 10, 1, 1, PAL.iris);
      px(c, x0 + 13 + L, y0 + 10, 1, 1, PAL.iris);
      px(c, x0 + 11 + L, y0 + 13, 2, 1, PAL.skinShade);
    }
  }
}

export function createPlayerSheet(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = PLAYER_FRAME.w * PLAYER_COL_COUNT;
  cv.height = PLAYER_FRAME.h * DIR8.length;
  const c = cv.getContext('2d') as Ctx;
  DIR8.forEach((d, row) => {
    for (let col = 0; col < PLAYER_COL_COUNT; col++)
      drawPlayerFrame(c, col * PLAYER_FRAME.w, row * PLAYER_FRAME.h, d, col);
  });
  return cv;
}

/** 64x64 portrait for the HUD (head of the south-facing idle frame, scaled with nearest neighbour). */
export function createPortraitDataUrl(): string {
  const src = document.createElement('canvas');
  src.width = PLAYER_FRAME.w;
  src.height = PLAYER_FRAME.h;
  drawPlayerFrame(src.getContext('2d') as Ctx, 0, 0, 'S', PLAYER_COLS.idle0);
  const out = document.createElement('canvas');
  out.width = 64;
  out.height = 64;
  const o = out.getContext('2d') as Ctx;
  o.imageSmoothingEnabled = false;
  o.drawImage(src, 4, 0, 16, 18, 0, 0, 64, 72);
  return out.toDataURL();
}

export function createSlimeSheet(): HTMLCanvasElement {
  const { w, h } = SLIME_FRAME;
  const cv = document.createElement('canvas');
  cv.width = w * 4;
  cv.height = h;
  const c = cv.getContext('2d') as Ctx;
  const body = (ox: number, squash: number) => {
    const bw = 12 + squash * 2;
    const bh = 9 - squash;
    const bx = ox + (w - bw) / 2;
    const by = h - 2 - bh;
    px(c, ox + 3, h - 2, 10, 2, 'rgba(0,0,0,0.3)');
    px(c, bx, by + 1, bw, bh, '#1f5a2a');
    px(c, bx + 1, by, bw - 2, bh, '#3fbf55');
    px(c, bx + 1, by + bh - 3, bw - 2, 2, '#2d9441');
    px(c, bx + 2, by + 1, 3, 2, '#b7ffbf');
    px(c, ox + 5, by + 3, 2, 2, '#14241a');
    px(c, ox + 9, by + 3, 2, 2, '#14241a');
  };
  body(0, 0);
  body(w, 1);
  body(w * 2, 2);
  // windup: angry red eyes
  px(c, w * 2 + 5, h - 2 - 7 + 3, 2, 1, '#ff3b3b');
  px(c, w * 2 + 9, h - 2 - 7 + 3, 2, 1, '#ff3b3b');
  // dead puddle
  px(c, w * 3 + 2, h - 4, 12, 3, '#2d9441');
  px(c, w * 3 + 4, h - 5, 6, 1, '#3fbf55');
  return cv;
}

export function createWolfSheet(): HTMLCanvasElement {
  const { w, h } = WOLF_FRAME;
  const cv = document.createElement('canvas');
  cv.width = w * 5;
  cv.height = h;
  const c = cv.getContext('2d') as Ctx;
  const fur = '#8d93a3';
  const furD = '#5a5f6e';
  const furL = '#c5cad6';
  const wolf = (ox: number, legPhase: number, crouch: number) => {
    const y = crouch;
    px(c, ox + 4, h - 2, 18, 2, 'rgba(0,0,0,0.3)');
    // legs
    const lp = [0, 1, -1][legPhase] ?? 0;
    px(c, ox + 6 + lp, h - 6, 2, 5, furD);
    px(c, ox + 9 - lp, h - 6, 2, 5, fur);
    px(c, ox + 16 + lp, h - 6, 2, 5, furD);
    px(c, ox + 19 - lp, h - 6, 2, 5, fur);
    // body
    px(c, ox + 5, 6 + y, 17, 7, furD);
    px(c, ox + 6, 6 + y, 15, 5, fur);
    px(c, ox + 7, 10 + y, 12, 2, furL);
    // tail
    px(c, ox + 1, 5 + y, 5, 2, fur);
    px(c, ox + 0, 4 + y, 2, 2, furL);
    // head
    px(c, ox + 19, 3 + y, 6, 6, furD);
    px(c, ox + 20, 3 + y, 5, 5, fur);
    px(c, ox + 24, 6 + y, 2, 2, '#2a2a2a');
    px(c, ox + 19, 1 + y, 2, 3, furD);
    px(c, ox + 22, 1 + y, 2, 3, furD);
    px(c, ox + 22, 4 + y, 1, 1, crouch ? '#ff3b3b' : '#f7e36a');
  };
  wolf(0, 0, 0);
  wolf(w, 1, 0);
  wolf(w * 2, 2, 0);
  wolf(w * 3, 0, 2);
  // dead
  px(c, w * 4 + 4, h - 6, 18, 4, furD);
  px(c, w * 4 + 5, h - 6, 16, 2, fur);
  px(c, w * 4 + 20, h - 7, 5, 4, fur);
  return cv;
}

/** Tile ids match tools/asset-pipeline/generate-training-map.mjs */
export function createTilesheet(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = TILE * 9;
  cv.height = TILE;
  const c = cv.getContext('2d') as Ctx;
  let seed = 7;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const speckle = (ox: number, base: string, dots: string[], n: number) => {
    px(c, ox, 0, TILE, TILE, base);
    for (let i = 0; i < n; i++)
      px(c, ox + Math.floor(r() * 16), Math.floor(r() * 16), 1, 1, dots[i % dots.length] as string);
  };
  // 0 grass
  speckle(0, '#4d8a3c', ['#5ea049', '#3f7532'], 22);
  // 1 grass2 (tufts)
  speckle(16, '#4d8a3c', ['#5ea049', '#3f7532'], 14);
  for (const [x, y] of [
    [3, 5],
    [10, 11],
    [12, 3],
  ] as const) {
    px(c, 16 + x, y, 1, 2, '#78b85a');
    px(c, 16 + x + 2, y, 1, 2, '#78b85a');
    px(c, 16 + x + 1, y - 1, 1, 3, '#8fcf6a');
  }
  // 2 flowers
  speckle(32, '#4d8a3c', ['#5ea049', '#3f7532'], 14);
  for (const [x, y, col] of [
    [3, 4, '#f6e27a'],
    [11, 6, '#e98ad6'],
    [6, 12, '#ffffff'],
    [13, 13, '#b08cff'],
  ] as const) {
    px(c, 32 + x, y, 2, 2, col);
    px(c, 32 + x, y + 2, 1, 1, '#2f6a28');
  }
  // 3 path
  speckle(48, '#b99a68', ['#a7895a', '#cdb27f', '#8f744b'], 30);
  // 4 water
  px(c, 64, 0, 16, 16, '#2f5fa8');
  px(c, 64, 0, 16, 2, '#3c74c2');
  for (const [x, y] of [
    [2, 5],
    [9, 9],
    [4, 13],
  ] as const)
    px(c, 64 + x, y, 4, 1, '#7fb2ee');
  // 5 wall (stone bricks)
  px(c, 80, 0, 16, 16, '#5d5870');
  for (let y = 0; y < 16; y += 4) {
    px(c, 80, y, 16, 1, '#3a3648');
    const off = (y / 4) % 2 === 0 ? 0 : 4;
    for (let x = off; x < 16; x += 8) px(c, 80 + x, y, 1, 4, '#3a3648');
    px(c, 80 + off + 1, y + 1, 5, 1, '#7a7490');
  }
  // 6 tree (canopy over grass)
  speckle(96, '#3f7532', ['#356a2b'], 8);
  px(c, 96 + 7, 11, 2, 5, '#5b3b22');
  px(c, 96 + 2, 2, 12, 10, '#1f4a1f');
  px(c, 96 + 1, 4, 14, 6, '#1f4a1f');
  px(c, 96 + 3, 2, 10, 8, '#2e6b2a');
  px(c, 96 + 4, 3, 4, 3, '#4c9a3c');
  px(c, 96 + 9, 6, 3, 2, '#3f8434');
  // 7 dark grass
  speckle(112, '#3e7531', ['#4a8a3a', '#326228'], 22);
  // 8 sand
  speckle(128, '#d8c58f', ['#c9b47c', '#e8d8a6'], 24);
  return cv;
}

/** Simple sword sprite (4x16) used during attack swings. Pivot at the bottom (handle). */
export function createSwordTexture(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 5;
  cv.height = 18;
  const c = cv.getContext('2d') as Ctx;
  px(c, 1, 0, 3, 12, '#e6ecf5');
  px(c, 2, 0, 1, 12, '#ffffff');
  px(c, 1, 11, 3, 1, '#9aa6bd');
  px(c, 0, 12, 5, 2, PAL.gold);
  px(c, 2, 14, 1, 3, '#5b3b22');
  px(c, 1, 17, 3, 1, PAL.gold);
  return cv;
}
