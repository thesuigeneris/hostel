import { istDate, monthOf } from '@hostels/shared';
import { SubmitButton } from '@/components/SubmitButton';
import { Back, Card, Empty, Flash, Input, PageHeader, StatusBadge, Table, Td } from '@/components/ui';
import { api } from '@/lib/api';
import { dateLabel, monthLabel, rupees } from '@/lib/format';
import { generatePayoutsAction, markPayoutPaidAction } from '../actions';

function lastMonth() {
  const [y, m] = monthOf(istDate()).split('-').map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

export default async function AdminPayouts({ searchParams }: { searchParams: Promise<{ month?: string; error?: string; ok?: string }> }) {
  const q = await searchParams;
  const month = q.month && /^\d{4}-\d{2}$/.test(q.month) ? q.month : lastMonth();
  const payouts = await (await api()).admin.payouts(month);
  const path = `/admin/payouts?month=${month}`;
  return (
    <>
      <PageHeader title="Payouts" subtitle="Generate after a month closes. Bills paid in that month count, minus each hostel's fee." />
      <Flash error={q.error} ok={q.ok} />
      <Card className="mb-6 flex flex-wrap items-end gap-3">
        <form className="flex items-end gap-2">
          <label className="text-sm"><span className="mb-1 block font-medium">Month</span><Input type="month" name="month" defaultValue={month} className="w-44" /></label>
          <SubmitButton variant="secondary">Show</SubmitButton>
        </form>
        <form action={generatePayoutsAction}>
          <input type="hidden" name="month" value={month} />
          <SubmitButton>Generate for {monthLabel(month)}</SubmitButton>
        </form>
      </Card>
      {payouts.length === 0 ? <Empty title={`No payouts for ${monthLabel(month)} yet`} /> : (
        <Table head={['Hostel', 'Collected', 'Fee', 'Net', 'Status', '']}>
          {payouts.map((p) => (
            <tr key={p.id}>
              <Td className="font-medium">{p.hostelName}</Td><Td>{rupees(p.grossAmount)}</Td><Td>{rupees(p.platformFee)}</Td><Td className="font-medium">{rupees(p.netAmount)}</Td>
              <Td><StatusBadge status={p.status} />{p.paidAt && <div className="text-xs text-ink-muted">{dateLabel(p.paidAt)}</div>}</Td>
              <Td>
                {p.status === 'pending' && (
                  <form action={markPayoutPaidAction}><Back to={path} /><input type="hidden" name="id" value={p.id} /><SubmitButton size="sm" variant="secondary" confirm="Mark this payout as transferred?">Mark paid</SubmitButton></form>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
