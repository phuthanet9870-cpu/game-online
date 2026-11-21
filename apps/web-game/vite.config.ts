import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

// `--mode single` builds one self-contained HTML file (used for the shareable test artifact).
export default defineConfig(({ mode }) => ({
  plugins: mode === 'single' ? [react(), viteSingleFile()] : [react()],
  resolve: {
    alias: { '@data': fileURLToPath(new URL('../../game-data', import.meta.url)) },
  },
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    assetsInlineLimit: mode === 'single' ? 100_000_000 : 4096,
  },
  server: { port: 5173, strictPort: true },
}));
