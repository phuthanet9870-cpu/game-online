// The login / character screens' backdrop, drawn in code as one small pixel-art picture (shown scaled up, crisp): a sky,
// clouds, the tower the game climbs, hills, a meadow and a line-up of the code-drawn characters (pixelchar.ts).
import { CELL, pixelLook } from "../pixelchar.ts";
import type { Look } from "../../../shared/look.ts";

const W = 400, H = 225; // 16:9, scaled up to cover the screen

function rng(seed: number) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function drawBackdrop(): string {
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  const r = rng(7);
  // sky: banded gradient (pixel-art skies step, they do not blend)
  const sky = ["#5aa9f0", "#69b3f2", "#7cbef4", "#8fc8f5", "#a3d2f6", "#b7dcf7", "#cbe6f8"];
  sky.forEach((c, i) => { g.fillStyle = c; g.fillRect(0, i * 18, W, 18); });
  g.fillStyle = "#d9edf8"; g.fillRect(0, sky.length * 18, W, H);
  // sun
  g.fillStyle = "#fff6c9"; disc(g, 330, 38, 13); g.fillStyle = "#fffbe6"; disc(g, 330, 38, 9);
  // clouds
  for (let i = 0; i < 6; i++) cloud(g, Math.floor(r() * W), 14 + Math.floor(r() * 60), 0.7 + r() * 0.8);
  // the tower: a tall stepped spire on the far hills
  const tx = 92;
  g.fillStyle = "#8ea3c9";
  for (let y = 18, w = 10; y < 150; y += 12, w += 2) g.fillRect(tx - w / 2, y, w, 12);
  g.fillStyle = "#7a90b8";
  for (let y = 18, w = 10; y < 150; y += 12, w += 2) g.fillRect(tx, y, w / 2, 12);
  g.fillStyle = "#b5c6e6"; for (let y = 22; y < 148; y += 12) g.fillRect(tx - 2, y + 3, 2, 3); // windows
  g.fillStyle = "#ffd54a"; g.fillRect(tx - 1, 10, 2, 8); g.fillRect(tx - 3, 12, 6, 2); // beacon
  // hills: two layers
  hills(g, 150, "#8cc58a", 18, r);
  hills(g, 166, "#6fb26c", 12, r);
  // meadow
  g.fillStyle = "#5ea65a"; g.fillRect(0, 178, W, H - 178);
  g.fillStyle = "#4f9a4c"; for (let i = 0; i < 260; i++) g.fillRect(Math.floor(r() * W), 180 + Math.floor(r() * (H - 182)), 2, 1);
  g.fillStyle = "#8fd08a"; for (let i = 0; i < 120; i++) g.fillRect(Math.floor(r() * W), 178 + Math.floor(r() * 4), 1, 1);
  for (let i = 0; i < 26; i++) { g.fillStyle = ["#fff3b0", "#ffb3c7", "#ffffff"][i % 3]; g.fillRect(Math.floor(r() * W), 186 + Math.floor(r() * 36), 1, 1); }
  // a line-up of adventurers (front idle frame of each look), standing on the meadow with soft shadows
  const crew: Look[] = [
    { gender: "M", hair: 0, style: 0, outfit: "Swordman", job: "Swordman", weapon: "sword", shield: "guard" },
    { gender: "F", hair: 4, style: 2, outfit: "Archer", job: "Archer", weapon: "bow" },
    { gender: "F", hair: 6, style: 3, outfit: "Mage", job: "Mage", weapon: "rod" },
    { gender: "M", hair: 2, style: 0, outfit: "Novice", job: "Novice", weapon: "knife" },
    { gender: "F", hair: 7, style: 5, outfit: "Acolyte", job: "Acolyte", weapon: "mace" },
    { gender: "M", hair: 1, style: 4, outfit: "Thief", job: "Thief", weapon: "dagger" },
  ];
  const step = 32, baseX = Math.round((W - (crew.length - 1) * step) / 2);
  crew.forEach((look, i) => {
    const sheet = pixelLook(look).act, x = baseX + i * step - CELL / 2, y = 208 - CELL + ((i % 2) * 4);
    g.fillStyle = "rgba(30, 70, 30, 0.35)"; g.fillRect(x + 16, y + CELL - 4, 16, 3);
    g.drawImage(sheet.img, 0, (i % 3 === 1 ? 1 : 0) * CELL, CELL, CELL, x, y, CELL, CELL);
  });
  return cv.toDataURL();
}

function disc(g: CanvasRenderingContext2D, cx: number, cy: number, rad: number) {
  for (let y = -rad; y <= rad; y++) { const w = Math.round(Math.sqrt(rad * rad - y * y)); g.fillRect(cx - w, cy + y, w * 2, 1); }
}
function cloud(g: CanvasRenderingContext2D, x: number, y: number, k: number) {
  g.fillStyle = "#ffffff";
  for (const [dx, dy, rr] of [[0, 4, 7], [9, 0, 9], [20, 3, 8], [29, 6, 6]] as const) disc(g, Math.round(x + dx * k), Math.round(y + dy * k), Math.round(rr * k));
  g.fillStyle = "#e3f1fb"; g.fillRect(Math.round(x - 6 * k), Math.round(y + 9 * k), Math.round(42 * k), Math.max(1, Math.round(2 * k)));
}
function hills(g: CanvasRenderingContext2D, base: number, color: string, amp: number, r: () => number) {
  g.fillStyle = color;
  let h = amp / 2;
  for (let x = 0; x < W; x += 2) {
    h += (r() - 0.5) * 3; h = Math.max(2, Math.min(amp, h));
    g.fillRect(x, base - Math.round(h + Math.sin(x / 37) * amp * 0.4), 2, H);
  }
}

/** Sets the backdrop on the login / select / create screens (style.css reads --backdrop). */
export function applyBackdrop() {
  try {
    document.documentElement.style.setProperty("--backdrop", `url(${drawBackdrop()})`);
  } catch (e) { console.warn("[backdrop]", e); }
}
