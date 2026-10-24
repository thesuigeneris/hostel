import Link from 'next/link';
import { SubmitButton } from '@/components/SubmitButton';
import { Card, Flash, PageHeader, Stat } from '@/components/ui';
import { api } from '@/lib/api';
import { rupees } from '@/lib/format';
import { runJobsAction } from './actions';

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const q = await searchParams;
  const s = await (await api()).admin.stats();
  return (
    <>
      <PageHeader title="Admin" subtitle="What needs attention today." />
      <Flash error={q.error} ok={q.ok} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Listings to review" value={<Link href="/admin/listings">{s.listingsPending}</Link>} />
        <Stat label="Partner applications" value={<Link href="/admin/partners">{s.partnersApplied}</Link>} />
        <Stat label="Flagged reviews" value={<Link href="/admin/moderation">{s.flaggedReviews}</Link>} />
        <Stat label="Reported posts" value={<Link href="/admin/moderation">{s.openReports}</Link>} />
        <Stat label="Live hostels" value={s.liveHostels} />
        <Stat label="Active subscriptions" value={s.activeSubscriptions} />
        <Stat label="Overdue bills" value={<Link href="/admin/billing">{s.overdueBills}</Link>} />
        <Stat
          label="Escalated issues"
          value={<Link href="/admin/issues">{s.escalatedIssues}</Link>}
          hint="Unacknowledged 48 hrs or unresolved 7 days"
        />
      </div>
      <h2 className="mb-3 mt-8 text-lg font-semibold">Monthly recurring revenue</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Our revenue" value={rupees(s.revenue.platformFees + s.revenue.ownerPlans)} hint="Platform fees + owner plans" />
        <Stat label="Platform fees" value={rupees(s.revenue.platformFees)} hint={`On ${rupees(s.revenue.subscriptionGross)} of subscription bills`} />
        <Stat label="Owner plans" value={rupees(s.revenue.ownerPlans)} hint={`${s.revenue.trialHostels} more in their free month`} />
        <Stat label="Subscription gross" value={rupees(s.revenue.subscriptionGross)} hint="Rent + food billed to tenants" />
      </div>
      <Card className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-medium">Scheduled jobs</div>
          <p className="text-sm text-ink-soft">Bills, plan changes, expiring holds, moves and issue auto-close run every 15 minutes. Run them now to see changes right away. Running twice is safe.</p>
        </div>
        <form action={runJobsAction}><SubmitButton variant="secondary">Run jobs now</SubmitButton></form>
      </Card>
    </>
  );
}
