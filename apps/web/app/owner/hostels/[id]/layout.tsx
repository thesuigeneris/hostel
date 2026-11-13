import { OWNER_PLANS } from '@hostels/shared';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ListingProgress } from '@/components/ListingProgress';
import { type OwnerTab, OwnerTabs } from '@/components/OwnerTabs';
import { Badge, StatusBadge } from '@/components/ui';
import { hasPlan, issueSummary, ownerHostel, waitingLabel } from '@/lib/owner';

export default async function OwnerHostelLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [h, summary] = await Promise.all([ownerHostel(id), issueSummary()]);
  const eff = h.plan.effective;
  // Menus and the kitchen serve existing subscribers, so a Partner hostel paused for an overdue bill keeps them.
  const tier = h.plan.plan;
  const waiting = summary.byHostel[id] ?? 0;
  const tabs: OwnerTab[] = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '', label: 'Listing' },
    { href: '/rooms', label: 'Rooms' },
    { href: '/residents', label: 'Residents', locked: !hasPlan(eff, 'pro') },
    { href: '/rent', label: 'Rent', locked: !hasPlan(eff, 'pro') },
    { href: '/community', label: 'Issues & community', badge: { count: waiting, label: waitingLabel(waiting) } },
    { href: '/reviews', label: 'Reviews' },
    { href: '/menu', label: 'Menu', locked: !hasPlan(tier, 'partner') },
    { href: '/kitchen', label: 'Kitchen & subscribers', locked: !hasPlan(tier, 'partner') },
    { href: '/brand', label: 'Brand kit', locked: !hasPlan(eff, 'partner') || h.partnerStatus !== 'verified' },
    { href: '/plan', label: 'Plan & billing' },
  ];
  return (
    <>
      <div className="mb-4 text-sm"><Link href="/owner">← All hostels</Link></div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 font-display text-2xl font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-3xl">{h.name}</h1>
        <StatusBadge kind="hostel" status={h.status} />
        <Badge tone={eff === 'free' ? 'gray' : 'green'}>{OWNER_PLANS[eff].label}</Badge>
        {h.plan.suspended && (
          <Link href={`/owner/hostels/${id}/plan`} className="no-underline">
            <Badge tone="red">Paused: bill overdue · Pay now</Badge>
          </Link>
        )}
        {h.status === 'live' && <Link href={`/hostels/${h.slug}`} className="text-sm">View public page</Link>}
      </div>
      <ListingProgress hostel={h} />
      <OwnerTabs base={`/owner/hostels/${id}`} tabs={tabs} />
      {children}
    </>
  );
}
