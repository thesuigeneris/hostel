import Link from 'next/link';
import { PartnerDecision } from '@/components/admin/actions';
import { EmptyState, PageHeader } from '@/components/ui/states';
import { load } from '@/components/owner/data';
import { LoadError, PlanBadge, Table, Td } from '@/components/owner/ui';
import { timeAgo } from '@/lib/format';
import { serverApi } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function AdminPartners() {
  const api = await serverApi();
  const [applied, verified] = await Promise.all([
    load(() => api.admin.hostels({ partnerStatus: 'applied' })),
    load(() => api.admin.hostels({ partnerStatus: 'verified' })),
  ]);
  return (
    <div className="space-y-8">
      <section>
        <PageHeader title="Partner applications" subtitle="Visit and inspect, then verify with a platform fee — or reject with a reason." />
        {applied.error !== null ? (
          <LoadError message={applied.error} />
        ) : applied.data.items.length === 0 ? (
          <EmptyState title="No pending applications" />
        ) : (
          <Table head={['Hostel', 'Plan', 'Contact', 'Decision']}>
            {applied.data.items.map((h) => (
              <tr key={h.id}>
                <Td>
                  <Link href={`/hostels/${h.slug}`} className="font-medium hover:text-brand">
                    {h.name}
                  </Link>
                  <div className="text-xs text-muted">
                    {h.address} · listed {timeAgo(h.createdAt)}
                  </div>
                </Td>
                <Td>
                  <PlanBadge plan={h.ownerPlan} />
                </Td>
                <Td className="whitespace-nowrap text-muted">+91 {h.contactPhone}</Td>
                <Td>
                  <PartnerDecision hostelId={h.id} />
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Verified partners ({verified.data?.total ?? 0})</h2>
        {verified.error !== null ? (
          <LoadError message={verified.error} />
        ) : verified.data.items.length === 0 ? (
          <EmptyState title="No verified partners yet" />
        ) : (
          <Table head={['Hostel', 'Area', 'Fee', 'Change fee']}>
            {verified.data.items.map((h) => (
              <tr key={h.id}>
                <Td>
                  <Link href={`/hostels/${h.slug}`} className="font-medium hover:text-brand">
                    {h.name}
                  </Link>
                </Td>
                <Td>{h.area}</Td>
                <Td className="font-semibold">{h.platformFeePct}%</Td>
                <Td>
                  <PartnerDecision hostelId={h.id} currentFee={h.platformFeePct} />
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </div>
  );
}
