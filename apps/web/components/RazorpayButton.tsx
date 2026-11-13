'use client';

import { useState } from 'react';
import { createOrderAction, verifyPaymentAction } from '@/app/account/actions';
import { buttonClass } from './ui';

type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayCtor = new (options: Record<string, unknown>) => { open(): void };

function loadCheckout(): Promise<RazorpayCtor> {
  const w = window as unknown as { Razorpay?: RazorpayCtor };
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => (w.Razorpay ? resolve(w.Razorpay) : reject(new Error('Checkout failed to load')));
    s.onerror = () => reject(new Error('Checkout failed to load. Check your connection.'));
    document.body.appendChild(s);
  });
}

/** Opens Razorpay Checkout for a bill, then verifies the signature on the server. */
export function RazorpayButton({ invoiceId, label, description, phone }: { invoiceId: string; label: string; description: string; phone?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const [Razorpay, order] = await Promise.all([loadCheckout(), createOrderAction(invoiceId)]);
      new Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: 'Hostels',
        description,
        prefill: phone ? { contact: `+91${phone}` } : undefined,
        theme: { color: '#1F5C46' },
        modal: { ondismiss: () => setBusy(false) },
        handler: async (r: RazorpayResponse) => {
          const res = await verifyPaymentAction(invoiceId, {
            razorpayOrderId: r.razorpay_order_id,
            razorpayPaymentId: r.razorpay_payment_id,
            razorpaySignature: r.razorpay_signature,
          });
          if (res?.error) {
            setError(res.error);
            setBusy(false);
          }
        },
      }).open();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={pay} disabled={busy} className={buttonClass('primary', 'lg', 'w-full')}>
        {busy ? 'Opening checkout…' : label}
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
