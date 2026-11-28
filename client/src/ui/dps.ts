// Combat meter: your own damage, from the hits the server reports (Msg.hit with you as the source), so it shows what really landed.
// A fight starts with your first hit and ends after 8 s without one; the panel then keeps the last fight's numbers until the next one.
// Damage per second over the fight and over the last 5 s, total, hits, critical %, biggest hit, skill share. Great on the training dummies.
import { t } from "../i18n.ts";

type Hit = { at: number; dmg: number; crit: boolean; skill: boolean };
const IDLE_MS = 8000, RECENT_MS = 5000;
let fight: Hit[] = [], start = 0, last = 0, el: HTMLDivElement | undefined, timer = 0;

const fmt = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));
function panel() {
  if (el) return el;
  el = document.createElement("div");
  el.id = "dps-meter";
  el.hidden = true;
  el.addEventListener("dblclick", () => { fight = []; start = last = 0; render(); });
  el.title = t("dps.reset_hint");
  document.getElementById("hud")?.append(el);
  return el;
}
function render() {
  const p = panel(), now = performance.now();
  if (!fight.length) { p.hidden = true; return; }
  const secs = Math.max(1, (last - start) / 1000), total = fight.reduce((n, h) => n + h.dmg, 0);
  const recent = fight.filter((h) => now - h.at <= RECENT_MS).reduce((n, h) => n + h.dmg, 0) / (RECENT_MS / 1000);
  const crits = fight.filter((h) => h.crit).length, skill = fight.filter((h) => h.skill).reduce((n, h) => n + h.dmg, 0);
  const live = now - last < IDLE_MS;
  p.hidden = false;
  p.classList.toggle("idle", !live);
  p.innerHTML = `<b>${t("dps.title")}</b><span class="big">${fmt(total / secs)}</span><small>${t("dps.dps")}</small>`
    + `<div class="rows"><span>${t("dps.now")}</span><b>${live ? fmt(recent) : "–"}</b><span>${t("dps.total")}</span><b>${fmt(total)}</b>`
    + `<span>${t("dps.hits")}</span><b>${fight.length}</b><span>${t("dps.crit")}</span><b>${Math.round((crits * 100) / fight.length)}%</b>`
    + `<span>${t("dps.max")}</span><b>${fmt(Math.max(...fight.map((h) => h.dmg)))}</b><span>${t("dps.skills")}</span><b>${total ? Math.round((skill * 100) / total) : 0}%</b>`
    + `<span>${t("dps.time")}</span><b>${secs.toFixed(0)} s</b></div>`;
}
/** Every hit the server reports for this character as the attacker. */
export function recordHit(m: { dmg: number; crit: boolean; miss: boolean; skill?: number }) {
  if (m.miss || m.dmg <= 0) return;
  const now = performance.now();
  if (!fight.length || now - last > IDLE_MS) { fight = []; start = now; }
  fight.push({ at: now, dmg: m.dmg, crit: m.crit, skill: !!m.skill });
  if (fight.length > 5000) fight.splice(0, 1000);
  last = now;
  render();
  if (!timer) timer = window.setInterval(() => { render(); if (performance.now() - last > IDLE_MS * 4) { clearInterval(timer); timer = 0; } }, 500);
}
