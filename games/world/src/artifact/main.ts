/**
 * Lumen Realm as a single-page artifact. There is no game server, so:
 * - each page walks its own character with the shared pathfinding code and
 *   shares it through `room` presence;
 * - one page is elected host (the lowest peer id among pages allowed to send
 *   events) and runs the monsters and loot with the same WorldSim the real
 *   server uses. It checks every swing and pickup other pages send, resolves
 *   them, and broadcasts monster snapshots and hits. When the host leaves,
 *   the next page takes over from the last snapshot.
 * Outside claude.ai (no room) the page hosts itself and plays solo.
 */
import {
  CHAT_COOLDOWN_MS, CHAT_MAX_LENGTH, DEFAULT_MAP_ID, MAPS, MAX_PATH_LENGTH, NAME_MAX_LENGTH, PLAYER_BASE, PLAYER_COLORS,
  REGEN_COMBAT_COOLDOWN_MS, REGEN_FRACTION, REGEN_INTERVAL_MS, TICK_MS, WALK_SPEED, findPath, type Cell,
} from "../shared";
import { ITEMS, MONSTERS, SPAWNS } from "../shared/content";
import { advance, type Walker } from "../server/movement";
import { cellDistance } from "../sim/combat";
import { WorldSim } from "../sim/world";
import { Avatar, PLAYER_PALETTE } from "../client/avatar";
import { DamageTexts, ItemMarker, MonsterAvatar } from "../client/entities";
import { Hud } from "../client/hud";
import { toWorld, WorldView } from "../client/view";
import "../client/world.css";
import "./artifact.css";

// ---------------------------------------------------------------- room contract (subset)
interface Sender { peer: string; isMe: boolean; sameTab: boolean; kind: string }
interface Peer extends Sender { presence: Readonly<Record<string, unknown>> }
interface Message extends Sender { topic: string; data?: unknown }
interface Room {
  emit(topic: string, data?: unknown): Promise<void>;
  on(topic: string, fn: (m: Message) => void, onError?: (e: { code: string }) => void): () => void;
  presence(patch: Record<string, unknown>): Promise<void>;
  peers(): readonly Peer[];
  onPeers(fn: (c: { peers: readonly Peer[] }) => void, onError?: (e: { code: string }) => void): () => void;
  connected(): boolean;
  onConnection(fn: (connected: boolean) => void, onError?: (e: { code: string }) => void): () => void;
}
declare global {
  interface Window { claude?: { use(name: string): Promise<unknown> } }
}

const STORE_KEY = "lumen-realm.character";
const BAG_KEY = "lumen-realm.bag";
const PRESENCE_INTERVAL_MS = 100;
const SNAPSHOT_INTERVAL_MS = 200;
/** Extra cells of slack the host allows for network lag when checking reach. */
const REACH_SLACK = 1;

interface Saved { name: string; color: number; x?: number; y?: number; hp?: number }

const readJson = <T,>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};
const writeJson = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
};

const map = MAPS[DEFAULT_MAP_ID];
const clamp = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);

/** Another page's presence, checked: it is untrusted input. */
function readPresence(p: Readonly<Record<string, unknown>>) {
  const { n, c, x, y, d, m, hp, h } = p;
  if (typeof n !== "string" || !n.trim()) return null;
  return {
    name: n.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, NAME_MAX_LENGTH),
    color: Math.round(clamp(c, 0, PLAYER_COLORS - 1)),
    x: clamp(x, 0, map.width - 1),
    y: clamp(y, 0, map.height - 1),
    dir: Math.round(clamp(d, 0, 7)),
    moving: m === true,
    hp: Math.round(clamp(hp, 0, PLAYER_BASE.maxHp)),
    canHost: h === 1,
  };
}

/** Snapshot of monsters and loot, as the host broadcasts it. */
interface Snapshot {
  monsters: Map<string, { def: string; x: number; y: number; dir: number; hp: number; moving: boolean }>;
  items: Map<string, { item: string; x: number; y: number }>;
}

function encodeSnapshot(sim: WorldSim) {
  const m: Array<[string, string, number, number, number, number, number]> = [];
  for (const s of sim.monsters.monsters.values()) {
    if (s.mode === "dead") continue;
    m.push([s.id, s.def.id, Math.round(s.walker.x * 10), Math.round(s.walker.y * 10), s.dir, s.hp, s.walker.path.length > 0 ? 1 : 0]);
  }
  const i: Array<[string, string, number, number]> = [];
  for (const it of sim.items.values()) i.push([it.id, it.itemId, it.x, it.y]);
  return { m, i };
}

function decodeSnapshot(data: unknown): Snapshot | null {
  const d = data as { m?: unknown; i?: unknown };
  if (!d || !Array.isArray(d.m) || !Array.isArray(d.i)) return null;
  const monsters: Snapshot["monsters"] = new Map();
  for (const row of d.m.slice(0, 200)) {
    if (!Array.isArray(row) || typeof row[0] !== "string" || !MONSTERS[row[1]]) continue;
    const def = MONSTERS[row[1]];
    monsters.set(row[0].slice(0, 12), {
      def: def.id, x: clamp(row[2], 0, map.width * 10) / 10, y: clamp(row[3], 0, map.height * 10) / 10,
      dir: Math.round(clamp(row[4], 0, 7)), hp: Math.round(clamp(row[5], 0, def.hp)), moving: row[6] === 1,
    });
  }
  const items: Snapshot["items"] = new Map();
  for (const row of d.i.slice(0, 200)) {
    if (!Array.isArray(row) || typeof row[0] !== "string" || !ITEMS[row[1]]) continue;
    items.set(row[0].slice(0, 12), { item: row[1], x: Math.round(clamp(row[2], 0, map.width - 1)), y: Math.round(clamp(row[3], 0, map.height - 1)) });
  }
  return { monsters, items };
}

const roomPromise: Promise<Room | null> = window.claude?.use
  ? window.claude.use("room").then((r) => (r as Room | null), () => null)
  : Promise.resolve(null);

const container = document.querySelector<HTMLDivElement>("#game")!;
const startScreen = document.querySelector<HTMLDivElement>("#start")!;

function showStart(message?: string) {
  const saved = readJson<Saved>(STORE_KEY);
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

  document.querySelector<HTMLFormElement>("#start-form")!.onsubmit = (e) => {
    e.preventDefault();
    const name = nameInput.value.replace(/\s+/g, " ").trim().slice(0, NAME_MAX_LENGTH);
    if ([...name].length < 2) {
      error.textContent = "ตั้งชื่อตัวละครอย่างน้อย 2 ตัวอักษร";
      error.hidden = false;
      return;
    }
    const prev = readJson<Saved>(STORE_KEY);
    const me: Saved = { name, color, x: prev?.x, y: prev?.y, hp: prev?.hp };
    writeJson(STORE_KEY, me);
    startScreen.hidden = true;
    void play(me);
  };
  startScreen.hidden = false;
  nameInput.focus();
}

async function play(me: Saved) {
  const start = me.x !== undefined && me.y !== undefined && map.isWalkable(me.x, me.y) ? { x: me.x, y: me.y } : map.spawn;
  const walker: Walker = { x: start.x, y: start.y, path: [] };
  let dir = 0;
  let hp = me.hp && me.hp > 0 ? Math.min(PLAYER_BASE.maxHp, me.hp) : PLAYER_BASE.maxHp;
  let lastHitAt = -Infinity;
  let nextRegenAt = 0;
  let attackTarget: string | null = null;
  let pickupTarget: string | null = null;
  let nextSwingAt = 0;
  let nextRepathAt = 0;
  let lastPresence = 0;
  let lastSave = 0;
  let lastChat = 0;
  let wasMoving = false;
  let canSend = true;
  const bag: Record<string, number> = readJson<Record<string, number>>(BAG_KEY) ?? {};

  // Network: the room when there is one, else a local loopback so solo play runs the same code.
  let room: Room | null = null;
  let myPeer = "me";
  const handlers = new Map<string, (m: Message) => void>();
  const on = (topic: string, fn: (m: Message) => void) => handlers.set(topic, fn);
  const send = async (topic: string, data?: unknown) => {
    if (room) return room.emit(topic, data);
    handlers.get(topic)?.({ topic, data, peer: myPeer, isMe: true, sameTab: true, kind: "viewer" });
  };

  // What this page knows of the world: the latest snapshot from the host.
  let world: Snapshot = { monsters: new Map(), items: new Map() };
  let hostPeer: string | null = null;
  const monsterViews = new Map<string, MonsterAvatar>();
  const itemViews = new Map<string, ItemMarker>();
  const others = new Map<string, { avatar: Avatar; moving: boolean; key: string }>();
  const damage = new DamageTexts();

  // Host-only state.
  let sim: WorldSim | null = null;
  let hostTimer: ReturnType<typeof setInterval> | null = null;
  let pendingHits: Array<[string, string, number, number]> = [];
  const lastSwing = new Map<string, number>();

  const saveMe = () => writeJson(STORE_KEY, { name: me.name, color: me.color, x: Math.round(walker.x), y: Math.round(walker.y), hp });
  const showBag = () => hud.setInventory(Object.entries(bag).map(([id, amount]) => ({ name: ITEMS[id]?.name ?? id, amount, color: ITEMS[id]?.color ?? "#fff" })));

  const walkTo = (to: Cell) => {
    const from = { x: Math.round(walker.x), y: Math.round(walker.y) };
    const path = findPath(map, from, to, MAX_PATH_LENGTH);
    if (path) walker.path = from.x === walker.x && from.y === walker.y ? path : [from, ...path];
    return !!path;
  };
  const nextTo = (target: Cell) => {
    const from = { x: Math.round(walker.x), y: Math.round(walker.y) };
    let best: Cell | null = null;
    let bestLen = Infinity;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const c = { x: target.x + dx, y: target.y + dy };
      if (!map.isWalkable(c.x, c.y)) continue;
      const len = Math.max(Math.abs(c.x - from.x), Math.abs(c.y - from.y));
      if (len < bestLen) { bestLen = len; best = c; }
    }
    return best;
  };

  const hud = new Hud(map.name, (text) => void sendChat(text), () => stop(), () => {
    if (hp > 0) return;
    walker.x = map.spawn.x;
    walker.y = map.spawn.y;
    walker.path = [];
    hp = Math.ceil(PLAYER_BASE.maxHp / 2);
    nextRegenAt = performance.now() + REGEN_INTERVAL_MS;
    void room?.presence({ x: walker.x, y: walker.y, hp, m: false }).catch(() => {});
    saveMe();
  });

  const view = new WorldView(
    container,
    map,
    (cell, pick) => {
      if (hp <= 0) return;
      if (pick?.kind === "monster") {
        if (!canSend) return hud.addLine("", "บัญชีของคุณดูได้อย่างเดียว จึงโจมตีไม่ได้", "system");
        attackTarget = pick.id;
        pickupTarget = null;
        nextRepathAt = 0;
      } else if (pick?.kind === "item") {
        if (!canSend) return hud.addLine("", "บัญชีของคุณดูได้อย่างเดียว จึงเก็บของไม่ได้", "system");
        pickupTarget = pick.id;
        attackTarget = null;
        const it = world.items.get(pick.id);
        if (it && cellDistance(walker, it) > 1) walkTo(it);
      } else if (cell) {
        attackTarget = null;
        pickupTarget = null;
        walkTo(cell);
      }
    },
    () => hud.typing,
    (dt, now) => frame(dt, now),
  );
  container.append(hud.root);
  view.addEntity("damage", damage.root);
  const mine = new Avatar(me.name, me.color, true);
  toWorld(walker.x, walker.y, mine.target);
  view.addAvatar("me", mine);
  view.setLocalPlayer("me");
  hud.setOnline(1);
  showBag();
  hud.addLine("", "กำลังเชื่อมต่อห้องออนไลน์…", "system");

  function frame(dt: number, now: number) {
    if (hp > 0) act(now);
    const step = advance(walker, WALK_SPEED * dt);
    if (step !== null) dir = step;
    const moving = walker.path.length > 0;
    if (hp > 0 && now >= nextRegenAt) {
      nextRegenAt = now + REGEN_INTERVAL_MS;
      if (now - lastHitAt >= REGEN_COMBAT_COOLDOWN_MS) hp = Math.min(PLAYER_BASE.maxHp, hp + Math.ceil(PLAYER_BASE.maxHp * REGEN_FRACTION));
    }
    hud.setHp(hp, PLAYER_BASE.maxHp);

    toWorld(walker.x, walker.y, mine.target);
    mine.setFacing(dir);
    mine.update(dt, moving, now);
    for (const o of others.values()) o.avatar.update(dt, o.moving, now);
    for (const [id, m] of world.monsters) {
      const v = monsterViews.get(id);
      if (!v) continue;
      toWorld(m.x, m.y, v.target);
      v.setHp(m.hp, MONSTERS[m.def].hp);
      v.update(dt, m.moving, now);
    }
    for (const marker of itemViews.values()) marker.update(dt);
    damage.update(dt, now);

    if (room && now - lastPresence > PRESENCE_INTERVAL_MS && (moving || wasMoving || now - lastPresence > 1000)) {
      lastPresence = now;
      void room.presence({ x: round1(walker.x), y: round1(walker.y), d: dir, m: moving, hp }).catch(() => {});
    }
    if ((moving && now - lastSave > 2000) || (!moving && wasMoving)) {
      lastSave = now;
      saveMe();
    }
    wasMoving = moving;
  }

  /** Walk into reach of the attack or pickup target and send the action to the host. */
  function act(now: number) {
    if (pickupTarget) {
      const it = world.items.get(pickupTarget);
      if (!it) { pickupTarget = null; return; }
      if (cellDistance(walker, it) <= 1 && walker.path.length <= 1) {
        void send("take", { id: pickupTarget }).catch(() => {});
        pickupTarget = null;
      }
      return;
    }
    if (!attackTarget) return;
    const m = world.monsters.get(attackTarget);
    if (!m) { attackTarget = null; return; }
    if (cellDistance(walker, m) <= PLAYER_BASE.attackRange) {
      if (walker.path.length > 1) walker.path = walker.path.slice(0, 1);
      if (walker.path.length === 0 && now >= nextSwingAt) {
        nextSwingAt = now + PLAYER_BASE.attackDelayMs;
        void send("swing", { id: attackTarget }).catch(() => {});
      }
    } else if (now >= nextRepathAt) {
      nextRepathAt = now + 300;
      const cell = nextTo({ x: Math.round(m.x), y: Math.round(m.y) });
      if (!cell || !walkTo(cell)) attackTarget = null;
    }
  }

  async function sendChat(raw: string) {
    const text = raw.replace(/\s+/g, " ").trim().slice(0, CHAT_MAX_LENGTH);
    const now = Date.now();
    if (!text || now - lastChat < CHAT_COOLDOWN_MS) return;
    lastChat = now;
    try {
      await send("chat", { text });
    } catch (err) {
      hud.addLine("", (err as { code?: string }).code === "not_permitted" ? "บัญชีของคุณดูได้อย่างเดียว ส่งแชทไม่ได้" : "ส่งข้อความไม่สำเร็จ", "system");
    }
  }

  // ------------------------------------------------------------ everyone: apply what the host says
  function applySnapshot(snap: Snapshot) {
    for (const [id, m] of snap.monsters) {
      if (!monsterViews.has(id)) {
        const v = new MonsterAvatar(id, MONSTERS[m.def]);
        toWorld(m.x, m.y, v.target);
        v.root.position.copy(v.target);
        monsterViews.set(id, v);
        view.addEntity(`m:${id}`, v.root);
      }
    }
    for (const [id, v] of monsterViews) {
      if (snap.monsters.has(id)) continue;
      view.removeEntity(`m:${id}`);
      v.dispose();
      monsterViews.delete(id);
    }
    for (const [id, it] of snap.items) {
      if (itemViews.has(id)) continue;
      const marker = new ItemMarker(id, ITEMS[it.item]);
      toWorld(it.x, it.y, marker.root.position);
      itemViews.set(id, marker);
      view.addEntity(`i:${id}`, marker.root);
    }
    for (const [id, marker] of itemViews) {
      if (snap.items.has(id)) continue;
      view.removeEntity(`i:${id}`);
      marker.dispose();
      itemViews.delete(id);
    }
    world = snap;
  }

  const fromHost = (msg: Message) => msg.peer === hostPeer;

  on("mobs", (msg) => {
    if (!fromHost(msg)) return;
    const snap = decodeSnapshot(msg.data);
    if (snap) applySnapshot(snap);
  });

  on("hits", (msg) => {
    if (!fromHost(msg) || !Array.isArray(msg.data)) return;
    const now = performance.now();
    for (const row of msg.data.slice(0, 100)) {
      if (!Array.isArray(row)) continue;
      const [from, to, dmg, miss] = row as [unknown, unknown, unknown, unknown];
      if (typeof from !== "string" || typeof to !== "string") continue;
      const amount = Math.round(clamp(dmg, 0, 9999));
      const at = monsterViews.get(to)?.root.position ?? (to === myPeer ? mine.root.position : others.get(to)?.avatar.root.position);
      if (at) {
        const color = miss === 1 ? "#8fc8ff" : to === myPeer ? "#ff6b6b" : from === myPeer ? "#ffffff" : "#ffd27a";
        damage.spawn(at, miss === 1 ? "MISS" : String(amount), color, now);
      }
      if (to === myPeer && miss !== 1 && hp > 0) {
        hp = Math.max(0, hp - amount);
        lastHitAt = now;
        if (hp === 0) {
          walker.path = [];
          attackTarget = pickupTarget = null;
          hud.addLine("", "คุณหมดแรงแล้ว กดฟื้นเพื่อกลับไปที่จุดเซฟ", "system");
          void room?.presence({ hp: 0, m: false }).catch(() => {});
          saveMe();
        }
      }
    }
  });

  on("taken", (msg) => {
    if (!fromHost(msg)) return;
    const d = msg.data as { by?: unknown; item?: unknown; refused?: unknown };
    if (d?.by !== myPeer || typeof d.item !== "string" || !ITEMS[d.item]) return;
    if (d.refused === true) return hud.addLine("", `${ITEMS[d.item].name} เป็นของผู้เล่นอื่นอยู่ รออีกสักครู่`, "system");
    bag[d.item] = (bag[d.item] ?? 0) + 1;
    writeJson(BAG_KEY, bag);
    showBag();
    hud.addLine("", `ได้รับ ${ITEMS[d.item].name}`, "system");
  });

  on("chat", (msg) => {
    const raw = (msg.data as { text?: unknown } | undefined)?.text;
    if (typeof raw !== "string") return;
    const text = raw.replace(/\s+/g, " ").trim().slice(0, CHAT_MAX_LENGTH);
    if (!text) return;
    if (msg.sameTab) {
      hud.addLine(me.name, text);
      mine.say(text, performance.now());
      return;
    }
    const sender = room?.peers().find((p) => p.peer === msg.peer);
    const p = sender ? readPresence(sender.presence) : null;
    hud.addLine(p?.name ?? "ผู้เล่น", text);
    others.get(msg.peer)?.avatar.say(text, performance.now());
  });

  // ------------------------------------------------------------ host: run monsters and judge actions
  /** Where each player is, as the host believes: its own walker, others' presence. */
  function playerPositions() {
    const out = new Map<string, { x: number; y: number; hp: number }>();
    out.set(myPeer, { x: walker.x, y: walker.y, hp });
    for (const peer of room?.peers() ?? []) {
      if (peer.sameTab || peer.kind !== "viewer") continue;
      const p = readPresence(peer.presence);
      if (p) out.set(peer.peer, { x: p.x, y: p.y, hp: p.hp });
    }
    return out;
  }

  function becomeHost() {
    if (sim) return;
    const now = Date.now();
    sim = new WorldSim(map, SPAWNS[map.id] ?? [], MONSTERS, Math.random, now);
    // Carry the world over from the last snapshot: ids are stable (m1, m2… in spawn order).
    if (world.monsters.size > 0) {
      for (const [id, s] of sim.monsters.monsters) {
        const seen = world.monsters.get(id);
        if (!seen) {
          s.mode = "dead";
          s.respawnAt = now + 3000;
          continue;
        }
        s.walker = { x: Math.round(seen.x), y: Math.round(seen.y), path: [] };
        s.hp = Math.max(1, seen.hp);
      }
    }
    const host = sim;
    let lastSnapshot = 0;
    hostTimer = setInterval(() => {
      const t = Date.now();
      const positions = playerPositions();
      for (const [id, pos] of positions) {
        const sp = host.players.get(id) ?? host.addPlayer(id, { x: Math.round(pos.x), y: Math.round(pos.y) });
        sp.walker = { x: pos.x, y: pos.y, path: [] };
        sp.hp = pos.hp;
      }
      for (const id of [...host.players.keys()]) if (!positions.has(id)) host.removePlayer(id);
      const events = host.tick(TICK_MS, t);
      for (const h of events.hits) pendingHits.push([h.from, h.to, h.damage, h.miss ? 1 : 0]);
      if (pendingHits.length > 0) {
        const batch = pendingHits.splice(0, 60);
        void send("hits", batch).catch(() => {});
      }
      if (t - lastSnapshot >= SNAPSHOT_INTERVAL_MS) {
        lastSnapshot = t;
        void send("mobs", encodeSnapshot(host)).catch(() => {});
      }
    }, TICK_MS);
    hud.addLine("", "หน้านี้กำลังควบคุมมอนสเตอร์ให้ทุกคนในห้อง", "system");
  }

  function stopHosting() {
    if (hostTimer) clearInterval(hostTimer);
    hostTimer = null;
    sim = null;
    pendingHits = [];
  }

  on("swing", (msg) => {
    if (!sim) return;
    const id = (msg.data as { id?: unknown })?.id;
    const pos = playerPositions().get(msg.peer);
    const m = typeof id === "string" ? sim.monsters.monsters.get(id) : undefined;
    if (!pos || pos.hp <= 0 || !m || m.mode === "dead") return;
    if (cellDistance(pos, m.walker) > PLAYER_BASE.attackRange + REACH_SLACK) return;
    const t = Date.now();
    if (t - (lastSwing.get(msg.peer) ?? 0) < PLAYER_BASE.attackDelayMs * 0.8) return;
    lastSwing.set(msg.peer, t);
    const r = sim.strike(msg.peer, PLAYER_BASE, m.id, t);
    for (const h of r.hits) pendingHits.push([h.from, h.to, h.damage, h.miss ? 1 : 0]);
  });

  on("take", (msg) => {
    if (!sim) return;
    const id = (msg.data as { id?: unknown })?.id;
    const pos = playerPositions().get(msg.peer);
    const item = typeof id === "string" ? sim.items.get(id) : undefined;
    if (!pos || pos.hp <= 0 || !item || cellDistance(pos, item) > 1 + REACH_SLACK) return;
    const taken = sim.take(msg.peer, item.id, Date.now());
    void send("taken", { by: msg.peer, item: item.itemId, ...(taken ? {} : { refused: true }) }).catch(() => {});
    if (taken) void send("mobs", encodeSnapshot(sim)).catch(() => {});
  });

  const cleanups: Array<() => void> = [];
  function stop() {
    cleanups.forEach((fn) => fn());
    stopHosting();
    void room?.presence({ n: null, c: null, x: null, y: null, d: null, m: null, hp: null, h: null }).catch(() => {});
    saveMe();
    for (const v of monsterViews.values()) v.dispose();
    for (const v of itemViews.values()) v.dispose();
    view.dispose();
    hud.dispose();
    showStart();
  }

  if (location.hash === "#debug") {
    // Test hook: read-only view of this page's state, plus the same intents a click sends.
    (window as unknown as Record<string, unknown>).__lumen = {
      get state() {
        return { hp, x: walker.x, y: walker.y, attackTarget, pickupTarget, hostPeer, myPeer, hosting: !!sim, bag: { ...bag },
          monsters: [...world.monsters.entries()].map(([id, m]) => ({ id, ...m })), items: [...world.items.entries()].map(([id, i]) => ({ id, ...i })) };
      },
      attack(id: string) { attackTarget = id; pickupTarget = null; nextRepathAt = 0; },
      pickup(id: string) { pickupTarget = id; attackTarget = null; const it = world.items.get(id); if (it) walkTo(it); },
    };
  }

  // ------------------------------------------------------------ connect
  room = await roomPromise;
  if (!room) {
    hostPeer = myPeer;
    becomeHost();
    hud.addLine("", "เชื่อมต่อห้องออนไลน์ไม่ได้ เล่นคนเดียวได้ตามปกติ", "system");
    return;
  }
  const r = room;
  for (const [topic, fn] of handlers) cleanups.push(r.on(topic, fn));
  try {
    await r.emit("ping");
  } catch (err) {
    if ((err as { code?: string }).code === "not_permitted") canSend = false;
  }
  await r.presence({ n: me.name, c: me.color, x: round1(walker.x), y: round1(walker.y), d: dir, m: false, hp, h: canSend ? 1 : 0 }).catch(() => {});

  let electionReady = false;
  const sync = (peers: readonly Peer[]) => {
    myPeer = peers.find((p) => p.sameTab)?.peer ?? myPeer;
    const seen = new Set<string>();
    let online = 1;
    const hosts: string[] = canSend ? [myPeer] : [];
    for (const peer of peers) {
      if (peer.sameTab || peer.kind !== "viewer") continue;
      const p = readPresence(peer.presence);
      if (!p) continue;
      if (p.canHost) hosts.push(peer.peer);
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
    for (const [peerId] of others) {
      if (seen.has(peerId)) continue;
      view.removeAvatar(peerId);
      others.delete(peerId);
      hud.addLine("", "ผู้เล่นคนหนึ่งออกจากแผนที่", "system");
    }
    hud.setOnline(online);
    // Elect the host: lowest peer id among pages that may send events.
    if (!electionReady) return;
    hostPeer = hosts.sort()[0] ?? null;
    if (hostPeer === myPeer) becomeHost();
    else stopHosting();
  };
  cleanups.push(r.onPeers((change) => sync(change.peers)));
  // Give the room a moment to report who is already here before electing ourselves.
  setTimeout(() => {
    electionReady = true;
    sync(r.peers());
  }, 1500);

  let downSince = 0;
  cleanups.push(r.onConnection((ok) => {
    if (ok) {
      if (downSince > 0) hud.addLine("", "เชื่อมต่อห้องออนไลน์แล้ว", "system");
      else if (downSince === 0) hud.addLine("", "ออนไลน์แล้ว ผู้เล่นที่เปิดหน้านี้อยู่จะเห็นกัน", "system");
      downSince = -1;
    } else {
      const at = Date.now();
      downSince = at;
      setTimeout(() => {
        if (downSince === at && !r.connected()) hud.addLine("", "การเชื่อมต่อหลุด กำลังเชื่อมต่อใหม่…", "system");
      }, 2000);
    }
  }, () => {
    hud.addLine("", "ห้องออนไลน์ปิดการเชื่อมต่อ", "system");
  }));
}

function round1(v: number) {
  return Math.round(v * 10) / 10;
}

showStart();
