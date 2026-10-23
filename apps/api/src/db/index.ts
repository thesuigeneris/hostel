import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type DB = ReturnType<typeof drizzle<typeof schema>>;

let cached: { client: postgres.Sql; db: DB } | null = null;

export function getDb(): DB | null {
  if (!process.env.DATABASE_URL) return null;
  if (cached) return cached.db;
  const client = postgres(process.env.DATABASE_URL, { max: 10 });
  const db = drizzle(client, { schema });
  cached = { client, db };
  return db;
}

export { schema };
