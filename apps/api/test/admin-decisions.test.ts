import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { PARTNER_STANDARD_IDS, standardsFor } from '@hostels/shared';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../src/db';
import { setClock } from '../src/lib/clock';
import { addListingPhoto, admin, liveHostel, newOwner } from './fixtures';
import { call, resetDb } from './helpers';
import { holdRow } from './latch';

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

async function applied(opts: { foodAvailable?: boolean } = {}) {
  const { hostel } = await liveHostel(ownerToken, adminToken, opts);
  expect((await call(`/owner/hostels/${hostel.id}/partner`, { token: ownerToken, method: 'POST' })).status).toBe(200);
  return hostel as { id: string; slug: string; name: string };
}

const applications = (hostelId: string) =>
  getDb().select().from(schema.partnerApplications).where(eq(schema.partnerApplications.hostelId, hostelId));

describe('partner verification needs the whole checklist on every path', () => {
  test('a verify request without a checklist is judged on the saved inspection, and refused until it is complete', async () => {
    const hostel = await applied();
    const verify = () => call(`/admin/hostels/${hostel.id}/partner/verify`, { token: adminToken, body: { platformFeePct: 10 } });

    // Nothing ticked yet: a bare API call (no website, no app) can't verify.
    const bare = await verify();
    expect(bare.status).toBe(400);
    expect(bare.body.message).toContain('Tick every brand standard before verifying');
    expect((await call(`/owner/hostels/${hostel.id}`, { token: ownerToken })).body.partnerStatus).toBe('applied');

    // Saved progress counts, but only once every standard is in it.
    const save = (checklist: string[]) =>
      call(`/admin/hostels/${hostel.id}/partner/checklist`, { token: adminToken, method: 'PUT', body: { checklist, note: '' } });
    expect((await save(ALL.slice(0, 5))).status).toBe(200);
    const partial = await verify();
    expect(partial.status).toBe(400);
    expect(partial.body.message).toContain('Still to check');

    expect((await save(ALL)).status).toBe(200);
    const ok = await verify();
    expect(ok.status).toBe(200);
    expect(ok.body.partnerStatus).toBe('verified');
    const [app] = await applications(hostel.id);
    expect(app).toMatchObject({ status: 'verified', checklist: ALL });
  });

  test('a checklist sent with the request is the one that counts; standards that do not apply are dropped', async () => {
    const hostel = await applied({ foodAvailable: false });
    const save = await call(`/admin/hostels/${hostel.id}/partner/checklist`, { token: adminToken, method: 'PUT', body: { checklist: ALL } });
    expect(save.body.checklist).not.toContain('kitchen_hygiene');
    // The saved checklist is complete, but the inspector sent one with a standard unticked.
    const sent = await call(`/admin/hostels/${hostel.id}/partner/verify`, {
      token: adminToken,
      body: { platformFeePct: 10, checklist: ALL.filter((id) => id !== 'fire_safety' && id !== 'kitchen_hygiene') },
    });
    expect(sent.status).toBe(400);
    expect(sent.body.message).toContain('Fire extinguisher');
    // Without food, the kitchen standard is not needed.
    const ok = await call(`/admin/hostels/${hostel.id}/partner/verify`, {
      token: adminToken,
      body: { platformFeePct: 10, checklist: standardsFor(false).map((s) => s.id) },
    });
    expect(ok.status).toBe(200);
  });
});

describe('admin decisions made at the same moment', () => {
  test('two admins deciding one partner application: one decision, the other is told to refresh', async () => {
    const hostel = await applied();
    const latch = await holdRow('hostels', hostel.id);
    const verify = call(`/admin/hostels/${hostel.id}/partner/verify`, { token: adminToken, body: { platformFeePct: 10, checklist: ALL } });
    await latch.queued(1);
    const decline = call(`/admin/hostels/${hostel.id}/partner/reject`, { token: adminToken, body: { reason: 'No fire exit' } });
    await latch.queued(2);
    await latch.release();
    const [v, d] = await Promise.all([verify, decline]);

    expect(v.status).toBe(200);
    expect(d.status).toBe(409);
    expect(d.body.message).toContain('refresh');
    expect((await call(`/owner/hostels/${hostel.id}`, { token: ownerToken })).body.partnerStatus).toBe('verified');
    // One application, closed once, and one decision in the audit log.
    expect((await applications(hostel.id)).map((a) => a.status)).toEqual(['verified']);
    const audit = await call(`/admin/audit?targetId=${hostel.id}`, { token: adminToken });
    expect(audit.body.filter((e: { action: string }) => e.action.startsWith('partner.')).map((e: { action: string }) => e.action)).toEqual(['partner.verify']);
  });

  test('approving and rejecting a listing at the same moment: one decision', async () => {
    const created = await call('/owner/hostels', {
      token: ownerToken,
      body: { name: 'Twin Click PG', area: 'Madhapur', lat: 17.44, lng: 78.39, genderType: 'boys', contactPhone: '9876500001', amenities: [] },
    });
    const id = created.body.id as string;
    await call(`/owner/hostels/${id}/rooms`, { token: ownerToken, body: { sharing: '2-sharing', monthlyRent: 8000, advanceAmount: 0, totalBeds: 4, bedsAvailable: 4 } });
    await addListingPhoto(ownerToken, id);
    expect((await call(`/owner/hostels/${id}/submit`, { token: ownerToken, method: 'POST' })).status).toBe(200);

    const latch = await holdRow('hostels', id);
    const approve = call(`/admin/hostels/${id}/approve`, { token: adminToken, method: 'POST' });
    await latch.queued(1);
    const reject = call(`/admin/hostels/${id}/reject`, { token: adminToken, body: { reason: 'Blurry photos' } });
    await latch.queued(2);
    await latch.release();
    const [a, r] = await Promise.all([approve, reject]);

    expect(a.status).toBe(200);
    expect(r.status).toBe(409);
    const owner = await call(`/owner/hostels/${id}`, { token: ownerToken });
    expect(owner.body).toMatchObject({ status: 'live', rejectionReason: null });
    const audit = await call(`/admin/audit?targetId=${id}`, { token: adminToken });
    expect(audit.body.map((e: { action: string }) => e.action)).toEqual(['listing.approve']);
  });
});
