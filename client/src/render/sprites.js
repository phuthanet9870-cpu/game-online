// PLACEHOLDER ART — procedurally drawn pixel sprites so Phase 1 ships with zero external assets.
// Real spritesheets (Idle/Walk/Attack/Hit/Death, transparent PNG, nearest filtering) replace these
// in a later art pass; the renderer only depends on the frame lookup functions below.

const OUTLINE = '#160f1d';

function makeCanvas(w, h) {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return { c, ctx };
}

/** Add a 1px outline around every opaque pixel (classic pixel-art silhouette). */
function outline(ctx, w, h, color = OUTLINE) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  const op = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
  const marks = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (op(x, y)) continue;
    if (op(x - 1, y) || op(x + 1, y) || op(x, y - 1) || op(x, y + 1)) marks.push([x, y]);
  }
  ctx.fillStyle = color;
  for (const [x, y] of marks) ctx.fillRect(x, y, 1, 1);
}

function silhouette(src, w, h, color) {
  const { c, ctx } = makeCanvas(w, h);
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  return c;
}

function mirror(src, w, h) {
  const { c, ctx } = makeCanvas(w, h);
  ctx.translate(w, 0); ctx.scale(-1, 1); ctx.drawImage(src, 0, 0);
  return c;
}

// ---------------- Hero (16×20) ----------------
const H = {
  skin: '#f0c49c', skinS: '#c58b68', hair: '#3b2b52', hairH: '#5c4880', tunic: '#2e5f8f', tunicS: '#21466b',
  trim: '#d9b25a', belt: '#5b3a22', pants: '#3a3148', boot: '#251d2e', cape: '#8e2d3b', capeS: '#6a1f2b', eye: '#1b1426',
  steel: '#d5dde8', steelS: '#8f9bb0', hilt: '#c9a24a',
};
export const HERO_W = 16, HERO_H = 20;

function drawHero(ctx, dir, frame, sword) {
  const r = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
  // walk cycle: 0 neutral, 1 left leg forward, 2 neutral, 3 right leg forward
  const bob = frame === 1 || frame === 3 ? 1 : 0;
  const lf = frame === 1 ? 1 : frame === 3 ? -1 : 0;
  const y0 = bob;
  if (dir === 'down' || dir === 'up') {
    if (dir === 'down') r(4, 8 + y0, 8, 7, H.capeS); // cape peeking behind
    // legs
    r(5, 14 + y0, 2, 4 + (lf > 0 ? 1 : 0) - (lf < 0 ? 1 : 0), H.pants);
    r(9, 14 + y0, 2, 4 + (lf < 0 ? 1 : 0) - (lf > 0 ? 1 : 0), H.pants);
    r(5, 17 + y0 + (lf > 0 ? 1 : 0) - (lf < 0 ? 1 : 0), 2, 2, H.boot);
    r(9, 17 + y0 + (lf < 0 ? 1 : 0) - (lf > 0 ? 1 : 0), 2, 2, H.boot);
    // torso
    r(4, 8 + y0, 8, 6, H.tunic); r(4, 12 + y0, 8, 1, H.belt); r(10, 9 + y0, 2, 3, H.tunicS);
    r(7, 8 + y0, 2, 4, dir === 'down' ? H.trim : H.tunicS);
    // arms (swing opposite to legs)
    r(2, 9 + y0 - lf, 2, 4, H.tunicS); r(2, 13 + y0 - lf, 2, 1, H.skin);
    r(12, 9 + y0 + lf, 2, 4, H.tunicS); r(12, 13 + y0 + lf, 2, 1, H.skin);
    // head
    r(4, 2 + y0, 8, 6, H.skin);
    if (dir === 'down') {
      r(4, 1 + y0, 8, 3, H.hair); r(3, 2 + y0, 1, 4, H.hair); r(12, 2 + y0, 1, 4, H.hair); r(5, 1 + y0, 3, 1, H.hairH);
      r(6, 5 + y0, 1, 2, H.eye); r(9, 5 + y0, 1, 2, H.eye); r(4, 7 + y0, 8, 1, H.skinS);
    } else {
      r(3, 1 + y0, 10, 7, H.hair); r(5, 1 + y0, 4, 1, H.hairH);
      r(3, 8 + y0, 10, 7, H.cape); r(4, 9 + y0, 8, 5, H.capeS); r(3, 14 + y0, 10, 1, H.cape);
    }
    if (sword) {
      if (dir === 'down') { r(13, 12 + y0 + lf, 1, 7, H.steel); r(12, 12 + y0 + lf, 3, 1, H.hilt); }
      else { r(2, 2 + y0, 1, 9, H.steelS); r(1, 10 + y0, 3, 1, H.hilt); }
    }
  } else { // side view, facing right
    const stepA = frame === 1 ? 2 : frame === 3 ? -2 : 0;
    r(3, 8 + y0, 3, 8, H.cape); r(3, 9 + y0, 2, 6, H.capeS);
    // back leg then front leg
    r(7 - stepA, 14 + y0, 2, 4, H.pants); r(7 - stepA, 17 + y0, 3, 2, H.boot);
    r(7 + stepA, 14 + y0, 2, 4, H.tunicS); r(7 + stepA, 17 + y0, 3, 2, H.boot);
    r(5, 8 + y0, 6, 6, H.tunic); r(5, 12 + y0, 6, 1, H.belt); r(5, 8 + y0, 2, 5, H.tunicS);
    r(8 - (stepA >> 1), 9 + y0, 2, 4, H.tunicS); r(8 - (stepA >> 1), 13 + y0, 2, 1, H.skin);
    r(5, 2 + y0, 7, 6, H.skin); r(4, 1 + y0, 7, 3, H.hair); r(4, 2 + y0, 3, 5, H.hair); r(6, 1 + y0, 3, 1, H.hairH);
    r(10, 5 + y0, 1, 2, H.eye); r(11, 6 + y0, 1, 1, H.skinS);
    if (sword) { r(10 - (stepA >> 1), 10 + y0, 1, 1, H.hilt); r(11 - (stepA >> 1), 6 + y0, 1, 5, H.steel); }
  }
}

// ---------------- Wolf (22×14) ----------------
const WF = { fur: '#6f5f74', furD: '#4a3c52', furL: '#9b8a98', belly: '#b9a9ad', eye: '#ff6a3d', fang: '#f3ece6', nose: '#1e1622' };
export const WOLF_W = 22, WOLF_H = 14;

function drawWolf(ctx, frame, pose) {
  const r = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
  const crouch = pose === 'windup' ? 1 : 0;
  const stretch = pose === 'attack' ? 2 : 0;
  const lift = frame === 1 || frame === 3 ? 1 : 0;
  const y = crouch - (pose === 'attack' ? 1 : 0);
  // tail
  r(0, 4 + y, 3, 2, WF.furD); r(1, 3 + y, 2, 1, WF.fur);
  // legs (4-beat)
  const legs = [[4, frame === 1 ? -1 : 1], [7, frame === 1 ? 1 : -1], [13 + stretch, frame === 3 ? -1 : 1], [16 + stretch, frame === 3 ? 1 : -1]];
  for (const [lx, o] of legs) { r(lx + (pose === 'idle' ? 0 : o), 10 + y - (lift && o > 0 ? 1 : 0), 2, 4 - crouch, WF.furD); }
  // body
  r(3, 5 + y, 14 + stretch, 6, WF.fur); r(4, 4 + y, 12 + stretch, 1, WF.furL); r(5, 10 + y, 10 + stretch, 1, WF.belly);
  r(3, 8 + y, 3, 3, WF.furD);
  // head
  const hx = 15 + stretch, hy = 2 + y + crouch;
  r(hx, hy, 5, 5, WF.fur); r(hx + 4, hy + 2, 3, 3, WF.furL); r(hx + 6, hy + 2, 1, 1, WF.nose);
  r(hx, hy - 2, 2, 2, WF.furD); r(hx + 3, hy - 2, 2, 2, WF.furD); // ears
  r(hx + 3, hy + 1, 1, 1, WF.eye);
  if (pose !== 'idle' && pose !== 'walk') { r(hx + 4, hy + 5, 1, 1, WF.fang); r(hx + 6, hy + 5, 1, 1, WF.fang); r(hx + 4, hy + 4, 3, 1, '#3a0f18'); }
}

// ---------------- Tiles (16×16) ----------------
function hash(x, y, s = 0) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

const T = { g1: '#3c6a44', g2: '#34603d', gH: '#56895a', gD: '#2a4d33', dg: '#2e573a', water: '#21456b', waterH: '#3e6f9c', waterD: '#183251', shore: '#7aa37a',
  wallTop: '#77728a', wallTopH: '#8f8aa3', wallFace: '#4b4659', wallFaceD: '#383344', mortar: '#2d2937', rock: '#7d7890', rockH: '#a39fb5', rockD: '#545066',
  flowerA: '#e5b5ff', flowerB: '#ffd46e', trunk: '#4a3322', leaf: '#1f4a2f', leafH: '#2f6a40', leafD: '#173723' };

function grass(ctx, ox, oy, tx, ty, dark) {
  ctx.fillStyle = dark ? T.dg : (hash(tx, ty) > 0.5 ? T.g1 : T.g2);
  ctx.fillRect(ox, oy, 16, 16);
  for (let i = 0; i < 7; i++) {
    const px = Math.floor(hash(tx, ty, i) * 16), py = Math.floor(hash(ty, tx, i + 9) * 15);
    ctx.fillStyle = hash(tx + i, ty) > 0.45 ? T.gH : T.gD;
    ctx.fillRect(ox + px, oy + py, 1, 2);
  }
}

export function drawTile(ctx, map, tx, ty, waterFrame) {
  const ox = tx * 16, oy = ty * 16, t = map.tileAt(tx, ty);
  const below = ty + 1 < map.height ? map.tileAt(tx, ty + 1) : 'stone_wall';
  switch (t) {
    case 'grass': grass(ctx, ox, oy, tx, ty, false); break;
    case 'grass_dark': grass(ctx, ox, oy, tx, ty, true); break;
    case 'flowers':
      grass(ctx, ox, oy, tx, ty, false);
      for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? T.flowerA : T.flowerB; ctx.fillRect(ox + 2 + Math.floor(hash(tx, ty, i) * 11), oy + 2 + Math.floor(hash(ty, tx, i) * 11), 2, 2); }
      break;
    case 'water': {
      ctx.fillStyle = T.water; ctx.fillRect(ox, oy, 16, 16);
      ctx.fillStyle = T.waterD; ctx.fillRect(ox, oy + 12, 16, 4);
      for (let i = 0; i < 3; i++) { ctx.fillStyle = T.waterH; ctx.fillRect(ox + ((Math.floor(hash(tx, ty, i) * 12) + waterFrame * 3) % 13), oy + 3 + i * 4, 3, 1); }
      const n = (dx, dy) => map.tileAt(tx + dx, ty + dy);
      ctx.fillStyle = T.shore;
      if (n(0, -1) !== 'water') ctx.fillRect(ox, oy, 16, 1);
      if (n(-1, 0) !== 'water') ctx.fillRect(ox, oy, 1, 16);
      if (n(1, 0) !== 'water') ctx.fillRect(ox + 15, oy, 1, 16);
      break;
    }
    case 'stone_wall': {
      const face = below !== 'stone_wall';
      ctx.fillStyle = T.wallTop; ctx.fillRect(ox, oy, 16, 16);
      ctx.fillStyle = T.wallTopH; ctx.fillRect(ox, oy, 16, 1);
      ctx.fillStyle = T.mortar;
      for (let row = 0; row < 4; row++) { ctx.fillRect(ox, oy + row * 4 + 3, 16, 1); ctx.fillRect(ox + ((row % 2) * 8 + 4), oy + row * 4, 1, 3); }
      if (face) {
        ctx.fillStyle = T.wallFace; ctx.fillRect(ox, oy + 9, 16, 7);
        ctx.fillStyle = T.wallFaceD; ctx.fillRect(ox, oy + 14, 16, 2);
        ctx.fillStyle = T.mortar; ctx.fillRect(ox, oy + 9, 16, 1); ctx.fillRect(ox + 5, oy + 10, 1, 4); ctx.fillRect(ox + 12, oy + 10, 1, 4);
      }
      break;
    }
    case 'rock':
      grass(ctx, ox, oy, tx, ty, false);
      ctx.fillStyle = 'rgba(10,6,16,0.35)'; ctx.fillRect(ox + 2, oy + 12, 13, 3);
      ctx.fillStyle = T.rockD; ctx.fillRect(ox + 1, oy + 3, 14, 11);
      ctx.fillStyle = T.rock; ctx.fillRect(ox + 2, oy + 2, 12, 9);
      ctx.fillStyle = T.rockH; ctx.fillRect(ox + 4, oy + 3, 5, 2);
      ctx.fillStyle = OUTLINE; ctx.fillRect(ox + 1, oy + 14, 14, 1);
      break;
    case 'tree': grass(ctx, ox, oy, tx, ty, true); break; // canopy is drawn as a y-sorted prop
    default: ctx.fillStyle = '#ff00ff'; ctx.fillRect(ox, oy, 16, 16); // missing tile = loud magenta
  }
}

export function buildTreeSprite() {
  const w = 26, h = 30, { c, ctx } = makeCanvas(w, h);
  const r = (x, y, ww, hh, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, ww, hh); };
  r(11, 19, 4, 9, T.trunk); r(12, 19, 1, 9, '#6b4a30');
  r(3, 6, 20, 13, T.leafD); r(5, 3, 16, 17, T.leafD); r(8, 1, 10, 2, T.leafD);
  r(5, 5, 15, 11, T.leaf); r(8, 2, 9, 4, T.leaf); r(7, 4, 6, 4, T.leafH); r(14, 8, 5, 3, T.leafH); r(5, 11, 4, 3, T.leafH);
  outline(ctx, w, h);
  return c;
}

/** Build every frame once at startup. */
export function buildSpriteBank() {
  const bank = { hero: {}, heroFlash: {}, wolf: {}, wolfFlash: {}, tree: buildTreeSprite() };
  for (const dir of ['down', 'up', 'right']) {
    for (const sword of [true, false]) for (let f = 0; f < 4; f++) {
      const { c, ctx } = makeCanvas(HERO_W, HERO_H);
      drawHero(ctx, dir, f, sword); outline(ctx, HERO_W, HERO_H);
      const key = `${dir}:${sword ? 's' : 'n'}:${f}`;
      bank.hero[key] = c; bank.heroFlash[key] = silhouette(c, HERO_W, HERO_H, '#ffffff');
      if (dir === 'right') {
        const lk = `left:${sword ? 's' : 'n'}:${f}`, m = mirror(c, HERO_W, HERO_H);
        bank.hero[lk] = m; bank.heroFlash[lk] = silhouette(m, HERO_W, HERO_H, '#ffffff');
      }
    }
  }
  for (const pose of ['idle', 'walk', 'windup', 'attack']) for (let f = 0; f < 4; f++) {
    const { c, ctx } = makeCanvas(WOLF_W, WOLF_H);
    drawWolf(ctx, f, pose); outline(ctx, WOLF_W, WOLF_H);
    const m = mirror(c, WOLF_W, WOLF_H);
    for (const [side, img] of [['right', c], ['left', m]]) {
      const key = `${side}:${pose}:${f}`;
      bank.wolf[key] = img; bank.wolfFlash[key] = silhouette(img, WOLF_W, WOLF_H, '#ffffff');
    }
  }
  return bank;
}

export function buildGroundLayers(map) {
  const layers = [0, 1, 2].map((frame) => {
    const { c, ctx } = makeCanvas(map.pixelWidth, map.pixelHeight);
    for (let ty = 0; ty < map.height; ty++) for (let tx = 0; tx < map.width; tx++) drawTile(ctx, map, tx, ty, frame);
    return c;
  });
  const props = [];
  for (let ty = 0; ty < map.height; ty++) for (let tx = 0; tx < map.width; tx++)
    if (map.tileAt(tx, ty) === 'tree') props.push({ kind: 'tree', x: tx * 16 + 8, y: ty * 16 + 14 });
  return { layers, props };
}
