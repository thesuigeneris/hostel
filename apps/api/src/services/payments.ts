import type { PaymentExceptionReason, PaymentPage, User } from '@hostels/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { getDb, schema, type Tx } from '../db';
import { clock } from '../lib/clock';
import { isUniqueViolation } from '../lib/db-errors';
import { env } from '../lib/env';
import { AppError, notFound } from '../lib/errors';
import { createOrder, getKeyId, isRazorpayConfigured, paymentModeFor, type ReceivedMode, verifyPaymentSignature } from '../lib/razorpay';
import { isBookable, planFor } from './access';
import { activateIfPending, openSubscription, reserveBed, toInvoice } from './billing';
import { refreshSuspensions, toOwnerInvoice } from './plans';
import { exceptionForBill, exceptionForPayment, recordPaymentException } from './refunds';

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

export async function paymentPage(user: User, invoiceId: string): Promise<PaymentPage> {
  const p = await loadPayable(user, invoiceId);
  const refund = await exceptionForBill(p);
  return {
    invoiceId: p.row.id,
    kind: p.kind,
    amount: amountOf(p),
    status: p.row.status,
    description: await describe(p),
    invoice: p.kind === 'tenant' ? toInvoice(p.row) : toOwnerInvoice(p.row),
    keyId: getKeyId(),
    stub: !isRazorpayConfigured(),
    // The admin's refund note is for the team; the payer sees what happened and when.
    refund: refund && (user.role === 'admin' ? refund : { ...refund, refundNote: null }),
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
    const table = p.kind === 'tenant' ? schema.invoices : schema.ownerInvoices;
    // Two tabs racing: the first order stored wins and both tabs pay that one. Overwriting it would leave the other
    // tab paying an order no bill points at, and that payment could not be matched to anything.
    const [set] = await getDb()
      .update(table)
      .set({ razorpayOrderId: order.id })
      .where(and(eq(table.id, p.row.id), eq(table.status, 'due'), isNull(table.razorpayOrderId)))
      .returning({ orderId: table.razorpayOrderId });
    if (set?.orderId) orderId = set.orderId;
    else {
      const [now] = await getDb().select({ status: table.status, orderId: table.razorpayOrderId }).from(table).where(eq(table.id, p.row.id));
      if (now?.status !== 'due' || !now.orderId) throw new AppError('invalid_state', 'This bill changed while opening the payment; refresh and try again');
      orderId = now.orderId;
    }
  }
  return { invoiceId: p.row.id, orderId, amount: amountOf(p) * 100, currency: 'INR' as const, keyId: getKeyId(), stub: !isRazorpayConfigured() };
}

/**
 * What became of a payment: `paid` (the bill was due), `already_paid` (this same payment was applied before),
 * `revived` (it arrived after the bed hold expired, and the plan was taken back up), or `refund_due` (it could not be
 * applied, and a payment exception now records the refund owed).
 */
export type PaymentOutcome = { kind: 'tenant' | 'owner'; invoiceId: string; outcome: 'paid' | 'already_paid' | 'revived' | 'refund_due' };

/**
 * Applies a captured payment to the bill for its order. Safe to call any number of times for the same payment (the
 * checkout callback and every webhook retry call it): only the first call changes anything. A payment never
 * disappears: if the bill can't take it any more, it is either applied by reviving the plan or recorded for a refund.
 */
export async function markOrderPaid(orderId: string, paymentId: string, mode: ReceivedMode): Promise<PaymentOutcome> {
  const result = await getDb().transaction(async (tx): Promise<PaymentOutcome> => {
    const paid = { status: 'paid' as const, razorpayPaymentId: paymentId, paidAt: clock.now(), paymentMode: mode };
    const [inv] = await tx
      .update(schema.invoices)
      .set(paid)
      .where(and(eq(schema.invoices.razorpayOrderId, orderId), eq(schema.invoices.status, 'due')))
      .returning();
    if (inv) {
      await activateIfPending(tx, inv.subscriptionId);
      return { kind: 'tenant', invoiceId: inv.id, outcome: 'paid' };
    }
    const [oin] = await tx
      .update(schema.ownerInvoices)
      .set(paid)
      .where(and(eq(schema.ownerInvoices.razorpayOrderId, orderId), eq(schema.ownerInvoices.status, 'due')))
      .returning();
    if (oin) return { kind: 'owner', invoiceId: oin.id, outcome: 'paid' };
    return settleLatePayment(tx, orderId, paymentId, mode);
  });
  if (result.kind === 'owner') await refreshSuspensions();
  return result;
}

/** The bill for this order is no longer due: already paid, or voided before the payment reached us. */
async function settleLatePayment(tx: Tx, orderId: string, paymentId: string, mode: ReceivedMode): Promise<PaymentOutcome> {
  // Locking the bill row serializes every delivery of a payment for it, so a retry can't revive a plan that an
  // earlier delivery already recorded as a refund (or the other way round).
  const [inv] = await tx.select().from(schema.invoices).where(eq(schema.invoices.razorpayOrderId, orderId)).for('update');
  const [oin] = inv ? [] : await tx.select().from(schema.ownerInvoices).where(eq(schema.ownerInvoices.razorpayOrderId, orderId)).for('update');
  const bill: Payable | null = inv ? { kind: 'tenant', row: inv } : oin ? { kind: 'owner', row: oin } : null;
  if (!bill) throw notFound('Order');
  const done = (outcome: PaymentOutcome['outcome']): PaymentOutcome => ({ kind: bill.kind, invoiceId: bill.row.id, outcome });

  if (bill.row.status === 'paid' && bill.row.razorpayPaymentId === paymentId) return done('already_paid');
  if (await exceptionForPayment(tx, paymentId)) return done('refund_due');

  let reason: PaymentExceptionReason;
  if (bill.row.status === 'paid') reason = 'duplicate_payment';
  else if (bill.kind === 'tenant') {
    const why = await reviveExpiredPlan(tx, bill.row, paymentId, mode);
    if (!why) return done('revived');
    reason = why;
  } else reason = bill.row.paymentMode === 'waived' ? 'bill_waived' : 'bill_cancelled';

  await recordPaymentException(tx, bill, { orderId, paymentId, mode }, reason);
  return done('refund_due');
}

class NotRevived extends Error {
  constructor(public reason: PaymentExceptionReason) {
    super(reason);
  }
}

/**
 * The first bill of a plan whose 30-minute bed hold ran out just before the payment arrived: take the plan back up,
 * if nothing that happened since makes that wrong. Every step runs in one savepoint, so a step that fails (no bed
 * left, the payer started another plan) leaves nothing behind. Returns null when revived, otherwise why it couldn't be.
 */
async function reviveExpiredPlan(
  tx: Tx,
  inv: typeof schema.invoices.$inferSelect,
  paymentId: string,
  mode: ReceivedMode,
): Promise<PaymentExceptionReason | null> {
  const [sub] = await tx.select().from(schema.subscriptions).where(eq(schema.subscriptions.id, inv.subscriptionId)).for('update');
  // A plan the payer cancelled, a bill a move replaced, or a period already over stays closed.
  if (!sub || sub.status !== 'expired' || inv.periodStart !== sub.startDate || clock.today() > inv.periodEnd) return 'bill_cancelled';
  const [hostel] = await tx.select().from(schema.hostels).where(eq(schema.hostels.id, sub.hostelId));
  if (!hostel || !isBookable(hostel, await planFor(hostel.id, tx))) return 'hostel_unavailable';
  if (await openSubscription(sub.userId, tx)) return 'has_other_plan';
  try {
    await tx.transaction(async (sp) => {
      if (!(await reserveBed(sp, sub.roomTypeId))) throw new NotRevived('bed_taken');
      const [paid] = await sp
        .update(schema.invoices)
        .set({ status: 'paid', razorpayPaymentId: paymentId, paidAt: clock.now(), paymentMode: mode })
        .where(and(eq(schema.invoices.id, inv.id), eq(schema.invoices.status, 'void')))
        .returning({ id: schema.invoices.id });
      if (!paid) throw new NotRevived('bill_cancelled');
      if (!(await activateIfPending(sp, sub.id, 'expired'))) throw new NotRevived('bill_cancelled');
    });
    console.warn(`[payments] payment ${paymentId} arrived after the hold on ${sub.id} expired; plan revived`);
    return null;
  } catch (e) {
    if (e instanceof NotRevived) return e.reason;
    // The payer started another plan in the same moment.
    if (isUniqueViolation(e, 'subscriptions_one_open_per_user')) return 'has_other_plan';
    throw e;
  }
}

export async function verifyCheckout(user: User, invoiceId: string, input: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) {
  const p = await loadPayable(user, invoiceId);
  if (p.row.razorpayOrderId !== input.razorpayOrderId) throw new AppError('signature_invalid', 'Payment does not match this bill', 400);
  const ok = verifyPaymentSignature({ orderId: input.razorpayOrderId, paymentId: input.razorpayPaymentId, signature: input.razorpaySignature });
  if (!ok) throw new AppError('signature_invalid', 'Payment signature did not verify', 400);
  await markOrderPaid(input.razorpayOrderId, input.razorpayPaymentId, paymentModeFor(input.razorpayOrderId));
  // A payment that could not be applied comes back on the page as `refund`, so the payer is told at once.
  return paymentPage(user, invoiceId);
}

/** Stub mode only: pays the bill as if Razorpay Checkout succeeded, recorded as simulated (never real money). */
export async function simulatePayment(user: User, invoiceId: string) {
  // Simulation is for development and for demo instances; a production standard instance only takes real payments.
  if (isRazorpayConfigured() || (env.isProduction && env.appMode !== 'demo')) {
    throw new AppError('forbidden', 'Simulated payments are only available in dev mode');
  }
  const order = await orderFor(user, invoiceId);
  const paymentId = `pay_stub_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
  await markOrderPaid(order.orderId, paymentId, 'simulated');
  return paymentPage(user, invoiceId);
}
