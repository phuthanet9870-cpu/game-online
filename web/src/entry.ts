// Browser single-player entry: load the game files, start the server inside this page, then start the normal client.
import "./globals.ts";
import "../../client/src/style.css";
import { assetBlob, loadPacks, rewriteSheets } from "./assets.ts";

const box = document.createElement("div");
box.id = "boot";
box.innerHTML = `<div class="boot-card"><div class="boot-title">Game Online</div><div class="boot-msg">Loading game files…</div>
  <div class="boot-bar"><i></i></div><div class="boot-note">Single-player build: the server runs in this tab.</div></div>`;
const style = document.createElement("style");
style.textContent = `#boot{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;background:#0b1020;color:#e8ecf8;font:14px/1.5 system-ui,sans-serif}
#boot .boot-card{width:min(360px,calc(100vw - 32px));text-align:center}
#boot .boot-title{font:700 28px Georgia,serif;color:#ffd757;margin-bottom:12px;letter-spacing:.04em}
#boot .boot-bar{height:8px;border-radius:4px;background:#1f2a4a;overflow:hidden;margin:12px 0}
#boot .boot-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#f2a928,#ffd757);transition:width .15s}
#boot .boot-note{opacity:.6;font-size:12px}#boot.err .boot-msg{color:#ff8a8a;white-space:pre-wrap}`;
document.head.append(style);
document.body.append(box);
const msg = box.querySelector(".boot-msg") as HTMLElement, bar = box.querySelector(".boot-bar i") as HTMLElement;
const mb = (n: number) => (n / 1048576).toFixed(1);

try {
  await loadPacks((got, total) => {
    bar.style.width = `${(100 * got) / total}%`;
    msg.textContent = `Loading game files… ${mb(got)} / ${mb(total)} MB`;
  });
  msg.textContent = "Starting the server…";
  const { bootServer } = await import("./server.ts");
  const net = await import("./net.ts");
  const app = await bootServer();
  net.installFetch(app, assetBlob);
  net.installWebSocket();
  const { persistent } = await import("./db.ts");
  if (!persistent) console.warn("Progress is kept only until this tab closes.");
  await import("../../client/src/main.ts");
  rewriteSheets();
  box.remove();
  style.remove();
} catch (e) {
  console.error(e);
  box.classList.add("err");
  msg.textContent = `Could not start the game:\n${(e as Error)?.message ?? e}`;
}
