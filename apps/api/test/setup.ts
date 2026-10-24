import { afterAll, beforeAll } from 'bun:test';

// Tests always run against the separate test database.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/hostels_test';
process.env.ADMIN_PHONES = '9000000001';
for (const key of ['MSG91_AUTH_KEY', 'MSG91_TEMPLATE_ID', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET']) delete process.env[key];
process.env.RAZORPAY_WEBHOOK_SECRET = 'test-webhook-secret';

const { runMigrations } = await import('../src/db/migrate');
const { closeDb } = await import('../src/db');

beforeAll(async () => {
  await runMigrations(process.env.DATABASE_URL);
});

afterAll(async () => {
  await closeDb();
});
