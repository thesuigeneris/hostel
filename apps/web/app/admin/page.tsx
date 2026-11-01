import Link from 'next/link';
import { SubmitButton } from '@/components/SubmitButton';
import { Card, Flash, PageHeader, Stat } from '@/components/ui';
import { api } from '@/lib/api';
import { monthLabel, notCountedLabel, rupees } from '@/lib/format';
import { runJobsAction } from './actions';

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const q = await searchParams;
  const s = await (await api()).admin.stats();
  const r = s.revenue;
  const leftOut = notCountedLabel({
    simulated: r.notCounted.tenant.simulated + r.notCounted.owner.simulated,
    test: r.notCounted.tenant.test + r.notCounted.owner.test,
  });
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
        <Stat label="Overdue tenant bills" value={<Link href="/admin/billing">{s.overdueBills}</Link>} />
        <Stat label="Overdue owner bills" value={<Link href="/admin/billing?bills=overdue">{s.overdueOwnerBills}</Link>} />
        <Stat label="Paused hostels" value={<Link href="/admin/billing?paused=1">{s.suspendedHostels}</Link>} hint="Plan bill 15+ days overdue" />
        <Stat label="Refunds due" value={<Link href="/admin/billing#refunds">{s.refundsDue}</Link>} hint="Paid after the bill had closed" />
        <Stat
          label="Escalated issues"
          value={<Link href="/admin/issues">{s.escalatedIssues}</Link>}
          hint="Unacknowledged 48 hrs or unresolved 7 days"
        />
      </div>
      <h2 className="mt-8 text-lg font-semibold">Money received · {monthLabel(r.month)} so far</h2>
      <p className="mb-3 text-sm text-ink-soft">Real money only: payments through live Razorpay.</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Our revenue" value={rupees(r.platformFees + r.ownerPlans)} hint="Platform fees + owner plan bills paid" />
        <Stat label="Platform fees" value={rupees(r.platformFees)} hint={`On ${rupees(r.subscriptionGross)} of tenant bills paid`} />
        <Stat label="Owner plans paid" value={rupees(r.ownerPlans)} hint={`${r.trialHostels} more in their free month`} />
        <Stat label="Tenant bills paid" value={rupees(r.subscriptionGross)} hint="Rent + food paid online" />
      </div>
      {leftOut && <p className="mt-3 text-sm text-ink-soft">{leftOut}. Owner plan bills an admin waived are never revenue.</p>}
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
