import Link from 'next/link';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState, PageHeader } from '@/components/ui/states';
import { load } from '@/components/owner/data';
import { HostelStatusBadge, LoadError, PartnerBadge, PlanBadge, Table, Td } from '@/components/owner/ui';
import { GENDER_LABEL } from '@/lib/format';
import { serverApi } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function OwnerHostels() {
  const api = await serverApi();
  const res = await load(() => api.owner.hostels());
  if (res.error !== null) return <LoadError message={res.error} />;
  const hostels = res.data;

  return (
    <div>
      <PageHeader title="Your hostels" actions={<ButtonLink href="/owner/hostels/new">Add a hostel</ButtonLink>} />
      {hostels.length === 0 ? (
        <EmptyState title="No hostels yet" action={<ButtonLink href="/owner/hostels/new">Add a hostel</ButtonLink>}>
          Listing is free and takes about ten minutes.
        </EmptyState>
      ) : (
        <Table head={['Hostel', 'Type', 'Status', 'Partner', 'Plan', '']}>
          {hostels.map((h) => (
            <tr key={h.id}>
              <Td>
                <Link href={`/owner/hostels/${h.id}`} className="font-medium hover:text-brand">
                  {h.name}
                </Link>
                <div className="text-xs text-muted">{h.area}, {h.city}</div>
              </Td>
              <Td>{GENDER_LABEL[h.genderType]}</Td>
              <Td>
                <HostelStatusBadge status={h.status} />
              </Td>
              <Td>
                <PartnerBadge status={h.partnerStatus} />
              </Td>
              <Td>
                <PlanBadge plan={h.ownerPlan} />
              </Td>
              <Td className="text-right">
                <Link href={`/owner/hostels/${h.id}`} className="text-sm text-brand hover:underline">
                  Manage
                </Link>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
