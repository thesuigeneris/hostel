import { HOSTEL_STATUSES, type HostelStatus } from '@hostels/shared';
import Link from 'next/link';
import { SubmitButton } from '@/components/SubmitButton';
import { Back, Card, cx, Empty, Flash, Input, PageHeader, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { dateLabel, GENDER_LABEL } from '@/lib/format';
import { approveAction, rejectAction } from '../actions';

type Props = { searchParams: Promise<{ status?: string; error?: string; ok?: string }> };

export default async function AdminListings({ searchParams }: Props) {
  const q = await searchParams;
  const status: HostelStatus = HOSTEL_STATUSES.includes(q.status as HostelStatus) ? (q.status as HostelStatus) : 'pending';
  const client = await api();
  const hostels = await client.admin.hostels({ status });
  const details = await Promise.all(hostels.map((h) => client.admin.hostel(h.id)));
  const path = `/admin/listings?status=${status}`;

  return (
    <>
      <PageHeader title="Listings" />
      <Flash error={q.error} ok={q.ok} />
      <nav className="mb-4 flex gap-2 text-sm">
        {HOSTEL_STATUSES.map((s) => (
          <Link key={s} href={`/admin/listings?status=${s}`} className={cx('rounded-full px-3 py-1 no-underline', s === status ? 'bg-brand text-white' : 'bg-surface text-ink-soft')}>{s}</Link>
        ))}
      </nav>
      {details.length === 0 ? <Empty title={`No ${status} listings`} /> : (
        <div className="space-y-4">
          {details.map((h) => (
            <Card key={h.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">{h.name}</div>
                  <div className="text-sm text-ink-soft">{h.area} · {GENDER_LABEL[h.genderType]} · +91 {h.contactPhone} · created {dateLabel(h.createdAt)}</div>
                  <div className="text-sm text-ink-soft">{h.address}</div>
                </div>
                <StatusBadge status={h.status} />
              </div>
              <div className="mt-3 flex gap-2 overflow-x-auto">
                {h.photos.map((p) => <img key={p.id} src={p.url} alt={h.name} className="h-24 w-32 flex-none rounded-lg object-cover" />)}
              </div>
              <p className="mt-3 line-clamp-3 text-sm">{h.description || <span className="text-ink-muted">No description</span>}</p>
              <div className="mt-2 text-sm text-ink-soft">{h.roomTypes.map((r) => `${r.sharing} ₹${r.monthlyRent} (${r.bedsAvailable}/${r.totalBeds})`).join(' · ') || 'No rooms'}</div>
              {h.status === 'live' && <Link href={`/hostels/${h.slug}`} className="mt-2 inline-block text-sm">Public page</Link>}
              {h.status === 'pending' && (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <form action={approveAction}><Back to={path} /><input type="hidden" name="hostelId" value={h.id} /><SubmitButton>Approve</SubmitButton></form>
                  <form action={rejectAction} className="flex flex-1 gap-2">
                    <Back to={path} /><input type="hidden" name="hostelId" value={h.id} />
                    <Input name="reason" required minLength={3} placeholder="Why it can't go live (the owner sees this)" />
                    <SubmitButton variant="danger">Reject</SubmitButton>
                  </form>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
