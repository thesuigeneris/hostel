import Link from 'next/link';
import { LoadError } from '@/components/public/load-error';
import { load } from '@/components/public/safe';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { formatDate } from '@/lib/format';
import { serverApi } from '@/lib/session';

export const dynamic = 'force-dynamic';

const STATUS = { new: { label: 'Requested', tone: 'warn' }, contacted: { label: 'Owner contacted you', tone: 'brand' }, closed: { label: 'Closed', tone: 'neutral' } } as const;

export default async function VisitsPage() {
  const r = await load((await serverApi()).tenant.visits());
  if (!r.ok) return <LoadError message={r.message} retryHref="/account/visits" />;
  if (r.data.length === 0) {
    return (
      <EmptyState title="No visit requests" action={<ButtonLink href="/search">Find a hostel</ButtonLink>}>
        Request a visit from any hostel page and the owner will call you to fix a time.
      </EmptyState>
    );
  }
  return (
    <Card className="divide-y divide-line">
      {r.data.map((v) => (
        <div key={v.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <Link href={`/hostels/${v.hostel.slug}`} className="font-medium hover:text-brand">{v.hostel.name}</Link>
            <div className="text-sm text-muted">Preferred date {formatDate(v.preferredDate)}</div>
            {v.message && <div className="mt-1 text-sm text-ink">“{v.message}”</div>}
          </div>
          <Badge tone={STATUS[v.status].tone}>{STATUS[v.status].label}</Badge>
        </div>
      ))}
    </Card>
  );
}
