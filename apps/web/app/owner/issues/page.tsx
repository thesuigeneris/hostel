import { ISSUE_CATEGORIES } from '@hostels/shared';
import Link from 'next/link';
import { IssueList } from '@/components/Community';
import { Badge, Card, PageHeader, Stat } from '@/components/ui';
import { api } from '@/lib/api';
import { timeAgo, titleCase } from '@/lib/format';

const DAY = 24 * 3600_000;

export default async function OwnerIssuesPage() {
  const client = await api();
  const [issues, hostels] = await Promise.all([client.owner.issues(), client.owner.hostels()]);
  const name = new Map(hostels.map((h) => [h.id, h.name]));
  const byHostel = [...new Set(issues.map((i) => i.hostelId))];
  const open = issues.filter((i) => i.status !== 'resolved' && i.status !== 'closed');
  // Longest wait first. A reopened issue waits from the reopen, not from the first report.
  const waiting = open.filter((i) => i.needsResponse).sort((a, b) => (a.awaitingReplySince ?? a.createdAt).localeCompare(b.awaitingReplySince ?? b.createdAt));
  const now = Date.now();
  const olderThan = (days: number) => open.filter((i) => now - new Date(i.createdAt).getTime() > days * DAY).length;
  const categories = ISSUE_CATEGORIES.map((c) => [c, open.filter((i) => i.category === c).length] as const).filter(([, n]) => n > 0);

  return (
    <>
      <PageHeader title="Issues" subtitle="Everything your residents have reported, open ones first. Response times show on your public listing." />
      {issues.length > 0 && (
        <div className="mb-8 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Open" value={open.length} />
            <Stat label="Needs a reply" value={waiting.length} hint="Waiting over 24 hours for your first answer, or since a resident reopened it" />
            <Stat label="Open over 3 days" value={olderThan(3)} />
            <Stat label="Open over a week" value={olderThan(7)} />
          </div>
          {categories.length > 0 && (
            <ul aria-label="Open issues by category" className="flex flex-wrap gap-2">
              {categories.map(([c, n]) => <li key={c}><Badge>{titleCase(c)} · {n}</Badge></li>)}
            </ul>
          )}
          {waiting.length > 0 && (
            <Card className="border-danger/40 bg-danger-soft/40">
              <h2 className="mb-2 font-medium">Reply to these first</h2>
              <ul className="space-y-1 text-sm">
                {waiting.map((i) => (
                  <li key={i.id} className="flex flex-wrap justify-between gap-2">
                    <Link href={`/issues/${i.id}`}>{i.title}</Link>
                    <span className="text-ink-soft">
                      {name.get(i.hostelId)} · {i.awaitingReplySince && i.awaitingReplySince !== i.createdAt ? 'reopened' : 'reported'}{' '}
                      {timeAgo(i.awaitingReplySince ?? i.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
      {byHostel.length === 0 && <IssueList issues={[]} emptyText="No issues reported yet. When residents report one, it shows here and on your dashboard." />}
      <div className="space-y-8">
        {byHostel.map((hid) => (
          <section key={hid}>
            <h2 className="mb-3 text-lg font-semibold">{name.get(hid) ?? 'Hostel'}</h2>
            <IssueList issues={issues.filter((i) => i.hostelId === hid)} />
          </section>
        ))}
      </div>
    </>
  );
}
