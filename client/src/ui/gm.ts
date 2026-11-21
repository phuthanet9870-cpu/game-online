// GM window (server/src/gm.ts). "/gm<passphrase>" in chat asks the server to unlock it (the text never reaches chat); once
// the account is GM, "/gm" alone opens and closes the window. Players: everyone online, and every action on one of them.
// World: spawn monsters, clear the map, announce, EXP / drop rates, warp. Log: the server's answers.
import "./gm.css";
import type { Room } from "@colyseus/sdk";
import { Msg, type GmOnlineEvent, type GmOp, type GmResultEvent, type GmStateEvent } from "../../../shared/protocol.ts";
import { JOBS, MOBS } from "../../../shared/rules/data.ts";
import { ITEMS } from "../../../shared/rules/items.ts";
import { MAP_INFO, MAP_NAMES } from "../../../shared/maps.ts";
import { log } from "./hud.ts";
import { play } from "../audio.ts";

let room: Room | undefined;
let el: HTMLElement | undefined;
let isGm = false;
let tab: "players" | "world" | "log" = "players";
let players: GmOnlineEvent["players"] = [];
let rates = { exp: 1, drop: 1 };
const results: (GmResultEvent & { at: string })[] = [];

export function bindGm(r: Room) {
  room = r;
  r.onMessage(Msg.gmState, (m: GmStateEvent) => {
    const first = !isGm && m.gm;
    isGm = m.gm; rates = m.rates;
    if (!m.gm) return close();
    if (first) log("system", "GM menu unlocked. Type /gm to open or close it.");
    open();
  });
  r.onMessage(Msg.gmResult, (m: GmResultEvent) => {
    results.unshift({ ...m, at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) });
    if (results.length > 80) results.pop();
    toast(m);
    if (tab === "log") render();
    if (m.ok && tab === "players") send({ op: "online" }); // numbers changed: refresh the list
  });
  r.onMessage(Msg.gmOnline, (m: GmOnlineEvent) => { players = m.players; if (tab === "players") renderPlayers(); });
}

/** chat input: "/gm..." is a GM request, never a chat line */
export function handleGmInput(text: string): boolean {
  const m = /^\/gm(\S*)$/i.exec(text.trim());
  if (!m || !room) return false;
  if (isGm && !m[1]) { if (el && !el.hidden) close(); else open(); return true; }
  room.send(Msg.gmAuth, { phrase: m[1] });
  return true;
}

const send = (op: GmOp) => room?.send(Msg.gm, op);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function close() { if (el) el.hidden = true; }
function open() {
  if (!el) build();
  el!.hidden = false;
  play("sfx", "ui_open", 0.4);
  setTab(tab);
}

function build() {
  el = document.createElement("section");
  el.id = "gm-panel";
  el.setAttribute("aria-label", "GM");
  el.innerHTML = `
    <header class="gm-head"><span class="gm-badge">GM</span><strong>Game Master</strong>
      <div class="gm-tabs"><button data-t="players" class="on">Players</button><button data-t="world">World</button><button data-t="log">Log</button></div>
      <button class="gm-x" aria-label="Close GM menu">✕</button></header>
    <div class="gm-body"></div>
    <div class="gm-toast" hidden></div>
    <datalist id="gm-items">${[...ITEMS.values()].map((i) => `<option value="${i.id}">${esc(i.name)}</option>`).join("")}</datalist>
    <datalist id="gm-mobs">${MOBS.map((m) => `<option value="${m.id}">${esc(m.name)} · Lv ${m.level}</option>`).join("")}</datalist>
    <datalist id="gm-names"></datalist>`;
  document.body.append(el);
  el.querySelector(".gm-x")!.addEventListener("click", close);
  for (const b of el.querySelectorAll<HTMLButtonElement>(".gm-tabs button")) b.addEventListener("click", () => setTab(b.dataset.t as typeof tab));
  // drag by the header
  const head = el.querySelector<HTMLElement>(".gm-head")!;
  head.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const r = el!.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
    head.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => { el!.style.left = `${Math.max(0, Math.min(innerWidth - 120, ev.clientX - ox))}px`; el!.style.top = `${Math.max(0, Math.min(innerHeight - 40, ev.clientY - oy))}px`; el!.style.right = "auto"; };
    head.addEventListener("pointermove", move);
    head.addEventListener("pointerup", () => head.removeEventListener("pointermove", move), { once: true });
  });
  // keys typed in the GM window never reach the game (M map, Enter chat, hotkeys)
  el.addEventListener("keydown", (e) => e.stopPropagation());
}

function setTab(t: typeof tab) {
  tab = t;
  for (const b of el!.querySelectorAll<HTMLButtonElement>(".gm-tabs button")) b.classList.toggle("on", b.dataset.t === t);
  if (t === "players") send({ op: "online" });
  render();
}

function render() {
  const body = el!.querySelector<HTMLElement>(".gm-body")!;
  if (tab === "players") body.innerHTML = playersHtml();
  else if (tab === "world") body.innerHTML = worldHtml();
  else body.innerHTML = results.length ? `<ol class="gm-log">${results.map((r) => `<li class="${r.ok ? "ok" : "no"}"><time>${r.at}</time>${esc(r.text)}</li>`).join("")}</ol>` : `<p class="gm-empty">Nothing yet. Results of your GM actions show up here.</p>`;
  wire(body);
  if (tab === "players") renderPlayers();
}

const jobOptions = () => (Object.keys(JOBS) as (keyof typeof JOBS)[]).map((k) => `<option value="${k}">${esc(JOBS[k].name)} (${k})</option>`).join("");
const mapOptions = () => MAP_NAMES.map((n) => `<option value="${n}">${esc(MAP_INFO[n].title)}</option>`).join("");

function playersHtml() {
  return `
    <div class="gm-row"><input id="gm-target" list="gm-names" placeholder="Character name (empty = you)" autocomplete="off"><button data-a="refresh" class="ghost" title="Refresh">⟳</button></div>
    <div class="gm-list" id="gm-list"></div>
    <div class="gm-section"><h4>Quick</h4><div class="gm-btns">
      <button data-a="heal">Heal</button><button data-a="revive">Revive</button><button data-a="goto">Go to</button>
      <button data-a="summon">Summon</button><button data-a="kill" class="warn">Kill</button><button data-a="kick" class="warn">Kick</button></div></div>
    <div class="gm-section"><h4>Character</h4>
      <div class="gm-row"><label>Base Lv<input id="gm-base" type="number" min="1" max="99"></label><label>Job Lv<input id="gm-joblv" type="number" min="1" max="70"></label><button data-a="level">Set</button></div>
      <div class="gm-row"><select id="gm-job">${jobOptions()}</select><button data-a="job">Change job</button></div>
      <div class="gm-row"><select id="gm-stat"><option>str</option><option>agi</option><option>vit</option><option>int</option><option>dex</option><option>luk</option></select><input id="gm-statv" type="number" min="1" max="999" placeholder="Value"><button data-a="stat">Set stat</button></div>
      <div class="gm-row"><label>Status pts<input id="gm-sp" type="number" min="0"></label><label>Skill pts<input id="gm-kp" type="number" min="0"></label><button data-a="points">Set</button></div></div>
    <div class="gm-section"><h4>Give</h4>
      <div class="gm-row"><input id="gm-zeny" type="number" placeholder="Zeny (− to take)"><button data-a="zeny">Zeny</button></div>
      <div class="gm-row"><input id="gm-item" list="gm-items" placeholder="Item id or pick"><input id="gm-itemn" type="number" min="1" value="1" class="short"><button data-a="item">Item</button></div></div>
    <div class="gm-section"><h4>Move</h4>
      <div class="gm-row"><select id="gm-map">${mapOptions()}</select><input id="gm-x" type="number" placeholder="x" class="short"><input id="gm-y" type="number" placeholder="y" class="short"><button data-a="warp">Warp</button></div></div>
    <div class="gm-section"><h4>Moderation</h4>
      <div class="gm-row"><input id="gm-min" type="number" min="1" value="10" class="short"><span class="unit">min</span><button data-a="mute">Mute</button><button data-a="unmute" class="ghost">Unmute</button></div>
      <div class="gm-row"><input id="gm-hours" type="number" min="1" value="24" class="short"><span class="unit">h</span><button data-a="ban" class="warn">Ban</button><button data-a="unban" class="ghost">Unban</button></div>
      <div class="gm-row"><button data-a="gm-on">Make GM</button><button data-a="gm-off" class="ghost">Remove GM</button></div></div>`;
}

function worldHtml() {
  return `
    <div class="gm-section"><h4>Monsters on this map</h4>
      <div class="gm-row"><input id="gm-mob" list="gm-mobs" placeholder="Monster id or pick"><input id="gm-mobn" type="number" min="1" max="50" value="1" class="short"><button data-a="spawn">Spawn</button></div>
      <div class="gm-row"><button data-a="killmobs" class="warn">Defeat every monster here</button></div></div>
    <div class="gm-section"><h4>Announcement</h4>
      <div class="gm-row"><input id="gm-ann" maxlength="160" placeholder="Shown to everyone online"><button data-a="announce">Send</button></div></div>
    <div class="gm-section"><h4>Server rates</h4>
      <div class="gm-row"><label>EXP %<input id="gm-rexp" type="number" min="0" max="10000" value="${Math.round(rates.exp * 100)}"></label><label>Drops %<input id="gm-rdrop" type="number" min="0" max="10000" value="${Math.round(rates.drop * 100)}"></label><button data-a="rates">Apply</button></div>
      <p class="gm-note">100 = normal. Applies to everyone until the server restarts.</p></div>
    <div class="gm-section"><h4>Warp me</h4>
      <div class="gm-row"><select id="gm-wmap">${mapOptions()}</select><input id="gm-wx" type="number" placeholder="x" class="short"><input id="gm-wy" type="number" placeholder="y" class="short"><button data-a="warpme">Go</button></div></div>`;
}

function renderPlayers() {
  const list = el?.querySelector<HTMLElement>("#gm-list");
  if (!list) return;
  el!.querySelector("#gm-names")!.innerHTML = players.map((p) => `<option value="${esc(p.name)}">`).join("");
  list.innerHTML = players.length ? players.map((p) => `
    <button class="gm-p" data-name="${esc(p.name)}">
      <span class="nm">${esc(p.name)}${p.gm ? ` <i class="tag">GM</i>` : ""}${p.muted ? ` <i class="tag mute">muted</i>` : ""}${p.dead ? ` <i class="tag dead">down</i>` : ""}</span>
      <span class="meta">${esc(JOBS[p.job as keyof typeof JOBS]?.name ?? p.job)} · Lv ${p.level}/${p.jobLevel} · ${esc(MAP_INFO[p.map as keyof typeof MAP_INFO]?.title ?? p.map)}</span>
      <span class="hp"><i style="width:${p.maxHp ? Math.round((100 * p.hp) / p.maxHp) : 0}%"></i></span>
    </button>`).join("") : `<p class="gm-empty">Loading players…</p>`;
  for (const b of list.querySelectorAll<HTMLButtonElement>(".gm-p")) b.addEventListener("click", () => {
    (el!.querySelector("#gm-target") as HTMLInputElement).value = b.dataset.name!;
    for (const o of list.querySelectorAll(".gm-p")) o.classList.toggle("on", o === b);
  });
}

function wire(body: HTMLElement) {
  const v = (id: string) => (body.querySelector(`#${id}`) as HTMLInputElement | HTMLSelectElement | null)?.value.trim() ?? "";
  const n = (id: string) => (v(id) === "" ? undefined : Number(v(id)));
  const target = () => v("gm-target") || undefined;
  const need = (): string | undefined => { const t = target(); if (!t) toast({ ok: false, text: "Pick a player first (click a name or type one)." }); return t; };
  const actions: Record<string, () => GmOp | undefined> = {
    refresh: () => ({ op: "online" }),
    heal: () => ({ op: "heal", target: target() }), revive: () => ({ op: "revive", target: target() }),
    goto: () => { const t = need(); return t ? { op: "goto", target: t } : undefined; }, summon: () => { const t = need(); return t ? { op: "summon", target: t } : undefined; },
    kill: () => { const t = need(); return t ? { op: "kill", target: t } : undefined; }, kick: () => { const t = need(); return t ? { op: "kick", target: t } : undefined; },
    level: () => ({ op: "level", target: target(), base: n("gm-base"), job: n("gm-joblv") }),
    job: () => ({ op: "job", target: target(), job: v("gm-job") }),
    stat: () => ({ op: "stat", target: target(), stat: v("gm-stat") as "str", value: n("gm-statv") ?? 1 }),
    points: () => ({ op: "points", target: target(), status: n("gm-sp"), skill: n("gm-kp") }),
    zeny: () => ({ op: "zeny", target: target(), amount: n("gm-zeny") ?? 0 }),
    item: () => ({ op: "item", target: target(), itemId: parseInt(v("gm-item"), 10), amount: n("gm-itemn") ?? 1 }),
    warp: () => ({ op: "warp", target: target(), map: v("gm-map"), x: n("gm-x"), y: n("gm-y") }),
    mute: () => { const t = need(); return t ? { op: "mute", target: t, minutes: n("gm-min") ?? 10 } : undefined; },
    unmute: () => { const t = need(); return t ? { op: "unmute", target: t } : undefined; },
    ban: () => { const t = need(); return t ? { op: "ban", target: t, hours: n("gm-hours") ?? 24 } : undefined; },
    unban: () => { const t = need(); return t ? { op: "unban", target: t } : undefined; },
    "gm-on": () => { const t = need(); return t ? { op: "setgm", target: t, on: true } : undefined; },
    "gm-off": () => { const t = need(); return t ? { op: "setgm", target: t, on: false } : undefined; },
    spawn: () => ({ op: "spawn", mobId: parseInt(v("gm-mob"), 10), count: n("gm-mobn") ?? 1 }),
    killmobs: () => ({ op: "killmobs" }),
    announce: () => ({ op: "announce", text: v("gm-ann") }),
    rates: () => ({ op: "rates", exp: n("gm-rexp"), drop: n("gm-rdrop") }),
    warpme: () => ({ op: "warp", map: v("gm-wmap"), x: n("gm-wx"), y: n("gm-wy") }),
  };
  for (const b of body.querySelectorAll<HTMLButtonElement>("button[data-a]")) b.addEventListener("click", () => {
    const op = actions[b.dataset.a!]?.();
    if (op) { send(op); play("sfx", "click", 0.35); }
  });
}

let toastTimer = 0;
function toast(m: GmResultEvent) {
  const t = el?.querySelector<HTMLElement>(".gm-toast");
  if (!t) return;
  t.textContent = m.text;
  t.className = `gm-toast ${m.ok ? "ok" : "no"}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { t.hidden = true; }, 3200);
}
