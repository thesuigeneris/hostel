import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { requireUser } from '@/lib/api';

export const metadata: Metadata = { title: 'Owner dashboard', robots: { index: false } };

export default async function OwnerLayout({ children }: { children: ReactNode }) {
  await requireUser('/owner', 'owner');
  return <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>;
}
