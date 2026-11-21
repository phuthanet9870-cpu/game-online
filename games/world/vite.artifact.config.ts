import { defineConfig } from "vite";

/** Builds src/artifact/main.ts into one IIFE + one CSS file; tools/build-artifact.mjs inlines them into a page. */
export default defineConfig({
  build: {
    outDir: "dist-artifact",
    emptyOutDir: true,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 1500,
    lib: { entry: "src/artifact/main.ts", formats: ["iife"], name: "LumenRealm", fileName: () => "app.js", cssFileName: "app" },
  },
});
