import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: { alias: { '@astra/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)) } },
  server: { port: 5173, proxy: { '/api': 'http://localhost:8080', '/ws': { target: 'ws://localhost:8080', ws: true } } },
  build: { target: 'es2020', sourcemap: false, chunkSizeWarningLimit: 900 },
});
