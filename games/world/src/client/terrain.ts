import * as THREE from "three";
import type { GameMap } from "../shared";

/** Deterministic per-cell noise so the same map always looks the same. */
function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Builds the 3D ground and props for a map. World space: cell (x, y) covers
 * x..x+1 on the X axis and y..y+1 on the Z axis; Y is up.
 */
export function buildTerrain(map: GameMap): { group: THREE.Group; ground: THREE.Mesh } {
  const group = new THREE.Group();
  const { width: w, height: h } = map;

  // Ground: one plane with a texel per cell.
  const data = new Uint8Array(w * h * 4);
  const color = new THREE.Color();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      color.setHex(map.tileAt(x, y)!.color).offsetHSL(0, 0, (hash(x, y) - 0.5) * 0.06);
      // PlaneGeometry rotated flat puts texture row 0 at the far (max Z) edge.
      const i = ((h - 1 - y) * w + x) * 4;
      data[i] = color.r * 255;
      data[i + 1] = color.g * 255;
      data[i + 2] = color.b * 255;
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, w, h);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshLambertMaterial({ map: texture }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(w / 2, 0, h / 2);
  group.add(ground);

  // Faint cell grid, like RO's walkable-cell feel.
  const lines: number[] = [];
  for (let x = 0; x <= w; x++) lines.push(x, 0.01, 0, x, 0.01, h);
  for (let y = 0; y <= h; y++) lines.push(0, 0.01, y, w, 0.01, y);
  const gridGeometry = new THREE.BufferGeometry();
  gridGeometry.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
  group.add(new THREE.LineSegments(gridGeometry, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.08 })));

  // Props as instanced meshes: one draw call per prop kind.
  const trees: Array<[number, number]> = [];
  const rocks: Array<[number, number]> = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const prop = map.tileAt(x, y)!.prop;
      if (prop === "tree") trees.push([x, y]);
      else if (prop === "rock") rocks.push([x, y]);
    }
  }
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 0.8, 6), new THREE.MeshLambertMaterial({ color: 0x7a5230 }), trees.length);
  const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(0.55, 1.6, 7), new THREE.MeshLambertMaterial({ color: 0x2f6f3a }), trees.length);
  trees.forEach(([x, y], i) => {
    const size = 0.8 + hash(x, y) * 0.5;
    q.setFromAxisAngle(up, hash(y, x) * Math.PI * 2);
    s.setScalar(size);
    m.compose(p.set(x + 0.5, 0.4 * size, y + 0.5), q, s);
    trunks.setMatrixAt(i, m);
    m.compose(p.set(x + 0.5, (0.8 + 0.8) * size, y + 0.5), q, s);
    crowns.setMatrixAt(i, m);
  });
  group.add(trunks, crowns);

  const rockMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.4), new THREE.MeshLambertMaterial({ color: 0x8a8d91, flatShading: true }), rocks.length);
  rocks.forEach(([x, y], i) => {
    const size = 0.8 + hash(x, y) * 0.6;
    q.setFromAxisAngle(up, hash(y, x) * Math.PI * 2);
    s.set(size, size * 0.7, size);
    m.compose(p.set(x + 0.5, 0.2 * size, y + 0.5), q, s);
    rockMesh.setMatrixAt(i, m);
  });
  group.add(rockMesh);

  return { group, ground };
}
