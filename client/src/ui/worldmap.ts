// The map window (M): "This map" = the current map large, with you, other players, monsters, NPCs (named) and the exits
// (labelled with where they lead); click a spot to walk there. "World" = every map of the tower as a chart: floors, level
// bands, towns, how maps connect, and where you are. Esc or M closes it.
import "./worldmap.css";
import type { GameMap } from "../../../shared/map.ts";
import { MAP_INFO, MAP_NAMES, WARPS, type MapName } from "../../../shared/maps.ts";
import { terrainImage, terrainTiles, type Dot } from "./hud.ts";
import { npcSpots } from "../worldItems.ts";
import { play } from "../audio.ts";

type Hooks = { walkTo: (x: number, y: number) => void; inGame: () => boolean; npcName: (id: string) => string };
let hooks: Hooks;
let root: HTMLElement, cv: HTMLCanvasElement, worldBox: HTMLElement, titleEl: HTMLElement, subEl: HTMLElement, posEl: HTMLElement;
let tab: "local" | "world" = "local";
let current: { m: GameMap; name: MapName; img?: HTMLCanvasElement; scale: number } | undefined;
let last: { dots: Dot[]; me: { x: number; y: number } } | undefined;
let hover: { x: number; y: number } | undefined;

const MAX_PX = 620; // the local map's longest side on screen

export function initWorldMap(h: Hooks) {
  hooks = h;
  root = document.createElement("div");
  root.id = "worldmap";
  root.hidden = true;
  root.innerHTML = `
    <div class="wm-panel" role="dialog" aria-label="Map">
      <header class="wm-head">
        <div class="wm-titles"><h2 class="wm-title"></h2><span class="wm-sub"></span></div>
        <div class="wm-tabs" role="tablist">
          <button role="tab" data-tab="local" class="on">This map</button>
          <button role="tab" data-tab="world">World</button>
        </div>
        <button class="wm-close" aria-label="Close map">✕</button>
      </header>
      <div class="wm-body">
        <div class="wm-local"><canvas></canvas><div class="wm-legend">
          <span><i class="k-me"></i>You</span><span><i class="k-pc"></i>Players</span><span><i class="k-mob"></i>Monsters</span>
          <span><i class="k-npc"></i>NPCs</span><span><i class="k-warp"></i>Exits</span><span class="wm-pos"></span></div>
          <p class="wm-hint">Click anywhere on the map to walk there.</p></div>
        <div class="wm-world" hidden></div>
      </div>
    </div>`;
  document.body.append(root);
  cv = root.querySelector("canvas")!;
  worldBox = root.querySelector(".wm-world")!;
  titleEl = root.querySelector(".wm-title")!;
  subEl = root.querySelector(".wm-sub")!;
  posEl = root.querySelector(".wm-pos")!;
  root.querySelector(".wm-close")!.addEventListener("click", () => toggleWorldMap(false));
  root.addEventListener("pointerdown", (e) => { if (e.target === root) toggleWorldMap(false); });
  for (const b of root.querySelectorAll<HTMLButtonElement>(".wm-tabs button")) b.addEventListener("click", () => setTab(b.dataset.tab as "local" | "world"));
  cv.addEventListener("pointermove", (e) => { hover = cellAt(e); draw(); });
  cv.addEventListener("pointerleave", () => { hover = undefined; draw(); });
  cv.addEventListener("click", (e) => {
    const c = cellAt(e);
    if (!c || !current) return;
    hooks.walkTo(c.x, c.y);
    play("sfx", "click", 0.35);
  });
  addEventListener("keydown", (e) => {
    if ((e.target as HTMLElement).closest("input, textarea") || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.code === "KeyM" && hooks.inGame()) { e.preventDefault(); toggleWorldMap(); }
    else if (e.key === "Escape" && !root.hidden) { e.stopImmediatePropagation(); toggleWorldMap(false); }
  }, true);
}

export const worldMapOpen = () => !!root && !root.hidden;

export function toggleWorldMap(on = root.hidden) {
  if (!root) return;
  root.hidden = !on;
  play("sfx", on ? "ui_open" : "ui_close", 0.4);
  if (on) { render(); }
}

function setTab(t: "local" | "world") {
  tab = t;
  for (const b of root.querySelectorAll<HTMLButtonElement>(".wm-tabs button")) b.classList.toggle("on", b.dataset.tab === t);
  render();
}

/** The map the player is on (called with the minimap's). */
export function setWorldMapMap(m: GameMap, name: MapName) {
  const scale = Math.min(MAX_PX / m.w, MAX_PX / m.h);
  current = { m, name, scale };
  // drawn on first open: the large terrain image is a few hundred ms on big maps (the login screen loads a map before init)
  if (root && !root.hidden) render();
}

/** Live positions (same feed as the minimap, ~10 per second); redraws only while the window is open. */
export function updateWorldMap(dots: Dot[], me: { x: number; y: number }) {
  last = { dots, me };
  if (root && !root.hidden && tab === "local") draw();
}

function render() {
  if (!current) return;
  const info = MAP_INFO[current.name];
  titleEl.textContent = tab === "local" ? info.title : "The Tower";
  subEl.textContent = tab === "local" ? info.sub : "3 floors · 15 maps";
  root.querySelector<HTMLElement>(".wm-local")!.hidden = tab !== "local";
  worldBox.hidden = tab !== "world";
  if (tab === "world") return renderWorld();
  if (!current.img) {
    const warps = WARPS.filter((w) => w.map === current!.name);
    current.img = terrainImage(current.m, terrainTiles(current.m), current.scale, warps);
  }
  cv.width = current.img.width; cv.height = current.img.height;
  draw();
}

function cellAt(e: PointerEvent | MouseEvent) {
  if (!current) return undefined;
  const r = cv.getBoundingClientRect(), k = cv.width / r.width;
  const x = Math.floor(((e.clientX - r.left) * k) / current.scale), y = Math.floor(((e.clientY - r.top) * k) / current.scale);
  return x >= 0 && y >= 0 && x < current.m.w && y < current.m.h ? { x, y } : undefined;
}

function draw() {
  if (!current?.img || tab !== "local") return;
  const g = cv.getContext("2d")!, s = current.scale;
  g.clearRect(0, 0, cv.width, cv.height);
  g.drawImage(current.img, 0, 0);
  const at = (x: number, y: number) => [(x + 0.5) * s, (y + 0.5) * s] as const;
  const dot = (x: number, y: number, fill: string, r: number) => {
    const [px, py] = at(x, y);
    g.beginPath(); g.arc(px, py, r + 1.5, 0, Math.PI * 2); g.fillStyle = "rgba(15, 18, 28, 0.75)"; g.fill();
    g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fillStyle = fill; g.fill();
  };
  const taken: [number, number, number, number][] = []; // label boxes already drawn: a label that would overlap one is left out
  const label = (x: number, y: number, text: string, color: string, dy = -10, force = false) => {
    const [px, py] = at(x, y);
    g.font = "600 11px Inter, system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "bottom";
    const w = g.measureText(text).width + 6, box: [number, number, number, number] = [px - w / 2, py + dy - 14, px + w / 2, py + dy];
    if (!force && taken.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) return;
    taken.push(box);
    g.lineWidth = 3; g.strokeStyle = "rgba(15, 18, 28, 0.85)"; g.strokeText(text, px, py + dy);
    g.fillStyle = color; g.fillText(text, px, py + dy);
  };
  // exits, named by where they lead
  const seen = new Set<string>();
  for (const w of WARPS) {
    if (w.map !== current.name) continue;
    const key = `${w.to.map}:${Math.round(w.x / 6)}:${Math.round(w.y / 6)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    label(w.x, w.y, `→ ${MAP_INFO[w.to.map]?.title ?? w.to.map}`, "#bfe6ff", -9);
  }
  const npcs = npcSpots();
  for (const n of npcs) dot(n.x, n.y, "#ffc54a", 3.5);
  // the NPC under the cursor is always named; the rest where there is room
  const near = hover && npcs.find((n) => Math.hypot(n.x - hover!.x, n.y - hover!.y) <= 2.5);
  if (near) label(near.x, near.y, hooks.npcName(near.id), "#ffffff", -7, true);
  for (const n of npcs) if (n !== near) label(n.x, n.y, hooks.npcName(n.id), "#ffe3a3", -7);
  if (last) {
    for (const d of last.dots) if (!d.self) dot(d.x, d.y, d.party ? "#ff7ac8" : d.mob ? "#ff5a4c" : "#ffffff", d.mob ? 2.2 : 3.2);
    const [px, py] = at(last.me.x, last.me.y);
    g.beginPath(); g.arc(px, py, 9 + Math.sin(performance.now() / 220) * 1.5, 0, Math.PI * 2); g.strokeStyle = "rgba(93, 214, 255, 0.55)"; g.lineWidth = 2; g.stroke();
    dot(last.me.x, last.me.y, "#5dd6ff", 4.5);
    posEl.textContent = `${Math.round(last.me.x)}, ${Math.round(last.me.y)}`;
  }
  if (hover) {
    const [px, py] = at(hover.x, hover.y);
    g.strokeStyle = "rgba(255,255,255,0.9)"; g.lineWidth = 1.5; g.strokeRect(px - s * 1.5, py - s * 1.5, s * 3, s * 3);
  }
}

// ---------- world chart ----------
/** Grid spots per map (column, row); floors sit side by side, each framed. */
const SPOT: Partial<Record<MapName, [number, number]>> = {
  f1_field03: [1, 0], f1_field01: [0, 1], f1_town01: [1, 1], f1_field02: [2, 1], f1_field04: [1, 2], f1_field05: [0, 3],
  f1_dun01: [1, 3], f1_dun02: [1, 4], f1_dun03: [1, 5],
  f2_field01: [4, 0], f2_town01: [4, 1], f2_field02: [5, 1], f2_field03: [6, 1], f2_dun01: [5, 2],
  f3_field01: [4, 5],
};
/** each floor's frame: columns and rows it spans */
const FLOORS = [
  { n: 1, name: "The Verdant Floor", cols: [0, 2], rows: [0, 5] },
  { n: 2, name: "The Ember Floor", cols: [4, 6], rows: [0, 2] },
  { n: 3, name: "The Blighted Shire", cols: [4, 6], rows: [5, 5] },
];
const NODE_W = 136, NODE_H = 50, GAP_X = 16, GAP_Y = 24, PAD = 18, FLOOR_HEAD = 30;

function renderWorld() {
  const here = current?.name;
  const pos = (n: MapName) => { const s = SPOT[n] ?? [3, MAP_NAMES.indexOf(n) % 6]; return { x: PAD + s[0] * (NODE_W + GAP_X), y: PAD + FLOOR_HEAD + s[1] * (NODE_H + GAP_Y) }; };
  const cols = 7, rows = 6, W = PAD * 2 + cols * NODE_W + (cols - 1) * GAP_X, H = PAD * 2 + FLOOR_HEAD + rows * NODE_H + (rows - 1) * GAP_Y;
  const edges = new Map<string, { a: MapName; b: MapName; stair: boolean }>();
  for (const w of WARPS) {
    if (w.map === w.to.map) continue;
    const [a, b] = [w.map, w.to.map].sort() as [MapName, MapName];
    const stair = a.slice(0, 2) !== b.slice(0, 2) || !!w.npc;
    edges.set(`${a}|${b}`, { a, b, stair: stair || (edges.get(`${a}|${b}`)?.stair ?? false) });
  }
  const parts: string[] = [];
  for (const f of FLOORS) {
    const x0 = PAD + f.cols[0] * (NODE_W + GAP_X) - 10, x1 = PAD + f.cols[1] * (NODE_W + GAP_X) + NODE_W + 10;
    const y0 = PAD + f.rows[0] * (NODE_H + GAP_Y) - 6, y1 = PAD + FLOOR_HEAD + f.rows[1] * (NODE_H + GAP_Y) + NODE_H + 10;
    parts.push(`<g class="floor"><rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="14"/>`
      + `<text x="${x0 + 12}" y="${y0 + 18}" class="floor-n">FLOOR ${f.n}</text><text x="${x0 + 70}" y="${y0 + 18}" class="floor-name">${f.name}</text></g>`);
  }
  for (const e of edges.values()) {
    const p = pos(e.a), q = pos(e.b);
    parts.push(`<line class="edge${e.stair ? " stair" : ""}" x1="${p.x + NODE_W / 2}" y1="${p.y + NODE_H / 2}" x2="${q.x + NODE_W / 2}" y2="${q.y + NODE_H / 2}"/>`);
  }
  for (const n of MAP_NAMES) {
    const p = pos(n), info = MAP_INFO[n], kind = info.town ? "town" : n.includes("dun") ? "dungeon" : "field";
    const band = info.band ? `Lv ${info.band[0]}–${info.band[1]}` : info.town ? "Rest town" : (info.sub.match(/Lv [\d–-]+/)?.[0] ?? "");
    parts.push(`<g class="node ${kind}${n === here ? " here" : ""}" transform="translate(${p.x},${p.y})">`
      + `<rect width="${NODE_W}" height="${NODE_H}" rx="10"/>`
      + `<circle cx="14" cy="${NODE_H / 2}" r="5" class="pip"/>`
      + `<text x="26" y="21" class="n-title">${esc(info.title)}</text>`
      + `<text x="26" y="38" class="n-sub">${esc(band)}${kind === "dungeon" ? " · Dungeon" : ""}</text>`
      + (n === here ? `<text x="${NODE_W - 8}" y="-6" text-anchor="end" class="you">You are here</text>` : "")
      + `</g>`);
  }
  worldBox.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" style="width:min(${W}px, 100%)" role="img" aria-label="Tower map">${parts.join("")}</svg>
    <div class="wm-legend"><span><i class="k-town"></i>Town</span><span><i class="k-field"></i>Field</span><span><i class="k-dun"></i>Dungeon</span><span><i class="k-stair"></i>Stairs / portal</span></div>`;
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
