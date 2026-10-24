import { OWNER_PLANS } from '@hostels/shared';
import Link from 'next/link';
import { Badge, Card, Empty, LinkButton, PageHeader, Stat, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { rupees } from '@/lib/format';

export default async function OwnerHome() {
  const client = await api();
  const [hostels, visits, issues] = await Promise.all([client.owner.hostels(), client.owner.visits('new'), client.owner.issues()]);
  const details = await Promise.all(hostels.map((h) => client.owner.hostel(h.id)));
  const openIssues = issues.filter((i) => i.status !== 'resolved' && i.status !== 'closed');
  const waiting = openIssues.filter((i) => i.needsResponse);
  const freeBeds = details.reduce((n, h) => n + h.roomTypes.reduce((m, r) => m + r.bedsAvailable, 0), 0);

  return (
    <>
      <PageHeader title="Your hostels" actions={<LinkButton href="/owner/hostels/new">Add a hostel</LinkButton>} />
      {hostels.length === 0 ? (
        <Empty title="List your first hostel">
          It takes about five minutes: details, a pin on the map, rooms and a few photos. <Link href="/owner/hostels/new">Start now</Link>.
        </Empty>
      ) : (
        <>
          <div className="mb-8 grid gap-3 sm:grid-cols-4">
            <Stat label="Hostels" value={hostels.length} hint={`${hostels.filter((h) => h.status === 'live').length} live`} />
            <Stat label="Free beds" value={freeBeds} hint="Keep this current so tenants call at the right time" />
            <Stat label="New visit requests" value={<Link href="/owner/visits">{visits.length}</Link>} />
            <Stat label="Open issues" value={<Link href="/owner/issues">{openIssues.length}</Link>} hint={waiting.length ? `${waiting.length} waiting for your reply` : 'All answered'} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {details.map((h) => (
              <Card key={h.id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link href={`/owner/hostels/${h.id}`} className="text-lg font-semibold">{h.name}</Link>
                    <div className="text-sm text-ink-soft">{h.area}</div>
                  </div>
                  <StatusBadge status={h.status} />
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
                {h.status === 'rejected' && h.rejectionReason && <p className="mt-2 text-sm text-danger">Not approved: {h.rejectionReason}</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  <LinkButton href={`/owner/hostels/${h.id}`} size="sm" variant="secondary">Manage</LinkButton>
                  {h.status === 'live' && <LinkButton href={`/hostels/${h.slug}`} size="sm" variant="ghost">View listing</LinkButton>}
                </div>
              </Card>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-2 text-sm">
            <Link href="/owner/visits">Visit requests</Link> · <Link href="/owner/issues">All issues</Link> · <Link href="/owner/payouts">Payouts</Link>
          </div>
        </>
      )}
    </>
  );
}
