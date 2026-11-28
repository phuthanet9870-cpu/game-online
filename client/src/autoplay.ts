// Auto-hunt (RO3's auto battle): farms hands-free with nothing but the intents a player's clicks send: move (through the navigation
// planner, navi.ts), attack and pickup. The server sees an ordinary player; every rule it enforces (pc_cant_act while a dialog is
// open, the cell stack limit, the sit / stand toggle, weight) applies unchanged.
//
// Each tick picks ONE step, in this order: safety (death / weight / low HP: drink a potion, fight back, sit and rest), then
// hunting: the monsters of the character's level band, their loot, and the field whose band suits the character (shared/maps.ts
// fieldForLevel) when nothing is in sight. A window the player opens (NPC dialog, shop) ends auto.
// No DOM here: the browser UI (ui/auto.ts) and the test bots share this module.
import type { Room } from "@colyseus/sdk";
import { Msg, type InvEvent, type StatusEvent } from "../../shared/protocol.ts";
import { MOBS, MOB_BY_ID } from "../../shared/rules/data.ts";
import { ITEMS } from "../../shared/rules/items.ts";
import { FIELD_MOBS, fieldForLevel, mapOfState } from "../../shared/maps.ts";
import { naviRoute } from "../../shared/navi.ts";
import { naviActive, startNavi, stopNavi } from "./navi.ts";

type Cell = { x: number; y: number };
type Place = Cell & { map?: string };
export type AutoStep =
  | { do: "hunt"; mobIds: number[]; loot: number[] | "any"; fallback?: Place; why: string }
  | { do: "rest"; why: string }
  | { do: "idle"; why: string };
export type AutoOptions = {
  /** The character can't act right now (an NPC window is open: pc_cant_act). Default: tracked from the dialog messages. */
  locked?: () => boolean;
  /** Where "Auto stopped: ..." lines go (the chat log). */
  log?: (text: string) => void;
};

const TICK_MS = 250;
const REST_BELOW = 0.3; // stop and recover under 30 % HP...
const REST_UNTIL = 0.9; // ...until 90 %
const WEIGHT_STOP = 0.5; // 50 % weight: natural regen stops (pc_is50overweight) — auto stops before it hunts on with no regen
const ATTACK_MS = 1500; // re-send the attack request this often while the target lives (a click on the same monster)
const ATTACK_RANGE = 12; // attack from here (the server walks into range); farther = navigate first
const LOOT_RANGE = 10;
const BAND = 2; // auto-hunt: monsters up to this many levels above the character
const POTION_MS = 1000; // one healing item per second at most while HP is low
const FIGHT_BACK_MS = 2500; // a monster that hit us this recently is fought, not sat in front of
const cheb = (a: Cell, b: Cell) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

let room: Room | undefined;
let opts: AutoOptions = {};
let on = false, task = "";
let inv: InvEvent | undefined, own: StatusEvent | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
const offs: (() => void)[] = [];
let dlgOpen = false;
// execution memory
let goalKey = "", target: string | undefined, attackAt = 0, sitAt = 0, resting = false, potionAt = 0;
let hitBy: string | undefined, hitAt = 0; // the last monster that hurt us
const lootTried = new Map<string, number>();
const listeners = new Set<(on: boolean, task: string) => void>();
const emit = () => { for (const f of listeners) f(on, task); };
const setTask = (t: string) => { if (t !== task) { task = t; emit(); } };

const S = () => room?.state as any;
const meOf = () => S()?.players?.get(room!.sessionId);
const here = (p: any): Cell => ({ x: Math.round(p.x), y: Math.round(p.y) });
const invCount = (itemId: number) => inv?.items.filter((s) => s.itemId === itemId).reduce((n, s) => n + s.amount, 0) ?? 0;
const locked = () => (opts.locked ? opts.locked() : dlgOpen);

export function onAuto(f: (on: boolean, task: string) => void) { listeners.add(f); }
export const autoOn = () => on;
export const autoTask = () => task;

/** Listen to a room's messages (call once per room; `undefined` = left the world). */
export function bindAuto(r: Room | undefined, o: AutoOptions = {}) {
  stopAuto();
  for (const off of offs.splice(0)) off();
  if (timer) clearInterval(timer);
  timer = undefined;
  room = r; opts = o; inv = undefined; own = undefined; lootTried.clear(); dlgOpen = false;
  if (!r) return;
  const sub = (type: string, f: (m: any) => void) => { const off = r.onMessage(type, f); if (typeof off === "function") offs.push(off); };
  sub(Msg.inv, (m: InvEvent) => { inv = m; });
  sub(Msg.status, (m: StatusEvent) => { own = m; });
  sub(Msg.npcMes, () => { dlgOpen = true; if (on) stopAuto("Auto stopped: you are talking to someone."); });
  sub(Msg.npcEnd, () => { dlgOpen = false; });
  sub(Msg.hit, (m: { from: string; to: string; miss: boolean }) => { if (m.to === r.sessionId && !m.miss && S()?.monsters?.has(m.from)) { hitBy = m.from; hitAt = Date.now(); } });
  sub(Msg.shop, () => { if (on) stopAuto("Auto stopped: a shop window is open."); });
  sub(Msg.die, (m: { id: string }) => { if (m.id === r.sessionId && on) stopAuto("Auto stopped: you were knocked out."); else if (m.id === target) target = undefined; });
  timer = setInterval(tick, TICK_MS);
}

/** `quiet`: no chat line (auto goes on after a map change). */
export function setAuto(v: boolean, quiet = false) {
  if (v === on) return;
  if (!v) return stopAuto();
  if (!room) return;
  on = true; goalKey = ""; target = undefined; resting = false; task = "Starting…";
  if (!quiet) opts.log?.("Auto on: the character hunts for you. Click anywhere to take over.");
  emit();
}
export function toggleAuto() { setAuto(!on); }
/** Stop (a manual click, death, a window the player opened...). `why` goes to the chat log. */
export function stopAuto(why?: string) {
  if (!on) return;
  on = false; task = ""; goalKey = ""; target = undefined; resting = false;
  if (naviActive()) stopNavi();
  if (why) opts.log?.(why);
  emit();
}

// ---------- planning ----------
/** The step for this tick (exported for tests / the bot's log). */
export function plan(): AutoStep {
  const lv = own?.level ?? S()?.players?.get(room!.sessionId)?.level ?? 1;
  const band = MOBS.filter((m) => m.level <= lv + BAND && m.level >= Math.max(1, lv - 10 - BAND)).map((m) => m.id);
  // the field for this level: its species count too, and its hunting ground is where to go when nothing is in sight
  const field = fieldForLevel(lv, true), home = FIELD_MOBS[field];
  return { do: "hunt", mobIds: [...new Set([...band, ...home.mobs])], loot: "any", fallback: { ...home.hunt, map: field }, why: "Hunting nearby monsters" };
}

// ---------- execution ----------
function tick() {
  if (!on || !room) return;
  const me = meOf(), now = Date.now();
  if (!me) return;
  if (me.dead) return stopAuto("Auto stopped: you were knocked out.");
  if (own && own.maxWeight && own.weight >= own.maxWeight * WEIGHT_STOP) return stopAuto("Auto stopped: you are carrying 50% of your weight limit or more.");
  if (locked()) return stopAuto("Auto stopped: a window is open.");
  // low HP: sit and recover (natural regen twice as fast while sitting), then go on
  const hp = own?.hp ?? 1, maxHp = own?.maxHp ?? 1;
  if (!resting && hp < maxHp * REST_BELOW) { resting = true; target = undefined; if (naviActive()) stopNavi(); goalKey = ""; }
  if (resting) {
    const pct = `HP ${Math.floor((100 * hp) / Math.max(1, maxHp))}%`;
    if (hp >= maxHp * REST_UNTIL) resting = false;
    else {
      // a healing item from the bag first (what a player's F-key would do), then fight off whatever is still hitting us,
      // and only sit (2x natural regen) once nothing is
      const pot = hp < maxHp * REST_BELOW && inv?.items.find((it) => !it.equip && ITEMS.get(it.itemId)?.type === "Healing");
      if (pot && now >= potionAt) { potionAt = now + POTION_MS; room.send(Msg.useItem, { uid: pot.uid }); }
      const foe = hitBy && now - hitAt < FIGHT_BACK_MS ? S()?.monsters?.get(hitBy) : undefined;
      if (foe && !foe.dead) {
        setTask(`Fighting back (${pct})`);
        if (me.sitting) { if (now >= sitAt) { room.send(Msg.sit); sitAt = now + 1200; } return; }
        if (now >= attackAt) { room.send(Msg.attack, { id: hitBy }); attackAt = now + ATTACK_MS; }
        return;
      }
      return rest(me, now, `Resting: ${pct}`);
    }
  }
  const step = plan();
  setTask(step.why);
  if (step.do === "rest") return rest(me, now, step.why);
  if (step.do === "idle") { if (naviActive() && goalKey) { stopNavi(); goalKey = ""; } return; }
  if (me.sitting) { // stand up first (the sit request toggles); navigation does this itself for walks
    if (now >= sitAt) { room.send(Msg.sit); sitAt = now + 1200; }
    return;
  }
  hunt(step, me, now);
}

function rest(me: any, now: number, why: string) {
  setTask(why);
  if (naviActive()) stopNavi();
  goalKey = ""; target = undefined;
  if (!me.sitting && !me.moving && now >= sitAt) { room!.send(Msg.sit); sitAt = now + 1200; }
}

function hunt(step: Extract<AutoStep, { do: "hunt" }>, me: any, now: number) {
  const st = S(), at = here(me), map = mapOfState(st);
  // loot first: the quest's items (or anything, when just hunting) lying close by
  let item: [string, any] | undefined, bd = Infinity;
  st.floor?.forEach((f: any, id: string) => {
    if (step.loot !== "any" && !step.loot.includes(f.itemId)) return;
    if (now - (lootTried.get(id) ?? 0) < 5000) return;
    const d = cheb(at, here(f));
    if (d <= LOOT_RANGE && d < bd) { bd = d; item = [id, f]; }
  });
  if (item) {
    lootTried.set(item[0], now);
    if (naviActive()) stopNavi();
    goalKey = ""; target = undefined;
    room!.send(Msg.pickup, { id: item[0] }); // the server walks there and picks it up (pc_takeitem)
    setTask(`Picking up ${ITEMS.get(item[1].itemId)?.name ?? "an item"}`);
    return;
  }
  // keep hitting the current target while it lives and counts
  const cur = target ? st.monsters?.get(target) : undefined;
  if (cur && !cur.dead && step.mobIds.includes(cur.mobId) && cheb(at, here(cur)) <= ATTACK_RANGE + 2) {
    if (now >= attackAt) { room!.send(Msg.attack, { id: target }); attackAt = now + ATTACK_MS; }
    return;
  }
  target = undefined;
  // the nearest live monster that counts and that a walk can reach (a spawn walled in by trees is skipped)
  const live: { id: string; m: any; d: number }[] = [];
  st.monsters?.forEach((m: any, id: string) => { if (!m.dead && step.mobIds.includes(m.mobId)) live.push({ id, m, d: cheb(at, here(m)) }); });
  live.sort((a, b) => a.d - b.d);
  const pick = live.slice(0, 4).find((c) => c.d < 2 || naviRoute(map, at.x, at.y, Math.round(c.m.x), Math.round(c.m.y)).length > 0);
  if (pick && pick.d <= ATTACK_RANGE) {
    if (naviActive()) stopNavi();
    goalKey = ""; target = pick.id; attackAt = now + ATTACK_MS;
    room!.send(Msg.attack, { id: pick.id });
    return;
  }
  if (pick) {
    const key = `mob:${pick.m.mobId}`;
    if (naviActive() && goalKey === key) return;
    goalKey = key;
    startNavi({ kind: "mob", mobIds: [pick.m.mobId], fallback: step.fallback }, MOB_BY_ID.get(pick.m.mobId)?.name ?? "");
    return;
  }
  const away = !!step.fallback?.map && step.fallback.map !== st.map;
  if (step.fallback && (away || cheb(at, step.fallback) > 3)) {
    const key = `area:${step.fallback.map ?? ""}:${step.fallback.x},${step.fallback.y}`;
    if (naviActive() && goalKey === key) return;
    goalKey = key;
    startNavi({ kind: "cell", x: step.fallback.x, y: step.fallback.y, within: 3, map: step.fallback.map }, "hunting ground");
    return;
  }
  setTask(`${step.why} (waiting for monsters)`);
}
