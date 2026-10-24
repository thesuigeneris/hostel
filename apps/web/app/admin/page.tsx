import Link from 'next/link';
import { RunJobsButton } from '@/components/admin/actions';
import { Stat } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/states';
import { load } from '@/components/owner/data';
import { LoadError } from '@/components/owner/ui';
import { rupees } from '@/lib/format';
import { serverApi } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function AdminOverview() {
  const api = await serverApi();
  const res = await load(() => api.admin.overview());
  if (res.error !== null) return <LoadError message={res.error} />;
  const o = res.data;
  const cards: { label: string; value: React.ReactNode; href?: string; hint?: string }[] = [
    { label: 'Listings to review', value: o.pendingListings, href: '/admin/listings' },
    { label: 'Partner applications', value: o.partnerApplications, href: '/admin/partners' },
    { label: 'Open issues', value: o.openIssues, href: '/admin/issues?escalated=1' },
    { label: 'Overdue bills', value: o.overdueInvoices, href: '/admin/subscriptions' },
    { label: 'Live hostels', value: o.liveHostels, href: '/admin/listings?status=live' },
    { label: 'Verified partners', value: o.verifiedPartners, href: '/admin/partners' },
    { label: 'Pro hostels', value: o.proHostels, href: '/admin/billing' },
    { label: 'Active subscriptions', value: o.activeSubscriptions, href: '/admin/subscriptions' },
    { label: 'Scheduled moves', value: o.scheduledMoves, href: '/admin/subscriptions#moves' },
  ];
  return (
    <div className="space-y-8">
      <PageHeader title="Overview" actions={<RunJobsButton />} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="MRR — subscriptions" value={rupees(o.mrr.subscriptions)} hint="Rent + food from active subscribers" />
        <Stat label="MRR — owner software" value={rupees(o.mrr.saas)} hint="Hostels Pro" />
        <Stat label="MRR — total" value={rupees(o.mrr.subscriptions + o.mrr.saas)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) =>
          c.href ? (
            <Link key={c.label} href={c.href} className="block transition-transform hover:-translate-y-0.5">
              <Stat label={c.label} value={c.value} />
            </Link>
          ) : (
            <Stat key={c.label} label={c.label} value={c.value} />
          ),
        )}
      </div>
    </div>
  );
}
