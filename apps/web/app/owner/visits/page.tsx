import { VISIT_ACTION_LABEL, VISIT_NEXT, VISIT_STATUSES, type VisitStatus } from '@hostels/shared';
import Link from 'next/link';
import { setVisitAction } from '@/app/owner/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { Back, Card, Empty, Flash, PageHeader, pillClass, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { dateLabel, phoneLink, timeAgo, whatsappLink } from '@/lib/format';

type Props = { searchParams: Promise<{ status?: string; error?: string; ok?: string }> };

const FILTER_LABEL: Record<VisitStatus, string> = { new: 'New', contacted: 'Contacted', closed: 'Closed' };

export default async function VisitsPage({ searchParams }: Props) {
  const q = await searchParams;
  const status = VISIT_STATUSES.includes(q.status as VisitStatus) ? (q.status as VisitStatus) : undefined;
  const visits = await (await api()).owner.visits(status);
  const here = status ? `/owner/visits?status=${status}` : '/owner/visits';
  return (
    <>
      <PageHeader title="Visit requests" subtitle="Call or WhatsApp back quickly; most tenants decide within a day. A closed request stays closed; the seeker can send a new one." />
      <Flash error={q.error} ok={q.ok} />
      <nav aria-label="Filter visit requests" className="mb-4 flex flex-wrap gap-2">
        {[undefined, ...VISIT_STATUSES].map((s) => (
          <Link key={s ?? 'all'} href={s ? `/owner/visits?status=${s}` : '/owner/visits'} aria-current={s === status ? 'page' : undefined} className={pillClass(s === status)}>
            {s ? FILTER_LABEL[s] : 'All'}
          </Link>
        ))}
      </nav>
      {visits.length === 0 ? (
        <Empty title={status ? `No ${FILTER_LABEL[status].toLowerCase()} requests` : 'No visit requests yet'}>
          {status ? <Link href="/owner/visits">See all requests</Link> : 'Requests appear here when seekers ask to see your hostel. Keep photos and free beds current to get more.'}
        </Empty>
      ) : (
        <div className="space-y-3">
          {visits.map((v) => (
            <Card key={v.id} className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium [overflow-wrap:anywhere]">{v.visitor.name || 'Someone'} wants to visit {v.hostelName}</div>
                <div className="text-sm text-ink-soft [overflow-wrap:anywhere]">On {dateLabel(v.preferredDate)} · asked {timeAgo(v.createdAt)}{v.message && ` · “${v.message}”`}</div>
                {v.status !== 'closed' && (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    <a href={phoneLink(v.visitor.phone)}>Call +91 {v.visitor.phone}</a>
                    <a href={whatsappLink(v.visitor.phone, `Hi ${v.visitor.name}, this is ${v.hostelName} about your visit.`)} target="_blank" rel="noopener noreferrer">
                      WhatsApp<span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge kind="visit" status={v.status} />
                {VISIT_NEXT[v.status].map((s) => (
                  <form key={s} action={setVisitAction}>
                    <Back to={here} />
                    <input type="hidden" name="visitId" value={v.id} />
                    <input type="hidden" name="status" value={s} />
                    <SubmitButton size="sm" variant={s === 'contacted' ? 'primary' : 'secondary'}>{VISIT_ACTION_LABEL[s]}</SubmitButton>
                  </form>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
