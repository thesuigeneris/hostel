'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx, focusRing } from './ui';

/** Sections of one hostel. Locked sections stay visible so owners can see what an upgrade adds. */
export function OwnerTabs({ base, tabs }: { base: string; tabs: { href: string; label: string; locked?: boolean }[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Hostel sections" className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-1 rounded-2xl border border-line bg-surface p-1 sm:w-auto sm:flex-wrap">
        {tabs.map((t) => {
          const href = `${base}${t.href}`;
          const active = t.href === '' ? path === base : path.startsWith(href);
          return (
            <li key={t.href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'flex min-h-10 items-center gap-1 whitespace-nowrap rounded-xl px-4 text-sm no-underline transition duration-feedback',
                  focusRing,
                  active ? 'bg-brand text-brand-on' : 'text-ink-soft hover:bg-brand-soft hover:text-brand',
                )}
              >
                {t.label}
                {t.locked && (
                  <>
                    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-current opacity-70"><path d="M6 8V6a4 4 0 1 1 8 0v2h1v10H5V8zm2 0h4V6a2 2 0 1 0-4 0z" /></svg>
                    <span className="sr-only">(needs an upgrade)</span>
                  </>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
