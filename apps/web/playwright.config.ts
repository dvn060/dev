import { defineConfig } from '@playwright/test';

/**
 * E2E smoke tests against a locally running stack.
 * Start the backend first (scripts/dev-api.ps1 or `uvicorn app.main:app`),
 * then `npm run e2e` — the Vite dev server is started automatically.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5173',
    ...(process.env.PW_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
      : {}),
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    stdout: 'ignore',
  },
});
