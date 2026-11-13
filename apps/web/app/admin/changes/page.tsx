import { changeValueText } from '@hostels/shared';
import Link from 'next/link';
import { Badge, Card, Empty, PageHeader, pillClass } from '@/components/ui';
import { api } from '@/lib/api';
import { dateLabel, timeAgo } from '@/lib/format';

type Props = { searchParams: Promise<{ recheck?: string; before?: string }> };

const PAGE = 50;

export default async function AdminChanges({ searchParams }: Props) {
  const q = await searchParams;
  const recheck = q.recheck === '1';
  const before = q.before && !Number.isNaN(Date.parse(q.before)) ? q.before : undefined;
  const changes = await (await api()).admin.listingChanges({ recheck: recheck || undefined, before, limit: PAGE });
  const filter = (on: boolean) => (on ? '/admin/changes?recheck=1' : '/admin/changes');
  const older = changes.length === PAGE ? `${filter(recheck)}${recheck ? '&' : '?'}before=${encodeURIComponent(changes.at(-1)!.createdAt)}` : null;

  return (
    <>
      <PageHeader
        title="Recently changed listings"
        subtitle="A live listing stays live when its owner edits it. Changes to its name, address, map pin, who can stay, food or phone numbers are listed here, newest first, so you can check them."
      />
      <nav aria-label="Which changes" className="mb-4 flex flex-wrap gap-2">
        <Link href={filter(false)} aria-current={!recheck ? 'page' : undefined} className={pillClass(!recheck)}>
          All changes
        </Link>
        <Link href={filter(true)} aria-current={recheck ? 'page' : undefined} className={pillClass(recheck)}>
          Partners to check again
        </Link>
      </nav>
      {changes.length === 0 ? (
        <Empty title={recheck ? 'No partner needs a new check' : before ? 'No older changes' : 'No changes to live listings yet'}>
          {recheck ? 'When a verified partner moves its address or map pin, or starts serving food, it shows up here.' : 'Edits to live listings appear here as owners make them.'}
        </Empty>
      ) : (
        <ol className="space-y-3">
          {changes.map((ch) => (
            <li key={ch.id}>
              <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="font-medium [overflow-wrap:anywhere]">
                      {ch.hostel.status === 'live' ? <Link href={`/hostels/${ch.hostel.slug}`}>{ch.hostel.name}</Link> : ch.hostel.name}
                    </h2>
                    <p className="text-xs text-ink-muted">
                      {ch.hostel.area} · changed by{' '}
                      {ch.changedBy ? (ch.changedBy.isOwner ? 'the owner' : `admin ${ch.changedBy.name || `+91 ${ch.changedBy.phone}`}`) : 'an account since removed'} ·{' '}
                      <time dateTime={ch.createdAt}>{timeAgo(ch.createdAt)}</time>
                    </p>
                  </div>
                  {ch.partnerRecheck &&
                    (ch.hostel.recheckSince ? (
                      <Link href="/admin/partners#recheck" className="no-underline">
                        <Badge tone="food">Partner check due since {dateLabel(ch.hostel.recheckSince)}</Badge>
                      </Link>
                    ) : (
                      <Badge>Partner checked again</Badge>
                    ))}
                </div>
                <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
                  {ch.changes.map((c) => (
                    <div key={c.field} className="contents">
                      <dt className="text-ink-soft">{c.label}</dt>
                      <dd className="[overflow-wrap:anywhere]">
                        <span className="text-ink-muted line-through decoration-ink-muted/60">{changeValueText(c.field, c.before)}</span>
                        <span aria-hidden> → </span>
                        <span className="sr-only"> changed to </span>
                        <span className="font-medium">{changeValueText(c.field, c.after)}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </Card>
            </li>
          ))}
        </ol>
      )}
      {older && (
        <div className="mt-4 text-sm">
          <Link href={older}>
            Older changes <span aria-hidden>→</span>
          </Link>
        </div>
      )}
    </>
  );
}
