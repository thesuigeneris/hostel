import { ApiError, type Invoice } from '@hostels/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { releaseHoldAction, simulatePaymentAction } from '@/app/account/actions';
import { RazorpayButton } from '@/components/RazorpayButton';
import { SubmitButton } from '@/components/SubmitButton';
import { Card, Flash, LinkButton, PageHeader, StatusBadge } from '@/components/ui';
import { api, requireUser } from '@/lib/api';
import { dateLabel, rupees } from '@/lib/format';
import { holdText } from '@/lib/hold';

type Props = { params: Promise<{ invoiceId: string }>; searchParams: Promise<{ error?: string; ok?: string }> };

export const metadata: Metadata = { title: 'Pay your bill', robots: { index: false } };

export default async function PayPage({ params, searchParams }: Props) {
  const { invoiceId } = await params;
  const q = await searchParams;
  const user = await requireUser(`/pay/${invoiceId}`);
  const client = await api();
  const page = await client.payments.page(invoiceId).catch((e) => {
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  });
  const tenantBill = page.kind === 'tenant' ? (page.invoice as Invoice) : null;
  // A first bill for a held bed: say how long the hold lasts, and offer a way back to choose again.
  const mine = tenantBill && page.status === 'due' ? await client.me.subscription().catch(() => null) : null;
  const held = mine?.subscription.status === 'pending' && mine.subscription.id === tenantBill?.subscriptionId ? mine : null;
  const hold = held ? holdText(held.subscription.createdAt) : null;
  const doneHref = page.kind === 'tenant' ? '/account' : `/owner/hostels/${page.invoice.hostelId}/plan`;

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <PageHeader title="Pay your bill" subtitle={page.description} />
      <Flash error={q.error} ok={q.ok} />
      <Card>
        <div className="flex items-center justify-between">
          <span className="text-sm text-ink-muted">
            {dateLabel(page.invoice.periodStart)} – {dateLabel(page.invoice.periodEnd)}
          </span>
          <StatusBadge kind="invoice" status={page.invoice.isOverdue ? 'overdue' : page.status} />
        </div>
        {tenantBill && (
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-ink-soft">Rent</dt><dd>{rupees(tenantBill.rentAmount)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-soft">Food</dt><dd>{rupees(tenantBill.foodAmount)}</dd></div>
            {tenantBill.creditAmount > 0 && (
              <div className="flex justify-between text-brand"><dt>Skipped-meal credit</dt><dd>−{rupees(tenantBill.creditAmount)}</dd></div>
            )}
          </dl>
        )}
        <div className="mt-4 flex items-end justify-between border-t border-line pt-4">
          <span className="font-medium">Total</span>
          <span className="text-2xl font-semibold">{rupees(page.amount)}</span>
        </div>
        <div className="mt-1 text-right text-xs text-ink-muted">Due {dateLabel(page.invoice.dueDate)}</div>

        {held && hold && (
          <p className="mt-4 rounded-xl bg-brand-soft p-3 text-sm text-ink">
            {hold.ended
              ? `The hold on your bed at ${held.hostel.name} has run out, so it can be released at any moment. Pay now to keep it while it is still yours.`
              : `We’re holding your bed at ${held.hostel.name} until ${hold.until}. Pay before then to confirm it; after that the bed is released and this bill is cancelled.`}
          </p>
        )}

        <div className="mt-6">
          {page.status === 'paid' ? (
            <>
              <p className="mb-3 text-sm text-ink-soft">Paid{page.invoice.paidAt ? ` on ${dateLabel(page.invoice.paidAt)}` : ''}. Nothing more to pay on this bill.</p>
              <LinkButton href={doneHref} size="lg" className="w-full">Done</LinkButton>
            </>
          ) : page.status === 'void' ? (
            <div className="text-sm text-ink-soft">
              <p>
                This bill is no longer due, so there is nothing to pay here. It was replaced by a newer bill, or the plan it belonged to was cancelled or
                not paid in time.
              </p>
              <LinkButton href={doneHref} variant="secondary" className="mt-3 w-full">{page.kind === 'tenant' ? 'See my plan and bills' : 'See plan and bills'}</LinkButton>
            </div>
          ) : page.stub ? (
            <form action={simulatePaymentAction}>
              <input type="hidden" name="invoiceId" value={invoiceId} />
              <SubmitButton size="lg" className="w-full" pendingText="Paying…">Pay {rupees(page.amount)} (simulated)</SubmitButton>
              <p className="mt-2 text-center text-xs text-ink-muted">Payments are simulated until Razorpay keys are configured.</p>
            </form>
          ) : (
            <RazorpayButton invoiceId={invoiceId} label={`Pay ${rupees(page.amount)}`} description={page.description} phone={user.phone} />
          )}
          {held && (
            <form action={releaseHoldAction} className="mt-3 text-center">
              <input type="hidden" name="slug" value={held.hostel.slug} />
              <input type="hidden" name="subscriptionId" value={held.subscription.id} />
              <SubmitButton variant="ghost" size="sm" pendingText="Releasing…">Release the bed and choose again</SubmitButton>
            </form>
          )}
        </div>
      </Card>
    </div>
  );
}
