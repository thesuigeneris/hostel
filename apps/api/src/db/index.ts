import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export const DEFAULT_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/hostels';

const client = postgres(process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL, {
  max: Number(process.env.DB_POOL_MAX ?? 10),
  onnotice: () => {},
});

export const db = drizzle(client, { schema, casing: 'snake_case' });
export type DB = typeof db;
/** A transaction handle; services accept `DB | Tx` so they compose inside transactions. */
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
export type DbOrTx = DB | Tx;

export async function closeDb() {
  await client.end({ timeout: 5 });
}

export { schema };
