'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from './ui';

const NAV = [
  ['/admin', 'Overview'],
  ['/admin/listings', 'Listings'],
  ['/admin/changes', 'Recently changed'],
  ['/admin/partners', 'Partners'],
  ['/admin/billing', 'Subscriptions & bills'],
  ['/admin/payouts', 'Payouts'],
  ['/admin/issues', 'Escalated issues'],
  ['/admin/moderation', 'Moderation'],
  ['/admin/food', 'Food partners'],
  ['/admin/audit', 'Audit log'],
] as const;

/** The admin sections, with the current one marked for sighted and screen-reader users alike. */
export function AdminNav() {
  const path = usePathname();
  return (
    <nav aria-label="Admin" className="flex gap-1 overflow-x-auto lg:flex-col">
      {NAV.map(([href, label]) => {
        const current = path === href || (href !== '/admin' && path.startsWith(`${href}/`));
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? 'page' : undefined}
            className={cx(
              'whitespace-nowrap rounded-lg px-3 py-2 text-sm no-underline',
              current ? 'bg-brand-soft font-medium text-brand' : 'text-ink-soft hover:bg-brand-soft hover:text-brand',
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
