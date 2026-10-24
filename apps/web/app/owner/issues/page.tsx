import Link from 'next/link';
import { ISSUE_STATUSES, type IssueStatus } from '@hostels/shared';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState, PageHeader } from '@/components/ui/states';
import { load } from '@/components/owner/data';
import { FilterChip } from '@/components/owner/filter-chip';
import { Pager } from '@/components/owner/pager';
import { HostelPicker } from '@/components/owner/hostel-picker';
import { IssueStatusBadge, LoadError, SeverityBadge, Table, Td } from '@/components/owner/ui';
import { ISSUE_CATEGORY_LABEL, ISSUE_STATUS_LABEL, timeAgo } from '@/lib/format';
import { serverApi } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function OwnerIssuesPage({ searchParams }: { searchParams: Promise<{ hostelId?: string; status?: string; page?: string }> }) {
  const sp = await searchParams;
  const api = await serverApi();
  const hostels = await load(() => api.owner.hostels());
  if (hostels.error !== null) return <LoadError message={hostels.error} />;
  if (hostels.data.length === 0) return <EmptyState title="No hostels yet" action={<ButtonLink href="/owner/hostels/new">Add a hostel</ButtonLink>} />;

  const hostelId = hostels.data.some((h) => h.id === sp.hostelId) ? sp.hostelId! : hostels.data[0]!.id;
  const status = (ISSUE_STATUSES as readonly string[]).includes(sp.status ?? '') ? (sp.status as IssueStatus) : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const issues = await load(() => api.owner.issues(hostelId, { status, page }));
  const qs = (s?: string, p?: number) => {
    const q = new URLSearchParams({ hostelId });
    if (s) q.set('status', s);
    if (p && p > 1) q.set('page', String(p));
    return `?${q.toString()}`;
  };

  return (
    <div>
      <PageHeader
        title="Issue desk"
        subtitle="Residents' reports. Your response and resolution times are shown publicly on your hostel page."
        actions={<HostelPicker hostels={hostels.data} value={hostelId} />}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <FilterChip href={qs()} active={!status}>
          All
        </FilterChip>
        {ISSUE_STATUSES.map((s) => (
          <FilterChip key={s} href={qs(s)} active={status === s}>
            {ISSUE_STATUS_LABEL[s]}
          </FilterChip>
        ))}
      </div>
      {issues.error !== null ? (
        <LoadError message={issues.error} />
      ) : issues.data.items.length === 0 ? (
        <EmptyState title="Nothing here">No issues {status ? `marked "${ISSUE_STATUS_LABEL[status]}"` : 'reported yet'}. Keep it up.</EmptyState>
      ) : (
        <>
          <Table head={['Issue', 'Category', 'Severity', 'Status', 'Reported', 'Upvotes']}>
            {issues.data.items.map((i) => (
              <tr key={i.id}>
                <Td>
                  <Link href={`/owner/issues/${i.id}`} className="font-medium hover:text-brand">
                    {i.title}
                  </Link>
                  <div className="text-xs text-muted">{i.anonymous || !i.reporter ? 'Anonymous resident' : i.reporter.name}</div>
                </Td>
                <Td>{ISSUE_CATEGORY_LABEL[i.category]}</Td>
                <Td>
                  <SeverityBadge severity={i.severity} />
                </Td>
                <Td>
                  <IssueStatusBadge status={i.status} />
                </Td>
                <Td className="whitespace-nowrap text-muted">{timeAgo(i.createdAt)}</Td>
                <Td>▲ {i.upvotes}</Td>
              </tr>
            ))}
          </Table>
          <Pager page={issues.data.page} pageSize={issues.data.pageSize} total={issues.data.total} href={(p) => qs(status, p)} />
        </>
      )}
    </div>
  );
}

