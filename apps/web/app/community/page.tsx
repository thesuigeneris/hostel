import type { Metadata } from 'next';
import Link from 'next/link';
import { getMyResidencies } from '@/components/community/context';
import { FALLBACK_PHOTO } from '@/components/public/hostel-card';
import { LoadError } from '@/components/public/load-error';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, PageHeader } from '@/components/ui/states';
import { formatDate } from '@/lib/format';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Community', robots: { index: false } };

export default async function CommunityHome() {
  await requireUser('/community');
  const r = await getMyResidencies();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <PageHeader
        title="Resident community"
        subtitle="Talk to people in your hostel, report problems and see them fixed in the open."
        actions={<ButtonLink href="/community/join" variant="secondary">Join a hostel</ButtonLink>}
      />
      {!r.ok ? (
        <LoadError message={r.message} retryHref="/community" />
      ) : r.data.residencies.length === 0 ? (
        <EmptyState title="You're not part of a hostel community yet" action={<ButtonLink href="/community/join">Find my hostel</ButtonLink>}>
          If you live in a hostel listed here, join its community. The owner confirms you&apos;re a resident. Subscribers join automatically.
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {r.data.residencies
            .filter((x) => x.status !== 'rejected')
            .map((res) => {
              const card = (
                <Card className="flex gap-4 overflow-hidden p-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={res.hostel.coverPhotoUrl ?? FALLBACK_PHOTO} alt="" className="h-auto w-28 shrink-0 object-cover" />
                  <div className="min-w-0 py-4 pr-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{res.hostel.name}</h2>
                      {res.status === 'active' && <Badge tone="ok">Resident</Badge>}
                      {res.status === 'pending' && <Badge tone="warn">Awaiting approval</Badge>}
                      {res.status === 'ended' && <Badge>Past resident</Badge>}
                    </div>
                    <p className="text-sm text-muted">{res.hostel.area}</p>
                    <p className="mt-1 text-xs text-muted">
                      Since {formatDate(res.startDate)}
                      {res.endDate && ` · left ${formatDate(res.endDate)}`}
                      {res.roomLabel && ` · Room ${res.roomLabel}`}
                    </p>
                    {res.status === 'ended' && <p className="mt-2 text-sm text-brand">Write a review →</p>}
                  </div>
                </Card>
              );
              if (res.status === 'pending') return <div key={res.id}>{card}</div>;
              return (
                <Link key={res.id} href={res.status === 'ended' ? `/community/${res.hostelId}/review` : `/community/${res.hostelId}`} className="block hover:opacity-90">
                  {card}
                </Link>
              );
            })}
        </div>
      )}
    </div>
  );
}
