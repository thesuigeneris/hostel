import { SUBSCRIPTION_STATUSES, type SubscriptionStatus } from '@hostels/shared';
import { Badge } from '@/components/ui/badge';
import { EmptyState, PageHeader } from '@/components/ui/states';
import { load } from '@/components/owner/data';
import { FilterChip } from '@/components/owner/filter-chip';
import { Pager } from '@/components/owner/pager';
import { LoadError, Table, Td } from '@/components/owner/ui';
import { DIET_LABEL, formatDate, MEAL_PLAN_LABEL, rupees, SUBSCRIPTION_STATUS_LABEL } from '@/lib/format';
import { serverApi } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function AdminSubscriptions({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const sp = await searchParams;
  const status = (SUBSCRIPTION_STATUSES as readonly string[]).includes(sp.status ?? '') ? (sp.status as SubscriptionStatus) : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const api = await serverApi();
  const [subs, moves, overdue] = await Promise.all([
    load(() => api.admin.subscriptions({ status, page })),
    load(() => api.admin.moves()),
    load(() => api.admin.overdueInvoices()),
  ]);
  const qs = (s?: string, p?: number) => {
    const q = new URLSearchParams();
    if (s) q.set('status', s);
    if (p && p > 1) q.set('page', String(p));
    return `?${q.toString()}`;
  };

  return (
    <div className="space-y-10">
      <section>
        <PageHeader title="Subscriptions" />
        <div className="mb-4 flex flex-wrap gap-2">
          <FilterChip href={qs()} active={!status}>
            All
          </FilterChip>
          {SUBSCRIPTION_STATUSES.map((s) => (
            <FilterChip key={s} href={qs(s)} active={status === s}>
              {SUBSCRIPTION_STATUS_LABEL[s]}
            </FilterChip>
          ))}
        </div>
        {subs.error !== null ? (
          <LoadError message={subs.error} />
        ) : subs.data.items.length === 0 ? (
          <EmptyState title="No subscriptions" />
        ) : (
          <>
            <Table head={['Tenant', 'Hostel', 'Plan', 'Started', 'Status', 'Bills']}>
              {subs.data.items.map((s) => (
                <tr key={s.id}>
                  <Td>
                    <div className="font-medium">{s.user.name || 'Tenant'}</div>
                    <div className="text-xs text-muted">+91 {s.user.phone}</div>
                  </Td>
                  <Td>{s.hostel.name}</Td>
                  <Td>
                    {MEAL_PLAN_LABEL[s.mealPlan]} · {DIET_LABEL[s.diet]}
                  </Td>
                  <Td>
                    {formatDate(s.startDate)}
                    {s.cancelAt && <div className="text-xs text-warn">ends {formatDate(s.cancelAt)}</div>}
                  </Td>
                  <Td>
                    <Badge tone={s.status === 'active' ? 'ok' : s.status === 'pending' ? 'warn' : 'neutral'}>{SUBSCRIPTION_STATUS_LABEL[s.status]}</Badge>
                  </Td>
                  <Td>{s.overdueInvoices > 0 ? <Badge tone="danger">{s.overdueInvoices} overdue</Badge> : '—'}</Td>
                </tr>
              ))}
            </Table>
            <Pager page={subs.data.page} pageSize={subs.data.pageSize} total={subs.data.total} href={(p) => qs(status, p)} />
          </>
        )}
      </section>

      <section id="moves" className="scroll-mt-20">
        <h2 className="mb-3 text-lg font-semibold">Moves</h2>
        {moves.error !== null ? (
          <LoadError message={moves.error} />
        ) : moves.data.length === 0 ? (
          <EmptyState title="No moves" />
        ) : (
          <Table head={['Subscription', 'From', 'To', 'Move date', 'Status']}>
            {moves.data.map((m) => (
              <tr key={m.id}>
                <Td className="font-mono text-xs">{m.subscriptionId}</Td>
                <Td className="font-mono text-xs">{m.fromHostelId}</Td>
                <Td className="font-mono text-xs">{m.toHostelId}</Td>
                <Td>{formatDate(m.moveDate)}</Td>
                <Td>
                  <Badge tone={m.status === 'scheduled' ? 'warn' : m.status === 'completed' ? 'ok' : 'neutral'}>{m.status}</Badge>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Overdue bills</h2>
        {overdue.error !== null ? (
          <LoadError message={overdue.error} />
        ) : overdue.data.length === 0 ? (
          <EmptyState title="Nothing overdue" />
        ) : (
          <Table head={['Invoice', 'Period', 'Amount', 'Due', 'Days late']}>
            {overdue.data.map((i) => (
              <tr key={i.id}>
                <Td className="font-mono text-xs">{i.id}</Td>
                <Td>
                  {formatDate(i.periodStart)} – {formatDate(i.periodEnd)}
                </Td>
                <Td className="font-semibold">{rupees(i.totalAmount)}</Td>
                <Td>{formatDate(i.dueDate)}</Td>
                <Td>
                  <Badge tone="danger">{Math.max(0, Math.round((Date.now() - new Date(`${i.dueDate}T00:00:00+05:30`).getTime()) / 86_400_000))}</Badge>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </div>
  );
}
