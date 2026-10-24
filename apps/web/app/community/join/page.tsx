import type { Metadata } from 'next';
import { createApiClient } from '@hostels/shared';
import { JoinForm } from '@/components/community/join-form';
import { load } from '@/components/public/safe';
import { PageHeader } from '@/components/ui/states';
import { API_URL } from '@/lib/config';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Join your hostel community', robots: { index: false } };

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ hostel?: string }> }) {
  const { hostel } = await searchParams;
  await requireUser(`/community/join${hostel ? `?hostel=${encodeURIComponent(hostel)}` : ''}`);
  const pre = hostel ? await load(createApiClient(API_URL).hostels.get(hostel)) : null;
  const preselected = pre?.ok ? { id: pre.data.id, name: pre.data.name, area: pre.data.area } : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <PageHeader title="Join your hostel's community" subtitle="Tell us where you live. The owner confirms it, and then you can post, report issues and leave a review." />
      <JoinForm preselected={preselected} />
    </div>
  );
}
