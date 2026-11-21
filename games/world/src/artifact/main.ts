/**
 * Lumen Realm as a single-page artifact. There is no game server here: each
 * page walks its own character with the shared pathfinding and movement code,
 * and the artifact `room` capability shares positions (presence) and chat
 * (events) with everyone who has the page open. When the room is unavailable
 * the page still plays, alone.
 */
import {
  CHAT_COOLDOWN_MS, CHAT_MAX_LENGTH, DEFAULT_MAP_ID, MAPS, MAX_PATH_LENGTH, NAME_MAX_LENGTH, PLAYER_COLORS,
  WALK_SPEED, findPath,
} from "../shared";
import { advance, type Walker } from "../server/movement";
import { Avatar, PLAYER_PALETTE } from "../client/avatar";
import { Hud } from "../client/hud";
import { toWorld, WorldView } from "../client/view";
import "../client/world.css";
import "./artifact.css";

// ---------------------------------------------------------------- room types (subset of the platform contract)
interface Sender { peer: string; isMe: boolean; sameTab: boolean; kind: string }
interface Peer extends Sender { presence: Readonly<Record<string, unknown>> }
interface Message extends Sender { topic: string; data?: unknown }
interface Room {
  emit(topic: string, data?: unknown): Promise<void>;
  on(topic: string, fn: (m: Message) => void, onError?: (e: { code: string }) => void): () => void;
  presence(patch: Record<string, unknown>): Promise<void>;
  peers(): readonly Peer[];
  onPeers(fn: (c: { peers: readonly Peer[]; joined: readonly Peer[]; left: readonly Peer[]; updated: readonly Peer[] }) => void, onError?: (e: { code: string }) => void): () => void;
  connected(): boolean;
  onConnection(fn: (connected: boolean) => void, onError?: (e: { code: string }) => void): () => void;
}
declare global {
  interface Window { claude?: { use(name: string): Promise<unknown> } }
}

const STORE_KEY = "lumen-realm.character";
const PRESENCE_INTERVAL_MS = 100;

interface Saved { name: string; color: number; x?: number; y?: number }

function load(): Saved | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}
function save(s: Saved) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

/** Another page's presence, checked: it is untrusted input. */
function readPresence(p: Readonly<Record<string, unknown>>) {
  const { n, c, x, y, d, m } = p;
  if (typeof n !== "string" || !n.trim()) return null;
  const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);
  const map = MAPS[DEFAULT_MAP_ID];
  return {
    name: n.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, NAME_MAX_LENGTH),
    color: Math.round(num(c, 0, PLAYER_COLORS - 1)),
    x: num(x, 0, map.width - 1),
    y: num(y, 0, map.height - 1),
    dir: Math.round(num(d, 0, 7)),
    moving: m === true,
  };
}

const roomPromise: Promise<Room | null> = window.claude?.use
  ? window.claude.use("room").then((r) => (r as Room | null), () => null)
  : Promise.resolve(null);

const container = document.querySelector<HTMLDivElement>("#game")!;
const startScreen = document.querySelector<HTMLDivElement>("#start")!;

function showStart(message?: string) {
  const saved = load();
  let color = saved?.color ?? Math.floor(Math.random() * PLAYER_COLORS);
  const nameInput = document.querySelector<HTMLInputElement>("#name")!;
  nameInput.value = saved?.name ?? "";
  const swatches = document.querySelector<HTMLDivElement>("#swatches")!;
  swatches.replaceChildren();
  for (let i = 0; i < PLAYER_COLORS; i++) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `swatch-pick${i === color ? " on" : ""}`;
    b.style.background = PLAYER_PALETTE[i];
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(i === color));
    b.setAttribute("aria-label", `สีที่ ${i + 1}`);
    b.addEventListener("click", () => {
      color = i;
      swatches.querySelectorAll("button").forEach((s, j) => {
        s.classList.toggle("on", j === i);
        s.setAttribute("aria-checked", String(j === i));
      });
    });
    swatches.append(b);
  }
  const error = document.querySelector<HTMLParagraphElement>("#start-error")!;
  error.textContent = message ?? "";
  error.hidden = !message;

  const form = document.querySelector<HTMLFormElement>("#start-form")!;
  form.onsubmit = (e) => {
    e.preventDefault();
    const name = nameInput.value.replace(/\s+/g, " ").trim().slice(0, NAME_MAX_LENGTH);
    if ([...name].length < 2) {
      error.textContent = "ตั้งชื่อตัวละครอย่างน้อย 2 ตัวอักษร";
      error.hidden = false;
      return;
    }
    const prev = load();
    save({ name, color, x: prev?.x, y: prev?.y });
    startScreen.hidden = true;
    void play({ name, color, x: prev?.x, y: prev?.y });
  };
  startScreen.hidden = false;
  nameInput.focus();
}

async function play(me: Saved) {
  const map = MAPS[DEFAULT_MAP_ID];
  const spawn = me.x !== undefined && me.y !== undefined && map.isWalkable(me.x, me.y) ? { x: me.x, y: me.y } : map.spawn;
  const walker: Walker = { x: spawn.x, y: spawn.y, path: [] };
  let dir = 0;
  let room: Room | null = null;
  const cleanups: Array<() => void> = [];
  let lastChat = 0;
  let lastPresence = 0;
  let lastSave = 0;
  let wasMoving = false;

  const others = new Map<string, { avatar: Avatar; moving: boolean; key: string }>();

  const hud = new Hud(map.name, (text) => void sendChat(text), () => stop());
  const view = new WorldView(
    container,
    map,
    (x, y) => {
      const from = { x: Math.round(walker.x), y: Math.round(walker.y) };
      const path = findPath(map, from, { x, y }, MAX_PATH_LENGTH);
      if (path) walker.path = from.x === walker.x && from.y === walker.y ? path : [from, ...path];
    },
    () => hud.typing,
    (dt, now) => {
      const step = advance(walker, WALK_SPEED * dt);
      if (step !== null) dir = step;
      const moving = walker.path.length > 0;
      const mine = view.avatars.get("me");
      if (mine) {
        toWorld(walker.x, walker.y, mine.target);
        mine.setFacing(dir);
        mine.update(dt, moving, now);
      }
      for (const o of others.values()) o.avatar.update(dt, o.moving, now);
      if (room && (moving || wasMoving) && now - lastPresence > PRESENCE_INTERVAL_MS) {
        lastPresence = now;
        void room.presence({ x: round2(walker.x), y: round2(walker.y), d: dir, m: moving }).catch(() => {});
      }
      if ((moving && now - lastSave > 2000) || (!moving && wasMoving)) {
        lastSave = now;
        save({ name: me.name, color: me.color, x: Math.round(walker.x), y: Math.round(walker.y) });
      }
      wasMoving = moving;
    },
  );
  container.append(hud.root);
  const mine = new Avatar(me.name, me.color, true);
  toWorld(walker.x, walker.y, mine.target);
  view.addAvatar("me", mine);
  view.setLocalPlayer("me");
  hud.setOnline(1);
  hud.addLine("", "กำลังเชื่อมต่อห้องออนไลน์…", "system");

  function stop() {
    cleanups.forEach((fn) => fn());
    void room?.presence({ n: null, c: null, x: null, y: null, d: null, m: null }).catch(() => {});
    save({ name: me.name, color: me.color, x: Math.round(walker.x), y: Math.round(walker.y) });
    view.dispose();
    hud.dispose();
    showStart();
  }

  async function sendChat(raw: string) {
    const text = raw.replace(/\s+/g, " ").trim().slice(0, CHAT_MAX_LENGTH);
    if (!text) return;
    const now = Date.now();
    if (now - lastChat < CHAT_COOLDOWN_MS) return;
    lastChat = now;
    if (!room) {
      // Alone: show it locally so the chat box still works.
      hud.addLine(me.name, text);
      view.avatars.get("me")?.say(text, performance.now());
      return;
    }
    try {
      await room.emit("chat", { text });
    } catch (err) {
      const code = (err as { code?: string }).code;
      hud.addLine("", code === "not_permitted" ? "บัญชีของคุณดูได้อย่างเดียว ส่งแชทไม่ได้" : "ส่งข้อความไม่สำเร็จ", "system");
    }
  }

  // ---- online: light up when the room arrives
  room = await roomPromise;
  if (!room) {
    hud.addLine("", "เชื่อมต่อห้องออนไลน์ไม่ได้ เล่นคนเดียวได้ตามปกติ", "system");
    return;
  }
  const r = room;
  await r.presence({ n: me.name, c: me.color, x: round2(walker.x), y: round2(walker.y), d: dir, m: false }).catch(() => {});

  const sync = (peers: readonly Peer[]) => {
    const seen = new Set<string>();
    let online = 1;
    for (const peer of peers) {
      if (peer.sameTab || peer.kind !== "viewer") continue;
      const p = readPresence(peer.presence);
      if (!p) continue;
      online++;
      seen.add(peer.peer);
      const key = `${p.name}|${p.color}`;
      let o = others.get(peer.peer);
      if (o && o.key !== key) {
        view.removeAvatar(peer.peer);
        others.delete(peer.peer);
        o = undefined;
      }
      if (!o) {
        o = { avatar: new Avatar(p.name, p.color, false), moving: false, key };
        toWorld(p.x, p.y, o.avatar.target);
        view.addAvatar(peer.peer, o.avatar);
        others.set(peer.peer, o);
        hud.addLine("", `${p.name} เข้ามาในแผนที่`, "system");
      }
      toWorld(p.x, p.y, o.avatar.target);
      o.avatar.setFacing(p.dir);
      o.moving = p.moving;
    }
    for (const [peerId, o] of others) {
      if (seen.has(peerId)) continue;
      view.removeAvatar(peerId);
      others.delete(peerId);
      hud.addLine("", "ผู้เล่นคนหนึ่งออกจากแผนที่", "system");
    }
    hud.setOnline(online);
  };
  cleanups.push(r.onPeers((change) => sync(change.peers)));
  sync(r.peers());

  cleanups.push(r.on("chat", (msg) => {
    const raw = (msg.data as { text?: unknown } | undefined)?.text;
    if (typeof raw !== "string") return;
    const text = raw.replace(/\s+/g, " ").trim().slice(0, CHAT_MAX_LENGTH);
    if (!text) return;
    if (msg.sameTab) {
      hud.addLine(me.name, text);
      view.avatars.get("me")?.say(text, performance.now());
      return;
    }
    const sender = r.peers().find((p) => p.peer === msg.peer);
    const p = sender ? readPresence(sender.presence) : null;
    hud.addLine(p?.name ?? "ผู้เล่น", text);
    others.get(msg.peer)?.avatar.say(text, performance.now());
  }));

  let downSince = 0;
  let reported = false;
  cleanups.push(r.onConnection((ok) => {
    if (ok) {
      if (reported) hud.addLine("", "เชื่อมต่อห้องออนไลน์แล้ว", "system");
      if (!reported && downSince === 0) hud.addLine("", "ออนไลน์แล้ว ผู้เล่นที่เปิดหน้านี้อยู่จะเห็นกัน", "system");
      reported = false;
      downSince = -1;
    } else if (downSince !== 0) {
      const at = Date.now();
      downSince = at;
      setTimeout(() => {
        if (downSince === at && !r.connected()) {
          reported = true;
          hud.addLine("", "การเชื่อมต่อหลุด กำลังเชื่อมต่อใหม่…", "system");
        }
      }, 2000);
    }
  }, () => hud.addLine("", "ห้องออนไลน์ปิดการเชื่อมต่อ เล่นคนเดียวต่อได้", "system")));
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}

showStart();
