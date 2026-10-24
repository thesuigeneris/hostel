'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiRequestError, type Checkout } from '@hostels/shared';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormError } from '@/components/ui/field';
import { api } from '@/lib/client-api';
import { describeError } from '@/lib/errors';
import { formatDate, rupees } from '@/lib/format';

type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayInstance = { open: () => void; on: (event: string, cb: (r: { error?: { description?: string } }) => void) => void };
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load Razorpay. Check your connection and try again.'));
    document.body.appendChild(s);
  });
}

export function successHref(invoiceId: string) {
  return invoiceId.startsWith('sin_') ? '/owner/billing' : '/account';
}

export function PayPanel({ initial }: { initial: Checkout }) {
  const router = useRouter();
  const [checkout, setCheckout] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inv = checkout.invoice;
  const paid = inv.status === 'paid';
  const isSaas = inv.id.startsWith('sin_');

  function onPaid(c: Checkout) {
    setCheckout(c);
    router.refresh();
  }

  function handleError(e: unknown) {
    if (e instanceof ApiRequestError && e.code === 'invoice_already_paid') {
      setCheckout({ ...checkout, invoice: { ...inv, status: 'paid' } });
      return;
    }
    setError(describeError(e).message);
  }

  async function simulate() {
    setLoading(true);
    setError(null);
    try {
      onPaid(await api.payments.simulate(inv.id));
    } catch (e) {
      handleError(e);
    } finally {
      setLoading(false);
    }
  }

  async function payLive() {
    setLoading(true);
    setError(null);
    try {
      await loadRazorpay();
      const rzp = new window.Razorpay!({
        key: checkout.razorpayKeyId,
        order_id: checkout.razorpayOrderId,
        amount: checkout.amountPaise,
        currency: 'INR',
        name: 'Hostels',
        description: checkout.description,
        prefill: { name: checkout.payer.name, contact: `+91${checkout.payer.phone}`, email: checkout.payer.email ?? undefined },
        theme: { color: '#1f5f4a' },
        handler: async (r: RazorpayResponse) => {
          try {
            onPaid(
              await api.payments.verify(inv.id, {
                razorpayOrderId: r.razorpay_order_id,
                razorpayPaymentId: r.razorpay_payment_id,
                razorpaySignature: r.razorpay_signature,
              }),
            );
          } catch (e) {
            handleError(e);
          } finally {
            setLoading(false);
          }
        },
        modal: { ondismiss: () => setLoading(false) },
      });
      rzp.on('payment.failed', (r) => {
        setError(r.error?.description ?? 'Payment failed. You have not been charged.');
        setLoading(false);
      });
      rzp.open();
    } catch (e) {
      handleError(e);
      setLoading(false);
    }
  }

  if (paid) {
    return (
      <Card className="p-8 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-ok-soft text-2xl text-ok">✓</div>
        <h2 className="mt-4 text-xl font-semibold">Payment received</h2>
        <p className="mt-1 text-sm text-muted">
          {rupees(inv.totalAmount)} paid{isSaas ? '. Your Hostels Pro features are now active.' : '. Your plan is active and your bed is confirmed.'}
        </p>
        <ButtonLink href={successHref(inv.id)} className="mt-6">
          {isSaas ? 'Back to billing' : 'Go to my stay'}
        </ButtonLink>
      </Card>
    );
  }

  if (inv.status === 'void') {
    return (
      <Card className="p-8 text-center">
        <h2 className="text-xl font-semibold">This bill is no longer valid</h2>
        <p className="mt-1 text-sm text-muted">It was replaced or cancelled. Check your latest bills.</p>
        <ButtonLink href={isSaas ? '/owner/billing' : '/account/bills'} className="mt-6" variant="secondary">
          View bills
        </ButtonLink>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="text-sm text-muted">{checkout.description}</div>
      {!isSaas && (
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between"><dt>Period</dt><dd>{formatDate(inv.periodStart)} – {formatDate(inv.periodEnd)}</dd></div>
          <div className="flex justify-between"><dt>Rent</dt><dd>{rupees(inv.rentAmount)}</dd></div>
          <div className="flex justify-between"><dt>Food</dt><dd>{rupees(inv.foodAmount)}</dd></div>
          {inv.creditAmount > 0 && (
            <div className="flex justify-between text-ok"><dt>Skipped-meal credit</dt><dd>−{rupees(inv.creditAmount)}</dd></div>
          )}
        </dl>
      )}
      <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
        <span className="font-medium">Amount due</span>
        <span className="text-3xl font-semibold">{rupees(inv.totalAmount)}</span>
      </div>
      <p className="mt-1 text-right text-xs text-muted">
        Due {formatDate(inv.dueDate)}
        {inv.overdue && <span className="ml-1 font-medium text-danger">· overdue</span>}
      </p>
      <div className="mt-6 space-y-3">
        <FormError message={error} />
        {checkout.mode === 'stub' ? (
          <>
            <Button size="lg" className="w-full" onClick={() => void simulate()} loading={loading}>
              Simulate successful payment
            </Button>
            <p className="text-center text-xs text-muted">Dev mode: no Razorpay keys are set, so no money moves.</p>
          </>
        ) : (
          <Button size="lg" className="w-full" onClick={() => void payLive()} loading={loading}>
            Pay {rupees(inv.totalAmount)}
          </Button>
        )}
        <p className="text-center text-xs text-muted">UPI, cards and netbanking via Razorpay. Payments are secured end to end.</p>
      </div>
    </Card>
  );
}
