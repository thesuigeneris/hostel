import { TabsNav } from '@/components/ui/tabs-nav';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

const TABS = [
  { href: '/admin', label: 'Overview', exact: true },
  { href: '/admin/listings', label: 'Listings' },
  { href: '/admin/partners', label: 'Partners' },
  { href: '/admin/subscriptions', label: 'Subscriptions' },
  { href: '/admin/payouts', label: 'Payouts' },
  { href: '/admin/reviews', label: 'Reviews' },
  { href: '/admin/issues', label: 'Issues' },
  { href: '/admin/food-partners', label: 'Food partners' },
  { href: '/admin/billing', label: 'Owner billing' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireUser('/admin', ['admin']);
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-food">Admin console</div>
      <TabsNav items={TABS} />
      {children}
    </div>
  );
}
