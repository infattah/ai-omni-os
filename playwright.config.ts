import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://127.0.0.1:3456',
    headless: true,
  },
  webServer: {
    command: 'npm run build:client && OMNI_SESSION_TOKEN=e2e-token npx tsx src/index.ts',
    url: 'http://127.0.0.1:3456/?token=e2e-token',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
