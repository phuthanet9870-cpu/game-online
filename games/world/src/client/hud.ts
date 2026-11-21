import { CHAT_MAX_LENGTH } from "../shared";

const MAX_LOG_LINES = 60;

/** DOM overlay: map name, player count, controls help, and the chat box. */
export class Hud {
  readonly root = document.createElement("div");
  private readonly log: HTMLDivElement;
  private readonly input: HTMLInputElement;
  private readonly online: HTMLSpanElement;
  private readonly onKey: (e: KeyboardEvent) => void;
  private readonly hpFill: HTMLDivElement;
  private readonly hpText: HTMLSpanElement;
  private readonly bag: HTMLDivElement;
  private readonly bagList: HTMLUListElement;
  private readonly downScreen: HTMLDivElement;

  constructor(mapName: string, onSend: (text: string) => void, onSwitchCharacter: () => void, onRevive?: () => void) {
    this.root.className = "world-hud";
    this.root.innerHTML = `
      <div class="world-top">
        <div class="world-panel"><strong class="map"></strong> · ออนไลน์ <span class="online">0</span>
          · <button type="button" class="switch">เปลี่ยนตัวละคร</button></div>
        <div class="world-panel help">คลิกพื้นเพื่อเดิน · คลิกมอนสเตอร์เพื่อโจมตี · คลิกของเพื่อเก็บ · คลิกขวาลาก หรือ Q/E หมุนกล้อง · Enter แชท · I กระเป๋า</div>
      </div>
      <div class="world-status">
        <div class="hp" role="meter" aria-label="HP"><div class="hp-fill"></div><span class="hp-text"></span></div>
        <button type="button" class="bag-toggle">กระเป๋า (I)</button>
      </div>
      <div class="world-bag" hidden><strong>กระเป๋า</strong><ul></ul></div>
      <div class="world-down" hidden>
        <div class="world-panel"><p>คุณหมดแรงแล้ว</p><button type="button" class="revive">ฟื้นที่จุดเซฟ</button></div>
      </div>
      <div class="world-chat">
        <div class="log" aria-live="polite"></div>
        <input class="input" maxlength="${CHAT_MAX_LENGTH}" placeholder="กด Enter เพื่อพิมพ์" autocomplete="off" />
      </div>`;
    this.root.querySelector(".map")!.textContent = mapName;
    this.log = this.root.querySelector(".log")!;
    this.input = this.root.querySelector(".input")!;
    this.online = this.root.querySelector(".online")!;
    this.root.querySelector(".switch")!.addEventListener("click", onSwitchCharacter);
    this.hpFill = this.root.querySelector(".hp-fill")!;
    this.hpText = this.root.querySelector(".hp-text")!;
    this.bag = this.root.querySelector(".world-bag")!;
    this.bagList = this.bag.querySelector("ul")!;
    this.downScreen = this.root.querySelector(".world-down")!;
    this.root.querySelector(".bag-toggle")!.addEventListener("click", () => this.toggleBag());
    const revive = this.root.querySelector<HTMLButtonElement>(".revive")!;
    if (onRevive) revive.addEventListener("click", onRevive);
    this.root.querySelector<HTMLElement>(".world-status")!.hidden = !onRevive;

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
      if (document.activeElement === this.input) return;
      if (e.key === "Enter") {
        e.preventDefault();
        this.input.focus();
      } else if (e.key.toLowerCase() === "i" && !e.ctrlKey && !e.metaKey) {
        this.toggleBag();
      }
    };
    window.addEventListener("keydown", this.onKey);
  }

  /** True while the player is typing, so game hotkeys stay off. */
  get typing(): boolean {
    return document.activeElement === this.input;
  }

  toggleBag() {
    this.bag.hidden = !this.bag.hidden;
  }

  private shownHp = "";

  /** Cheap to call every frame: touches the DOM only when the value changes. */
  setHp(hp: number, maxHp: number) {
    const key = `${hp}/${maxHp}`;
    if (key === this.shownHp) return;
    this.shownHp = key;
    const f = maxHp > 0 ? hp / maxHp : 0;
    this.hpFill.style.width = `${Math.round(f * 100)}%`;
    this.hpFill.dataset.level = f > 0.5 ? "ok" : f > 0.25 ? "warn" : "low";
    this.hpText.textContent = `HP ${hp} / ${maxHp}`;
    this.root.querySelector(".hp")!.setAttribute("aria-valuenow", String(hp));
    this.downScreen.hidden = hp > 0;
  }

  setInventory(items: Array<{ name: string; amount: number; color: string }>) {
    this.bagList.replaceChildren(...items.map((i) => {
      const li = document.createElement("li");
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = i.color;
      const name = document.createElement("span");
      name.textContent = i.name;
      const amount = document.createElement("span");
      amount.className = "amount";
      amount.textContent = `× ${i.amount}`;
      li.append(dot, name, amount);
      return li;
    }));
    if (items.length === 0) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "ยังว่างอยู่ ตีมอนสเตอร์แล้วเก็บของที่ดรอป";
      this.bagList.append(li);
    }
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
