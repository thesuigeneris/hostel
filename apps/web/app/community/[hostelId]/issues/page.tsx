import Link from 'next/link';
import { ISSUE_CATEGORIES, ISSUE_STATUSES, schemas } from '@hostels/shared';
import { CommunityError } from '@/components/community/guard';
import { ReportIssue } from '@/components/community/report-issue';
import { Upvote } from '@/components/community/upvote';
import { IssueStatusBadge } from '@/components/public/issue-transparency';
import { Pagination } from '@/components/public/pagination';
import { load } from '@/components/public/safe';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { cn } from '@/lib/cn';
import { ISSUE_CATEGORY_LABEL, ISSUE_STATUS_LABEL, timeAgo } from '@/lib/format';
import { requireUser, serverApi } from '@/lib/session';

export const dynamic = 'force-dynamic';

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn('whitespace-nowrap rounded-full border px-3 py-1 text-sm', active ? 'border-brand bg-brand text-white' : 'border-line bg-surface text-muted hover:border-brand')}>
      {children}
    </Link>
  );
}

export default async function IssuesPage({ params, searchParams }: { params: Promise<{ hostelId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { hostelId } = await params;
  const sp = await searchParams;
  await requireUser(`/community/${hostelId}/issues`);
  const parsed = schemas.issueListQuery.safeParse(sp);
  const query = parsed.success ? parsed.data : {};
  const base = `/community/${hostelId}/issues`;
  const r = await load((await serverApi()).community.issues(hostelId, query));
  if (!r.ok) return <CommunityError result={r} hostelId={hostelId} retryHref={base} />;

  const href = (changes: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const merged = { status: query.status, category: query.category, ...changes };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };

  return (
    <div className="space-y-5">
      <ReportIssue hostelId={hostelId} />

      <div className="space-y-2">
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Chip href={href({ status: undefined })} active={!query.status}>All</Chip>
          {ISSUE_STATUSES.map((s) => (
            <Chip key={s} href={href({ status: s })} active={query.status === s}>{ISSUE_STATUS_LABEL[s]}</Chip>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Chip href={href({ category: undefined })} active={!query.category}>Any category</Chip>
          {ISSUE_CATEGORIES.map((c) => (
            <Chip key={c} href={href({ category: c })} active={query.category === c}>{ISSUE_CATEGORY_LABEL[c]}</Chip>
          ))}
        </div>
      </div>

      {r.data.items.length === 0 ? (
        <EmptyState title={query.status || query.category ? 'No issues match' : 'No issues reported'}>
          {query.status || query.category ? 'Try another filter.' : 'Good news. If something breaks, report it here and track it to the fix.'}
        </EmptyState>
      ) : (
        <Card className="divide-y divide-line">
          {r.data.items.map((i) => (
            <div key={i.id} className="relative flex items-start gap-3 p-4 hover:bg-bg">
              <div className="relative z-10">
                <Upvote issueId={i.id} upvotes={i.upvotes} upvotedByMe={i.upvotedByMe} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`${base}/${i.id}`} className="font-medium after:absolute after:inset-0">
                    {i.title}
                  </Link>
                  {i.severity === 'high' && <Badge tone="danger">Urgent</Badge>}
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  {ISSUE_CATEGORY_LABEL[i.category]} · {i.reporter ? i.reporter.name : 'Anonymous'} · {timeAgo(i.createdAt)}
                  {!i.isPublic && ' · residents only'}
                </div>
              </div>
              <IssueStatusBadge status={i.status} />
            </div>
          ))}
        </Card>
      )}
      <Pagination page={r.data.page} pageSize={r.data.pageSize} total={r.data.total} basePath={base} params={{ status: query.status, category: query.category }} />
    </div>
  );
}
