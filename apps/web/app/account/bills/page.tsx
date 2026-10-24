import { LoadError } from '@/components/public/load-error';
import { load } from '@/components/public/safe';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { formatDate, formatDateTime, rupees } from '@/lib/format';
import { serverApi } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function BillsPage() {
  const r = await load((await serverApi()).tenant.invoices());
  if (!r.ok) return <LoadError message={r.message} retryHref="/account/bills" />;
  const bills = [...r.data].filter((b) => b.status !== 'void').sort((a, b) => b.periodStart.localeCompare(a.periodStart));
  if (bills.length === 0) {
    return <EmptyState title="No bills yet">Bills appear here once you subscribe. Each one is raised 5 days before your month starts.</EmptyState>;
  }
  return (
    <Card className="divide-y divide-line">
      {bills.map((b) => (
        <div key={b.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div>
            <div className="font-medium">
              {formatDate(b.periodStart)} – {formatDate(b.periodEnd)}
            </div>
            <div className="text-xs text-muted">
              Rent {rupees(b.rentAmount)} · Food {rupees(b.foodAmount)}
              {b.creditAmount > 0 && <span className="text-ok"> · Credit −{rupees(b.creditAmount)}</span>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold">{rupees(b.totalAmount)}</span>
            {b.status === 'paid' ? (
              <Badge tone="ok">Paid {b.paidAt ? formatDateTime(b.paidAt) : ''}</Badge>
            ) : (
              <>
                {b.overdue ? <Badge tone="danger">Overdue</Badge> : <Badge tone="warn">Due {formatDate(b.dueDate)}</Badge>}
                <ButtonLink href={`/pay/${b.id}`} size="sm">Pay</ButtonLink>
              </>
            )}
          </div>
        </div>
      ))}
    </Card>
  );
}
