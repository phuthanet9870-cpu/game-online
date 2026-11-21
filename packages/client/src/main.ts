import { Client } from "@colyseus/sdk";
import { GAMES } from "./games";

/** In dev the game server runs on its own port; in production it serves this page. */
function serverUrl(): string {
  const configured = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (configured) return configured;
  if (import.meta.env.DEV) return `${location.protocol}//${location.hostname}:2567`;
  return location.origin;
}

const lobby = document.querySelector<HTMLFormElement>("#lobby")!;
const nameInput = document.querySelector<HTMLInputElement>("#name")!;
const list = document.querySelector<HTMLDivElement>("#games")!;
const errorBox = document.querySelector<HTMLParagraphElement>("#lobby-error")!;
const container = document.querySelector<HTMLDivElement>("#game")!;

nameInput.value = safeGet("playerName") ?? "";
lobby.addEventListener("submit", (e) => e.preventDefault());

for (const game of GAMES) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "game-card";
  button.innerHTML = `<strong></strong><span></span>`;
  button.querySelector("strong")!.textContent = game.title;
  button.querySelector("span")!.textContent = game.description;
  button.addEventListener("click", async () => {
    const playerName = nameInput.value.trim();
    safeSet("playerName", playerName);
    errorBox.hidden = true;
    lobby.querySelectorAll("button").forEach((b) => (b.disabled = true));
    try {
      await game.start({ container, sdk: new Client(serverUrl()), playerName });
      lobby.hidden = true;
    } catch (err) {
      console.error(err);
      errorBox.textContent = `เชื่อมต่อเซิร์ฟเวอร์ไม่ได้: ${err instanceof Error ? err.message : String(err)}`;
      errorBox.hidden = false;
    } finally {
      lobby.querySelectorAll("button").forEach((b) => (b.disabled = false));
    }
  });
  list.append(button);
}

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}
