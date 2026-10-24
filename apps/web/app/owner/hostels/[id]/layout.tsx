import { OWNER_PLANS } from '@hostels/shared';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { OwnerTabs } from '@/components/OwnerTabs';
import { Badge, StatusBadge } from '@/components/ui';
import { hasPlan, ownerHostel } from '@/lib/owner';

export default async function OwnerHostelLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const h = await ownerHostel(id);
  const eff = h.plan.effective;
  const tabs = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '', label: 'Listing' },
    { href: '/rooms', label: 'Rooms' },
    { href: '/residents', label: 'Residents', locked: !hasPlan(eff, 'pro') },
    { href: '/rent', label: 'Rent', locked: !hasPlan(eff, 'pro') },
    { href: '/community', label: 'Issues & community' },
    { href: '/reviews', label: 'Reviews' },
    { href: '/menu', label: 'Menu', locked: !hasPlan(eff, 'partner') },
    { href: '/kitchen', label: 'Kitchen & subscribers', locked: !hasPlan(eff, 'partner') },
    { href: '/brand', label: 'Brand kit', locked: !hasPlan(eff, 'partner') || h.partnerStatus !== 'verified' },
    { href: '/plan', label: 'Plan & billing' },
  ];
  return (
    <>
      <div className="mb-4 text-sm"><Link href="/owner">← All hostels</Link></div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{h.name}</h1>
        <StatusBadge status={h.status} />
        <Badge tone={eff === 'free' ? 'gray' : 'green'}>{OWNER_PLANS[eff].label}</Badge>
        {h.plan.suspended && <Badge tone="red">Paused: bill overdue</Badge>}
        {h.status === 'live' && <Link href={`/hostels/${h.slug}`} className="text-sm">View public page</Link>}
      </div>
      <OwnerTabs base={`/owner/hostels/${id}`} tabs={tabs} />
      {children}
    </>
  );
}
