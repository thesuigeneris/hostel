import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

/**
 * Golden-path e2e: boots the API on a freshly reset + seeded `hostels_e2e` database
 * and a production build of the website, then drives every persona in Chromium.
 *   createdb hostels_e2e   # once
 *   bun run test:e2e
 */
// E2E_EXTERNAL=1 runs against servers you already started (E2E_WEB_URL / E2E_API_URL).
const EXTERNAL = process.env.E2E_EXTERNAL === '1';
const API_PORT = 4200;
const WEB_PORT = 3200;
const DB = process.env.E2E_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/hostels_e2e';
// Use a pre-installed Chromium when present (CI images); otherwise `bunx playwright install chromium`.
const chromium = process.env.PW_CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_WEB_URL ?? `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    actionTimeout: 15_000,
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    launchOptions: chromium ? { executablePath: chromium } : {},
  },
  webServer: EXTERNAL
    ? []
    : [
    {
      command: 'bun run db:reset && bun run src/index.ts',
      cwd: '../api',
      port: API_PORT,
      timeout: 120_000,
      reuseExistingServer: false,
      env: { DATABASE_URL: DB, PORT: String(API_PORT), DISABLE_JOBS: '1', ADMIN_PHONES: '9000000001', WEB_URL: `http://localhost:${WEB_PORT}`, API_PUBLIC_URL: `http://localhost:${API_PORT}` },
    },
    {
      command: `bunx next build && bunx next start -p ${WEB_PORT}`,
      port: WEB_PORT,
      timeout: 300_000,
      reuseExistingServer: false,
      env: { API_URL: `http://localhost:${API_PORT}`, NEXT_PUBLIC_SITE_URL: `http://localhost:${WEB_PORT}`, NEXT_TELEMETRY_DISABLED: '1' },
    },
  ],
});
