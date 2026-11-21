import * as THREE from "three";

export const PLAYER_PALETTE = ["#e8574f", "#4f8fe8", "#e8c34f", "#57c46b", "#b06be0", "#e88a4f", "#4fd1d9", "#e86bb4"];

const SPRITE_HEIGHT = 1.5;
const CHAT_BUBBLE_MS = 5000;

function textSprite(text: string, opts: { font: number; color: string; background?: string; maxWidth?: number }): THREE.Sprite {
  const scale = 2; // canvas pixels per CSS pixel, for crisp text
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const font = `600 ${opts.font * scale}px system-ui, "Noto Sans Thai", sans-serif`;
  ctx.font = font;
  const pad = 6 * scale;
  const maxWidth = (opts.maxWidth ?? 400) * scale;

  // Wrap words; Thai has no spaces, so fall back to wrapping by character.
  const lines: string[] = [];
  let line = "";
  for (const ch of Array.from(text)) {
    if (ctx.measureText(line + ch).width > maxWidth && line) {
      lines.push(line);
      line = ch.trimStart();
    } else line += ch;
  }
  if (line) lines.push(line);

  const lineHeight = opts.font * scale * 1.3;
  const width = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2);
  const height = Math.ceil(lines.length * lineHeight + pad * 2 - (lineHeight - opts.font * scale));
  canvas.width = width;
  canvas.height = height;
  ctx.font = font;
  if (opts.background) {
    ctx.fillStyle = opts.background;
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, 8 * scale);
    ctx.fill();
  }
  ctx.textBaseline = "top";
  ctx.textAlign = "center";
  ctx.lineWidth = 4 * scale;
  ctx.strokeStyle = "rgba(0,0,0,0.65)";
  lines.forEach((l, i) => {
    const y = pad + i * lineHeight;
    if (!opts.background) ctx.strokeText(l, width / 2, y);
    ctx.fillStyle = opts.color;
    ctx.fillText(l, width / 2, y);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  const worldPerPixel = 0.014 / scale;
  sprite.scale.set(width * worldPerPixel, height * worldPerPixel, 1);
  sprite.renderOrder = 10;
  return sprite;
}

/** Simple placeholder character drawn on a canvas: body + head + eyes. */
function bodyTexture(color: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 96;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(14, 40, 36, 52, 14);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#f6d7b8";
  ctx.beginPath();
  ctx.arc(32, 26, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#222";
  ctx.fillRect(23, 24, 5, 7);
  ctx.fillRect(36, 24, 5, 7);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function disposeSprite(sprite: THREE.Sprite) {
  sprite.material.map?.dispose();
  sprite.material.dispose();
}

/**
 * A player on screen: a camera-facing sprite (RO-style billboard) standing
 * on the 3D ground, with a blob shadow, a facing marker, a name label below
 * and a chat bubble above.
 */
export class Avatar {
  readonly root = new THREE.Group();
  /** Position the server last reported, in world space. */
  readonly target = new THREE.Vector3();
  private readonly body: THREE.Sprite;
  private readonly facing: THREE.Mesh;
  private readonly label: THREE.Sprite;
  private bubble: THREE.Sprite | null = null;
  private bubbleUntil = 0;
  private walkPhase = 0;

  constructor(name: string, colorIndex: number, isLocal: boolean) {
    const color = PLAYER_PALETTE[colorIndex % PLAYER_PALETTE.length];

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.32, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    this.root.add(shadow);

    const marker = new THREE.Shape();
    marker.moveTo(0, 0.55);
    marker.lineTo(-0.14, 0.36);
    marker.lineTo(0.14, 0.36);
    this.facing = new THREE.Mesh(
      new THREE.ShapeGeometry(marker),
      new THREE.MeshBasicMaterial({ color: isLocal ? 0xffffff : color, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }),
    );
    // Shape is drawn in XY; lay it flat so +Y of the shape points along +Z (south).
    this.facing.geometry.rotateX(Math.PI / 2);
    this.facing.position.y = 0.03;
    this.root.add(this.facing);

    this.body = new THREE.Sprite(new THREE.SpriteMaterial({ map: bodyTexture(color), transparent: true }));
    this.body.center.set(0.5, 0);
    this.body.scale.set(SPRITE_HEIGHT * (64 / 96), SPRITE_HEIGHT, 1);
    this.root.add(this.body);

    this.label = textSprite(name, { font: 13, color: isLocal ? "#ffe680" : "#ffffff" });
    // Offsets go through `center` (camera-facing units), not position.y, which
    // the tilted camera foreshortens while the sprites themselves are not.
    this.label.center.set(0.5, 1 + 0.05 / this.label.scale.y);
    this.root.add(this.label);
  }

  /** Facing 0..7, clockwise from south. */
  setFacing(dir: number) {
    this.facing.rotation.y = -(dir * Math.PI) / 4;
  }

  say(text: string, now: number) {
    if (this.bubble) {
      this.root.remove(this.bubble);
      disposeSprite(this.bubble);
    }
    this.bubble = textSprite(text, { font: 14, color: "#1d2330", background: "rgba(255,255,255,0.92)", maxWidth: 220 });
    this.bubble.center.set(0.5, -(SPRITE_HEIGHT + 0.15) / this.bubble.scale.y);
    this.root.add(this.bubble);
    this.bubbleUntil = now + CHAT_BUBBLE_MS;
  }

  update(dt: number, moving: boolean, now: number) {
    const pos = this.root.position;
    if (pos.distanceToSquared(this.target) > 9) pos.copy(this.target);
    else pos.lerp(this.target, 1 - Math.exp(-dt * 14));

    this.walkPhase = moving ? this.walkPhase + dt * 14 : 0;
    this.body.position.y = moving ? Math.abs(Math.sin(this.walkPhase)) * 0.08 : 0;

    if (this.bubble && now > this.bubbleUntil) {
      this.root.remove(this.bubble);
      disposeSprite(this.bubble);
      this.bubble = null;
    }
  }

  dispose() {
    this.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      } else if (obj instanceof THREE.Sprite) {
        disposeSprite(obj);
      }
    });
  }
}
