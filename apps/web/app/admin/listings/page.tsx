import Link from 'next/link';
import { HOSTEL_STATUSES, OWNER_PLANS, PARTNER_STATUSES, type HostelStatus, type OwnerPlan, type PartnerStatus } from '@hostels/shared';
import { ListingDecision } from '@/components/admin/actions';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { EmptyState, PageHeader } from '@/components/ui/states';
import { load } from '@/components/owner/data';
import { Pager } from '@/components/owner/pager';
import { HostelStatusBadge, LoadError, PartnerBadge, PlanBadge, Table, Td } from '@/components/owner/ui';
import { GENDER_LABEL, HOSTEL_STATUS_LABEL, PARTNER_STATUS_LABEL, timeAgo } from '@/lib/format';
import { serverApi } from '@/lib/session';

export const dynamic = 'force-dynamic';

type SP = { status?: string; partnerStatus?: string; ownerPlan?: string; q?: string; page?: string };
const pick = <T extends string>(v: string | undefined, all: readonly T[]) => (all as readonly string[]).includes(v ?? '') ? (v as T) : undefined;

export default async function AdminListings({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  // Default to the review queue.
  const status = sp.status === 'all' ? undefined : (pick<HostelStatus>(sp.status, HOSTEL_STATUSES) ?? 'pending');
  const partnerStatus = pick<PartnerStatus>(sp.partnerStatus, PARTNER_STATUSES);
  const ownerPlan = pick<OwnerPlan>(sp.ownerPlan, OWNER_PLANS);
  const page = Math.max(1, Number(sp.page) || 1);
  const api = await serverApi();
  const res = await load(() => api.admin.hostels({ status, partnerStatus, ownerPlan, q: sp.q || undefined, page }));
  const qs = (p: number) => {
    const q = new URLSearchParams();
    q.set('status', status ?? 'all');
    if (partnerStatus) q.set('partnerStatus', partnerStatus);
    if (ownerPlan) q.set('ownerPlan', ownerPlan);
    if (sp.q) q.set('q', sp.q);
    if (p > 1) q.set('page', String(p));
    return `?${q.toString()}`;
  };

  return (
    <div>
      <PageHeader title="Listings" subtitle={status === 'pending' ? 'Review queue — approve listings so they go live.' : 'All hostels on the platform.'} />
      <form className="mb-4 flex flex-wrap gap-2" method="get">
        <Select name="status" defaultValue={status ?? 'all'} className="w-40" aria-label="Status">
          <option value="all">Any status</option>
          {HOSTEL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {HOSTEL_STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
        <Select name="partnerStatus" defaultValue={partnerStatus ?? ''} className="w-44" aria-label="Partner status">
          <option value="">Any partner status</option>
          {PARTNER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {PARTNER_STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
        <Select name="ownerPlan" defaultValue={ownerPlan ?? ''} className="w-32" aria-label="Plan">
          <option value="">Any plan</option>
          {OWNER_PLANS.map((p) => (
            <option key={p} value={p}>
              {p === 'pro' ? 'Pro' : 'Free'}
            </option>
          ))}
        </Select>
        <Input name="q" defaultValue={sp.q ?? ''} placeholder="Search name or area" className="w-56" />
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>
      {res.error !== null ? (
        <LoadError message={res.error} />
      ) : res.data.items.length === 0 ? (
        <EmptyState title={status === 'pending' ? 'Review queue is empty' : 'No hostels match'} />
      ) : (
        <>
          <Table head={['Hostel', 'Type', 'Status', 'Partner / plan', 'Contact', '']}>
            {res.data.items.map((h) => (
              <tr key={h.id}>
                <Td>
                  {h.status === 'live' ? (
                    <Link href={`/hostels/${h.slug}`} className="font-medium hover:text-brand">
                      {h.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{h.name}</span>
                  )}
                  <div className="text-xs text-muted">
                    {h.area}, {h.city} · added {timeAgo(h.createdAt)}
                  </div>
                  {h.description && <p className="mt-1 line-clamp-2 max-w-sm text-xs text-muted">{h.description}</p>}
                </Td>
                <Td>{GENDER_LABEL[h.genderType]}</Td>
                <Td>
                  <HostelStatusBadge status={h.status} />
                  {h.status === 'rejected' && h.rejectionReason && <div className="mt-1 max-w-[12rem] text-xs text-danger">{h.rejectionReason}</div>}
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    <PartnerBadge status={h.partnerStatus} />
                    <PlanBadge plan={h.ownerPlan} />
                  </div>
                </Td>
                <Td className="whitespace-nowrap text-muted">+91 {h.contactPhone}</Td>
                <Td>{h.status === 'pending' && <ListingDecision hostelId={h.id} />}</Td>
              </tr>
            ))}
          </Table>
          <Pager page={res.data.page} pageSize={res.data.pageSize} total={res.data.total} href={qs} />
        </>
      )}
    </div>
  );
}
