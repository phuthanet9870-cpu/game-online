// Dev-only: boots the in-page server and runs one of the upstream bot scripts (client/scripts/*.ts) against it, so the
// browser build's server can be checked without rendering the game: SELFTEST=1 vite build, serve dist-selftest, open
// /selftest.html?script=grind.
// The result is in window.__selftest: { done, ok, log }.
import "./globals.ts";
import proc from "./shims/process.ts";
// the bots that spawn bosses / give items use the dev-only GM shortcuts (refused when NODE_ENV=production, as in the game build)
proc.env.NODE_ENV = "development";

const out = document.getElementById("out")!;
const state = { done: false, ok: false, log: [] as string[] };
(window as any).__selftest = state;
const log = (kind: string, a: unknown[]) => { const line = `${kind} ${a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")}`; state.log.push(line); out.textContent = state.log.join("\n"); };
for (const k of ["log", "error", "warn"] as const) { const f = console[k].bind(console); console[k] = (...a: unknown[]) => { log(k, a); f(...a); }; }
proc.exit = (code = 0) => { state.done = true; state.ok = code === 0; log("exit", [code]); throw new Error(`process.exit(${code})`); };

// the bot scripts that only talk to the server (the others drive a browser with playwright or read files)
const scripts = { ...import.meta.glob("../../client/scripts/{grind,smoke,items,boss,auto,duel,friends,pets}.ts"), ...import.meta.glob("../selftest/*.ts") };
const name = new URLSearchParams(location.search).get("script") ?? "grind";
try {
  const { bootServer } = await import("./server.ts");
  const net = await import("./net.ts");
  const app = await bootServer();
  net.installFetch(app, () => undefined);
  net.installWebSocket();
  const load = scripts[`../../client/scripts/${name}.ts`] ?? scripts[`../selftest/${name}.ts`];
  if (!load) throw new Error(`no script ${name}`);
  await load();
  if (!state.done) { state.done = true; state.ok = true; }
} catch (e) {
  if (!state.done) { state.done = true; state.ok = false; log("error", [String((e as Error)?.stack ?? e)]); }
}
