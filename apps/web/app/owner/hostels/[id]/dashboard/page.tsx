import { ISSUE_CATEGORIES, istDate, monthOf } from '@hostels/shared';
import Link from 'next/link';
import { SubmitButton } from '@/components/SubmitButton';
import { Card, Input, LinkButton, Stat } from '@/components/ui';
import { api } from '@/lib/api';
import { monthLabel, rupees, SHARING_LABEL, titleCase } from '@/lib/format';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ month?: string }> };

const hours = (h: number | null) => (h === null ? '—' : h < 24 ? `${Math.round(h)} h` : `${Math.round((h / 24) * 10) / 10} days`);

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
    <div className="space-y-8">
      <form className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Month</span>
          <Input type="month" name="month" defaultValue={month} className="w-44" />
        </label>
        <SubmitButton variant="secondary">Show</SubmitButton>
      </form>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Occupancy and money · {monthLabel(month)}</h2>
        {d.occupancy && d.revenue ? (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Occupancy" value={d.occupancy.occupancyPct === null ? '—' : `${d.occupancy.occupancyPct}%`} hint={`${d.occupancy.occupiedBeds} of ${d.occupancy.totalBeds} beds taken`} />
              <Stat label="Residents" value={d.occupancy.activeResidents} hint={`${d.occupancy.activeSubscribers} pay online through Hostels`} />
              <Stat label="Rent you collected" value={rupees(d.revenue.rentCollected)} hint={<Link href={`${base}/rent?month=${month}`}>{rupees(Math.max(0, d.revenue.rentDue - d.revenue.rentCollected))} still due</Link>} />
              <Stat
                label="Paid online"
                value={rupees(d.revenue.subscriptionNet)}
                hint={d.revenue.subscriptionGross ? `${rupees(d.revenue.subscriptionGross)} less ${d.revenue.platformFeePct}% fee (${rupees(d.revenue.platformFee)})` : 'Subscription bills paid this month, after the platform fee'}
              />
            </div>
            {d.revenue.planBillDue > 0 && (
              <Card className="mt-3 flex flex-wrap items-center justify-between gap-3 border-food bg-food-soft text-sm">
                <span>Your plan bill of {rupees(d.revenue.planBillDue)} is unpaid.</span>
                <LinkButton href={`${base}/plan`} size="sm">Pay it</LinkButton>
              </Card>
            )}
            {d.occupancy.rooms.length > 0 && (
              <div className="mt-4 space-y-2">
                {d.occupancy.rooms.map((r) => {
                  const taken = r.totalBeds - r.bedsAvailable;
                  const pct = r.totalBeds ? Math.round((taken / r.totalBeds) * 100) : 0;
                  return (
                    <div key={r.roomTypeId} className="grid grid-cols-[110px_1fr_90px] items-center gap-3 text-sm">
                      <span>{SHARING_LABEL[r.sharing]}</span>
                      <div className="h-3 overflow-hidden rounded-full bg-brand-soft" role="img" aria-label={`${pct}% taken`}>
                        <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-right text-ink-soft">{taken}/{r.totalBeds} taken</span>
                    </div>
                  );
                })}
                <p className="text-xs text-ink-muted">Beds taken come from your free-bed counts. <Link href={`${base}/rooms`}>Update them</Link> when someone moves in or out.</p>
              </div>
            )}
          </>
        ) : (
          <Card className="flex flex-wrap items-center justify-between gap-3 border-food bg-food-soft/50">
            <div className="text-sm">
              <div className="font-medium">Occupancy, rent collected and online payments are part of Pro</div>
              <div className="text-ink-soft">{d.plan.suspended ? 'Your plan is paused until the overdue bill is paid.' : 'The first month is free.'}</div>
            </div>
            <LinkButton href={`${base}/plan`} size="sm">{d.plan.suspended ? 'Pay the bill' : 'See plans'}</LinkButton>
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold">Issues</h2>
        <p className="mb-3 text-sm text-ink-soft">Seekers see your response times on your listing once you have 3 or more issues in 90 days. Acknowledge new issues within 24 hours.</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Open" value={<Link href={`${base}/community`}>{d.issues.open}</Link>} />
          <Stat label="Needs a reply" value={d.issues.needsResponse} hint={d.issues.needsResponse ? 'Open for over 24 hours with no reply' : 'All acknowledged in time'} />
          <Stat label="Median first reply" value={hours(d.issues.medianHoursToFirstResponse)} hint="Last 90 days" />
          <Stat label="Median time to fix" value={hours(d.issues.medianHoursToResolve)} hint={`${d.issues.reportedLast90Days} reported in 90 days`} />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Card>
            <div className="mb-3 text-sm font-medium">Open issues by age</div>
            {(
              [
                ['Under a day', age.under1Day],
                ['1–3 days', age.days1to3],
                ['3–7 days', age.days3to7],
                ['Over a week', age.over7Days],
              ] as const
            ).map(([label, n], i) => (
              <div key={label} className="mb-2 grid grid-cols-[100px_1fr_32px] items-center gap-3 text-sm">
                <span className="text-ink-soft">{label}</span>
                <div className="h-3 rounded-full bg-bg">
                  <div className={i >= 2 && n ? 'h-full rounded-full bg-danger' : 'h-full rounded-full bg-food'} style={{ width: `${(n / ageMax) * 100}%` }} />
                </div>
                <span className="text-right tabular-nums">{n}</span>
              </div>
            ))}
          </Card>
          <Card>
            <div className="mb-3 text-sm font-medium">What residents report (90 days)</div>
            {categories.length === 0 ? <p className="text-sm text-ink-soft">Nothing reported.</p> : (
              <ul className="space-y-1 text-sm">
                {categories.map((c) => (
                  <li key={c} className="flex justify-between"><span>{titleCase(c)}</span><span className="tabular-nums">{d.issues.byCategory[c]}</span></li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="Rating" value={d.reviews.rating === null ? '—' : `★ ${d.reviews.rating.toFixed(1)}`} hint={`${d.reviews.count} verified reviews`} />
        <Stat label="Reviews without your reply" value={<Link href={`${base}/reviews`}>{d.reviews.awaitingReply}</Link>} />
        <Stat label="New visit requests" value={<Link href="/owner/visits">{d.visits.new}</Link>} hint={`${d.visits.contacted} contacted`} />
      </section>
    </div>
  );
}
