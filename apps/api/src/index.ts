import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type {
  AuthOtpRequestInput,
  AuthOtpVerifyInput,
  AuthSession,
  CreateOrderInput,
  CreateOrderResult,
  Hostel,
  Role,
  SubscribeInput,
  User,
  VerifyPaymentInput,
  CreateHostelInput,
  UpdateHostelInput,
} from '@hostels/shared';
import { store } from './lib/store';
import {
  createOrder,
  getKeyId,
  isRazorpayConfigured,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from './lib/razorpay';
import { generateOtp, sendOtp } from './lib/msg91';

type Variables = { user: User };

const app = new Hono<{ Variables: Variables }>();

app.use('*', logger());
app.use('*', cors({ origin: '*' }));

app.get('/', (c) =>
  c.json({
    ok: true,
    service: 'hostels-api',
    version: '0.0.2',
    razorpay: isRazorpayConfigured() ? 'live' : 'stubbed',
    db: process.env.DATABASE_URL ? 'postgres' : 'in-memory',
  }),
);

const auth = (requiredRole?: Role) => async (c: any, next: any) => {
  const header = c.req.header('Authorization') || '';
  const match = header.match(/^Bearer (\S+)$/);
  if (!match) return c.json({ error: 'unauthorized' }, 401);
  const user = await store.getSessionUser(match[1]);
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  if (requiredRole && user.role !== requiredRole && user.role !== 'admin')
    return c.json({ error: 'forbidden' }, 403);
  c.set('user', user);
  await next();
};

app.get('/hostels', async (c) => {
  const area = c.req.query('area');
  const max = c.req.query('maxRent');
  const result: Hostel[] = await store.listHostels({
    area: area ?? undefined,
    maxRent: max ? Number(max) : undefined,
  });
  return c.json(result);
});

app.get('/hostels/:id', async (c) => {
  const h = await store.getHostel(c.req.param('id'));
  if (!h) return c.json({ error: 'not_found' }, 404);
  return c.json(h);
});

app.post('/auth/otp', async (c) => {
  const body = await c.req.json<AuthOtpRequestInput>();
  if (!body.phone) return c.json({ error: 'phone_required' }, 400);
  const otp = generateOtp();
  await store.setOtp(body.phone, otp, 5 * 60);
  await sendOtp(body.phone, otp);
  const exposeDevOtp = !process.env.MSG91_AUTH_KEY || process.env.NODE_ENV !== 'production';
  return c.json({ ok: true, ...(exposeDevOtp ? { devOtp: otp } : {}) });
});

app.post('/auth/verify', async (c) => {
  const body = await c.req.json<AuthOtpVerifyInput & { role?: Role }>();
  const ok = await store.verifyOtp(body.phone, body.otp);
  if (!ok) return c.json({ error: 'otp_invalid_or_expired' }, 400);
  let user = await store.findUserByPhone(body.phone);
  if (!user) user = await store.createUser({ phone: body.phone, role: body.role ?? 'tenant' });
  if (body.role && user.role !== body.role && user.role !== 'admin') {
    user = await store.updateUser(user.id, { role: body.role });
  }
  const token = await store.createSession(user.id);
  const session: AuthSession = { user, token };
  return c.json(session);
});

app.get('/me', auth(), (c) => c.json(c.get('user')));

app.patch('/me', auth(), async (c) => {
  const body = await c.req.json<Partial<Pick<User, 'name' | 'email'>>>();
  const u = c.get('user');
  const updated = await store.updateUser(u.id, body);
  return c.json(updated);
});

app.get('/me/subscription', auth(), async (c) => {
  const u = c.get('user');
  const sub = await store.getActiveSubscriptionFor(u.id);
  return c.json(sub ?? null);
});

app.post('/payments/create-order', auth('tenant'), async (c) => {
  const u = c.get('user');
  const body = await c.req.json<CreateOrderInput>();
  const hostel = await store.getHostel(body.hostelId);
  if (!hostel) return c.json({ error: 'hostel_not_found' }, 404);
  if (hostel.bedsAvailable <= 0) return c.json({ error: 'no_beds_available' }, 400);
  const existing = await store.getActiveSubscriptionFor(u.id);
  if (existing) return c.json({ error: 'already_subscribed' }, 409);

  const mealPlanAdjustments: Record<typeof body.mealPlan, number> = {
    full: 0,
    'breakfast-only': -3000,
    none: -6000,
  };
  const monthly = hostel.monthlyRent + mealPlanAdjustments[body.mealPlan];
  const amountInPaise = monthly * 100;

  const order = await createOrder({
    amountInPaise,
    receipt: `rcp_${u.id}_${Date.now()}`,
    notes: { userId: u.id, hostelId: hostel.id, mealPlan: body.mealPlan },
  });
  await store.createPendingSubscription({
    userId: u.id,
    hostelId: hostel.id,
    monthlyAmount: monthly,
    mealPlan: body.mealPlan,
    razorpayOrderId: order.id,
  });
  const result: CreateOrderResult = {
    orderId: order.id,
    amount: order.amount,
    currency: 'INR',
    keyId: getKeyId(),
  };
  return c.json(result);
});

app.post('/payments/verify', auth('tenant'), async (c) => {
  const body = await c.req.json<VerifyPaymentInput>();
  const ok = verifyPaymentSignature({
    orderId: body.razorpayOrderId,
    paymentId: body.razorpayPaymentId,
    signature: body.razorpaySignature,
  });
  if (!ok) return c.json({ error: 'signature_invalid' }, 400);
  const sub = await store.activateSubscriptionByOrder(body.razorpayOrderId, body.razorpayPaymentId);
  if (!sub) return c.json({ error: 'subscription_not_found' }, 404);
  await store.incrementBeds(sub.hostelId, -1);
  return c.json(sub);
});

app.post('/subscribe', auth('tenant'), async (c) => {
  const u = c.get('user');
  const body = await c.req.json<SubscribeInput>();
  const hostel = await store.getHostel(body.hostelId);
  if (!hostel) return c.json({ error: 'hostel_not_found' }, 404);
  if (hostel.bedsAvailable <= 0) return c.json({ error: 'no_beds_available' }, 400);
  const existing = await store.getActiveSubscriptionFor(u.id);
  if (existing) return c.json({ error: 'already_subscribed', subscriptionId: existing.id }, 409);
  const mealPlanAdjustments: Record<typeof body.mealPlan, number> = {
    full: 0,
    'breakfast-only': -3000,
    none: -6000,
  };
  const monthly = hostel.monthlyRent + mealPlanAdjustments[body.mealPlan];
  const sub = await store.createPendingSubscription({
    userId: u.id,
    hostelId: hostel.id,
    monthlyAmount: monthly,
    mealPlan: body.mealPlan,
    razorpayOrderId: `order_legacy_${Date.now()}`,
  });
  const activated = await store.activateSubscriptionByOrder(sub.razorpayOrderId!, `pay_legacy_${Date.now()}`);
  await store.incrementBeds(hostel.id, -1);
  return c.json(activated);
});

app.post('/subscriptions/:id/cancel', auth(), async (c) => {
  const u = c.get('user');
  const sub = await store.getSubscription(c.req.param('id'));
  if (!sub || sub.userId !== u.id) return c.json({ error: 'not_found' }, 404);
  const cancelled = await store.cancelSubscription(sub.id);
  if (cancelled) await store.incrementBeds(sub.hostelId, 1);
  return c.json(cancelled);
});

app.post('/webhooks/razorpay', async (c) => {
  const signature = c.req.header('x-razorpay-signature') ?? '';
  const raw = await c.req.text();
  if (!verifyWebhookSignature(raw, signature)) {
    return c.json({ error: 'invalid_signature' }, 400);
  }
  const payload = JSON.parse(raw);
  const event = payload.event as string;
  if (event === 'payment.captured') {
    const orderId = payload.payload?.payment?.entity?.order_id;
    const paymentId = payload.payload?.payment?.entity?.id;
    if (orderId && paymentId) {
      const sub = await store.activateSubscriptionByOrder(orderId, paymentId);
      if (sub) await store.incrementBeds(sub.hostelId, -1);
    }
  }
  return c.json({ ok: true });
});

app.get('/owner/hostels', auth('owner'), async (c) => {
  const u = c.get('user');
  return c.json(await store.listHostels({ ownerId: u.id }));
});

app.post('/owner/hostels', auth('owner'), async (c) => {
  const u = c.get('user');
  const body = await c.req.json<CreateHostelInput>();
  const hostel = await store.createHostel({
    ownerId: u.id,
    name: body.name,
    area: body.area,
    city: body.city,
    imageUrl: body.imageUrl,
    monthlyRent: body.monthlyRent,
    foodIncluded: body.foodIncluded,
    sharingType: body.sharingType,
    amenities: body.amenities,
    bedsAvailable: body.bedsAvailable ?? body.totalBeds,
    totalBeds: body.totalBeds,
    description: body.description,
  });
  return c.json(hostel);
});

app.get('/owner/hostels/:id', auth('owner'), async (c) => {
  const u = c.get('user');
  const h = await store.getHostel(c.req.param('id'));
  if (!h || (h.ownerId !== u.id && u.role !== 'admin')) return c.json({ error: 'not_found' }, 404);
  return c.json(h);
});

app.patch('/owner/hostels/:id', auth('owner'), async (c) => {
  const u = c.get('user');
  const h = await store.getHostel(c.req.param('id'));
  if (!h || (h.ownerId !== u.id && u.role !== 'admin')) return c.json({ error: 'not_found' }, 404);
  const body = await c.req.json<UpdateHostelInput>();
  const updated = await store.updateHostel(h.id, body);
  return c.json(updated);
});

app.get('/owner/subscribers', auth('owner'), async (c) => {
  const u = c.get('user');
  const list = await store.listSubscribersForOwner(u.id);
  return c.json(list);
});

app.get('/owner/payouts', auth('owner'), async (c) => {
  const u = c.get('user');
  const [history, preview] = await Promise.all([store.listPayouts(u.id), store.computePayoutPreview(u.id)]);
  return c.json({ history, preview });
});

const port = Number(process.env.PORT || 4000);
console.log(`hostels-api listening on http://localhost:${port}`);
console.log(`  razorpay: ${isRazorpayConfigured() ? 'live' : 'stubbed'}`);
console.log(`  database: ${process.env.DATABASE_URL ? 'postgres' : 'in-memory'}`);

export default { port, fetch: app.fetch };
