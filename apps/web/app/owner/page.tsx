import { istDate, type NextStep, OWNER_PLANS, type OwnerInsights, ownerNextStep } from '@hostels/shared';
import Link from 'next/link';
import { Badge, Card, cx, Empty, LinkButton, PageHeader, Stat, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { rupees } from '@/lib/format';
import { issueSummary, sectionHref, waitingLabel } from '@/lib/owner';

const STEP_TONE: Record<NextStep['tone'], string> = {
  ok: 'border-line bg-bg text-ink-soft',
  info: 'border-info/30 bg-info-soft text-ink',
  warn: 'border-food/50 bg-food-soft text-ink',
  danger: 'border-danger/40 bg-danger-soft text-ink',
};

export default async function OwnerHome() {
  const client = await api();
  const [hostels, visits, issues, summary] = await Promise.all([client.owner.hostels(), client.owner.visits('new'), client.owner.issues(), issueSummary()]);
  const [details, insights] = await Promise.all([
    Promise.all(hostels.map((h) => client.owner.hostel(h.id))),
    Promise.all(hostels.map((h) => client.owner.insights(h.id))),
  ]);
  const insightFor = new Map(insights.map((i) => [i.hostelId, i]));
  const openIssues = issues.filter((i) => i.status !== 'resolved' && i.status !== 'closed');
  const freeBeds = details.reduce((n, h) => n + h.roomTypes.reduce((m, r) => m + r.bedsAvailable, 0), 0);
  const today = istDate();

  return (
    <>
      <PageHeader title="Your hostels" actions={<LinkButton href="/owner/hostels/new">Add a hostel</LinkButton>} />
      {hostels.length === 0 ? (
        <Empty
          title="List your first hostel"
          action={<LinkButton href="/owner/hostels/new">List your hostel free</LinkButton>}
        >
          It takes about five minutes: details, a pin on the map, rooms and a few photos. Listing is free;{' '}
          <Link href="/for-owners#plans">see what Pro and Partner add</Link>.
        </Empty>
      ) : (
        <>
          <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Hostels" value={hostels.length} hint={`${hostels.filter((h) => h.status === 'live').length} live`} />
            <Stat label="Free beds" value={freeBeds} hint="Keep this current so tenants call at the right time" />
            <Stat label="New visit requests" value={<Link href="/owner/visits">{visits.length}</Link>} />
            <Stat
              label="Open issues"
              value={<Link href="/owner/issues">{openIssues.length}</Link>}
              hint={summary.needsResponse ? `${waitingLabel(summary.needsResponse)} for over a day` : 'None waiting for your reply'}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {details.map((h) => {
              const i = insightFor.get(h.id);
              const step = ownerNextStep(
                {
                  status: h.status,
                  rejectionReason: h.rejectionReason,
                  partnerStatus: h.partnerStatus,
                  rooms: h.roomTypes.length,
                  photos: h.photos.length,
                  plan: h.plan,
                  unpaidBill: i?.planBill.oldest ?? null,
                  needsResponse: summary.byHostel[h.id] ?? 0,
                },
                today,
              );
              return (
                <Card key={h.id} className="flex flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/owner/hostels/${h.id}`} className="text-lg font-semibold [overflow-wrap:anywhere]">{h.name}</Link>
                      <div className="text-sm text-ink-soft">{h.area}</div>
                    </div>
                    <StatusBadge kind="hostel" status={h.status} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge tone={h.plan.effective === 'free' ? 'gray' : 'green'}>{OWNER_PLANS[h.plan.effective].label} plan</Badge>
                    {h.plan.suspended && <Badge tone="red">Paused: bill overdue</Badge>}
                    {h.isVerified && <Badge tone="green">✓ Verified partner</Badge>}
                    {h.partnerStatus === 'applied' && <Badge tone="food">Partner review pending</Badge>}
                  </div>
                  <div className="mt-3 text-sm text-ink-soft">
                    {h.roomTypes.length} room types · {h.roomTypes.reduce((n, r) => n + r.bedsAvailable, 0)} beds free · from{' '}
                    {rupees(h.roomTypes.length ? Math.min(...h.roomTypes.map((r) => r.monthlyRent)) : null)}
                    {h.ratings.rating !== null && ` · ★ ${h.ratings.rating.toFixed(1)} (${h.ratings.reviewCount})`}
                  </div>
                  {h.status === 'live' && i && <InsightsRow hostelId={h.id} insights={i} />}
                  <div className={cx('mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm', STEP_TONE[step.tone])}>
                    <p className="min-w-0 [overflow-wrap:anywhere]">
                      <span className="sr-only">Next step: </span>
                      {step.text}
                    </p>
                    {step.action && (
                      <LinkButton href={sectionHref(h.id, step.action.section)} size="sm" variant={step.tone === 'ok' ? 'secondary' : 'primary'}>
                        {step.action.label}
                      </LinkButton>
                    )}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <LinkButton href={`/owner/hostels/${h.id}/dashboard`} size="sm" variant="secondary">Dashboard</LinkButton>
                    <LinkButton href={`/owner/hostels/${h.id}`} size="sm" variant="ghost">Edit listing</LinkButton>
                    {h.status === 'live' && <LinkButton href={`/hostels/${h.slug}`} size="sm" variant="ghost">View listing</LinkButton>}
                  </div>
                </Card>
              );
            })}
          </div>
          <nav aria-label="Across your hostels" className="mt-8 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <Link href="/owner/visits">Visit requests</Link>
            <Link href="/owner/issues">
              All issues
              {summary.needsResponse > 0 && (
                <span className="ml-1 rounded-full bg-danger px-1.5 text-xs font-semibold text-white">
                  <span aria-hidden="true">{summary.needsResponse}</span>
                  <span className="sr-only">({waitingLabel(summary.needsResponse)})</span>
                </span>
              )}
            </Link>
            <Link href="/owner/payouts">Payouts</Link>
          </nav>
        </>
      )}
    </>
  );
}

/** Last 30 days at a glance. Page views need Pro or Partner; Free shows a one-line unlock link. */
function InsightsRow({ hostelId, insights: i }: { hostelId: string; insights: OwnerInsights }) {
  const cell = 'px-2 py-2 text-center';
  const label = 'text-[11px] uppercase tracking-wide text-ink-muted';
  return (
    <div className="mt-3 grid grid-cols-2 divide-line overflow-hidden rounded-xl border border-line text-sm sm:grid-cols-4 sm:divide-x">
      <div className={cell}>
        <div className="font-semibold">{i.occupancyPct}%</div>
        <div className={label}>Occupancy</div>
      </div>
      <div className={cell}>
        <div className="font-semibold">{i.activeResidents}</div>
        <div className={label}>Residents</div>
      </div>
      <div className={cell}>
        <div className="font-semibold">{i.visitRequests30d}</div>
        <div className={label}>Visits · 30d</div>
      </div>
      <div className={cell}>
        {i.locked ? (
          <Link href={`/owner/hostels/${hostelId}/plan`} className="inline-block rounded-full bg-food-soft px-2 py-0.5 text-xs font-medium text-food-ink no-underline hover:underline">
            Unlock with Pro
          </Link>
        ) : (
          <div className="font-semibold">{i.views30d}</div>
        )}
        <div className={label}>Page views · 30d</div>
      </div>
    </div>
  );
}
