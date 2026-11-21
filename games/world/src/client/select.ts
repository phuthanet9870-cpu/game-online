import type { ApiClient } from "@game/core";
import { PLAYER_COLORS } from "../shared";
import { PLAYER_PALETTE } from "./avatar";

interface CharacterSummary {
  id: number;
  name: string;
  color: number;
  mapName: string;
}

const MAX_CHARACTERS = 3;

/** Create an element, assign DOM properties, append children. */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...children: Array<Node | string>): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

/**
 * Character select: list, create, delete, play. Resolves with the chosen
 * character id, or null when the player goes back to the lobby.
 */
export function selectCharacter(root: HTMLElement, api: ApiClient, notice?: string): Promise<number | null> {
  return new Promise((resolve) => {
    const screen = el("div", { className: "panel-screen" });
    const panel = el("div", { className: "panel world-select" });
    screen.append(panel);
    root.append(screen);
    const finish = (value: number | null) => {
      screen.remove();
      resolve(value);
    };

    let characters: CharacterSummary[] = [];
    let selected: number | null = null;
    let confirmingDelete = false;
    let message = notice ?? "";

    const render = () => {
      const list = el("div", { className: "char-list" });
      for (const c of characters) {
        const card = el("button", { type: "button", className: `char-card${c.id === selected ? " selected" : ""}` },
          el("span", { className: "swatch" }),
          el("span", { className: "char-text" }, el("strong", { textContent: c.name }), el("small", { textContent: c.mapName })));
        (card.querySelector(".swatch") as HTMLElement).style.background = PLAYER_PALETTE[c.color % PLAYER_PALETTE.length];
        card.setAttribute("aria-pressed", String(c.id === selected));
        card.addEventListener("click", () => { selected = c.id; confirmingDelete = false; render(); });
        card.addEventListener("dblclick", () => finish(c.id));
        list.append(card);
      }
      if (characters.length === 0) list.append(el("p", { className: "hint", textContent: "ยังไม่มีตัวละคร สร้างตัวแรกด้านล่าง" }));

      const play = el("button", { type: "button", className: "primary", textContent: "เข้าเกม", disabled: selected === null });
      play.addEventListener("click", () => selected !== null && finish(selected));

      const actions = el("div", { className: "row" }, play);
      if (selected !== null) {
        if (confirmingDelete) {
          const yes = el("button", { type: "button", className: "danger", textContent: "ลบถาวร" });
          const no = el("button", { type: "button", className: "secondary", textContent: "ยกเลิก" });
          yes.addEventListener("click", () => void remove(selected!));
          no.addEventListener("click", () => { confirmingDelete = false; render(); });
          actions.append(el("span", { className: "hint", textContent: "ลบตัวละครนี้?" }), yes, no);
        } else {
          const del = el("button", { type: "button", className: "secondary", textContent: "ลบ" });
          del.addEventListener("click", () => { confirmingDelete = true; render(); });
          actions.append(del);
        }
      }

      const back = el("button", { type: "button", className: "link", textContent: "← กลับไปหน้าเลือกเกม" });
      back.addEventListener("click", () => finish(null));
      const status = el("p", { className: "error", hidden: !message, textContent: message });

      panel.replaceChildren(el("h2", { textContent: "เลือกตัวละคร" }), list, actions, status,
        characters.length < MAX_CHARACTERS ? createForm() : el("p", { className: "hint", textContent: `มีครบ ${MAX_CHARACTERS} ตัวแล้ว` }),
        back);
    };

    const createForm = () => {
      const name = el("input", { id: "char-name", maxLength: 16, placeholder: "ชื่อตัวละคร", autocomplete: "off" });
      const swatches = el("div", { className: "swatches", role: "radiogroup" });
      swatches.setAttribute("aria-label", "สีตัวละคร");
      let color = Math.floor(Math.random() * PLAYER_COLORS);
      for (let i = 0; i < PLAYER_COLORS; i++) {
        const b = el("button", { type: "button", className: `swatch-pick${i === color ? " on" : ""}` });
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
      const submit = el("button", { type: "submit", className: "secondary", textContent: "สร้างตัวละคร" });
      const form = el("form", { className: "char-create" }, el("h3", { textContent: "สร้างตัวละครใหม่" }), name, swatches, submit);
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        submit.disabled = true;
        try {
          const { character } = await api.post<{ character: CharacterSummary }>("/characters", { name: name.value, color });
          characters.push(character);
          selected = character.id;
          message = "";
          render();
        } catch (err) {
          message = (err as Error).message;
          render();
        }
      });
      return form;
    };

    const remove = async (id: number) => {
      try {
        await api.delete(`/characters/${id}`);
        characters = characters.filter((c) => c.id !== id);
        selected = characters[0]?.id ?? null;
        confirmingDelete = false;
        message = "";
      } catch (err) {
        message = (err as Error).message;
      }
      render();
    };

    panel.append(el("p", { className: "hint", textContent: "กำลังโหลดตัวละคร…" }));
    api.get<{ characters: CharacterSummary[] }>("/characters").then(
      (data) => {
        characters = data.characters;
        selected = characters[0]?.id ?? null;
        render();
      },
      (err) => {
        message = (err as Error).message;
        render();
      },
    );
  });
}
