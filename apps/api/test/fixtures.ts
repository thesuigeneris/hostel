import { expect, spyOn } from 'bun:test';
import { signPayment } from '../src/lib/razorpay';
import { app, call, login } from './helpers';

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

/** A real 1×1 PNG. */
export const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

/** Uploads a photo as the apps do. Returns the receipt to attach it with, and its link. */
export async function uploadPhoto(token: string, purpose?: 'listing' | 'attachment', bytes = PNG) {
  const form = new FormData();
  form.append('file', new File([bytes], 'photo.png', { type: 'image/png' }));
  if (purpose) form.append('purpose', purpose);
  const res = await app.request('/uploads', { method: 'POST', body: form, headers: { Authorization: `Bearer ${token}` } });
  expect(res.status).toBe(201);
  return (await res.json()) as { upload: string; url: string };
}

/** Uploads a listing photo and adds it to the hostel. */
export async function addListingPhoto(token: string, hostelId: string) {
  const { upload } = await uploadPhoto(token, 'listing');
  const res = await call(`/owner/hostels/${hostelId}/photos`, { token, body: { photo: upload } });
  expect(res.status).toBe(201);
  return res.body as { id: string; url: string };
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
  await addListingPhoto(ownerToken, hostel.id);
  expect((await call(`/owner/hostels/${hostel.id}/submit`, { token: ownerToken, method: 'POST' })).status).toBe(200);
  expect((await call(`/admin/hostels/${hostel.id}/approve`, { token: adminToken, method: 'POST' })).status).toBe(200);
  if (opts.partner) {
    expect((await call(`/owner/hostels/${hostel.id}/partner`, { token: ownerToken, method: 'POST' })).status).toBe(200);
    const v = await call(`/admin/hostels/${hostel.id}/partner/verify`, { token: adminToken, body: { platformFeePct: 10 } });
    expect(v.status).toBe(200);
  }
  return { hostel: { ...hostel, status: 'live' }, rooms };
}

/** Subscribes and pays the first bill in stub mode (a simulated payment, never counted as money). */
export async function activeSubscriber(tenantToken: string, hostelId: string, roomTypeId: string, mealPlan = 'full', diet = 'veg') {
  const sub = await call(`/hostels/${hostelId}/subscribe`, { token: tenantToken, body: { roomTypeId, mealPlan, diet } });
  expect(sub.status).toBe(201);
  const paid = await call(`/payments/${sub.body.invoice.id}/simulate`, { token: tenantToken, method: 'POST' });
  expect(paid.status).toBe(200);
  return sub.body as { subscription: { id: string; startDate: string }; invoice: { id: string } };
}

/** Opens checkout for a bill, as the pay page does, and returns its payment order id. */
export async function checkoutOrderId(token: string, invoiceId: string): Promise<string> {
  const order = await call(`/payments/${invoiceId}/order`, { token, method: 'POST' });
  expect(order.status).toBe(200);
  return order.body.orderId;
}

export async function roomBeds(ownerToken: string, hostelId: string, roomTypeId: string) {
  const res = await call(`/owner/hostels/${hostelId}`, { token: ownerToken });
  return res.body.roomTypes.find((r: { id: string }) => r.id === roomTypeId).bedsAvailable as number;
}

/**
 * Runs `fn` as an instance with Razorpay keys of the given mode (`rzp_live_…` or `rzp_test_…`). Razorpay itself is
 * never called: order creation is answered here with an order id like Razorpay's.
 */
export async function withRazorpay<T>(mode: 'live' | 'test', fn: () => Promise<T>, opts: { beforeOrderReply?: () => Promise<void> } = {}): Promise<T> {
  const saved = { id: process.env.RAZORPAY_KEY_ID, secret: process.env.RAZORPAY_KEY_SECRET };
  process.env.RAZORPAY_KEY_ID = `rzp_${mode}_HostelsTestKey`;
  process.env.RAZORPAY_KEY_SECRET = 'test-razorpay-key-secret';
  const realFetch = globalThis.fetch;
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url !== 'https://api.razorpay.com/v1/orders') return realFetch(input, init);
    await opts.beforeOrderReply?.();
    const { amount } = JSON.parse(String(init?.body)) as { amount: number };
    const id = `order_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
    return new Response(JSON.stringify({ id, amount, currency: 'INR', status: 'created' }), { status: 200 });
  }) as typeof fetch);
  try {
    return await fn();
  } finally {
    fetchSpy.mockRestore();
    for (const [key, value] of Object.entries({ RAZORPAY_KEY_ID: saved.id, RAZORPAY_KEY_SECRET: saved.secret })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

let paymentCounter = 0;
/** A Razorpay-looking payment id. */
export function nextPaymentId() {
  paymentCounter += 1;
  return `pay_T${String(paymentCounter).padStart(13, '0')}`;
}

/** Pays a bill through checkout as Razorpay would: order, then the signed callback. Use inside `withRazorpay`. */
export async function payByCheckout(token: string, invoiceId: string, paymentId = nextPaymentId()) {
  const order = await call(`/payments/${invoiceId}/order`, { token, method: 'POST' });
  expect(order.status).toBe(200);
  const res = await call(`/payments/${invoiceId}/verify`, {
    token,
    body: { razorpayOrderId: order.body.orderId, razorpayPaymentId: paymentId, razorpaySignature: signPayment(order.body.orderId, paymentId) },
  });
  expect(res.status).toBe(200);
  return res.body;
}

/** Subscribes and pays the first bill with real money: Razorpay with live keys. */
export async function liveSubscriber(tenantToken: string, hostelId: string, roomTypeId: string, mealPlan = 'full', diet = 'veg') {
  return withRazorpay('live', async () => {
    const sub = await call(`/hostels/${hostelId}/subscribe`, { token: tenantToken, body: { roomTypeId, mealPlan, diet } });
    expect(sub.status).toBe(201);
    const paid = await payByCheckout(tenantToken, sub.body.invoice.id);
    expect(paid.invoice).toMatchObject({ status: 'paid', paymentMode: 'razorpay_live' });
    return sub.body as { subscription: { id: string; startDate: string }; invoice: { id: string } };
  });
}
