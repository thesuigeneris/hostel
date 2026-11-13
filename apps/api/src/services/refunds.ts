import type { AdminPaymentException, PaymentException, PaymentExceptionReason, PaymentExceptionStatus } from '@hostels/shared';
import { newId } from '@hostels/shared';
import { and, desc, eq, type SQL, sql } from 'drizzle-orm';
import { getDb, schema, type Tx } from '../db';
import { clock } from '../lib/clock';
import { AppError, notFound } from '../lib/errors';
import type { ReceivedMode } from '../lib/razorpay';

type ExceptionRow = typeof schema.paymentExceptions.$inferSelect;
type Bill =
  | { kind: 'tenant'; row: typeof schema.invoices.$inferSelect }
  | { kind: 'owner'; row: typeof schema.ownerInvoices.$inferSelect };

export function toPaymentException(r: ExceptionRow): PaymentException {
  return {
    id: r.id,
    billKind: r.invoiceId ? 'tenant' : 'owner',
    billId: (r.invoiceId ?? r.ownerInvoiceId)!,
    userId: r.userId,
    amount: r.amount,
    paymentMode: r.paymentMode as ReceivedMode,
    reason: r.reason,
    status: r.status,
    razorpayOrderId: r.razorpayOrderId,
    razorpayPaymentId: r.razorpayPaymentId,
    createdAt: r.createdAt.toISOString(),
    refundedAt: r.refundedAt?.toISOString() ?? null,
    refundNote: r.refundNote,
  };
}

export async function exceptionForPayment(tx: Tx, paymentId: string) {
  const [row] = await tx.select().from(schema.paymentExceptions).where(eq(schema.paymentExceptions.razorpayPaymentId, paymentId));
  return row ?? null;
}

/**
 * Records a payment that arrived for a bill that could no longer take it, so the money is owed back instead of lost.
 * Keyed by the Razorpay payment id: the checkout callback and every webhook retry for the same payment land on one row.
 */
export async function recordPaymentException(
  tx: Tx,
  bill: Bill,
  payment: { orderId: string; paymentId: string; mode: ReceivedMode },
  reason: PaymentExceptionReason,
  /** Only part of the bill is owed back (a cancelled move); the whole bill when omitted. */
  amount?: number,
) {
  const t = schema.paymentExceptions;
  await tx
    .insert(t)
    .values({
      id: newId('pex'),
      invoiceId: bill.kind === 'tenant' ? bill.row.id : null,
      ownerInvoiceId: bill.kind === 'owner' ? bill.row.id : null,
      userId: bill.kind === 'tenant' ? bill.row.userId : bill.row.ownerId,
      hostelId: bill.row.hostelId,
      amount: amount ?? (bill.kind === 'tenant' ? bill.row.totalAmount : bill.row.amount),
      paymentMode: payment.mode,
      reason,
      razorpayOrderId: payment.orderId,
      razorpayPaymentId: payment.paymentId,
    })
    .onConflictDoNothing({ target: t.razorpayPaymentId });
  console.warn(`[payments] payment ${payment.paymentId} for bill ${bill.row.id}: refund due (${reason})`);
}

/** The latest late payment on a bill, for the payer's bill page. */
export async function exceptionForBill(bill: Bill): Promise<PaymentException | null> {
  const t = schema.paymentExceptions;
  const [row] = await getDb()
    .select()
    .from(t)
    .where(bill.kind === 'tenant' ? eq(t.invoiceId, bill.row.id) : eq(t.ownerInvoiceId, bill.row.id))
    .orderBy(desc(t.createdAt))
    .limit(1);
  return row ? toPaymentException(row) : null;
}

export async function countRefundsDue(): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.paymentExceptions)
    .where(eq(schema.paymentExceptions.status, 'refund_due'));
  return row?.n ?? 0;
}

async function adminRows(where: SQL | undefined, limit: number): Promise<AdminPaymentException[]> {
  const t = schema.paymentExceptions;
  const rows = await getDb()
    .select({ exception: t, hostelName: schema.hostels.name, payer: { id: schema.users.id, name: schema.users.name, phone: schema.users.phone } })
    .from(t)
    .innerJoin(schema.hostels, eq(schema.hostels.id, t.hostelId))
    .innerJoin(schema.users, eq(schema.users.id, t.userId))
    .where(where)
    // Refunds still owed first, oldest first; then the ones already refunded, newest first.
    .orderBy(sql`${t.status} = 'refunded'`, sql`case when ${t.status} = 'refund_due' then ${t.createdAt} end`, desc(t.refundedAt))
    .limit(limit);
  return rows.map((r) => ({ ...toPaymentException(r.exception), hostelName: r.hostelName, payer: r.payer }));
}

/** For the admin billing page. */
export function listPaymentExceptions(status?: PaymentExceptionStatus) {
  return adminRows(status ? eq(schema.paymentExceptions.status, status) : undefined, 200);
}

/** An admin records that the money went back (refunded in the Razorpay dashboard, or by bank transfer). */
export async function markRefunded(id: string, adminId: string, note: string): Promise<AdminPaymentException> {
  const t = schema.paymentExceptions;
  const [row] = await getDb()
    .update(t)
    .set({ status: 'refunded', refundedAt: clock.now(), refundedBy: adminId, refundNote: note })
    .where(and(eq(t.id, id), eq(t.status, 'refund_due')))
    .returning({ id: t.id });
  if (!row) {
    const [existing] = await getDb().select({ status: t.status }).from(t).where(eq(t.id, id));
    if (!existing) throw notFound('Payment');
    throw new AppError('invalid_state', 'This payment is already marked refunded');
  }
  const [view] = await adminRows(eq(t.id, id), 1);
  return view!;
}
