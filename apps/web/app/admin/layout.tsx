import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AdminNav } from '@/components/AdminNav';
import { requireUser } from '@/lib/api';

export const metadata: Metadata = { title: 'Admin', robots: { index: false } };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireUser('/admin', 'admin');
  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[200px_1fr]">
      <AdminNav />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
