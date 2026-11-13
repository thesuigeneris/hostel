import { VISIT_STATUSES, type VisitStatus } from '@hostels/shared';
import Link from 'next/link';
import { setVisitAction } from '@/app/owner/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { Card, cx, Empty, Flash, PageHeader, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { dateLabel, phoneLink, timeAgo, whatsappLink } from '@/lib/format';

type Props = { searchParams: Promise<{ status?: string; error?: string; ok?: string }> };

export default async function VisitsPage({ searchParams }: Props) {
  const q = await searchParams;
  const status = VISIT_STATUSES.includes(q.status as VisitStatus) ? (q.status as VisitStatus) : undefined;
  const visits = await (await api()).owner.visits(status);
  return (
    <>
      <PageHeader title="Visit requests" subtitle="Call or WhatsApp back quickly; most tenants decide within a day." />
      <Flash error={q.error} ok={q.ok} />
      <nav className="mb-4 flex gap-2 text-sm">
        {[undefined, ...VISIT_STATUSES].map((s) => (
          <Link key={s ?? 'all'} href={s ? `/owner/visits?status=${s}` : '/owner/visits'} className={cx('rounded-full px-3 py-1 no-underline', s === status ? 'bg-brand text-white' : 'bg-surface text-ink-soft')}>
            {s ? s[0]!.toUpperCase() + s.slice(1) : 'All'}
          </Link>
        ))}
      </nav>
      {visits.length === 0 ? <Empty title="No visit requests here" /> : (
        <div className="space-y-3">
          {visits.map((v) => (
            <Card key={v.id} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-medium">{v.visitor.name || 'Someone'} wants to visit {v.hostelName}</div>
                <div className="text-sm text-ink-soft">On {dateLabel(v.preferredDate)} · asked {timeAgo(v.createdAt)}{v.message && ` · “${v.message}”`}</div>
                <div className="mt-2 flex gap-3 text-sm">
                  <a href={phoneLink(v.visitor.phone)}>Call +91 {v.visitor.phone}</a>
                  <a href={whatsappLink(v.visitor.phone, `Hi ${v.visitor.name}, this is ${v.hostelName} about your visit.`)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge kind="visit" status={v.status} />
                {VISIT_STATUSES.filter((s) => s !== v.status && s !== 'new').map((s) => (
                  <form key={s} action={setVisitAction}>
                    <input type="hidden" name="visitId" value={v.id} />
                    <input type="hidden" name="status" value={s} />
                    <SubmitButton size="sm" variant="secondary">{s === 'contacted' ? 'Mark contacted' : 'Close'}</SubmitButton>
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
