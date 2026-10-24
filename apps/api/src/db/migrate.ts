import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { env } from '../lib/env';

export const migrationsFolder = fileURLToPath(new URL('../../migrations', import.meta.url));

export async function runMigrations(url = env.databaseUrl) {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client.end();
  }
}

if (import.meta.main) {
  await runMigrations();
  console.log('migrations complete');
}
