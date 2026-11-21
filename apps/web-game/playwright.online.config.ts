import { defineConfig } from '@playwright/test';

/**
 * Phase 2 online E2E: runs the real Go server (serving the built client) against a disposable
 * PostgreSQL database given by E2E_DATABASE_URL. Build the client first: `npm run build`.
 */
const db = process.env.E2E_DATABASE_URL;
if (!db) throw new Error('E2E_DATABASE_URL is required for online E2E tests');

export default defineConfig({
  testDir: './tests/e2e-online',
  timeout: 90_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:8090', viewport: { width: 1280, height: 720 }, trace: 'off' },
  webServer: {
    command: 'go run ./cmd/gameserver serve',
    cwd: '../../server',
    url: 'http://127.0.0.1:8090/api/health',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: db,
      ADDR: '127.0.0.1:8090',
      GAME_DATA: '../game-data',
      WEB_DIR: '../apps/web-game/dist',
      AUTH_PER_MINUTE: '1000',
      TEST_WORLD: 'true',
      GOTOOLCHAIN: 'local',
    },
  },
});
