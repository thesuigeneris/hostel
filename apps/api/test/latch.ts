import { sql } from 'drizzle-orm';
import { getDb } from '../src/db';

/**
 * A deterministic race: holds a row lock in its own transaction, so the requests under test queue up behind it in a
 * known order (Postgres hands a row to its waiters first come, first served), then lets them go together.
 *
 *   const latch = await holdRow('owner_invoices', bill.id);
 *   const first = call(...);  await latch.queued(1);
 *   const second = call(...); await latch.queued(2);
 *   await latch.release();
 */
export async function holdRow(table: string, id: string) {
  let release!: () => void;
  const released = new Promise<void>((r) => {
    release = r;
  });
  let locked!: () => void;
  const isLocked = new Promise<void>((r) => {
    locked = r;
  });
  const done = getDb().transaction(async (tx) => {
    await tx.execute(sql`select 1 from ${sql.identifier(table)} where id = ${id} for update`);
    locked();
    await released;
  });
  await isLocked;
  return {
    /** Waits until `n` other sessions are blocked on a lock in this database. */
    async queued(n: number, timeoutMs = 5000) {
      const until = Date.now() + timeoutMs;
      for (;;) {
        const [row] = await getDb().execute<{ n: number }>(
          sql`select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`,
        );
        if ((row?.n ?? 0) >= n) return;
        if (Date.now() > until) throw new Error(`expected ${n} queued sessions, saw ${row?.n ?? 0}`);
        await Bun.sleep(10);
      }
    },
    async release() {
      release();
      await done;
    },
  };
}
