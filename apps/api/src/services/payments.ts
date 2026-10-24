import type { User } from '@hostels/shared';
import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { clock } from '../lib/clock';
import { env } from '../lib/env';
import { AppError, notFound } from '../lib/errors';
import { createOrder, getKeyId, isRazorpayConfigured, signPayment, verifyPaymentSignature } from '../lib/razorpay';
import { activateIfPending, toInvoice } from './billing';
import { refreshSuspensions, toOwnerInvoice } from './plans';

/** Tenant bills (`inv_`) and owner platform bills (`oin_`) are paid through the same page. */
type Payable =
  | { kind: 'tenant'; row: typeof schema.invoices.$inferSelect }
  | { kind: 'owner'; row: typeof schema.ownerInvoices.$inferSelect };

async function loadPayable(user: User, invoiceId: string): Promise<Payable> {
  const db = getDb();
  if (invoiceId.startsWith('oin_')) {
    const [row] = await db.select().from(schema.ownerInvoices).where(eq(schema.ownerInvoices.id, invoiceId));
    if (!row || (row.ownerId !== user.id && user.role !== 'admin')) throw notFound('Bill');
    return { kind: 'owner', row };
  }
  const [row] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, invoiceId));
  if (!row || (row.userId !== user.id && user.role !== 'admin')) throw notFound('Bill');
  return { kind: 'tenant', row };
}

const amountOf = (p: Payable) => (p.kind === 'tenant' ? p.row.totalAmount : p.row.amount);

async function describe(p: Payable) {
  const [hostel] = await getDb()
    .select({ name: schema.hostels.name })
    .from(schema.hostels)
    .where(eq(schema.hostels.id, p.row.hostelId));
  const what = p.kind === 'tenant' ? 'Stay and food' : `${p.row.plan === 'pro' ? 'Pro' : 'Partner'} plan`;
  return `${what} at ${hostel?.name ?? 'hostel'}, ${p.row.periodStart} to ${p.row.periodEnd}`;
}

export async function paymentPage(user: User, invoiceId: string) {
  const p = await loadPayable(user, invoiceId);
  return {
    invoiceId: p.row.id,
    kind: p.kind,
    amount: amountOf(p),
    status: p.row.status,
    description: await describe(p),
    invoice: p.kind === 'tenant' ? toInvoice(p.row) : toOwnerInvoice(p.row),
    keyId: getKeyId(),
    stub: !isRazorpayConfigured(),
  };
}

/** Returns the Razorpay order for a bill, creating it on first use. */
export async function orderFor(user: User, invoiceId: string) {
  const p = await loadPayable(user, invoiceId);
  if (p.row.status === 'paid') throw new AppError('invoice_already_paid', 'This bill is already paid');
  if (p.row.status === 'void') throw new AppError('invalid_state', 'This bill was cancelled');
  let orderId = p.row.razorpayOrderId;
  if (!orderId) {
    const order = await createOrder({ amountInPaise: amountOf(p) * 100, receipt: p.row.id, notes: { invoiceId: p.row.id } });
    orderId = order.id;
    const table = p.kind === 'tenant' ? schema.invoices : schema.ownerInvoices;
    // Two tabs racing: keep whichever order landed first.
    const [set] = await getDb()
      .update(table)
      .set({ razorpayOrderId: orderId })
      .where(and(eq(table.id, p.row.id), eq(table.status, 'due')))
      .returning({ orderId: table.razorpayOrderId });
    orderId = set?.orderId ?? orderId;
  }
  return { invoiceId: p.row.id, orderId, amount: amountOf(p) * 100, currency: 'INR' as const, keyId: getKeyId(), stub: !isRazorpayConfigured() };
}

/**
 * Marks the bill for an order paid. Safe to call any number of times (checkout callback and webhook both
 * call it): only the first call flips `due` to `paid` and activates a pending subscription.
 */
export async function markOrderPaid(orderId: string, paymentId: string) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [inv] = await tx
      .update(schema.invoices)
      .set({ status: 'paid', razorpayPaymentId: paymentId, paidAt: clock.now() })
      .where(and(eq(schema.invoices.razorpayOrderId, orderId), eq(schema.invoices.status, 'due')))
      .returning();
    if (inv) {
      await activateIfPending(tx, inv.subscriptionId);
      return { kind: 'tenant' as const, invoiceId: inv.id, alreadyPaid: false };
    }
    const [oin] = await tx
      .update(schema.ownerInvoices)
      .set({ status: 'paid', razorpayPaymentId: paymentId, paidAt: clock.now() })
      .where(and(eq(schema.ownerInvoices.razorpayOrderId, orderId), eq(schema.ownerInvoices.status, 'due')))
      .returning();
    if (oin) return { kind: 'owner' as const, invoiceId: oin.id, alreadyPaid: false };

    const [paidInv] = await tx.select().from(schema.invoices).where(eq(schema.invoices.razorpayOrderId, orderId));
    const [paidOin] = await tx.select().from(schema.ownerInvoices).where(eq(schema.ownerInvoices.razorpayOrderId, orderId));
    const existing = paidInv ?? paidOin;
    if (existing?.status === 'paid') return { kind: paidInv ? ('tenant' as const) : ('owner' as const), invoiceId: existing.id, alreadyPaid: true };
    if (existing) {
      console.error(`[payments] payment ${paymentId} captured for ${existing.status} bill ${existing.id}; refund needed`);
      throw new AppError('invalid_state', 'This bill was cancelled before the payment arrived. Contact support for a refund.');
    }
    throw notFound('Order');
  }).then(async (result) => {
    if (result.kind === 'owner') await refreshSuspensions();
    return result;
  });
}

export async function verifyCheckout(user: User, invoiceId: string, input: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) {
  const p = await loadPayable(user, invoiceId);
  if (p.row.razorpayOrderId !== input.razorpayOrderId) throw new AppError('signature_invalid', 'Payment does not match this bill', 400);
  const ok = verifyPaymentSignature({ orderId: input.razorpayOrderId, paymentId: input.razorpayPaymentId, signature: input.razorpaySignature });
  if (!ok) throw new AppError('signature_invalid', 'Payment signature did not verify', 400);
  await markOrderPaid(input.razorpayOrderId, input.razorpayPaymentId);
  return paymentPage(user, invoiceId);
}

/** Stub mode only: pays the bill as if Razorpay Checkout succeeded. */
export async function simulatePayment(user: User, invoiceId: string) {
  // Simulation is for development and for demo instances; a production standard instance only takes real payments.
  if (isRazorpayConfigured() || (env.isProduction && env.appMode !== 'demo')) {
    throw new AppError('forbidden', 'Simulated payments are only available in dev mode');
  }
  const order = await orderFor(user, invoiceId);
  const paymentId = `pay_stub_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
  return verifyCheckout(user, invoiceId, {
    razorpayOrderId: order.orderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: signPayment(order.orderId, paymentId),
  });
}
