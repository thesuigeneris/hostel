import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { addDays, newId } from '@hostels/shared';
import { db, schema } from '../src/db';
import { ratingSummary } from '../src/services/reputation';
import { createHostel, login, loginAdmin, req, truncateAll } from './helpers';
import { insertSubscription, issueBody, ownerWithHostel, resident, reviewBody, today } from './community-fixtures';

beforeEach(truncateAll);

async function paidInvoice(opts: { userId: string; hostelId: string; roomTypeId: string; subscriptionId: string; total: number; paidAt: Date; periodStart: string }) {
  await db.insert(schema.invoices).values({
    id: newId('inv'),
    subscriptionId: opts.subscriptionId,
    userId: opts.userId,
    hostelId: opts.hostelId,
    roomTypeId: opts.roomTypeId,
    periodStart: opts.periodStart,
    periodEnd: addDays(opts.periodStart, 29),
    rentAmount: opts.total - 6000,
    foodAmount: 6000,
    totalAmount: opts.total,
    status: 'paid',
    dueDate: opts.periodStart,
    paidAt: opts.paidAt,
  });
}

describe('admin', () => {
  test('requires the admin role', async () => {
    const o = await login('owner');
    expect((await req('GET', '/admin/overview', { token: o.token })).status).toBe(403);
    expect((await req('GET', '/admin/overview')).status).toBe(401);
  });

  test('overview counts and MRR', async () => {
    const { owner, hostel, roomType } = await ownerWithHostel({ ownerPlan: 'pro' });
    await createHostel(owner.user.id, { status: 'pending', partnerStatus: 'none' });
    await createHostel(owner.user.id, { partnerStatus: 'applied' });
    const t = await login('tenant');
    const sub = await insertSubscription({ userId: t.user.id, hostelId: hostel.id, roomTypeId: roomType.id, mealPlan: 'two-meals' });
    await db.insert(schema.invoices).values({
      id: newId('inv'),
      subscriptionId: sub.id,
      userId: t.user.id,
      hostelId: hostel.id,
      roomTypeId: roomType.id,
      periodStart: addDays(today(), -30),
      periodEnd: addDays(today(), -1),
      rentAmount: 9000,
      foodAmount: 4500,
      totalAmount: 13500,
      dueDate: addDays(today(), -9),
    });
    const r = await resident(hostel.id);
    await req('POST', `/community/${hostel.id}/issues`, { token: r.token, body: issueBody });
    const admin = await loginAdmin();
    const o = await req('GET', '/admin/overview', { token: admin.token });
    expect(o.body).toMatchObject({
      pendingListings: 1,
      partnerApplications: 1,
      liveHostels: 2,
      verifiedPartners: 1,
      proHostels: 1,
      activeSubscriptions: 1,
      overdueInvoices: 1,
      openIssues: 1,
      scheduledMoves: 0,
      mrr: { subscriptions: 13500, saas: 999 },
    });
    const overdue = await req('GET', '/admin/invoices/overdue', { token: admin.token });
    expect(overdue.body).toHaveLength(1);
    expect(overdue.body[0]).toMatchObject({ overdue: true, totalAmount: 13500 });
    const subs = await req('GET', '/admin/subscriptions?status=active', { token: admin.token });
    expect(subs.body.total).toBe(1);
    expect(subs.body.items[0]).toMatchObject({ overdueInvoices: 1, user: { phone: t.user.phone } });
  });

  test('listing review and partner verification', async () => {
    const o = await login('owner');
    const { hostel } = await createHostel(o.user.id, { status: 'pending', partnerStatus: 'none', name: 'Searchable Stay' });
    const admin = await loginAdmin();
    const pending = await req('GET', '/admin/hostels?status=pending', { token: admin.token });
    expect(pending.body.items.map((h: any) => h.id)).toEqual([hostel.id]);
    expect((await req('GET', '/admin/hostels?q=searchable', { token: admin.token })).body.total).toBe(1);
    expect((await req('POST', `/admin/hostels/${hostel.id}/reject`, { token: admin.token, body: { reason: 'x' } })).status).toBe(400);
    expect((await req('POST', `/admin/hostels/${hostel.id}/verify-partner`, { token: admin.token, body: {} })).body.error).toBe('invalid_transition');
    expect((await req('POST', `/admin/hostels/${hostel.id}/approve`, { token: admin.token })).body.status).toBe('live');
    expect((await req('POST', `/admin/hostels/${hostel.id}/approve`, { token: admin.token })).body.error).toBe('invalid_transition');

    await req('POST', `/owner/hostels/${hostel.id}/apply-partner`, { token: o.token });
    expect((await req('GET', '/admin/hostels?partnerStatus=applied', { token: admin.token })).body.total).toBe(1);
    const verified = await req('POST', `/admin/hostels/${hostel.id}/verify-partner`, { token: admin.token, body: { platformFeePct: 12 } });
    expect(verified.body).toMatchObject({ partnerStatus: 'verified', platformFeePct: 12 });

    const other = await createHostel(o.user.id, { partnerStatus: 'applied' });
    const rej = await req('POST', `/admin/hostels/${other.hostel.id}/reject-partner`, { token: admin.token, body: { reason: 'Kitchen not hygienic' } });
    expect(rej.body).toMatchObject({ partnerStatus: 'rejected', rejectionReason: 'Kitchen not hygienic', status: 'live' });
  });

  test('food partners CRUD', async () => {
    const admin = await loginAdmin();
    const c = await req('POST', '/admin/food-partners', { token: admin.token, body: { name: 'Biryani Co', cuisine: 'Hyderabadi' } });
    expect(c.status).toBe(201);
    expect(c.body).toMatchObject({ name: 'Biryani Co', active: true, logoUrl: null });
    const u = await req('PATCH', `/admin/food-partners/${c.body.id}`, { token: admin.token, body: { active: false } });
    expect(u.body.active).toBe(false);
    expect((await req('GET', '/admin/food-partners', { token: admin.token })).body).toHaveLength(1);
    expect((await req('PATCH', '/admin/food-partners/fdp_nope', { token: admin.token, body: { active: true } })).status).toBe(404);
  });

  test('payouts: IST month, platform fee, idempotent, mark paid', async () => {
    const { owner, hostel, roomType } = await ownerWithHostel({ platformFeePct: 10 });
    const t = await login('tenant');
    const sub = await insertSubscription({ userId: t.user.id, hostelId: hostel.id, roomTypeId: roomType.id });
    const base = { userId: t.user.id, hostelId: hostel.id, roomTypeId: roomType.id, subscriptionId: sub.id };
    await paidInvoice({ ...base, total: 15000, paidAt: new Date('2026-09-10T06:00:00Z'), periodStart: '2026-09-10' });
    // 1 Oct 01:00 IST = 30 Sep 19:30 UTC: counts for October.
    await paidInvoice({ ...base, total: 14000, paidAt: new Date('2026-09-30T19:30:00Z'), periodStart: '2026-10-10' });
    // 30 Sep 23:59 IST: September.
    const t2 = await login('tenant');
    const sub2 = await insertSubscription({ userId: t2.user.id, hostelId: hostel.id, roomTypeId: roomType.id });
    await paidInvoice({ userId: t2.user.id, hostelId: hostel.id, roomTypeId: roomType.id, subscriptionId: sub2.id, total: 5000, paidAt: new Date('2026-09-30T18:29:00Z'), periodStart: '2026-09-01' });

    const admin = await loginAdmin();
    const gen = await req('POST', '/admin/payouts/generate', { token: admin.token, body: { periodMonth: '2026-09' } });
    expect(gen.body).toHaveLength(1);
    expect(gen.body[0]).toMatchObject({ hostelId: hostel.id, ownerId: owner.user.id, grossAmount: 20000, platformFee: 2000, netAmount: 18000, status: 'pending' });

    const again = await req('POST', '/admin/payouts/generate', { token: admin.token, body: { periodMonth: '2026-09' } });
    expect(again.body).toHaveLength(1);
    expect(again.body[0].id).toBe(gen.body[0].id);

    const oct = await req('POST', '/admin/payouts/generate', { token: admin.token, body: { periodMonth: '2026-10' } });
    expect(oct.body[0].grossAmount).toBe(14000);

    const paid = await req('POST', `/admin/payouts/${gen.body[0].id}/mark-paid`, { token: admin.token });
    expect(paid.body.status).toBe('paid');
    expect(paid.body.paidAt).not.toBeNull();
    expect((await req('GET', '/admin/payouts?periodMonth=2026-09', { token: admin.token })).body).toHaveLength(1);
    expect((await req('GET', '/owner/payouts', { token: owner.token })).body).toHaveLength(2);
    expect((await req('POST', '/admin/payouts/generate', { token: admin.token, body: { periodMonth: 'Sept' } })).status).toBe(400);
  });

  test('hiding a review removes it from averages', async () => {
    const { hostel } = await ownerWithHostel();
    const a = await resident(hostel.id);
    const b = await resident(hostel.id);
    const ra = (await req('POST', `/hostels/${hostel.id}/reviews`, { token: a.token, body: { ...reviewBody, overall: 1 } })).body;
    await req('POST', `/hostels/${hostel.id}/reviews`, { token: b.token, body: { ...reviewBody, overall: 5 } });
    const admin = await loginAdmin();
    const list = await req('GET', '/admin/reviews', { token: admin.token });
    expect(list.body.total).toBe(2);
    expect(list.body.items[0].hostel.id).toBe(hostel.id);
    const hidden = await req('PATCH', `/admin/reviews/${ra.id}`, { token: admin.token, body: { status: 'hidden' } });
    expect(hidden.body.status).toBe('hidden');
    expect(await ratingSummary(hostel.id)).toMatchObject({ count: 1, overall: 5 });
    expect((await req('GET', '/admin/reviews?status=hidden', { token: admin.token })).body.total).toBe(1);
  });

  test('escalated issues: open > 7 days, or high severity > 48 hours', async () => {
    const { owner, hostel } = await ownerWithHostel();
    const r = await resident(hostel.id);
    const mk = async (title: string, severity: string, ageHours: number, status?: string) => {
      const i = (await req('POST', `/community/${hostel.id}/issues`, { token: r.token, body: { ...issueBody, title, severity, anonymous: true } })).body;
      await db.update(schema.issues).set({ createdAt: new Date(Date.now() - ageHours * 3_600_000) }).where(eq(schema.issues.id, i.id));
      if (status) await req('POST', `/issues/${i.id}/status`, { token: owner.token, body: { status } });
      return i.id;
    };
    const old = await mk('Old medium', 'medium', 8 * 24);
    const hot = await mk('High two days', 'high', 49, 'acknowledged');
    await mk('High fresh', 'high', 10);
    await mk('Medium three days', 'medium', 72);
    await mk('Old but in progress', 'high', 10 * 24, 'in_progress');
    const admin = await loginAdmin();
    const esc = await req('GET', '/admin/issues?escalated=true', { token: admin.token });
    expect(esc.body.items.map((i: any) => i.id).sort()).toEqual([old, hot].sort());
    expect(esc.body.items[0].reporter.id).toBe(r.user.id); // admins see anonymous reporters
    expect(esc.body.items[0].hostel.id).toBe(hostel.id);
    expect((await req('GET', '/admin/issues', { token: admin.token })).body.total).toBe(5);
    expect((await req('GET', '/admin/issues?status=in_progress', { token: admin.token })).body.total).toBe(1);
  });

  test('moves, saas invoices and job runner', async () => {
    const { owner, hostel, roomType } = await ownerWithHostel({ ownerPlan: 'free' });
    const t = await login('tenant');
    const sub = await insertSubscription({ userId: t.user.id, hostelId: hostel.id, roomTypeId: roomType.id });
    await db.insert(schema.moveRequests).values({
      id: newId('mov'),
      subscriptionId: sub.id,
      fromHostelId: hostel.id,
      fromRoomTypeId: roomType.id,
      toHostelId: hostel.id,
      toRoomTypeId: roomType.id,
      moveDate: addDays(today(), 5),
    });
    await req('POST', `/owner/hostels/${hostel.id}/plan`, { token: owner.token, body: { plan: 'pro' } });
    const admin = await loginAdmin();
    expect((await req('GET', '/admin/moves', { token: admin.token })).body[0]).toMatchObject({ status: 'scheduled' });
    expect((await req('GET', '/admin/saas-invoices', { token: admin.token })).body).toHaveLength(1);
    const jobs = await req('POST', '/admin/jobs/run', { token: admin.token });
    expect(jobs.status).toBe(200);
    expect(typeof jobs.body).toBe('object');
  });
});
