import { Client } from "@colyseus/sdk";
import type { Account, GameClientModule, PlayerSession } from "@game/core";
import { createApi, serverUrl } from "./api";
import { GAMES } from "./games";

const SESSION_KEY = "lumen.session";
const root = document.querySelector<HTMLDivElement>("#lobby")!;
const container = document.querySelector<HTMLDivElement>("#game")!;
const base = `${serverUrl()}/api`;

function storedSession(): PlayerSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as PlayerSession) : null;
  } catch {
    return null;
  }
}
function storeSession(session: PlayerSession | null) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* storage unavailable: the session lasts until reload */ }
}

/** Create an element, assign DOM properties, append children. */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...children: Array<Node | string>): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function showAuth(message?: string) {
  let mode: "login" | "register" = "login";
  const error = el("p", { className: "error", hidden: !message, textContent: message ?? "" });
  const username = el("input", { id: "username", autocomplete: "username", maxLength: 20, required: true });
  const password = el("input", { id: "password", type: "password", autocomplete: "current-password", maxLength: 128, required: true });
  const submit = el("button", { type: "submit", className: "primary", textContent: "เข้าสู่ระบบ" });
  const toggle = el("button", { type: "button", className: "link", textContent: "ยังไม่มีบัญชี? สมัครสมาชิก" });
  const hint = el("p", { className: "hint", hidden: true, textContent: "ชื่อผู้ใช้ 3–20 ตัว (a-z, 0-9, _) · รหัสผ่านอย่างน้อย 8 ตัว" });
  const title = el("h2", { textContent: "เข้าสู่ระบบ" });

  toggle.addEventListener("click", () => {
    mode = mode === "login" ? "register" : "login";
    title.textContent = submit.textContent = mode === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก";
    toggle.textContent = mode === "login" ? "ยังไม่มีบัญชี? สมัครสมาชิก" : "มีบัญชีแล้ว? เข้าสู่ระบบ";
    password.autocomplete = mode === "login" ? "current-password" : "new-password";
    hint.hidden = mode === "login";
    error.hidden = true;
  });

  const form = el("form", { className: "panel" },
    el("h1", { textContent: "Lumen Realm" }), title,
    el("label", {}, "ชื่อผู้ใช้", username),
    el("label", {}, "รหัสผ่าน", password),
    hint, error, submit, toggle);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    submit.disabled = true;
    error.hidden = true;
    try {
      const result = await createApi(base).post<{ token: string; account: Account }>(
        `/auth/${mode}`, { username: username.value, password: password.value });
      const session = { token: result.token, account: result.account };
      storeSession(session);
      showGames(session);
    } catch (err) {
      error.textContent = err instanceof Error ? err.message : String(err);
      error.hidden = false;
    } finally {
      submit.disabled = false;
    }
  });
  root.replaceChildren(form);
  root.hidden = false;
  username.focus();
}

function showGames(session: PlayerSession) {
  const logout = el("button", { type: "button", className: "link", textContent: "ออกจากระบบ" });
  logout.addEventListener("click", async () => {
    await createApi(base, session.token).post("/auth/logout").catch(() => {});
    storeSession(null);
    showAuth();
  });
  const error = el("p", { className: "error", hidden: true });
  const list = el("div", { className: "games" });
  for (const game of GAMES) {
    const card = el("button", { type: "button", className: "game-card" },
      el("strong", { textContent: game.title }), el("span", { textContent: game.description }));
    card.addEventListener("click", () => void launch(game, session, error));
    list.append(card);
  }
  root.replaceChildren(el("div", { className: "panel" },
    el("h1", { textContent: "Lumen Realm" }),
    el("p", { className: "who" }, "เข้าสู่ระบบเป็น ", el("strong", { textContent: session.account.username }), " · ", logout),
    list, error));
  root.hidden = false;
}

async function launch(game: GameClientModule, session: PlayerSession, error: HTMLElement) {
  error.hidden = true;
  const sdk = new Client(serverUrl());
  sdk.auth.token = session.token;
  let teardown: (() => void) | null = null;
  const exit = () => {
    teardown?.();
    teardown = null;
    container.replaceChildren();
    showGames(session);
  };
  try {
    root.hidden = true;
    teardown = await game.start({ container, sdk, session, exit, api: createApi(`${base}/games/${game.id}`, session.token) });
  } catch (err) {
    root.hidden = false;
    error.textContent = err instanceof Error ? err.message : String(err);
    error.hidden = false;
  }
}

async function boot() {
  const session = storedSession();
  if (!session) return showAuth();
  try {
    const { account } = await createApi(base, session.token).get<{ account: Account }>("/auth/me");
    showGames({ token: session.token, account });
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 401) storeSession(null);
    showAuth(status === 401 ? undefined : (err as Error).message);
  }
}

void boot();
