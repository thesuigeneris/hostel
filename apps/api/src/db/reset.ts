import { sql } from 'drizzle-orm';
import { closeDb, db } from './index';

/** Drops everything in the public schema. Dev/test only. */
export async function dropAll() {
  if (process.env.NODE_ENV === 'production') throw new Error('refusing to reset a production database');
  await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);
}

if (import.meta.main) {
  await dropAll();
  console.log('database reset');
  await closeDb();
}
