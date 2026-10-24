import Link from 'next/link';
import { load } from '@/components/owner/data';
import { IssueDetailView } from '@/components/owner/issue-detail';
import { LoadError } from '@/components/owner/ui';
import { serverApi } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function AdminIssuePage({ params }: { params: Promise<{ issueId: string }> }) {
  const { issueId } = await params;
  const api = await serverApi();
  const res = await load(() => api.community.issue(issueId));
  if (res.error !== null) return <LoadError message={res.error} />;
  return (
    <div>
      <Link href="/admin/issues" className="mb-4 inline-block text-sm text-muted hover:text-ink">
        ← All issues
      </Link>
      <IssueDetailView issue={res.data} asAdmin />
    </div>
  );
}
