import { expect } from 'bun:test';
import { call, login } from './helpers';

let phoneCounter = 0;
/** A fresh valid mobile number for each call. */
export function nextPhone() {
  phoneCounter += 1;
  return `97${String(phoneCounter).padStart(8, '0')}`;
}

export async function admin() {
  return login('9000000001');
}

export async function newOwner() {
  return login(nextPhone(), 'owner');
}

export async function newTenant(name = 'Test Tenant') {
  const phone = nextPhone();
  const token = await login(phone);
  await call('/me', { token, method: 'PATCH', body: { name } });
  return { token, phone };
}

type HostelOpts = {
  name?: string;
  area?: string;
  lat?: number;
  lng?: number;
  partner?: boolean;
  foodAvailable?: boolean;
  genderType?: 'boys' | 'girls' | 'coliving';
  rooms?: { sharing: string; monthlyRent: number; totalBeds: number; bedsAvailable: number; advanceAmount?: number }[];
};

/** Creates a listing through the owner and admin APIs, optionally verifying it as a partner. */
export async function liveHostel(ownerToken: string, adminToken: string, opts: HostelOpts = {}) {
  const created = await call('/owner/hostels', {
    token: ownerToken,
    body: {
      name: opts.name ?? `Test Hostel ${nextPhone().slice(-5)}`,
      area: opts.area ?? 'Gachibowli',
      lat: opts.lat ?? 17.44,
      lng: opts.lng ?? 78.35,
      genderType: opts.genderType ?? 'coliving',
      contactPhone: '9876500000',
      foodAvailable: opts.foodAvailable ?? true,
      amenities: ['WiFi'],
    },
  });
  expect(created.status).toBe(201);
  const hostel = created.body;
  const rooms = [];
  for (const r of opts.rooms ?? [{ sharing: '2-sharing', monthlyRent: 10000, totalBeds: 10, bedsAvailable: 5 }]) {
    const res = await call(`/owner/hostels/${hostel.id}/rooms`, { token: ownerToken, body: { advanceAmount: 0, ...r } });
    expect(res.status).toBe(201);
    rooms.push(res.body);
  }
  await call(`/owner/hostels/${hostel.id}/photos`, { token: ownerToken, body: { url: 'https://example.com/a.jpg' } });
  expect((await call(`/owner/hostels/${hostel.id}/submit`, { token: ownerToken, method: 'POST' })).status).toBe(200);
  expect((await call(`/admin/hostels/${hostel.id}/approve`, { token: adminToken, method: 'POST' })).status).toBe(200);
  if (opts.partner) {
    expect((await call(`/owner/hostels/${hostel.id}/partner`, { token: ownerToken, method: 'POST' })).status).toBe(200);
    const v = await call(`/admin/hostels/${hostel.id}/partner/verify`, { token: adminToken, body: { platformFeePct: 10 } });
    expect(v.status).toBe(200);
  }
  return { hostel: { ...hostel, status: 'live' }, rooms };
}

/** Subscribes and pays the first bill in stub mode. */
export async function activeSubscriber(tenantToken: string, hostelId: string, roomTypeId: string, mealPlan = 'full', diet = 'veg') {
  const sub = await call(`/hostels/${hostelId}/subscribe`, { token: tenantToken, body: { roomTypeId, mealPlan, diet } });
  expect(sub.status).toBe(201);
  const paid = await call(`/payments/${sub.body.invoice.id}/simulate`, { token: tenantToken, method: 'POST' });
  expect(paid.status).toBe(200);
  return sub.body as { subscription: { id: string; startDate: string }; invoice: { id: string } };
}

export async function roomBeds(ownerToken: string, hostelId: string, roomTypeId: string) {
  const res = await call(`/owner/hostels/${hostelId}`, { token: ownerToken });
  return res.body.roomTypes.find((r: { id: string }) => r.id === roomTypeId).bedsAvailable as number;
}
