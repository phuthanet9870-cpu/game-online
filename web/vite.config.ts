// Single-player browser build of the game. The page is client/index.html with its entry swapped for src/entry.ts; the
// server modules are bundled in, with Node built-ins, pg/ioredis/express and server/src/db.ts replaced by browser shims.
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const SHIM: Record<string, string> = {
  fs: here("src/shims/fs.ts"), "fs/promises": here("src/shims/fs.ts"),
  crypto: here("src/shims/crypto.ts"), util: here("src/shims/util.ts"),
  events: realpathSync(here("node_modules/events/events.js")), buffer: realpathSync(here("node_modules/buffer/index.js")),
  express: here("src/shims/express.ts"), ioredis: here("src/shims/ioredis.ts"),
};
const EMPTY = here("src/shims/empty.ts");
const NODE_EMPTY = new Set(["http", "https", "http2", "net", "tls", "os", "path", "url", "zlib", "stream", "child_process", "worker_threads", "cluster", "dns", "dgram", "readline", "module", "perf_hooks", "async_hooks", "v8", "vm", "assert", "string_decoder", "querystring", "tty", "ws", "compression", "pg", "@colyseus/redis-presence", "@colyseus/redis-driver", "@colyseus/greeting-banner"]);
const SERVER_DB = here("../server/src/db.ts");
const SELFTEST = !!process.env.SELFTEST;

function browserServer(): Plugin {
  return {
    name: "browser-server",
    enforce: "pre",
    async resolveId(id, importer) {
      const bare = id.replace(/^node:/, "");
      if (SHIM[bare]) return SHIM[bare];
      if (NODE_EMPTY.has(bare) || bare.startsWith("@colyseus/better-call/node") || bare === "@colyseus/ws-transport") return EMPTY;
      if (importer && id.endsWith("/db.ts")) {
        const r = await this.resolve(id, importer, { skipSelf: true });
        if (r?.id === SERVER_DB) return here("src/db.ts");
      }
      return null;
    },
    transformIndexHtml: {
      order: "pre",
      handler: (html, ctx) => (ctx.filename.endsWith("index.html") ? readFileSync(here("../client/index.html"), "utf8").replace(`src="/src/main.ts"`, `src="/src/entry.ts"`) : html),
    },
  };
}

export default defineConfig({
  base: "./",
  publicDir: false,
  // server/src reads its config from process.env at runtime (shims/process.ts); the game build keeps NODE_ENV=production
  // fixed (no GM shortcuts), the selftest build reads it at runtime so the bots can use them
  // GM_PASSPHRASE comes from the build's environment only (never committed): the in-page server checks "/gm<passphrase>" with it
  define: { "process.env": "globalThis.process.env", __GM_PASSPHRASE__: JSON.stringify(process.env.GM_PASSPHRASE ?? ""), ...(SELFTEST ? { "process.env.NODE_ENV": "globalThis.process.env.NODE_ENV" } : {}) },
  plugins: [browserServer()],
  optimizeDeps: { exclude: ["@electric-sql/pglite"] },
  server: { fs: { allow: [".."] } },
  build: {
    target: "es2022", emptyOutDir: true,
    // SELFTEST=1: also build selftest.html (runs an upstream bot script against the in-page server) into dist-selftest
    outDir: SELFTEST ? "dist-selftest" : "dist",
    rollupOptions: { input: SELFTEST ? { index: here("index.html"), selftest: here("selftest.html") } : { index: here("index.html") } }, chunkSizeWarningLimit: 6000, assetsInlineLimit: 0,
    rolldownOptions: {
      input: SELFTEST ? { index: here("index.html"), selftest: here("selftest.html") } : { index: here("index.html") },
      shimMissingExports: true, // named imports from the empty Node stand-ins (never called at runtime)
    },
  },
  worker: { format: "es" },
});
