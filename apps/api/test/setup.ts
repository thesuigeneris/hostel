// Runs before any test file. Point the app at the test database *before* the db module loads.
import { afterAll, beforeAll } from 'bun:test';

(process.env as Record<string, string>).NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/hostels_test';
process.env.DB_POOL_MAX = '5';
for (const k of ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'MSG91_AUTH_KEY', 'R2_BUCKET']) delete process.env[k];
process.env.ADMIN_PHONES = '9000000001';

const { dropAll } = await import('../src/db/reset');
const { runMigrations } = await import('../src/db/migrate');

let migrated = false;
beforeAll(async () => {
  if (migrated) return;
  await dropAll();
  await runMigrations();
  migrated = true;
});

afterAll(async () => {
  // keep the pool open across files; bun exits the process at the end
});
