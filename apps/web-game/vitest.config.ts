import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@data': fileURLToPath(new URL('../../game-data', import.meta.url)) },
  },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
});
