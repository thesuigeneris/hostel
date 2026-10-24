import Link from 'next/link';
import { Badge, Empty, PageHeader, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { timeAgo, titleCase } from '@/lib/format';

function age(hours: number) {
  return hours < 48 ? `${hours} hrs` : `${Math.floor(hours / 24)} days`;
}

export default async function EscalatedIssues() {
  const issues = await (await api()).admin.escalatedIssues();
  return (
    <>
      <PageHeader
        title="Escalated issues"
        subtitle="Open and unacknowledged for 48 hours, or not resolved after 7 days. Call the owner; slow fixes hurt the public issue record."
      />
      {issues.length === 0 ? (
        <Empty title="Nothing escalated">Every issue has been answered in time.</Empty>
      ) : (
        <ul className="space-y-2">
          {issues.map((i) => (
            <li key={i.id}>
              <Link href={`/issues/${i.id}`} className="block rounded-2xl border border-line bg-surface p-4 text-ink no-underline hover:border-brand">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{i.title}</span>
                  <span className="flex items-center gap-2">
                    <Badge tone="red">{i.reason === 'unacknowledged' ? 'No response' : 'Not fixed'} · {age(i.ageHours)}</Badge>
                    <StatusBadge status={i.status} />
                  </span>
                </div>
                <div className="mt-1 text-xs text-ink-muted">
                  {i.hostelName} · {titleCase(i.category)} · reported {timeAgo(i.createdAt)} · {i.upvotes} me-too
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
