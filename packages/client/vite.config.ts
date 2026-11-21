import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 5173, host: true },
  // three.js alone is ~600 kB; one bundle is fine until there are several games to split.
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 1000 },
});
