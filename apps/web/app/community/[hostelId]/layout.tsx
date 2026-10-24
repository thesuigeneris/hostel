import Link from 'next/link';
import { getResidencyAt } from '@/components/community/context';
import { Badge } from '@/components/ui/badge';
import { TabsNav } from '@/components/ui/tabs-nav';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function HostelCommunityLayout({ children, params }: { children: React.ReactNode; params: Promise<{ hostelId: string }> }) {
  const { hostelId } = await params;
  await requireUser(`/community/${hostelId}`);
  const res = await getResidencyAt(hostelId);
  const base = `/community/${hostelId}`;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link href="/community" className="text-sm text-muted hover:text-ink">
        ← My communities
      </Link>
      <div className="mt-2 mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{res?.hostel.name ?? 'Hostel community'}</h1>
        {res?.status === 'active' && <Badge tone="ok">You live here</Badge>}
        {res?.status === 'ended' && <Badge>Past resident</Badge>}
        {res && (
          <Link href={`/hostels/${res.hostel.slug}`} className="text-sm text-brand underline">
            Public page
          </Link>
        )}
      </div>
      <TabsNav
        items={[
          { href: base, label: 'Board', exact: true },
          { href: `${base}/issues`, label: 'Issues' },
          { href: `${base}/residents`, label: 'Residents' },
          { href: `${base}/review`, label: 'Review' },
        ]}
      />
      {children}
    </div>
  );
}
