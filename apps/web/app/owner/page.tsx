import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Stars } from '@/components/ui/stars';
import { EmptyState, PageHeader } from '@/components/ui/states';
import { load } from '@/components/owner/data';
import { HostelStatusBadge, LoadError, PartnerBadge, PlanBadge, ProGate } from '@/components/owner/ui';
import { formatDate, rupees } from '@/lib/format';
import { serverApi } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function OwnerOverview() {
  const api = await serverApi();
  const res = await load(() => api.owner.dashboard());
  if (res.error !== null) return <LoadError message={res.error} />;
  const { hostels, dueSaasInvoices } = res.data;

  return (
    <div>
      <PageHeader
        title="Overview"
        subtitle="How each of your hostels is doing this month."
        actions={<ButtonLink href="/owner/hostels/new">Add a hostel</ButtonLink>}
      />

      {dueSaasInvoices.length > 0 && (
        <div className="mb-6 space-y-2">
          {dueSaasInvoices.map((inv) => (
            <div key={inv.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] bg-food-soft px-4 py-3 text-sm">
              <span className="text-ink">
                Hostels Pro invoice for <strong>{inv.periodMonth}</strong> — {rupees(inv.amount)} due {formatDate(inv.dueDate)}
              </span>
              <ButtonLink href={`/pay/${inv.id}`} size="sm" variant="food">
                Pay now
              </ButtonLink>
            </div>
          ))}
        </div>
      )}

      {hostels.length === 0 ? (
        <EmptyState title="List your first hostel" action={<ButtonLink href="/owner/hostels/new">Add a hostel</ButtonLink>}>
          It&apos;s free. Add photos, rooms and a map pin, then submit for review.
        </EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {hostels.map(({ hostel, openIssues, newVisits, activeResidents, occupancyPct, views30d, rating }) => (
            <Card key={hostel.id} className="overflow-hidden">
              <div className="flex gap-4 border-b border-line p-4">
                <div className="h-16 w-20 shrink-0 overflow-hidden rounded-xl bg-line">
                  {hostel.coverPhotoUrl && <img src={hostel.coverPhotoUrl} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <Link href={`/owner/hostels/${hostel.id}`} className="block truncate font-semibold hover:text-brand">
                    {hostel.name}
                  </Link>
                  <div className="text-xs text-muted">{hostel.area}, {hostel.city}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <HostelStatusBadge status={hostel.status} />
                    <PartnerBadge status={hostel.partnerStatus} />
                    <PlanBadge plan={hostel.ownerPlan} />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 divide-x divide-line border-b border-line text-center">
                <Metric label="Occupancy" value={`${Math.round(occupancyPct)}%`} />
                <Metric label="Residents" value={activeResidents} />
                <Metric
                  label="Rating"
                  value={
                    rating ? (
                      <span className="inline-flex items-center gap-1">
                        {rating.toFixed(1)} <Stars value={rating} />
                      </span>
                    ) : (
                      '—'
                    )
                  }
                />
              </div>
              <div className="grid grid-cols-3 divide-x divide-line text-center">
                <Link href={`/owner/issues?hostelId=${hostel.id}`} className="hover:bg-bg">
                  <Metric label="Open issues" value={openIssues > 0 ? <Badge tone="danger">{openIssues}</Badge> : 0} />
                </Link>
                <Link href={`/owner/visits?hostelId=${hostel.id}`} className="hover:bg-bg">
                  <Metric label="New visits" value={newVisits > 0 ? <Badge tone="brand">{newVisits}</Badge> : 0} />
                </Link>
                <ProGate plan={hostel.ownerPlan} hostelId={hostel.id} feature="Insights">
                  <Metric label="Views (30d)" value={views30d} />
                </ProGate>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="px-2 py-3">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}
