import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
const offline = !!process.env.VITE_OFFLINE;
export default defineConfig({
  resolve: { alias: { '@astra/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)) } },
  server: { port: 5173, proxy: { '/api': 'http://localhost:8080', '/ws': { target: 'ws://localhost:8080', ws: true } } },
  build: {
    target: 'es2020', sourcemap: false, chunkSizeWarningLimit: 900,
    // The staff console is only part of the server build; the offline/artifact build is a single page.
    rollupOptions: { input: offline ? { main: fileURLToPath(new URL('index.html', import.meta.url)) } : { main: fileURLToPath(new URL('index.html', import.meta.url)), admin: fileURLToPath(new URL('admin.html', import.meta.url)) } },
  },
});
