import { sql } from 'drizzle-orm';
import { getDb, type Tx } from '../db';
import { clock } from '../lib/clock';

/** A second identical post or comment from the same person within this long is the same one sent twice. */
export const DUPLICATE_WINDOW_MS = 10_000;

/**
 * Creates something at most once per burst of identical sends (a double tap, a retried request, two tabs). Sends with
 * the same `key` (author, place and text) are serialized on a transaction-scoped advisory lock; inside it, a match
 * created in the last few seconds is returned instead of a new row. Different keys never wait on each other.
 */
export async function createOnce<T>(
  key: string,
  find: (tx: Tx, since: Date) => Promise<T | undefined>,
  create: (tx: Tx) => Promise<T>,
): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
    const existing = await find(tx, new Date(clock.now().getTime() - DUPLICATE_WINDOW_MS));
    return existing ?? create(tx);
  });
}
