import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Default: runs against the seeded dev database. Start Postgres and seed it first (`bun run db:reset`).
// The API and website are started here unless they're already running.
//
// Fresh mode (`E2E_FRESH=1`, or `bun run e2e:fresh`): resets and seeds a dedicated database
// (E2E_DATABASE_URL, default `hostels_e2e`), then starts the API and a production build of the
// website on their own ports (E2E_API_PORT / E2E_WEB_PORT), so it never touches your dev servers.
const FRESH = process.env.E2E_FRESH === '1';
const API_PORT = Number(process.env.E2E_API_PORT ?? (FRESH ? 4200 : 4000));
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? (FRESH ? 3200 : 3000));
const API_URL = `http://localhost:${API_PORT}`;
const WEB_URL = process.env.E2E_WEB_URL ?? `http://localhost:${WEB_PORT}`;
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/hostels_e2e';
// Specs read the API address from here.
process.env.E2E_API_URL ??= API_URL;
process.env.E2E_WEB_URL ??= WEB_URL;

// Use a pre-installed Chromium when the machine has one (CI images); otherwise `bunx playwright install chromium`.
const chromium = process.env.PW_CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    launchOptions: chromium ? { executablePath: chromium } : {},
  },
  webServer: FRESH
    ? [
        {
          command: 'bun run src/db/seed.ts --reset && bun run src/index.ts',
          cwd: '../api',
          url: `${API_URL}/`,
          env: { DATABASE_URL, PORT: String(API_PORT), JOBS: 'off', ADMIN_PHONES: '9000000001', API_PUBLIC_URL: API_URL },
          reuseExistingServer: false,
          timeout: 120_000,
        },
        {
          command: `bunx next build && bunx next start -p ${WEB_PORT}`,
          url: `${WEB_URL}/`,
          env: { API_URL, API_PUBLIC_URL: API_URL, NEXT_PUBLIC_SITE_URL: WEB_URL, NEXT_TELEMETRY_DISABLED: '1' },
          reuseExistingServer: false,
          timeout: 300_000,
        },
      ]
    : [
        {
          command: 'bun run src/index.ts',
          cwd: '../api',
          url: 'http://localhost:4000/',
          env: { JOBS: 'off' },
          reuseExistingServer: true,
          timeout: 60_000,
        },
        {
          command: 'bun run build && bun run start',
          url: 'http://localhost:3000/',
          reuseExistingServer: true,
          timeout: 300_000,
        },
      ],
});
