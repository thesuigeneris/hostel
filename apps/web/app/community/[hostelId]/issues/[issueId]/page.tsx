import Link from 'next/link';
import { CommunityError } from '@/components/community/guard';
import { IssueThread } from '@/components/community/issue-thread';
import { Upvote } from '@/components/community/upvote';
import { IssueStatusBadge } from '@/components/public/issue-transparency';
import { load } from '@/components/public/safe';
import { Badge } from '@/components/ui/badge';
import { ISSUE_CATEGORY_LABEL, ISSUE_SEVERITY_LABEL, timeAgo } from '@/lib/format';
import { requireUser, serverApi } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function IssuePage({ params }: { params: Promise<{ hostelId: string; issueId: string }> }) {
  const { hostelId, issueId } = await params;
  const user = await requireUser(`/community/${hostelId}/issues/${issueId}`);
  const r = await load((await serverApi()).community.issue(issueId), { notFoundOn404: true });
  if (!r.ok) return <CommunityError result={r} hostelId={hostelId} retryHref={`/community/${hostelId}/issues/${issueId}`} />;
  const i = r.data;

  return (
    <div className="space-y-6">
      <Link href={`/community/${hostelId}/issues`} className="text-sm text-muted hover:text-ink">
        ← All issues
      </Link>
      <div className="flex items-start gap-4">
        <Upvote issueId={i.id} upvotes={i.upvotes} upvotedByMe={i.upvotedByMe} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">{i.title}</h2>
            <IssueStatusBadge status={i.status} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            <Badge>{ISSUE_CATEGORY_LABEL[i.category]}</Badge>
            <Badge tone={i.severity === 'high' ? 'danger' : i.severity === 'medium' ? 'warn' : 'neutral'}>{ISSUE_SEVERITY_LABEL[i.severity]} urgency</Badge>
            <span>
              by {i.reporter ? i.reporter.name : 'Anonymous'}
              {i.anonymous && i.reporter?.id === user.id && ' (only you can see this is yours)'} · {timeAgo(i.createdAt)}
            </span>
            {!i.isPublic && <span>· visible to residents only</span>}
          </div>
          <p className="mt-3 whitespace-pre-line text-ink">{i.description}</p>
          {i.photoUrls.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {i.photoUrls.map((u) => (
                <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="block h-28 w-28 overflow-hidden rounded-lg border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="Issue photo" className="h-full w-full object-cover" />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
      <IssueThread issue={i} viewerId={user.id} />
    </div>
  );
}
