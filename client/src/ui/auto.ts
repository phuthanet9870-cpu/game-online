// Auto-hunt UI: the "Auto" toggle (Alt+T) and the AUTO indicator with the current task. The work itself is client/src/autoplay.ts
// (ordinary intents only); this binds it to the HUD.
import "./auto.css";
import type { Room } from "@colyseus/sdk";
import { bindAuto, onAuto, toggleAuto } from "../autoplay.ts";
import { dialogOpen } from "./dialog.ts";
import { log } from "./hud.ts";
import { play } from "../audio.ts";

const hud = document.getElementById("hud") ?? document.body;
const btn = document.createElement("button");
btn.type = "button"; btn.id = "auto-btn"; btn.hidden = true;
btn.title = "Auto hunt (Alt+T). Click anywhere in the world to take over.";
btn.innerHTML = `<svg viewBox="0 0 20 20"><path d="M6 4.5l9 5.5-9 5.5z"/></svg>Auto`;
const badge = document.createElement("div");
badge.id = "auto-badge"; badge.hidden = true;
const tag = document.createElement("b"), what = document.createElement("span");
tag.textContent = "AUTO";
badge.append(tag, what);
hud.append(btn, badge);
btn.addEventListener("click", () => { toggleAuto(); play("sfx", "click", 0.4); });
addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement | null)?.closest?.("input, textarea") || document.body.dataset.screen !== "game") return;
  if (e.altKey && e.code === "KeyT") { e.preventDefault(); toggleAuto(); }
});
onAuto((on, task) => {
  btn.classList.toggle("on", on);
  btn.setAttribute("aria-pressed", String(on));
  badge.hidden = !on;
  what.textContent = task;
});

/** Give auto-play its room (from enterWorld; undefined when leaving the world). */
export function bindAutoUi(r: Room | undefined) {
  btn.hidden = !r;
  bindAuto(r, { locked: dialogOpen, log: (t) => log("system", t) });
}
export { stopAuto } from "../autoplay.ts";
