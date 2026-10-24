import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { requireUser } from '@/lib/api';

export const metadata: Metadata = { title: 'Admin', robots: { index: false } };

const NAV = [
  ['/admin', 'Overview'],
  ['/admin/listings', 'Listings'],
  ['/admin/partners', 'Partners'],
  ['/admin/billing', 'Subscriptions & bills'],
  ['/admin/payouts', 'Payouts'],
  ['/admin/moderation', 'Moderation'],
  ['/admin/food', 'Food partners'],
  ['/admin/audit', 'Audit log'],
] as const;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireUser('/admin', 'admin');
  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[200px_1fr]">
      <nav className="flex gap-1 overflow-x-auto lg:flex-col">
        {NAV.map(([href, label]) => (
          <Link key={href} href={href} className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-ink-soft no-underline hover:bg-brand-soft hover:text-brand">{label}</Link>
        ))}
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
