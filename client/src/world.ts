import * as THREE from "three";
import { type GameMap, type PropType } from "../../shared/map.ts";
import { lookOf } from "./themes.ts";
import { TILE_PX, PAD, drawGround } from "./tiles.ts";
import { building, decor, glow, propArt, type Art } from "./props2d.ts";
import { hash } from "./pix.ts";

// Map renderer, 2D top-down. Cell (x, y) is world (x, ·, y), 1 cell = 1 unit = TILE_PX art pixels; the camera looks straight down
// with map-north up and cannot rotate. The ground is one picture drawn in code (tiles.ts); trees, rocks, buildings and the rest are
// upright sprites (props2d.ts) anchored where they meet the ground. Depth is the sprite's world y, which grows with its south
// coordinate (heightAt below), so whatever is further south is drawn in front: units walk behind trees and in front of walls.

/** The sort height of a thing standing at world z: units, props and effects all use it, so south is in front. */
export const depthOf = (z: number) => z * 0.002;
/** Height of the drawn ground at (x, z): the depth value units and items sit at (the ground itself is flat). */
export function heightAt(_m: GameMap | undefined, _x: number, z: number) { return depthOf(z) + 0.02; }

export function tickWorld(t: number, _camera?: unknown, _height?: number) { flicker(t); }
/** Props no longer fade for the fight: the view is top-down and nothing hides a unit for long. */
export function setSeeThrough(..._args: unknown[]) { /* kept for the callers */ }

const sprites = new Map<string, { mat: THREE.SpriteMaterial; w: number; h: number; foot: number }>();
function spriteFor(key: string, make: () => Art | undefined) {
  let s = sprites.get(key);
  if (!s) {
    const art = make();
    if (!art) return undefined;
    const tex = new THREE.CanvasTexture(art.canvas);
    tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
    s = { mat: new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.4 }), w: art.canvas.width, h: art.canvas.height, foot: art.foot };
    sprites.set(key, s);
  }
  return s;
}
function place(group: THREE.Group, s: NonNullable<ReturnType<typeof spriteFor>>, x: number, z: number, name = "prop") {
  const sp = new THREE.Sprite(s.mat);
  sp.center.set(0.5, 1 - s.foot / s.h);
  sp.scale.set(s.w / TILE_PX, s.h / TILE_PX, 1);
  sp.position.set(x, depthOf(z), z);
  sp.name = name;
  group.add(sp);
  return sp;
}

const flames: { glow: THREE.Sprite; base: number; seed: number }[] = [];
function flicker(t: number) { for (const f of flames) f.glow.material.opacity = f.base * (0.85 + Math.sin(t * 9 + f.seed) * 0.08 + Math.sin(t * 23 + f.seed * 2) * 0.07); }
let glowTex: THREE.CanvasTexture | undefined;

export function buildWorld(m: GameMap) {
  const group = new THREE.Group();
  const ground = drawGround(m), pal = ground.pal, look = lookOf(m.theme);
  flames.length = 0;

  // the ground: one flat plane under everything
  const W = m.w + PAD * 2, H = m.h + PAD * 2;
  const tex = new THREE.CanvasTexture(ground.canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(W, H).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex }));
  plane.position.set((m.w - 1) / 2, 0, (m.h - 1) / 2);
  plane.name = "ground";
  group.add(plane);

  const wall = pal.wall;
  // what stands on the map: the server's blocking props
  const taken = new Set<number>();
  for (const p of m.props) {
    taken.add(p.y * m.w + p.x);
    const h = ((p.x * 73856093) ^ (p.y * 19349663)) >>> 0, u = (h % 997) / 997;
    const key = `${p.type}:${m.theme ?? "town"}:${p.type === "tree" || p.type === "rock" ? Math.floor(u * 6) : h % 3}`;
    const s = spriteFor(key, () => propArt(p.type as PropType, p.type === "tree" || p.type === "rock" ? (Math.floor(u * 6) + 0.5) / 6 : u, h, pal, m.theme));
    if (!s) continue;
    const big = p.type === "house" || p.type === "housebig";
    place(group, s, p.x, p.y + (big ? 1.4 : p.type === "stair" ? 0.5 : 0.36), p.type === "stair" ? "stair" : "prop");
    if (p.type === "torch") addGlow(group, p.x, p.y);
  }

  // the town: buildings and street furniture
  if (m.town) {
    for (const b of m.town.buildings) {
      const s = spriteFor(`bld:${b.x0},${b.y0}`, () => building(b));
      if (s) place(group, s, (b.x0 + b.x1) / 2, b.y1 + 0.46, "building");
    }
    let i = 0;
    for (const d of m.town.decor) {
      const seed = (d.x * 31 + d.y * 17) >>> 0;
      const s = spriteFor(`dec:${d.type}:${d.tint ?? 0}:${d.type === "tree" ? seed % 3 : 0}`, () => decor(d, seed, pal));
      if (!s) continue;
      const z = d.y + (d.type === "fountain" ? 1.3 : d.type === "tower" ? 0.6 : 0.4);
      place(group, s, d.x, z, "decor");
      if (d.type === "brazier" || d.type === "lamp") addGlow(group, d.x, d.y - (d.type === "lamp" ? 0.8 : 0.2), d.type === "lamp" ? "255, 225, 150" : "255, 150, 60", 0.5);
      i++;
    }
  }

  // the woods (or rock) around the map: dense at the edge, thinning outward
  if (look.ring.length) {
    for (let y = -PAD + 1; y < m.h + PAD - 1; y++) for (let x = -PAD + 1; x < m.w + PAD - 1; x++) {
      if (x >= 0 && y >= 0 && x < m.w && y < m.h) continue;
      const d = Math.max(-x, x - (m.w - 1), -y, y - (m.h - 1));
      const p = d <= 2 ? 0.8 : d <= 5 ? 0.5 : 0.22;
      if (hash(x, y, 91) > p) continue;
      const type = look.ring[Math.floor(hash(x, y, 92) * look.ring.length)], h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0, u = hash(x, y, 93);
      const key = `${type}:${m.theme ?? "town"}:${Math.floor(u * 6)}`;
      const s = spriteFor(key, () => propArt(type, (Math.floor(u * 6) + 0.5) / 6, h, pal, m.theme));
      if (s) place(group, s, x + (hash(x, y, 94) - 0.5) * 0.7, y + 0.36 + (hash(x, y, 95) - 0.5) * 0.4, "ring");
    }
  }
  void wall; void taken;
  return { group, ground: plane };
}

function addGlow(group: THREE.Group, x: number, y: number, color = "255, 170, 80", op = 0.75) {
  if (!glowTex) glowTex = new THREE.CanvasTexture(glow(color));
  const tex = color === "255, 170, 80" ? glowTex : new THREE.CanvasTexture(glow(color));
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
  sp.scale.set(4.2, 4.2, 1);
  sp.center.set(0.5, 0.5);
  sp.position.set(x, 0.9, y - 0.5);
  sp.renderOrder = 40;
  sp.name = "glow";
  group.add(sp);
  flames.push({ glow: sp, base: op, seed: x * 7 + y * 13 });
}
