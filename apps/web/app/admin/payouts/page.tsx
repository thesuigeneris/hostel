import { addMonths, istDate, monthOf } from '@hostels/shared';
import { GeneratePayouts, MarkPayoutPaid } from '@/components/admin/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { EmptyState, PageHeader } from '@/components/ui/states';
import { load } from '@/components/owner/data';
import { LoadError, Table, Td } from '@/components/owner/ui';
import { formatDate, rupees } from '@/lib/format';
import { serverApi } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function AdminPayouts({ searchParams }: { searchParams: Promise<{ periodMonth?: string }> }) {
  const sp = await searchParams;
  const periodMonth = /^\d{4}-\d{2}$/.test(sp.periodMonth ?? '') ? sp.periodMonth : undefined;
  const lastMonth = monthOf(addMonths(`${monthOf(istDate())}-01`, -1));
  const api = await serverApi();
  const res = await load(() => api.admin.payouts(periodMonth));
  const totals = (res.data ?? []).reduce((t, p) => ({ gross: t.gross + p.grossAmount, fee: t.fee + p.platformFee, net: t.net + p.netAmount }), { gross: 0, fee: 0, net: 0 });

  return (
    <div>
      <PageHeader title="Payouts" subtitle="Generate monthly owner payouts from paid subscription bills, then mark them paid after the bank transfer." />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <GeneratePayouts defaultMonth={lastMonth} />
        <form method="get" className="flex gap-2">
          <Input type="month" name="periodMonth" defaultValue={periodMonth ?? ''} className="w-44" aria-label="Filter month" />
          <Button type="submit" variant="secondary">
            Show month
          </Button>
        </form>
      </div>
      {res.error !== null ? (
        <LoadError message={res.error} />
      ) : res.data.length === 0 ? (
        <EmptyState title="No payouts">Generate payouts for a month to create statements.</EmptyState>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">
            Collected {rupees(totals.gross)} · platform fees {rupees(totals.fee)} · owed to owners {rupees(totals.net)}
          </p>
          <Table head={['Month', 'Hostel', 'Gross', 'Fee', 'Net', 'Status', '']}>
            {res.data.map((p) => (
              <tr key={p.id}>
                <Td>{p.periodMonth}</Td>
                <Td className="font-mono text-xs">{p.hostelId}</Td>
                <Td>{rupees(p.grossAmount)}</Td>
                <Td>{rupees(p.platformFee)}</Td>
                <Td className="font-semibold">{rupees(p.netAmount)}</Td>
                <Td>{p.status === 'paid' ? <Badge tone="ok">Paid {formatDate(p.paidAt)}</Badge> : <Badge tone="warn">Pending</Badge>}</Td>
                <Td>{p.status === 'pending' && <MarkPayoutPaid payoutId={p.id} />}</Td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </div>
  );
}
