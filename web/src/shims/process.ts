// Minimal Node `process` for the in-page server. Installed on globalThis before any server module is evaluated.
declare const __GM_PASSPHRASE__: string; // vite.config.ts, from the build's environment
const env: Record<string, string> = {
  GAME_NAME: "ro",
  RO_STORE: "pglite",
  NODE_ENV: "production",
  ...(__GM_PASSPHRASE__ ? { GM_PASSPHRASE: __GM_PASSPHRASE__ } : {}),
};
const start = performance.now();
const proc = {
  env,
  argv: [] as string[],
  platform: "browser",
  version: "",
  versions: {} as Record<string, string>, // no "node": PGlite and others must take their browser paths
  pid: 1,
  browser: true,
  cwd: () => "/",
  exit: () => {},
  on: () => proc,
  once: () => proc,
  off: () => proc,
  removeListener: () => proc,
  emit: () => false,
  emitWarning: (...a: unknown[]) => console.warn(...a),
  nextTick: (fn: (...a: unknown[]) => void, ...args: unknown[]) => queueMicrotask(() => fn(...args)),
  hrtime: Object.assign((prev?: [number, number]) => {
    const t = performance.now() - start, s = Math.floor(t / 1000), ns = Math.floor((t % 1000) * 1e6);
    if (!prev) return [s, ns];
    let ds = s - prev[0], dn = ns - prev[1];
    if (dn < 0) { ds--; dn += 1e9; }
    return [ds, dn];
  }, { bigint: () => BigInt(Math.floor((performance.now() - start) * 1e6)) }),
  memoryUsage: () => ({ rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 }),
  uptime: () => (performance.now() - start) / 1000,
  stdout: { write: (s: string) => (console.log(s), true), isTTY: false },
  stderr: { write: (s: string) => (console.error(s), true), isTTY: false },
};
export default proc;
