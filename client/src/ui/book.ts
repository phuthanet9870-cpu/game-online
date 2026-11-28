// The Adventure Book window (Alt+B, and its button in the window dock): the server's record of what this character has met and found
// (shared/rules/collection.ts, server/src/collection.ts). Monsters (kills, a star at MASTERY_KILLS), variants, cards, and the milestones
// with their Claim buttons. The book is the server's: this window only shows it and asks to claim.
import type { Room } from "@colyseus/sdk";
import { Msg, type BookEntryEvent, type BookEvent } from "../../../shared/protocol.ts";
import { BOOK_CARDS, BOOK_MOBS, BOOK_VARIANTS, MASTERY_KILLS, MILESTONES, bookKey, discovered, milestoneReached, type Book, type Kind } from "../../../shared/rules/collection.ts";
import { MOB_BY_ID } from "../../../shared/rules/data.ts";
import { ITEMS } from "../../../shared/rules/items.ts";
import { VARIANT_BY_ID } from "../../../shared/rules/variants.ts";
import { getLang, onLangChange, t } from "../i18n.ts";
import { toggle } from "./windows.ts";
import { iconEl } from "./items.ts";
import "./book.css";

let room: Room | undefined;
let book: Book = new Map(), claimed = new Set<string>(), tab: "mob" | "variant" | "card" | "goals" = "mob";
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

const win = document.createElement("section");
win.className = "win"; win.id = "w-book"; win.hidden = true;
win.innerHTML = `<header class="win-title"><span class="bk-title"></span><button data-close title="Close (Alt+B)">×</button></header>
  <nav class="bk-tabs"></nav><div class="win-body bk-body"></div>`;
document.getElementById("hud")?.append(win);

function tabs() {
  const nav = win.querySelector(".bk-tabs")!;
  const list: [typeof tab, string, string][] = [
    ["mob", t("book.monsters"), `${discovered(book, "mob")}/${BOOK_MOBS.length}`], ["variant", t("book.variants"), `${discovered(book, "variant")}/${BOOK_VARIANTS.length}`],
    ["card", t("book.cards"), `${discovered(book, "card")}/${BOOK_CARDS.length}`], ["goals", t("book.goals"), `${claimed.size}/${MILESTONES.length}`],
  ];
  nav.innerHTML = list.map(([k, name, n]) => `<button type="button" data-tab="${k}" class="${k === tab ? "on" : ""}">${esc(name)} <small>${n}</small></button>`).join("");
  nav.querySelectorAll<HTMLButtonElement>("button").forEach((b) => b.addEventListener("click", () => { tab = b.dataset.tab as typeof tab; render(); }));
}
function render() {
  win.querySelector(".bk-title")!.textContent = t("book.title");
  tabs();
  const body = win.querySelector(".bk-body")! as HTMLElement;
  body.innerHTML = "";
  const count = (kind: Kind, ref: number) => book.get(bookKey(kind, ref)) ?? 0;
  if (tab === "mob") {
    const grid = document.createElement("div"); grid.className = "bk-grid";
    for (const id of BOOK_MOBS) {
      const m = MOB_BY_ID.get(id)!, n = count("mob", id), cell = document.createElement("div");
      cell.className = `bk-cell${n ? "" : " unknown"}${n >= MASTERY_KILLS ? " mastered" : ""}`;
      cell.innerHTML = n ? `<b>${esc(m.name)}</b><small>Lv ${m.level} · ${m.race} · ${m.element}</small><span>${t("book.kills", { n })}${n >= MASTERY_KILLS ? " ★" : ""}</span>`
        : `<b>???</b><small>Lv ${m.level}</small><span>${t("book.unknown")}</span>`;
      grid.append(cell);
    }
    body.append(grid);
  } else if (tab === "variant") {
    const grid = document.createElement("div"); grid.className = "bk-grid";
    for (const id of BOOK_VARIANTS) {
      const v = VARIANT_BY_ID.get(id)!, n = count("variant", id), cell = document.createElement("div");
      cell.className = `bk-cell${n ? "" : " unknown"}`;
      cell.innerHTML = `<b style="color:${n ? v.colour : "inherit"}">${n ? esc(v.title) : "???"}</b><span>${n ? t("book.kills", { n }) : t("book.unknown")}</span>`;
      grid.append(cell);
    }
    body.append(grid);
  } else if (tab === "card") {
    const grid = document.createElement("div"); grid.className = "bk-cards";
    for (const id of BOOK_CARDS) {
      const n = count("card", id), cell = document.createElement("div");
      cell.className = `bk-card${n ? "" : " unknown"}`;
      cell.append(iconEl(id, undefined, 32));
      cell.title = n ? ITEMS.get(id)!.name : "???";
      grid.append(cell);
    }
    body.append(grid);
  } else {
    for (const m of MILESTONES) {
      const row = document.createElement("div"), done = claimed.has(m.id), ok = milestoneReached(book, m);
      row.className = `bk-goal${done ? " done" : ok ? " ready" : ""}`;
      const reward = [m.reward.zeny ? `${m.reward.zeny.toLocaleString()} z` : "", ...(m.reward.items ?? []).map((r) => `${r.count} × ${r.item}`)].filter(Boolean).join(", ");
      row.innerHTML = `<div><b>${esc(getLang() === "th" ? m.th : m.title)}</b><small>${discovered(book, m.kind)}/${m.need} · ${esc(reward)}</small></div>`;
      const btn = document.createElement("button");
      btn.type = "button"; btn.className = "btn"; btn.disabled = done || !ok;
      btn.textContent = done ? t("book.claimed") : t("book.claim");
      btn.addEventListener("click", () => room?.send(Msg.bookClaim, { id: m.id }));
      row.append(btn);
      body.append(row);
    }
  }
}

export function bindBook(r: Room) {
  room = r;
  r.onMessage(Msg.book, (m: BookEvent) => { book = new Map(m.entries); claimed = new Set(m.claimed); if (!win.hidden) render(); });
  r.onMessage(Msg.bookEntry, (m: BookEntryEvent) => { book.set(bookKey(m.kind as Kind, m.ref), m.count); if (!win.hidden) render(); });
}
export function toggleBook(show?: boolean) { toggle(win, show); if (!win.hidden) render(); }
onLangChange(() => { if (!win.hidden) render(); });
addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement | null)?.closest?.("input, textarea, select") || document.body.dataset.screen !== "game") return;
  if (e.altKey && e.code === "KeyB") { e.preventDefault(); toggleBook(); }
});
// its button in the window dock and the Basic Info menu
const menu = document.getElementById("bi-menu");
if (menu && !document.getElementById("btn-book")) {
  const b = document.createElement("button");
  b.type = "button"; b.id = "btn-book"; b.title = "Adventure Book (Alt+B)";
  b.innerHTML = `<svg viewBox="0 0 20 20"><path d="M3 3.5h6c1 0 1 .6 1 1.2V17c0-.8-.6-1.2-1.4-1.2H3zM17 3.5h-6c-1 0-1 .6-1 1.2V17c0-.8.6-1.2 1.4-1.2H17z"/></svg>`;
  b.addEventListener("click", () => toggleBook());
  menu.append(b);
}
const dock = document.getElementById("menu-icons");
if (dock && !dock.querySelector('[data-win="w-book"]')) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "mico"; b.dataset.for = "btn-book"; b.dataset.win = "w-book"; b.title = "Adventure Book (Alt+B)";
  b.innerHTML = `<svg viewBox="0 0 24 24"><path d="M3.5 4.5h7c1.2 0 1.5.7 1.5 1.5v14c0-1-.7-1.5-1.7-1.5H3.5zM20.5 4.5h-7c-1.2 0-1.5.7-1.5 1.5v14c0-1 .7-1.5 1.7-1.5h6.8z"/></svg>`;
  dock.insertBefore(b, dock.lastElementChild);
}
