'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from './ui';

export function OwnerTabs({ base, tabs }: { base: string; tabs: { href: string; label: string; locked?: boolean }[] }) {
  const path = usePathname();
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-line bg-surface p-1">
      {tabs.map((t) => {
        const href = `${base}${t.href}`;
        const active = t.href === '' ? path === base : path.startsWith(href);
        return (
          <Link key={t.href} href={href} className={cx('whitespace-nowrap rounded-xl px-4 py-2 text-sm no-underline', active ? 'bg-brand text-white' : 'text-ink-soft hover:bg-brand-soft')}>
            {t.label}{t.locked && <span className="ml-1 opacity-70" aria-label="needs an upgrade">🔒</span>}
          </Link>
        );
      })}
    </nav>
  );
}
