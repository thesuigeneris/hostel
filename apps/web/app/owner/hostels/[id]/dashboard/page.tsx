import { ISSUE_CATEGORIES, istDate, monthOf } from '@hostels/shared';
import Link from 'next/link';
import { SubmitButton } from '@/components/SubmitButton';
import { Card, Field, Input, LinkButton, Stat } from '@/components/ui';
import { api } from '@/lib/api';
import { monthLabel, notCountedLabel, rupees, SHARING_LABEL, titleCase } from '@/lib/format';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ month?: string }> };

const hours = (h: number | null) => (h === null ? '—' : h < 1 ? 'under 1 h' : h < 24 ? `${Math.round(h)} h` : `${Math.round((h / 24) * 10) / 10} days`);

/** A labelled horizontal bar. The number is always printed next to it, so the bar is decoration. */
function Bar({ pct, tone = 'brand' }: { pct: number; tone?: 'brand' | 'food' | 'danger' }) {
  const fill = { brand: 'bg-brand', food: 'bg-food', danger: 'bg-danger' }[tone];
  return (
    <div aria-hidden className="h-3 overflow-hidden rounded-full bg-bg">
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

export default async function OwnerDashboard({ params, searchParams }: Props) {
  const { id } = await params;
  const q = await searchParams;
  const month = q.month && /^\d{4}-\d{2}$/.test(q.month) ? q.month : monthOf(istDate());
  const d = await (await api()).owner.insights(id, month);
  const base = `/owner/hostels/${id}`;
  const age = d.issues.openByAge;
  const ageMax = Math.max(1, age.under1Day, age.days1to3, age.days3to7, age.over7Days);
  const categories = ISSUE_CATEGORIES.filter((c) => d.issues.byCategory[c]);

  return (
    <div className="space-y-10">
      <form className="flex flex-wrap items-end gap-2">
        <div className="w-48">
          <Field label="Month">
            <Input type="month" name="month" defaultValue={month} />
          </Field>
        </div>
        <SubmitButton variant="secondary">Show</SubmitButton>
      </form>

      <section aria-labelledby="money-heading">
        <h2 id="money-heading" className="mb-3 text-lg font-semibold">Occupancy and money · {monthLabel(month)}</h2>
        {d.occupancy && d.revenue ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Occupancy" value={d.occupancy.occupancyPct === null ? '—' : `${d.occupancy.occupancyPct}%`} hint={`${d.occupancy.occupiedBeds} of ${d.occupancy.totalBeds} beds taken`} />
              <Stat label="Residents" value={d.occupancy.activeResidents} hint={`${d.occupancy.activeSubscribers} pay online through Hostels`} />
              <Stat
                label="Rent you collected"
                value={rupees(d.revenue.rentCollected)}
                hint={<Link href={`${base}/rent?month=${month}`}>{rupees(Math.max(0, d.revenue.rentDue - d.revenue.rentCollected))} still due</Link>}
              />
              <Stat
                label="Paid online"
                value={rupees(d.revenue.subscriptionNet)}
                hint={
                  <>
                    {d.revenue.subscriptionGross
                      ? `${rupees(d.revenue.subscriptionGross)} less ${d.revenue.platformFeePct}% fee (${rupees(d.revenue.platformFee)})`
                      : 'Subscription bills paid this month, after the platform fee'}
                    {notCountedLabel(d.revenue.notCounted) && <span className="block">{notCountedLabel(d.revenue.notCounted)}</span>}
                  </>
                }
              />
            </div>
            {d.revenue.planBillDue > 0 && (
              <Card className="mt-3 flex flex-wrap items-center justify-between gap-3 border-food/50 bg-food-soft text-sm">
                <span className="text-ink">Your plan bill of {rupees(d.revenue.planBillDue)} is unpaid.</span>
                <LinkButton href={`${base}/plan`} size="sm">Pay it</LinkButton>
              </Card>
            )}
            {d.occupancy.rooms.length > 0 && (
              <Card className="mt-4">
                <h3 className="mb-3 text-sm font-medium">Beds taken by room type</h3>
                <ul className="space-y-2">
                  {d.occupancy.rooms.map((r) => {
                    const taken = r.totalBeds - r.bedsAvailable;
                    return (
                      <li key={r.roomTypeId} className="grid grid-cols-[96px_1fr_auto] items-center gap-3 text-sm">
                        <span>{SHARING_LABEL[r.sharing]}</span>
                        <Bar pct={r.totalBeds ? (taken / r.totalBeds) * 100 : 0} />
                        <span className="text-right tabular-nums text-ink-soft">{taken} of {r.totalBeds}</span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-xs text-ink-muted">
                  Beds taken come from your free-bed counts. <Link href={`${base}/rooms`}>Update them</Link> when someone moves in or out.
                </p>
              </Card>
            )}
          </>
        ) : (
          <Card className="flex flex-wrap items-center justify-between gap-3 border-food/50 bg-food-soft/60">
            <div className="text-sm">
              <p className="font-medium text-ink">Room occupancy, rent collected, online payments and page views are part of Pro</p>
              <p className="text-ink-soft">
                {d.plan.suspended ? 'Your plan is paused until the overdue bill is paid.' : `Right now: ${d.occupancyPct}% of beds taken, ${d.activeResidents} residents.`}
              </p>
            </div>
            <LinkButton href={`${base}/plan`} size="sm">{d.plan.suspended ? 'Pay the bill' : 'See plans'}</LinkButton>
          </Card>
        )}
      </section>

      <section aria-labelledby="demand-heading">
        <h2 id="demand-heading" className="mb-3 text-lg font-semibold">Demand, last 30 days</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Page views" value={d.locked ? '—' : d.views30d} hint={d.locked ? <Link href={`${base}/plan`}>Unlock with Pro</Link> : 'People who opened your listing'} />
          <Stat label="Visit requests" value={d.visitRequests30d} />
          <Stat label="New visit requests" value={<Link href="/owner/visits">{d.visits.new}</Link>} hint={`${d.visits.contacted} contacted in total`} />
        </div>
      </section>

      <section aria-labelledby="issues-heading">
        <h2 id="issues-heading" className="mb-1 text-lg font-semibold">Issues</h2>
        <p className="mb-3 max-w-prose text-sm text-ink-soft">
          Seekers see your response times on your listing once residents report 3 or more issues in 90 days. Acknowledge new issues within 24 hours.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Open" value={<Link href={`${base}/community`}>{d.issues.open}</Link>} />
          <Stat label="Needs a reply" value={d.issues.needsResponse} hint={d.issues.needsResponse ? 'Open for over 24 hours with no reply' : 'All acknowledged in time'} />
          <Stat label="Median first reply" value={hours(d.issues.medianHoursToFirstResponse)} hint="Last 90 days" />
          <Stat label="Median time to fix" value={hours(d.issues.medianHoursToResolve)} hint={`${d.issues.reportedLast90Days} reported in 90 days`} />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Card>
            <h3 className="mb-3 text-sm font-medium">Open issues by age</h3>
            <ul className="space-y-2">
              {(
                [
                  ['Under a day', age.under1Day, 'food'],
                  ['1–3 days', age.days1to3, 'food'],
                  ['3–7 days', age.days3to7, 'danger'],
                  ['Over a week', age.over7Days, 'danger'],
                ] as const
              ).map(([label, n, tone]) => (
                <li key={label} className="grid grid-cols-[96px_1fr_32px] items-center gap-3 text-sm">
                  <span className="text-ink-soft">{label}</span>
                  <Bar pct={(n / ageMax) * 100} tone={tone} />
                  <span className="text-right tabular-nums">{n}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <h3 className="mb-3 text-sm font-medium">What residents report (90 days)</h3>
            {categories.length === 0 ? <p className="text-sm text-ink-soft">Nothing reported.</p> : (
              <dl className="space-y-1 text-sm">
                {categories.map((c) => (
                  <div key={c} className="flex justify-between gap-3"><dt>{titleCase(c)}</dt><dd className="tabular-nums">{d.issues.byCategory[c]}</dd></div>
                ))}
              </dl>
            )}
          </Card>
        </div>
      </section>

      <section aria-labelledby="reviews-heading">
        <h2 id="reviews-heading" className="mb-3 text-lg font-semibold">Reviews</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Stat label="Rating" value={d.reviews.rating === null ? '—' : `${d.reviews.rating.toFixed(1)} / 5`} hint={`${d.reviews.count} resident ${d.reviews.count === 1 ? 'review' : 'reviews'}`} />
          <Stat label="Reviews without your reply" value={<Link href={`${base}/reviews`}>{d.reviews.awaitingReply}</Link>} />
        </div>
      </section>
    </div>
  );
}
