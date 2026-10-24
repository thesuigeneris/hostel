'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

/** Horizontal sub-navigation for dashboard sections. `exact` items only match their own path. */
export function TabsNav({ items }: { items: { href: string; label: string; exact?: boolean }[] }) {
  const path = usePathname();
  return (
    <nav className="-mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-line px-4" aria-label="Section">
      {items.map((i) => {
        const active = i.exact ? path === i.href : path === i.href || path.startsWith(`${i.href}/`);
        return (
          <Link
            key={i.href}
            href={i.href}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium',
              active ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
