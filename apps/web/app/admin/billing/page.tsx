import { Badge } from '@/components/ui/badge';
import { Stat } from '@/components/ui/card';
import { EmptyState, PageHeader } from '@/components/ui/states';
import { load } from '@/components/owner/data';
import { LoadError, Table, Td } from '@/components/owner/ui';
import { formatDate, rupees } from '@/lib/format';
import { serverApi } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function AdminBilling() {
  const api = await serverApi();
  const res = await load(() => api.admin.saasInvoices());
  if (res.error !== null) return <LoadError message={res.error} />;
  const list = [...res.data].sort((a, b) => b.periodMonth.localeCompare(a.periodMonth));
  const sum = (s: string) => list.filter((i) => i.status === s).reduce((t, i) => t + i.amount, 0);

  return (
    <div>
      <PageHeader title="Owner billing" subtitle="Hostels Pro software invoices." />
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <Stat label="Collected" value={rupees(sum('paid'))} />
        <Stat label="Outstanding" value={rupees(sum('due'))} />
      </div>
      {list.length === 0 ? (
        <EmptyState title="No owner invoices yet" />
      ) : (
        <Table head={['Month', 'Hostel', 'Owner', 'Amount', 'Due', 'Status']}>
          {list.map((i) => (
            <tr key={i.id}>
              <Td>{i.periodMonth}</Td>
              <Td className="font-mono text-xs">{i.hostelId}</Td>
              <Td className="font-mono text-xs">{i.ownerId}</Td>
              <Td>{rupees(i.amount)}</Td>
              <Td>{formatDate(i.dueDate)}</Td>
              <Td>
                <Badge tone={i.status === 'paid' ? 'ok' : i.status === 'due' ? 'warn' : 'neutral'}>{i.status === 'paid' ? `Paid ${formatDate(i.paidAt)}` : i.status === 'due' ? 'Due' : 'Void'}</Badge>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
