import type { Metadata } from 'next';
import { LoadError } from '@/components/public/load-error';
import { load } from '@/components/public/safe';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import { requireUser, serverApi } from '@/lib/session';
import { PayPanel } from './pay-panel';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Pay bill', robots: { index: false } };

export default async function PayPage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  await requireUser(`/pay/${invoiceId}`);
  const r = await load((await serverApi()).payments.checkout(invoiceId));

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Pay your bill</h1>
      {r.ok ? (
        <PayPanel initial={r.data} />
      ) : r.status === 404 || r.status === 403 ? (
        <EmptyState title="Bill not found" action={<ButtonLink href="/account/bills" variant="secondary">My bills</ButtonLink>}>
          This bill doesn&apos;t exist or belongs to another account.
        </EmptyState>
      ) : (
        <LoadError message={r.message} retryHref={`/pay/${invoiceId}`} />
      )}
    </div>
  );
}
