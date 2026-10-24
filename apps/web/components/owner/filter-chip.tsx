import Link from 'next/link';
import type { ReactNode } from 'react';

export function FilterChip({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={`whitespace-nowrap rounded-full border px-3 py-1 text-sm ${active ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-surface text-muted hover:text-ink'}`}
    >
      {children}
    </Link>
  );
}
