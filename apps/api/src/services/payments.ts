/**
 * Payments for tenant invoices (`inv_…`) and owner software invoices (`sin_…`), addendum §7.
 * Paying is idempotent: a conditional `due → paid` update decides who wins.
 */
import { and, eq } from 'drizzle-orm';
import type { Checkout } from '@hostels/shared';
import { istDate } from '@hostels/shared';
import { db, schema, type DbOrTx } from '../db';
import { randomToken } from '../lib/crypto';
import { err } from '../lib/http';
import { createOrder, getKeyId, isRazorpayConfigured, verifyPaymentSignature } from '../lib/razorpay';
import { saasAsInvoice, toInvoice } from '../lib/serialize-tenant';
import type { UserRow } from '../lib/types';
import { startSubscriptionResidency } from './residency';

type InvoiceRow = typeof schema.invoices.$inferSelect;
type SaasRow = typeof schema.saasInvoices.$inferSelect;
type Payable = { kind: 'inv'; row: InvoiceRow } | { kind: 'sin'; row: SaasRow };

const amountOf = (p: Payable) => (p.kind === 'inv' ? p.row.totalAmount : p.row.amount);

/** Make sure a due tenant invoice has a Razorpay order. */
export async function ensureOrder(inv: InvoiceRow, tx: DbOrTx = db): Promise<InvoiceRow> {
  if (inv.razorpayOrderId || inv.status !== 'due') return inv;
  const order = await createOrder({ amountInPaise: inv.totalAmount * 100, receipt: inv.id, notes: { invoiceId: inv.id } });
  const [row] = await tx.update(schema.invoices).set({ razorpayOrderId: order.id }).where(eq(schema.invoices.id, inv.id)).returning();
  return row!;
}

async function ensureSaasOrder(inv: SaasRow): Promise<SaasRow> {
  if (inv.razorpayOrderId || inv.status !== 'due') return inv;
  const order = await createOrder({ amountInPaise: inv.amount * 100, receipt: inv.id, notes: { invoiceId: inv.id } });
  const [row] = await db.update(schema.saasInvoices).set({ razorpayOrderId: order.id }).where(eq(schema.saasInvoices.id, inv.id)).returning();
  return row!;
}

/** Load an invoice the user may pay. Other people's invoices read as not found. */
async function loadPayable(invoiceId: string, user: UserRow): Promise<Payable> {
  if (invoiceId.startsWith('inv_')) {
    const [row] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, invoiceId));
    if (!row || row.userId !== user.id) throw err.notFound('Invoice');
    return { kind: 'inv', row };
  }
  if (invoiceId.startsWith('sin_')) {
    const [row] = await db.select().from(schema.saasInvoices).where(eq(schema.saasInvoices.id, invoiceId));
    if (!row || row.ownerId !== user.id) throw err.notFound('Invoice');
    return { kind: 'sin', row };
  }
  throw err.notFound('Invoice');
}

function fmt(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

async function buildCheckout(p: Payable, user: UserRow): Promise<Checkout> {
  const [hostel] = await db.select({ name: schema.hostels.name }).from(schema.hostels).where(eq(schema.hostels.id, p.row.hostelId));
  const today = istDate();
  const invoice = p.kind === 'inv' ? toInvoice(p.row, today) : saasAsInvoice(p.row, today);
  const description =
    p.kind === 'inv'
      ? `${hostel?.name ?? 'Hostel'} — rent + food, ${fmt(p.row.periodStart)} – ${fmt(p.row.periodEnd)}`
      : `Hostels Pro for ${hostel?.name ?? 'your hostel'} — ${p.row.periodMonth}`;
  return {
    invoice,
    mode: isRazorpayConfigured() ? 'live' : 'stub',
    razorpayKeyId: getKeyId(),
    razorpayOrderId: p.row.razorpayOrderId ?? '',
    amountPaise: amountOf(p) * 100,
    payer: { name: user.name, phone: user.phone, email: user.email },
    description,
  };
}

export async function checkout(invoiceId: string, user: UserRow): Promise<Checkout> {
  let p = await loadPayable(invoiceId, user);
  if (p.row.status === 'due') {
    p = p.kind === 'inv' ? { kind: 'inv', row: await ensureOrder(p.row) } : { kind: 'sin', row: await ensureSaasOrder(p.row) };
  }
  return buildCheckout(p, user);
}

/**
 * Mark paid and apply side effects (activate subscription + residency, or switch the hostel to Pro).
 * Returns false when it was already paid (or void), so callers can decide whether that is an error.
 */
export async function markPaid(kind: 'inv' | 'sin', invoiceId: string, paymentId: string, now = new Date()): Promise<boolean> {
  return db.transaction(async (tx) => {
    if (kind === 'inv') {
      const [inv] = await tx
        .update(schema.invoices)
        .set({ status: 'paid', paidAt: now, razorpayPaymentId: paymentId })
        .where(and(eq(schema.invoices.id, invoiceId), eq(schema.invoices.status, 'due')))
        .returning();
      if (!inv) return false;
      const [sub] = await tx
        .update(schema.subscriptions)
        .set({ status: 'active' })
        .where(and(eq(schema.subscriptions.id, inv.subscriptionId), eq(schema.subscriptions.status, 'pending')))
        .returning();
      if (sub) {
        await startSubscriptionResidency(tx, {
          userId: sub.userId,
          hostelId: sub.hostelId,
          subscriptionId: sub.id,
          startDate: sub.startDate,
          monthlyRent: inv.rentAmount,
        });
      }
      return true;
    }
    const [sin] = await tx
      .update(schema.saasInvoices)
      .set({ status: 'paid', paidAt: now, razorpayPaymentId: paymentId })
      .where(and(eq(schema.saasInvoices.id, invoiceId), eq(schema.saasInvoices.status, 'due')))
      .returning();
    if (!sin) return false;
    await tx.update(schema.hostels).set({ ownerPlan: 'pro' }).where(eq(schema.hostels.id, sin.hostelId));
    return true;
  });
}

async function payOrThrow(p: Payable, paymentId: string) {
  if (p.row.status === 'paid') throw err.conflict('invoice_already_paid', 'This bill is already paid');
  if (p.row.status === 'void') throw err.domain('validation', 'This bill is no longer valid');
  if (!(await markPaid(p.kind, p.row.id, paymentId))) {
    throw err.conflict('invoice_already_paid', 'This bill is already paid');
  }
}

export async function verify(
  invoiceId: string,
  user: UserRow,
  input: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string },
): Promise<Checkout> {
  const p = await loadPayable(invoiceId, user);
  if (p.row.status === 'paid') throw err.conflict('invoice_already_paid', 'This bill is already paid');
  const ok =
    !!p.row.razorpayOrderId &&
    p.row.razorpayOrderId === input.razorpayOrderId &&
    verifyPaymentSignature({ orderId: input.razorpayOrderId, paymentId: input.razorpayPaymentId, signature: input.razorpaySignature });
  if (!ok) throw err.domain('signature_invalid', 'Payment could not be verified');
  await payOrThrow(p, input.razorpayPaymentId);
  return checkout(invoiceId, user);
}

/** Stub mode only: pretend Razorpay captured the payment. */
export async function simulate(invoiceId: string, user: UserRow): Promise<Checkout> {
  if (isRazorpayConfigured()) throw err.forbidden('Simulated payments are only available in dev mode');
  const p = await loadPayable(invoiceId, user);
  await payOrThrow(p, `pay_stub_${randomToken(8)}`);
  return checkout(invoiceId, user);
}

/** Webhook: find the invoice by order id and mark it paid. Already-paid is a no-op. */
export async function handleCapturedPayment(orderId: string, paymentId: string): Promise<'paid' | 'already' | 'unknown'> {
  const [inv] = await db.select({ id: schema.invoices.id }).from(schema.invoices).where(eq(schema.invoices.razorpayOrderId, orderId));
  if (inv) return (await markPaid('inv', inv.id, paymentId)) ? 'paid' : 'already';
  const [sin] = await db.select({ id: schema.saasInvoices.id }).from(schema.saasInvoices).where(eq(schema.saasInvoices.razorpayOrderId, orderId));
  if (sin) return (await markPaid('sin', sin.id, paymentId)) ? 'paid' : 'already';
  return 'unknown';
}
