import type { Metadata } from 'next';
import { TabsNav } from '@/components/ui/tabs-nav';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'My account', robots: { index: false } };

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser('/account');
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <p className="text-sm text-muted">Hi {user.name || 'there'}</p>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight sm:text-3xl">My account</h1>
      <TabsNav
        items={[
          { href: '/account', label: 'My stay', exact: true },
          { href: '/account/bills', label: 'Bills' },
          { href: '/account/menu', label: 'Menu & skips' },
          { href: '/account/move', label: 'Move' },
          { href: '/account/visits', label: 'Visits' },
          { href: '/account/profile', label: 'Profile' },
        ]}
      />
      {children}
    </div>
  );
}
