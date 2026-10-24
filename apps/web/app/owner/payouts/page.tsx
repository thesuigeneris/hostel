import { Empty, PageHeader, StatusBadge, Table, Td } from '@/components/ui';
import { api } from '@/lib/api';
import { dateLabel, monthLabel, rupees } from '@/lib/format';

export default async function PayoutsPage() {
  const data = await (await api()).owner.payouts();
  return (
    <>
      <PageHeader title="Payouts" subtitle="Rent and food paid online by your subscribers, minus the platform fee. Paid out monthly." />
      <h2 className="mb-3 text-lg font-semibold">So far in {monthLabel(data.thisMonth.month)}</h2>
      {data.thisMonth.hostels.length === 0 ? <Empty title="No online payments yet this month" /> : (
        <Table head={['Hostel', 'Collected', 'Platform fee', 'You get']}>
          {data.thisMonth.hostels.map((h) => (
            <tr key={h.hostelId}>
              <Td className="font-medium">{h.hostelName}</Td><Td>{rupees(h.grossAmount)}</Td><Td>−{rupees(h.platformFee)}</Td><Td className="font-medium">{rupees(h.netAmount)}</Td>
            </tr>
          ))}
        </Table>
      )}
      <h2 className="mb-3 mt-8 text-lg font-semibold">History</h2>
      {data.history.length === 0 ? <p className="text-sm text-ink-soft">No payouts yet.</p> : (
        <Table head={['Month', 'Hostel', 'Collected', 'Fee', 'Net', 'Status']}>
          {data.history.map((p) => (
            <tr key={p.id}>
              <Td>{monthLabel(p.periodMonth)}</Td><Td>{p.hostelName}</Td><Td>{rupees(p.grossAmount)}</Td><Td>−{rupees(p.platformFee)}</Td>
              <Td className="font-medium">{rupees(p.netAmount)}</Td>
              <Td><StatusBadge status={p.status} />{p.paidAt && <div className="text-xs text-ink-muted">{dateLabel(p.paidAt)}</div>}</Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
