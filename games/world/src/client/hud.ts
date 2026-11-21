import { CHAT_MAX_LENGTH } from "../shared";

const MAX_LOG_LINES = 60;

/** DOM overlay: map name, player count, controls help, and the chat box. */
export class Hud {
  readonly root = document.createElement("div");
  private readonly log: HTMLDivElement;
  private readonly input: HTMLInputElement;
  private readonly online: HTMLSpanElement;
  private readonly onKey: (e: KeyboardEvent) => void;

  constructor(mapName: string, onSend: (text: string) => void) {
    this.root.className = "world-hud";
    this.root.innerHTML = `
      <div class="world-top">
        <div class="world-panel"><strong class="map"></strong> · ออนไลน์ <span class="online">0</span></div>
        <div class="world-panel help">คลิกพื้นเพื่อเดิน · คลิกขวาลาก หรือ Q/E หมุนกล้อง · ล้อเมาส์ซูม · Enter แชท</div>
      </div>
      <div class="world-chat">
        <div class="log" aria-live="polite"></div>
        <input class="input" maxlength="${CHAT_MAX_LENGTH}" placeholder="กด Enter เพื่อพิมพ์" autocomplete="off" />
      </div>`;
    this.root.querySelector(".map")!.textContent = mapName;
    this.log = this.root.querySelector(".log")!;
    this.input = this.root.querySelector(".input")!;
    this.online = this.root.querySelector(".online")!;

    this.input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        const text = this.input.value.trim();
        if (text) onSend(text);
        this.input.value = "";
        this.input.blur();
      } else if (e.key === "Escape") {
        this.input.blur();
      }
    });
    this.onKey = (e) => {
      if (e.key === "Enter" && document.activeElement !== this.input) {
        e.preventDefault();
        this.input.focus();
      }
    };
    window.addEventListener("keydown", this.onKey);
  }

  /** True while the player is typing, so game hotkeys stay off. */
  get typing(): boolean {
    return document.activeElement === this.input;
  }

  setOnline(count: number) {
    this.online.textContent = String(count);
  }

  addLine(name: string, text: string, kind: "chat" | "system" = "chat") {
    const line = document.createElement("div");
    line.className = `line ${kind}`;
    if (kind === "chat") {
      const who = document.createElement("strong");
      who.textContent = `${name}: `;
      line.append(who);
    }
    line.append(document.createTextNode(text));
    this.log.append(line);
    while (this.log.childElementCount > MAX_LOG_LINES) this.log.firstElementChild!.remove();
    this.log.scrollTop = this.log.scrollHeight;
  }

  dispose() {
    window.removeEventListener("keydown", this.onKey);
    this.root.remove();
  }
}
