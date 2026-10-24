import type { Metadata } from 'next';
import { createApiClient } from '@hostels/shared';
import { LoadError } from '@/components/public/load-error';
import { load } from '@/components/public/safe';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState, PageHeader } from '@/components/ui/states';
import { API_URL } from '@/lib/config';
import { requireUser } from '@/lib/session';
import { SubscribeWizard } from './subscribe-wizard';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Subscribe', robots: { index: false } };

export default async function SubscribePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireUser(`/subscribe/${slug}`);
  const r = await load(createApiClient(API_URL).hostels.get(slug), { notFoundOn404: true });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {!r.ok ? (
        <LoadError message={r.message} retryHref={`/subscribe/${slug}`} />
      ) : r.data.partnerStatus !== 'verified' ? (
        <EmptyState title="This hostel isn't a verified partner yet" action={<ButtonLink href={`/hostels/${slug}`} variant="secondary">Back to hostel</ButtonLink>}>
          You can still request a visit or contact the owner directly.
        </EmptyState>
      ) : r.data.roomTypes.every((rt) => rt.bedsAvailable === 0) ? (
        <EmptyState title={`${r.data.name} is full right now`} action={<ButtonLink href="/search?verified=true">See other partner hostels</ButtonLink>}>
          Beds free up often, so check back soon.
        </EmptyState>
      ) : (
        <>
          <PageHeader title={`Subscribe to ${r.data.name}`} subtitle="One monthly bill for bed and food. No advance." />
          <SubscribeWizard hostel={r.data} />
        </>
      )}
    </div>
  );
}
