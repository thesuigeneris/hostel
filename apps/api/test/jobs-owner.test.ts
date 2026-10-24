import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { newId } from '@hostels/shared';
import { db, schema } from '../src/db';
import { runSaasBilling } from '../src/services/owner-saas';
import { truncateAll } from './helpers';
import { ownerWithHostel } from './community-fixtures';

beforeEach(truncateAll);

describe('saas billing job', () => {
  test('invoices each Pro hostel once per month, due on the 1st', async () => {
    const pro = await ownerWithHostel({ ownerPlan: 'pro' });
    await ownerWithHostel({ ownerPlan: 'free' });
    const now = new Date('2026-11-03T06:00:00Z');
    expect(await runSaasBilling(now)).toBe(1);
    expect(await runSaasBilling(now)).toBe(0);
    const rows = await db.select().from(schema.saasInvoices);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ hostelId: pro.hostel.id, periodMonth: '2026-11', dueDate: '2026-11-01', amount: 999, status: 'due' });
  });

  test('downgrades a Pro hostel after 15 days unpaid', async () => {
    const pro = await ownerWithHostel({ ownerPlan: 'pro' });
    await runSaasBilling(new Date('2026-11-03T06:00:00Z'));
    await runSaasBilling(new Date('2026-11-16T06:00:00Z')); // 15 days after due: still Pro
    let [h] = await db.select().from(schema.hostels).where(eq(schema.hostels.id, pro.hostel.id));
    expect(h!.ownerPlan).toBe('pro');
    await runSaasBilling(new Date('2026-11-17T06:00:00Z'));
    [h] = await db.select().from(schema.hostels).where(eq(schema.hostels.id, pro.hostel.id));
    expect(h!.ownerPlan).toBe('free');
    // Idempotent once downgraded.
    expect(await runSaasBilling(new Date('2026-11-18T06:00:00Z'))).toBe(0);
  });

  test('paid invoices keep the hostel Pro', async () => {
    const pro = await ownerWithHostel({ ownerPlan: 'pro' });
    await db.insert(schema.saasInvoices).values({
      id: newId('sin'),
      hostelId: pro.hostel.id,
      ownerId: pro.hostel.ownerId,
      plan: 'pro',
      periodMonth: '2026-11',
      amount: 999,
      dueDate: '2026-11-01',
      status: 'paid',
      paidAt: new Date(),
    });
    expect(await runSaasBilling(new Date('2026-11-25T06:00:00Z'))).toBe(0);
    const [h] = await db.select().from(schema.hostels).where(eq(schema.hostels.id, pro.hostel.id));
    expect(h!.ownerPlan).toBe('pro');
  });
});
