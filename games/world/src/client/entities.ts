import * as THREE from "three";
import type { ItemDef, MonsterDef } from "../shared/content";

function canvasSprite(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void, worldHeight: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d")!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.scale.set(worldHeight * (width / height), worldHeight, 1);
  return sprite;
}

function disposeTree(root: THREE.Object3D) {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.Sprite) {
      obj.geometry.dispose();
      const mat = obj.material as THREE.Material & { map?: THREE.Texture | null };
      mat.map?.dispose();
      mat.dispose();
    }
  });
}

/** Placeholder monster art: a simple shape per `look.shape`, drawn once per instance. */
function drawMonster(ctx: CanvasRenderingContext2D, look: MonsterDef["look"]) {
  const c = look.color;
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.fillStyle = c;
  const eyes = (y: number, gap = 12) => {
    ctx.fillStyle = "#1d1d1d";
    ctx.fillRect(32 - gap / 2 - 4, y, 5, 7);
    ctx.fillRect(32 + gap / 2 - 1, y, 5, 7);
  };
  ctx.beginPath();
  switch (look.shape) {
    case "blob":
      ctx.moveTo(6, 60);
      ctx.bezierCurveTo(4, 20, 60, 20, 58, 60);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.beginPath(); ctx.ellipse(22, 36, 6, 4, -0.5, 0, Math.PI * 2); ctx.fill();
      eyes(42);
      break;
    case "hopper":
      ctx.ellipse(32, 46, 20, 16, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(22, 18, 5, 14, -0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(42, 18, 5, 14, 0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      eyes(40);
      break;
    case "shell":
      ctx.ellipse(32, 44, 28, 18, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#c9b38a";
      ctx.beginPath(); ctx.ellipse(32, 52, 26, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath(); ctx.moveTo(32, 26); ctx.lineTo(32, 44); ctx.moveTo(16, 34); ctx.lineTo(48, 34); ctx.stroke();
      eyes(48, 30);
      break;
    case "flyer":
      ctx.fillStyle = "rgba(230,240,255,0.75)";
      ctx.ellipse(18, 22, 13, 8, -0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(46, 22, 13, 8, 0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.ellipse(32, 38, 14, 16, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#2a2a2a";
      ctx.fillRect(19, 36, 26, 4); ctx.fillRect(20, 44, 24, 4);
      eyes(28, 10);
      break;
  }
}

function hpBarTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 10;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { canvas, texture };
}

/** A monster on screen: billboard body, shadow, HP bar while hurt. */
export class MonsterAvatar {
  readonly root = new THREE.Group();
  readonly target = new THREE.Vector3();
  /** The sprite raycasts hit; `userData.pick` says what it is. */
  readonly body: THREE.Sprite;
  private readonly hpBar: THREE.Sprite;
  private readonly hpCanvas: HTMLCanvasElement;
  private readonly hpTexture: THREE.CanvasTexture;
  private lastHpFraction = -1;
  private phase = Math.random() * 10;
  private hitFlashUntil = 0;

  constructor(readonly id: string, readonly def: MonsterDef) {
    const size = def.look.size;
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.3 * size, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    this.root.add(shadow);

    this.body = canvasSprite(64, 64, (ctx) => drawMonster(ctx, def.look), 1.1 * size);
    this.body.center.set(0.5, 0);
    this.body.userData.pick = { kind: "monster", id };
    this.root.add(this.body);

    const { canvas, texture } = hpBarTexture();
    this.hpCanvas = canvas;
    this.hpTexture = texture;
    this.hpBar = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
    this.hpBar.scale.set(0.8, 0.125, 1);
    this.hpBar.center.set(0.5, -(1.1 * size + 0.1) / 0.125);
    this.hpBar.renderOrder = 9;
    this.hpBar.visible = false;
    this.root.add(this.hpBar);
  }

  setHp(hp: number, maxHp: number) {
    const f = maxHp > 0 ? hp / maxHp : 0;
    if (f === this.lastHpFraction) return;
    if (this.lastHpFraction >= 0 && f < this.lastHpFraction) this.hitFlashUntil = performance.now() + 120;
    this.lastHpFraction = f;
    this.hpBar.visible = f < 1;
    const ctx = this.hpCanvas.getContext("2d")!;
    ctx.clearRect(0, 0, 64, 10);
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, 0, 64, 10);
    ctx.fillStyle = f > 0.5 ? "#5ad46a" : f > 0.25 ? "#e8c34f" : "#e8574f";
    ctx.fillRect(2, 2, Math.round(60 * f), 6);
    this.hpTexture.needsUpdate = true;
  }

  update(dt: number, moving: boolean, now: number) {
    const pos = this.root.position;
    if (pos.distanceToSquared(this.target) > 9) pos.copy(this.target);
    else pos.lerp(this.target, 1 - Math.exp(-dt * 12));
    this.phase += dt * (moving ? 12 : 3);
    const bob = this.def.look.shape === "flyer" ? 0.35 + Math.sin(this.phase) * 0.08 : moving ? Math.abs(Math.sin(this.phase)) * 0.1 : 0;
    this.body.position.y = bob;
    this.body.material.color.setHex(now < this.hitFlashUntil ? 0xff8080 : 0xffffff);
  }

  dispose() {
    disposeTree(this.root);
  }
}

/** A dropped item: a small spinning gem in the item's colour. */
export class ItemMarker {
  readonly root = new THREE.Group();
  readonly mesh: THREE.Mesh;
  private t = Math.random() * 10;

  constructor(readonly id: string, def: ItemDef | undefined) {
    this.mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.14),
      new THREE.MeshLambertMaterial({ color: def?.color ?? "#ffffff", emissive: def?.color ?? "#ffffff", emissiveIntensity: 0.35 }),
    );
    this.mesh.userData.pick = { kind: "item", id };
    this.root.add(this.mesh);
  }

  update(dt: number) {
    this.t += dt;
    this.mesh.rotation.y += dt * 2;
    this.mesh.position.y = 0.22 + Math.sin(this.t * 3) * 0.05;
  }

  dispose() {
    disposeTree(this.root);
  }
}

/** Floating damage numbers, RO style. */
export class DamageTexts {
  readonly root = new THREE.Group();
  private active: Array<{ sprite: THREE.Sprite; born: number; vx: number }> = [];

  spawn(at: THREE.Vector3, text: string, color: string, now: number) {
    const sprite = canvasSprite(128, 48, (ctx) => {
      ctx.font = "800 36px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 6;
      ctx.strokeStyle = "rgba(0,0,0,0.8)";
      ctx.strokeText(text, 64, 24);
      ctx.fillStyle = color;
      ctx.fillText(text, 64, 24);
    }, 0.42);
    sprite.material.depthTest = false;
    sprite.renderOrder = 20;
    sprite.position.copy(at).add(new THREE.Vector3(0, 1.2, 0));
    this.root.add(sprite);
    this.active.push({ sprite, born: now, vx: (Math.random() - 0.5) * 0.6 });
  }

  update(dt: number, now: number) {
    this.active = this.active.filter((d) => {
      const age = (now - d.born) / 1000;
      if (age > 0.9) {
        this.root.remove(d.sprite);
        d.sprite.material.map?.dispose();
        d.sprite.material.dispose();
        return false;
      }
      d.sprite.position.y += dt * 1.4;
      d.sprite.position.x += d.vx * dt;
      d.sprite.material.opacity = 1 - Math.max(0, age - 0.5) / 0.4;
      return true;
    });
  }
}
