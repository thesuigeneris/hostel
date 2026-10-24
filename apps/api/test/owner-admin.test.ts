import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { PARTNER_STANDARD_IDS } from '@hostels/shared';
import { setClock } from '../src/lib/clock';
import { runJobs } from '../src/services/jobs';
import { activeSubscriber, admin, liveHostel, newOwner, newTenant } from './fixtures';
import { call, resetDb } from './helpers';

let ownerToken: string;
let adminToken: string;

beforeEach(async () => {
  await resetDb();
  setClock('2026-11-09T06:00:00Z');
  ownerToken = await newOwner();
  adminToken = await admin();
});

afterEach(() => setClock(null));

const ALL = [...PARTNER_STANDARD_IDS];

describe('partner applications and brand standards', () => {
  test('the inspection checklist must be complete to verify; the outcome is kept on the application', async () => {
    const { hostel } = await liveHostel(ownerToken, adminToken);
    const before = await call(`/owner/hostels/${hostel.id}/partner`, { token: ownerToken });
    expect(before.body.application).toBeNull();
    expect(before.body.standards.map((s: { id: string }) => s.id)).toEqual(ALL);

    expect((await call(`/owner/hostels/${hostel.id}/plan`, { token: ownerToken, body: { plan: 'partner' } })).status).toBe(200);
    const queue = await call('/admin/partner-applications', { token: adminToken });
    expect(queue.body).toHaveLength(1);
    expect(queue.body[0]).toMatchObject({ hostelId: hostel.id, status: 'applied', checklist: [], hostel: { name: hostel.name } });

    // Progress is saved between visits; unknown ids are rejected by validation.
    const saved = await call(`/admin/hostels/${hostel.id}/partner/checklist`, {
      token: adminToken,
      method: 'PUT',
      body: { checklist: ['photos_match', 'fire_safety'], note: 'Second floor geyser pending' },
    });
    expect(saved.body).toMatchObject({ checklist: ['photos_match', 'fire_safety'], note: 'Second floor geyser pending' });
    expect((await call(`/admin/hostels/${hostel.id}/partner/checklist`, { token: adminToken, method: 'PUT', body: { checklist: ['nope'] } })).status).toBe(400);

    const partial = await call(`/admin/hostels/${hostel.id}/partner/verify`, {
      token: adminToken,
      body: { platformFeePct: 10, checklist: ['photos_match', 'fire_safety'] },
    });
    expect(partial.status).toBe(400);
    expect(partial.body.message).toContain('Still to check: Every listed bed');
    expect(partial.body.message).not.toContain('Photos match');
    expect((await call(`/owner/hostels/${hostel.id}`, { token: ownerToken })).body.partnerStatus).toBe('applied');

    const ok = await call(`/admin/hostels/${hostel.id}/partner/verify`, { token: adminToken, body: { platformFeePct: 8, checklist: ALL } });
    expect(ok.body).toMatchObject({ partnerStatus: 'verified', platformFeePct: 8 });
    const after = await call(`/owner/hostels/${hostel.id}/partner`, { token: ownerToken });
    expect(after.body.application).toMatchObject({ status: 'verified', checklist: ALL, note: 'Second floor geyser pending' });
    expect(after.body.application.decidedAt).not.toBeNull();
    expect((await call('/admin/partner-applications', { token: adminToken })).body).toHaveLength(0);
    expect((await call('/admin/partner-applications?status=verified', { token: adminToken })).body).toHaveLength(1);
  });

  test('hostels without food skip the kitchen check; a declined application keeps its reason', async () => {
    const { hostel } = await liveHostel(ownerToken, adminToken, { foodAvailable: false });
    await call(`/owner/hostels/${hostel.id}/partner`, { token: ownerToken, method: 'POST' });
    const info = await call(`/owner/hostels/${hostel.id}/partner`, { token: ownerToken });
    expect(info.body.standards.map((s: { id: string }) => s.id)).not.toContain('kitchen_hygiene');

    const declined = await call(`/admin/hostels/${hostel.id}/partner/reject`, { token: adminToken, body: { reason: 'No fire extinguishers' } });
    expect(declined.body.partnerStatus).toBe('rejected');
    expect((await call(`/owner/hostels/${hostel.id}/partner`, { token: ownerToken })).body.application).toMatchObject({
      status: 'rejected',
      reason: 'No fire extinguishers',
    });

    // Reapplying opens a fresh application, which verifies without the kitchen item.
    await call(`/owner/hostels/${hostel.id}/partner`, { token: ownerToken, method: 'POST' });
    const verified = await call(`/admin/hostels/${hostel.id}/partner/verify`, {
      token: adminToken,
      body: { platformFeePct: 10, checklist: ALL.filter((id) => id !== 'kitchen_hygiene') },
    });
    expect(verified.body.partnerStatus).toBe('verified');
  });

  test('the brand kit is for verified partners only', async () => {
    const free = await liveHostel(ownerToken, adminToken);
    expect((await call(`/owner/hostels/${free.hostel.id}/brand-kit`, { token: ownerToken })).body.error).toBe('plan_required');

    const partner = await liveHostel(ownerToken, adminToken, { partner: true, name: 'Sunrise Residency' });
    const kit = await call(`/owner/hostels/${partner.hostel.id}/brand-kit`, { token: ownerToken });
    expect(kit.status).toBe(200);
    expect(kit.body).toMatchObject({ name: 'Sunrise Residency', area: 'Gachibowli', partnerSince: '2026-11-09' });
    expect(kit.body.listingUrl).toEndWith(`/hostels/${partner.hostel.slug}`);

    const other = await newOwner();
    expect((await call(`/owner/hostels/${partner.hostel.id}/brand-kit`, { token: other })).status).toBe(404);
  });
});

describe('owner insights', () => {
  test('Free hostels get issue health only; paid plans add occupancy and money', async () => {
    const { hostel, rooms } = await liveHostel(ownerToken, adminToken, {
      partner: true,
      rooms: [{ sharing: '2-sharing', monthlyRent: 10000, totalBeds: 10, bedsAvailable: 6 }],
    });
    const t = await newTenant('Ravi Kumar');
    await activeSubscriber(t.token, hostel.id, rooms[0].id, 'none');
    const issue = await call(`/hostels/${hostel.id}/issues`, { token: t.token, body: { category: 'wifi', title: 'Wi-Fi drops at night' } });
    expect(issue.status).toBe(201);

    setClock('2026-11-10T12:00:00Z');
    const res = await call(`/owner/hostels/${hostel.id}/insights`, { token: ownerToken });
    expect(res.status).toBe(200);
    expect(res.body.month).toBe('2026-11');
    expect(res.body.occupancy).toMatchObject({ totalBeds: 10, freeBeds: 5, occupiedBeds: 5, occupancyPct: 50, activeSubscribers: 1, activeResidents: 1 });
    expect(res.body.revenue).toMatchObject({ subscriptionGross: 10000, platformFeePct: 10, platformFee: 1000, subscriptionNet: 9000 });
    expect(res.body.issues).toMatchObject({
      open: 1,
      needsResponse: 1,
      openByAge: { under1Day: 0, days1to3: 1, days3to7: 0, over7Days: 0 },
      byCategory: { wifi: 1 },
      reportedLast90Days: 1,
      medianHoursToFirstResponse: null,
    });

    await call(`/issues/${issue.body.id}/updates`, { token: ownerToken, body: { status: 'acknowledged', message: 'Router replaced tomorrow' } });
    const acked = await call(`/owner/hostels/${hostel.id}/insights`, { token: ownerToken });
    expect(acked.body.issues.needsResponse).toBe(0);
    expect(acked.body.issues.medianHoursToFirstResponse).toBeGreaterThan(29);

    // A different month has no subscription money in it.
    expect((await call(`/owner/hostels/${hostel.id}/insights?month=2026-10`, { token: ownerToken })).body.revenue.subscriptionGross).toBe(0);

    const free = await liveHostel(ownerToken, adminToken);
    const freeInsights = await call(`/owner/hostels/${free.hostel.id}/insights`, { token: ownerToken });
    expect(freeInsights.body).toMatchObject({ occupancy: null, revenue: null, issues: { open: 0 }, visits: { new: 0 } });
    expect((await call(`/owner/hostels/${hostel.id}/insights`, { token: await newOwner() })).status).toBe(404);
  });
});

describe('admin billing oversight', () => {
  test('owner plans show dues and pauses; waiving the bill lifts the pause and is audited', async () => {
    const { hostel } = await liveHostel(ownerToken, adminToken, { name: 'Lakeview PG' });
    await call(`/owner/hostels/${hostel.id}/plan`, { token: ownerToken, body: { plan: 'pro' } });
    setClock('2026-12-04T06:00:00Z');
    await runJobs();
    setClock('2026-12-25T06:00:00Z');
    await runJobs();

    const paused = await call('/admin/owner-plans?suspended=true', { token: adminToken });
    expect(paused.body).toHaveLength(1);
    expect(paused.body[0]).toMatchObject({ hostelName: 'Lakeview PG', plan: 'pro', suspended: true, amountDue: 999, overdueBills: 1 });
    expect((await call('/admin/owner-plans?q=lakeview', { token: adminToken })).body).toHaveLength(1);
    expect((await call('/admin/owner-plans?q=nothing-like-this', { token: adminToken })).body).toHaveLength(0);

    const overdue = await call('/admin/owner-invoices?overdue=true', { token: adminToken });
    expect(overdue.body).toHaveLength(1);
    expect(overdue.body[0]).toMatchObject({ hostelName: 'Lakeview PG', isOverdue: true, amount: 999 });
    expect(overdue.body[0].ownerPhone).toMatch(/^97/);
    expect((await call('/admin/stats', { token: adminToken })).body).toMatchObject({ overdueOwnerBills: 1, suspendedHostels: 1 });

    const waived = await call(`/admin/owner-invoices/${overdue.body[0].id}/void`, { token: adminToken, body: { reason: 'Router outage, goodwill' } });
    expect(waived.body.status).toBe('void');
    expect((await call(`/admin/owner-invoices/${overdue.body[0].id}/void`, { token: adminToken, body: { reason: 'again' } })).body.error).toBe('invalid_state');
    expect((await call('/admin/owner-plans?suspended=true', { token: adminToken })).body).toHaveLength(0);
    expect((await call(`/owner/hostels/${hostel.id}/rent`, { token: ownerToken })).status).toBe(200);

    const log = await call('/admin/audit?action=owner_invoice.void', { token: adminToken });
    expect(log.body).toHaveLength(1);
    expect(log.body[0]).toMatchObject({ targetId: overdue.body[0].id, actor: { phone: '9000000001' } });
    expect(log.body[0].summary).toContain('goodwill');
  });

  test('admin tables search; owners cannot reach admin endpoints', async () => {
    await liveHostel(ownerToken, adminToken, { name: 'Banjara Nest', area: 'Madhapur' });
    await liveHostel(ownerToken, adminToken, { name: 'Ameerpet Corner', area: 'Ameerpet' });
    expect((await call('/admin/hostels?q=nest', { token: adminToken })).body.map((h: { name: string }) => h.name)).toEqual(['Banjara Nest']);
    expect((await call('/admin/hostels?q=ameerpet&status=live', { token: adminToken })).body).toHaveLength(1);

    // Approvals were audited; the log can be searched by summary.
    const approvals = await call('/admin/audit?action=listing.approve', { token: adminToken });
    expect(approvals.body).toHaveLength(2);
    expect((await call('/admin/audit?q=Banjara', { token: adminToken })).body).toHaveLength(1);

    for (const path of ['/admin/owner-plans', '/admin/audit', '/admin/partner-applications']) {
      expect((await call(path, { token: ownerToken })).status).toBe(403);
    }
  });
});
