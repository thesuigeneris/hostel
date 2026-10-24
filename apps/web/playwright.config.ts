import { defineConfig, devices } from '@playwright/test';

// Runs against the seeded dev database. Start Postgres and seed it first (`bun run db:reset`).
// The API and website are started here unless they're already running.
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_WEB_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: [
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
