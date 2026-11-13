import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../lib/env';
import * as schema from './schema';

export type DB = ReturnType<typeof createDb>['db'];
/** A database handle or an open transaction; services accept either. */
export type Tx = DB | Parameters<Parameters<DB['transaction']>[0]>[0];

function createDb(url: string) {
  const client = postgres(url, { max: 10, onnotice: () => {} });
  return { client, db: drizzle(client, { schema }) };
}

let cached: ReturnType<typeof createDb> | null = null;

export function getDb(): DB {
  if (!cached) cached = createDb(env.databaseUrl);
  return cached.db;
}

export async function closeDb() {
  if (cached) {
    await cached.client.end({ timeout: 5 });
    cached = null;
  }
}

export async function pingDb(): Promise<boolean> {
  try {
    await getDb().execute('select 1');
    return true;
  } catch {
    return false;
  }
}

export { schema };
