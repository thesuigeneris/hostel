import Link from 'next/link';
import { ISSUE_STATUSES, type IssueStatus } from '@hostels/shared';
import { EmptyState, PageHeader } from '@/components/ui/states';
import { load } from '@/components/owner/data';
import { FilterChip } from '@/components/owner/filter-chip';
import { Pager } from '@/components/owner/pager';
import { IssueStatusBadge, LoadError, SeverityBadge, Table, Td } from '@/components/owner/ui';
import { ISSUE_CATEGORY_LABEL, ISSUE_STATUS_LABEL, timeAgo } from '@/lib/format';
import { serverApi } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function AdminIssues({ searchParams }: { searchParams: Promise<{ status?: string; escalated?: string; page?: string }> }) {
  const sp = await searchParams;
  const status = (ISSUE_STATUSES as readonly string[]).includes(sp.status ?? '') ? (sp.status as IssueStatus) : undefined;
  const escalated = sp.escalated === '1';
  const page = Math.max(1, Number(sp.page) || 1);
  const api = await serverApi();
  const res = await load(() => api.admin.issues({ status, escalated: escalated || undefined, page }));
  const qs = (o: { status?: string; escalated?: boolean; page?: number }) => {
    const q = new URLSearchParams();
    if (o.status) q.set('status', o.status);
    if (o.escalated) q.set('escalated', '1');
    if (o.page && o.page > 1) q.set('page', String(o.page));
    return `?${q.toString()}`;
  };

  return (
    <div>
      <PageHeader title="Issues" subtitle="Escalated: open or acknowledged for over 7 days, or high severity left unhandled for over 48 hours." />
      <div className="mb-4 flex flex-wrap gap-2">
        <FilterChip href={qs({ escalated: true })} active={escalated}>
          Escalated
        </FilterChip>
        <FilterChip href={qs({})} active={!escalated && !status}>
          All
        </FilterChip>
        {ISSUE_STATUSES.map((s) => (
          <FilterChip key={s} href={qs({ status: s })} active={!escalated && status === s}>
            {ISSUE_STATUS_LABEL[s]}
          </FilterChip>
        ))}
      </div>
      {res.error !== null ? (
        <LoadError message={res.error} />
      ) : res.data.items.length === 0 ? (
        <EmptyState title={escalated ? 'Nothing escalated' : 'No issues'} />
      ) : (
        <>
          <Table head={['Issue', 'Hostel', 'Category', 'Severity', 'Status', 'Age']}>
            {res.data.items.map((i) => (
              <tr key={i.id}>
                <Td>
                  <Link href={`/admin/issues/${i.id}`} className="font-medium hover:text-brand">
                    {i.title}
                  </Link>
                  <div className="text-xs text-muted">
                    {i.reporter ? i.reporter.name : 'Anonymous'}
                    {i.anonymous && i.reporter && ' (anonymous to others)'} · ▲ {i.upvotes}
                  </div>
                </Td>
                <Td>{i.hostel.name}</Td>
                <Td>{ISSUE_CATEGORY_LABEL[i.category]}</Td>
                <Td>
                  <SeverityBadge severity={i.severity} />
                </Td>
                <Td>
                  <IssueStatusBadge status={i.status} />
                </Td>
                <Td className="whitespace-nowrap text-muted">{timeAgo(i.createdAt)}</Td>
              </tr>
            ))}
          </Table>
          <Pager page={res.data.page} pageSize={res.data.pageSize} total={res.data.total} href={(p) => qs({ status, escalated, page: p })} />
        </>
      )}
    </div>
  );
}
