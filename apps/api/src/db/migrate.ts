import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { fileURLToPath } from 'node:url';
import { closeDb, db } from './index';

export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../migrations', import.meta.url));

export async function runMigrations() {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}

if (import.meta.main) {
  await runMigrations();
  console.log('migrations complete');
  await closeDb();
}
