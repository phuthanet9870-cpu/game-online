import * as THREE from "three";
import type { GameMap } from "../shared";
import { Avatar } from "./avatar";
import { OrbitFollowCamera } from "./camera";
import { buildTerrain } from "./terrain";

const CLICK_DRAG_PX = 6;

/** World-space position of a cell-unit position (cell centres sit at +0.5). */
export function toWorld(x: number, y: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(x + 0.5, 0, y + 0.5);
}

/**
 * Owns the Three.js renderer, scene and input for one map. Knows nothing
 * about the network: it reports clicked cells and draws what it is told.
 */
export class WorldView {
  readonly avatars = new Map<string, Avatar>();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly rig: OrbitFollowCamera;
  private readonly ground: THREE.Mesh;
  private readonly hover: THREE.Mesh;
  private readonly clickMarker: THREE.Mesh;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly keys = new Set<string>();
  private localId: string | null = null;
  private frame = 0;
  private lastTime = performance.now();
  private markerUntil = 0;
  private readonly cleanup: Array<() => void> = [];

  constructor(
    private readonly container: HTMLElement,
    private readonly map: GameMap,
    private readonly onCellClick: (x: number, y: number) => void,
    private readonly isTyping: () => boolean,
    private readonly perFrame: (dt: number, now: number) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.append(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x9cc7e8);
    this.scene.fog = new THREE.Fog(0x9cc7e8, 45, 90);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x5a6b48, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(-20, 40, 10);
    this.scene.add(sun);

    const terrain = buildTerrain(map);
    this.ground = terrain.ground;
    this.scene.add(terrain.group);

    const square = new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2);
    this.hover = new THREE.Mesh(square, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false }));
    this.hover.position.y = 0.015;
    this.hover.visible = false;
    this.clickMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.32, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xfff27a, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    this.clickMarker.position.y = 0.02;
    this.clickMarker.visible = false;
    this.scene.add(this.hover, this.clickMarker);

    this.rig = new OrbitFollowCamera(container.clientWidth / Math.max(1, container.clientHeight));
    this.rig.snapTo(toWorld(map.spawn.x, map.spawn.y));

    this.bindInput();
    // First frame on the next tick, so callers finish wiring perFrame's dependencies.
    this.frame = requestAnimationFrame(this.loop);
  }

  setLocalPlayer(sessionId: string) {
    this.localId = sessionId;
    const avatar = this.avatars.get(sessionId);
    if (avatar) this.rig.snapTo(avatar.target);
  }

  addAvatar(sessionId: string, avatar: Avatar) {
    this.avatars.set(sessionId, avatar);
    avatar.root.position.copy(avatar.target);
    this.scene.add(avatar.root);
    if (sessionId === this.localId) this.rig.snapTo(avatar.target);
  }

  removeAvatar(sessionId: string) {
    const avatar = this.avatars.get(sessionId);
    if (!avatar) return;
    this.scene.remove(avatar.root);
    avatar.dispose();
    this.avatars.delete(sessionId);
  }

  private cellUnderPointer(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.rig.camera);
    const hit = this.raycaster.intersectObject(this.ground)[0];
    if (!hit) return null;
    const x = Math.floor(hit.point.x);
    const y = Math.floor(hit.point.z);
    return this.map.inBounds(x, y) ? { x, y } : null;
  }

  private bindInput() {
    const canvas = this.renderer.domElement;
    let down: { x: number; y: number; button: number; lastX: number } | null = null;

    const on = <K extends keyof HTMLElementEventMap>(target: HTMLElement | Window, type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      target.addEventListener(type, fn as EventListener, opts);
      this.cleanup.push(() => target.removeEventListener(type, fn as EventListener, opts));
    };

    on(canvas, "contextmenu", (e) => e.preventDefault());
    on(canvas, "pointerdown", (e) => {
      down = { x: e.clientX, y: e.clientY, button: e.button, lastX: e.clientX };
      canvas.setPointerCapture(e.pointerId);
    });
    on(canvas, "pointermove", (e) => {
      if (down && down.button === 2) {
        this.rig.rotate((e.clientX - down.lastX) * -0.008);
        down.lastX = e.clientX;
      }
      const cell = this.cellUnderPointer(e.clientX, e.clientY);
      this.hover.visible = cell !== null;
      if (cell) {
        this.hover.position.x = cell.x + 0.5;
        this.hover.position.z = cell.y + 0.5;
        (this.hover.material as THREE.MeshBasicMaterial).color.setHex(this.map.isWalkable(cell.x, cell.y) ? 0xffffff : 0xff4040);
      }
    });
    on(canvas, "pointerup", (e) => {
      const start = down;
      down = null;
      if (!start || start.button !== 0) return;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > CLICK_DRAG_PX) return;
      const cell = this.cellUnderPointer(e.clientX, e.clientY);
      if (!cell || !this.map.isWalkable(cell.x, cell.y)) return;
      this.clickMarker.position.x = cell.x + 0.5;
      this.clickMarker.position.z = cell.y + 0.5;
      this.clickMarker.visible = true;
      this.markerUntil = performance.now() + 600;
      this.onCellClick(cell.x, cell.y);
    });
    on(canvas, "pointerleave", () => (this.hover.visible = false));
    on(canvas, "wheel", (e) => {
      e.preventDefault();
      this.rig.zoom(e.deltaY);
    }, { passive: false });
    on(window, "keydown", (e) => {
      if (!this.isTyping()) this.keys.add(e.key.toLowerCase());
    });
    on(window, "keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    on(window, "blur", () => this.keys.clear());
    on(window, "resize", () => {
      this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
      this.rig.resize(this.container.clientWidth / Math.max(1, this.container.clientHeight));
    });
  }

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;

    if (this.isTyping()) this.keys.clear();
    if (this.keys.has("q")) this.rig.rotate(dt * 1.8);
    if (this.keys.has("e")) this.rig.rotate(-dt * 1.8);

    this.perFrame(dt, now);

    const local = this.localId ? this.avatars.get(this.localId) : undefined;
    if (local) this.rig.update(local.root.position, dt);
    if (this.clickMarker.visible) {
      const left = (this.markerUntil - now) / 600;
      if (left <= 0) this.clickMarker.visible = false;
      else this.clickMarker.scale.setScalar(0.6 + left * 0.6);
    }
    this.renderer.render(this.scene, this.rig.camera);
  };

  dispose() {
    cancelAnimationFrame(this.frame);
    this.cleanup.forEach((fn) => fn());
    for (const id of [...this.avatars.keys()]) this.removeAvatar(id);
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments || obj instanceof THREE.InstancedMesh) {
        obj.geometry.dispose();
        const material = obj.material as THREE.Material & { map?: THREE.Texture | null };
        material.map?.dispose();
        material.dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
