import { OWNER_PLAN_PRICING } from '@hostels/shared';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Stat } from '@/components/ui/card';
import { EmptyState, PageHeader } from '@/components/ui/states';
import { load } from '@/components/owner/data';
import { PlanSwitch } from '@/components/owner/plan-switch';
import { LoadError, PlanBadge, Table, Td } from '@/components/owner/ui';
import { formatDate, rupees } from '@/lib/format';
import { serverApi } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function BillingPage() {
  const api = await serverApi();
  const [hostels, invoices] = await Promise.all([load(() => api.owner.hostels()), load(() => api.owner.saasInvoices())]);
  if (hostels.error !== null) return <LoadError message={hostels.error} />;
  const names = new Map(hostels.data.map((h) => [h.id, h.name]));
  const proCount = hostels.data.filter((h) => h.ownerPlan === 'pro').length;
  const due = (invoices.data ?? []).filter((i) => i.status === 'due');

  return (
    <div className="space-y-8">
      <PageHeader title="Billing" subtitle={`Hostels Pro is ${rupees(OWNER_PLAN_PRICING.pro.price)} per hostel per month. Free plan costs nothing.`} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Hostels on Pro" value={`${proCount} / ${hostels.data.length}`} />
        <Stat label="Monthly software cost" value={rupees(proCount * OWNER_PLAN_PRICING.pro.price)} />
        <Stat label="Amount due" value={rupees(due.reduce((s, i) => s + i.amount, 0))} />
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Plans</h2>
        {hostels.data.length === 0 ? (
          <EmptyState title="No hostels yet" />
        ) : (
          <Table head={['Hostel', 'Plan', '']}>
            {hostels.data.map((h) => (
              <tr key={h.id}>
                <Td className="font-medium">{h.name}</Td>
                <Td>
                  <PlanBadge plan={h.ownerPlan} />
                </Td>
                <Td>
                  <PlanSwitch hostelId={h.id} plan={h.ownerPlan} />
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Invoices</h2>
        {invoices.error !== null ? (
          <LoadError message={invoices.error} />
        ) : invoices.data.length === 0 ? (
          <EmptyState title="No invoices yet">Invoices appear when you upgrade a hostel to Pro.</EmptyState>
        ) : (
          <Table head={['Month', 'Hostel', 'Amount', 'Due', 'Status', '']}>
            {[...invoices.data]
              .sort((a, b) => b.periodMonth.localeCompare(a.periodMonth))
              .map((i) => (
                <tr key={i.id}>
                  <Td className="font-medium">{i.periodMonth}</Td>
                  <Td>{names.get(i.hostelId) ?? i.hostelId}</Td>
                  <Td>{rupees(i.amount)}</Td>
                  <Td>{formatDate(i.dueDate)}</Td>
                  <Td>
                    <Badge tone={i.status === 'paid' ? 'ok' : i.status === 'due' ? 'warn' : 'neutral'}>{i.status === 'paid' ? `Paid ${formatDate(i.paidAt)}` : i.status === 'due' ? 'Due' : 'Cancelled'}</Badge>
                  </Td>
                  <Td className="text-right">
                    {i.status === 'due' && (
                      <ButtonLink href={`/pay/${i.id}`} size="sm" variant="food">
                        Pay
                      </ButtonLink>
                    )}
                  </Td>
                </tr>
              ))}
          </Table>
        )}
      </section>
    </div>
  );
}
