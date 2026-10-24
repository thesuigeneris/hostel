import { Badge } from '@/components/ui/badge';
import { Stat } from '@/components/ui/card';
import { EmptyState, PageHeader } from '@/components/ui/states';
import { load } from '@/components/owner/data';
import { LoadError, Table, Td } from '@/components/owner/ui';
import { formatDate, rupees } from '@/lib/format';
import { serverApi } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function PayoutsPage() {
  const api = await serverApi();
  const [payouts, hostels] = await Promise.all([load(() => api.owner.payouts()), load(() => api.owner.hostels())]);
  if (payouts.error !== null) return <LoadError message={payouts.error} />;
  const names = new Map((hostels.data ?? []).map((h) => [h.id, h.name]));
  const list = [...payouts.data].sort((a, b) => b.periodMonth.localeCompare(a.periodMonth));
  const paid = list.filter((p) => p.status === 'paid').reduce((s, p) => s + p.netAmount, 0);
  const pending = list.filter((p) => p.status === 'pending').reduce((s, p) => s + p.netAmount, 0);

  return (
    <div>
      <PageHeader title="Payouts" subtitle="Monthly statements for subscription revenue we collected on your behalf." />
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <Stat label="Pending payout" value={rupees(pending)} />
        <Stat label="Paid to date" value={rupees(paid)} />
      </div>
      {list.length === 0 ? (
        <EmptyState title="No payouts yet">Statements are generated each month for verified partner hostels with paid subscriber bills.</EmptyState>
      ) : (
        <Table head={['Month', 'Hostel', 'Collected', 'Platform fee', 'You receive', 'Status']}>
          {list.map((p) => (
            <tr key={p.id}>
              <Td className="font-medium">{formatDate(`${p.periodMonth}-01`, { month: 'long', year: 'numeric' })}</Td>
              <Td>{names.get(p.hostelId) ?? p.hostelId}</Td>
              <Td>{rupees(p.grossAmount)}</Td>
              <Td className="text-muted">− {rupees(p.platformFee)}</Td>
              <Td className="font-semibold">{rupees(p.netAmount)}</Td>
              <Td>{p.status === 'paid' ? <Badge tone="ok">Paid {p.paidAt && formatDate(p.paidAt)}</Badge> : <Badge tone="warn">Pending</Badge>}</Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
