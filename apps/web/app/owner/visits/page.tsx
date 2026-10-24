import { VISIT_STATUSES, type VisitStatus } from '@hostels/shared';
import { Badge } from '@/components/ui/badge';
import { EmptyState, PageHeader } from '@/components/ui/states';
import { load } from '@/components/owner/data';
import { FilterChip } from '@/components/owner/filter-chip';
import { HostelPicker } from '@/components/owner/hostel-picker';
import { LoadError, Table, Td } from '@/components/owner/ui';
import { VisitActions } from '@/components/owner/visit-actions';
import { formatDate, timeAgo } from '@/lib/format';
import { serverApi } from '@/lib/session';

export const dynamic = 'force-dynamic';

const LABEL: Record<VisitStatus, string> = { new: 'New', contacted: 'Contacted', closed: 'Closed' };

export default async function VisitsPage({ searchParams }: { searchParams: Promise<{ hostelId?: string; status?: string }> }) {
  const sp = await searchParams;
  const api = await serverApi();
  const [hostels, visits] = await Promise.all([load(() => api.owner.hostels()), load(() => api.owner.visits(sp.hostelId || undefined))]);
  if (hostels.error !== null) return <LoadError message={hostels.error} />;
  if (visits.error !== null) return <LoadError message={visits.error} />;
  const status = (VISIT_STATUSES as readonly string[]).includes(sp.status ?? '') ? (sp.status as VisitStatus) : undefined;
  const rows = visits.data.filter((v) => !status || v.status === status);
  const counts = Object.fromEntries(VISIT_STATUSES.map((s) => [s, visits.data.filter((v) => v.status === s).length]));
  const qs = (s?: string) => {
    const p = new URLSearchParams();
    if (sp.hostelId) p.set('hostelId', sp.hostelId);
    if (s) p.set('status', s);
    return `?${p.toString()}`;
  };

  return (
    <div>
      <PageHeader title="Visit requests" subtitle="Seekers who want to see your hostel. Call them back quickly — most decide within a day." actions={<HostelPicker hostels={hostels.data} value={sp.hostelId ?? ''} allowAll />} />
      <div className="mb-4 flex flex-wrap gap-2">
        <FilterChip href={qs()} active={!status}>
          All ({visits.data.length})
        </FilterChip>
        {VISIT_STATUSES.map((s) => (
          <FilterChip key={s} href={qs(s)} active={status === s}>
            {LABEL[s]} ({counts[s]})
          </FilterChip>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No visit requests here">When seekers request a visit from your listing, they&apos;ll show up here.</EmptyState>
      ) : (
        <Table head={['Seeker', 'Hostel', 'Preferred date', 'Message', 'Status', '']}>
          {rows.map((v) => (
            <tr key={v.id}>
              <Td>
                <div className="font-medium">{v.user.name || 'Seeker'}</div>
                <div className="text-xs text-muted">+91 {v.user.phone}</div>
              </Td>
              <Td>{v.hostel.name}</Td>
              <Td>
                {formatDate(v.preferredDate)}
                <div className="text-xs text-muted">asked {timeAgo(v.createdAt)}</div>
              </Td>
              <Td className="max-w-xs text-muted">{v.message || '—'}</Td>
              <Td>
                <Badge tone={v.status === 'new' ? 'brand' : v.status === 'contacted' ? 'warn' : 'neutral'}>{LABEL[v.status]}</Badge>
              </Td>
              <Td>
                <VisitActions visitId={v.id} status={v.status} phone={v.user.phone} />
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

