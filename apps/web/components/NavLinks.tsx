'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from './ui';

export type NavItem = { href: string; label: string };

/** Primary navigation with the current section marked for sighted and screen-reader users alike. */
export function NavLinks({ items, variant }: { items: NavItem[]; variant: 'bar' | 'menu' }) {
  const path = usePathname();
  return (
    <ul className={variant === 'bar' ? 'flex items-center gap-1' : 'flex flex-col gap-1 p-2'}>
      {items.map((l) => {
        const current = path === l.href || (l.href !== '/' && path.startsWith(`${l.href}/`));
        return (
          <li key={l.href}>
            <Link
              href={l.href}
              aria-current={current ? 'page' : undefined}
              className={cx(
                'block rounded-lg px-3 text-sm no-underline transition duration-feedback',
                variant === 'bar' ? 'py-2' : 'min-h-11 py-3 text-base',
                current ? 'bg-brand-soft font-medium text-brand' : 'text-ink-soft hover:bg-brand-soft hover:text-brand',
              )}
            >
              {l.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
