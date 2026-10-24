import { TabsNav } from '@/components/ui/tabs-nav';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

const TABS = [
  { href: '/owner', label: 'Overview', exact: true },
  { href: '/owner/hostels', label: 'Hostels' },
  { href: '/owner/visits', label: 'Visits' },
  { href: '/owner/issues', label: 'Issues' },
  { href: '/owner/residents', label: 'Residents' },
  { href: '/owner/reviews', label: 'Reviews' },
  { href: '/owner/food', label: 'Food' },
  { href: '/owner/subscribers', label: 'Subscribers' },
  { href: '/owner/payouts', label: 'Payouts' },
  { href: '/owner/billing', label: 'Billing' },
];

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  await requireUser('/owner', ['owner']);
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <TabsNav items={TABS} />
      {children}
    </div>
  );
}
