import Link from 'next/link';
import { TabsNav } from '@/components/ui/tabs-nav';
import { loadOwnerHostel } from '@/components/owner/hostel-loader';
import { HostelStatusBadge, LoadError, PartnerBadge, PlanBadge } from '@/components/owner/ui';

export const dynamic = 'force-dynamic';

export default async function HostelEditorLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await loadOwnerHostel(id);
  if (res.error !== null) return <LoadError message={res.error} />;
  const h = res.data;
  const base = `/owner/hostels/${id}`;
  return (
    <div>
      <div className="mb-4">
        <Link href="/owner/hostels" className="text-sm text-muted hover:text-ink">
          ← All hostels
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{h.name}</h1>
          <HostelStatusBadge status={h.status} />
          <PartnerBadge status={h.partnerStatus} />
          <PlanBadge plan={h.ownerPlan} />
          {h.status === 'live' && (
            <Link href={`/hostels/${h.slug}`} className="ml-auto text-sm text-brand hover:underline">
              View public page ↗
            </Link>
          )}
        </div>
      </div>
      <TabsNav
        items={[
          { href: base, label: 'Details', exact: true },
          { href: `${base}/rooms`, label: `Rooms (${h.roomTypes.length})` },
          { href: `${base}/photos`, label: `Photos (${h.photos.length})` },
          { href: `${base}/status`, label: 'Status & plan' },
          { href: `${base}/community`, label: 'Community' },
        ]}
      />
      {children}
    </div>
  );
}
