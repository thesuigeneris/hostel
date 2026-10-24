import { OWNER_PLAN_TIERS, OWNER_PLANS, type OwnerPlanTier } from '@hostels/shared';
import Link from 'next/link';
import { SubmitButton } from '@/components/SubmitButton';
import { Back, Badge, Flash, Input, PageHeader, Select, Stat, StatusBadge, Table, Td } from '@/components/ui';
import { api } from '@/lib/api';
import { dateLabel, planLabel, rupees } from '@/lib/format';
import { voidOwnerBillAction } from '../actions';

type Props = { searchParams: Promise<{ q?: string; plan?: string; paused?: string; bills?: string; error?: string; ok?: string }> };

const BILL_FILTERS = { all: 'All', due: 'Unpaid', overdue: 'Overdue', paid: 'Paid', void: 'Waived' } as const;

export default async function AdminBilling({ searchParams }: Props) {
  const q = await searchParams;
  const plan = OWNER_PLAN_TIERS.includes(q.plan as OwnerPlanTier) ? (q.plan as OwnerPlanTier) : undefined;
  const billFilter = (q.bills && q.bills in BILL_FILTERS ? q.bills : 'all') as keyof typeof BILL_FILTERS;
  const client = await api();
  const filtered = !!(q.q || plan || q.paused === '1');
  const [subs, overdue, plans, allPlans, ownerBills, moves] = await Promise.all([
    client.admin.subscriptions(),
    client.admin.overdue(),
    client.admin.ownerPlans({ q: q.q, plan, suspended: q.paused === '1' ? true : undefined }),
    filtered ? client.admin.ownerPlans() : null,
    client.admin.ownerInvoices({
      q: q.q,
      overdue: billFilter === 'overdue' ? true : undefined,
      status: billFilter === 'due' || billFilter === 'paid' || billFilter === 'void' ? billFilter : undefined,
    }),
    client.admin.moves(),
  ]);
  const params = new URLSearchParams(Object.entries({ q: q.q, plan: q.plan, paused: q.paused, bills: q.bills }).filter((e): e is [string, string] => !!e[1]));
  const path = `/admin/billing${params.size ? `?${params}` : ''}`;
  const totals = allPlans ?? plans;
  const mrr = totals.filter((p) => !p.inTrial && !p.suspended).reduce((n, p) => n + OWNER_PLANS[p.plan].price, 0);

  return (
    <>
      <PageHeader title="Subscriptions & bills" />
      <Flash error={q.error} ok={q.ok} />

      <h2 className="mb-3 text-lg font-semibold">Owner plans</h2>
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat label="Paying plans" value={totals.filter((p) => p.plan !== 'free' && !p.inTrial).length} hint={`${totals.filter((p) => p.inTrial).length} in free trial`} />
        <Stat label="Monthly plan revenue" value={rupees(mrr)} hint="Pro and Partner, outside trial, not paused" />
        <Stat label="Owed by owners" value={rupees(totals.reduce((n, p) => n + p.amountDue, 0))} />
        <Stat label="Paused hostels" value={totals.filter((p) => p.suspended).length} hint="Bill 15+ days overdue" />
      </div>
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <span className="w-64 flex-none"><Input name="q" defaultValue={q.q} placeholder="Hostel, area, owner or phone" className="h-9" aria-label="Search" /></span>
        <span className="w-36 flex-none"><Select name="plan" defaultValue={plan ?? ''} className="h-9" aria-label="Plan">
          <option value="">All plans</option>
          {OWNER_PLAN_TIERS.map((t) => <option key={t} value={t}>{OWNER_PLANS[t].label}</option>)}
        </Select></span>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="paused" value="1" defaultChecked={q.paused === '1'} /> Paused only</label>
        {q.bills && <input type="hidden" name="bills" value={q.bills} />}
        <SubmitButton size="sm" variant="secondary">Filter</SubmitButton>
      </form>
      <div className="mb-8">
        {plans.length === 0 ? <p className="text-sm text-ink-soft">No hostels match.</p> : (
          <Table head={['Hostel', 'Owner', 'Plan', 'Since', 'Owes', 'State']}>
            {plans.map((p) => (
              <tr key={p.id}>
                <Td><div className="font-medium">{p.hostelName}</div><div className="text-xs text-ink-muted">{p.area}</div></Td>
                <Td><div>{p.owner.name || '—'}</div><div className="text-xs text-ink-muted">+91 {p.owner.phone}</div></Td>
                <Td>
                  {OWNER_PLANS[p.plan].label}
                  {p.pendingPlan && <div className="text-xs text-ink-muted">→ {OWNER_PLANS[p.pendingPlan].label}{p.pendingPlanOn ? ` on ${dateLabel(p.pendingPlanOn)}` : ' (application)'}</div>}
                </Td>
                <Td>{dateLabel(p.startDate)}{p.inTrial && p.trialEndsOn && <div className="text-xs text-ink-muted">trial to {dateLabel(p.trialEndsOn)}</div>}</Td>
                <Td className={p.overdueBills ? 'text-danger' : ''}>{p.amountDue ? rupees(p.amountDue) : '—'}{p.overdueBills > 0 && <div className="text-xs">{p.overdueBills} overdue</div>}</Td>
                <Td>{p.suspended ? <Badge tone="red">Paused</Badge> : p.plan === 'free' ? <Badge>Free</Badge> : <Badge tone="green">Active</Badge>}</Td>
              </tr>
            ))}
          </Table>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Owner plan bills ({ownerBills.length})</h2>
        <nav className="flex gap-2 text-sm">
          {Object.entries(BILL_FILTERS).map(([k, label]) => {
            const next = new URLSearchParams(params);
            if (k === 'all') next.delete('bills');
            else next.set('bills', k);
            return (
              <Link key={k} href={`/admin/billing${next.size ? `?${next}` : ''}`} className={k === billFilter ? 'rounded-full bg-brand px-3 py-1 text-white no-underline' : 'rounded-full bg-surface px-3 py-1 text-ink-soft no-underline'}>{label}</Link>
            );
          })}
        </nav>
      </div>
      <div className="mb-8">
        {ownerBills.length === 0 ? <p className="text-sm text-ink-soft">No bills.</p> : (
          <Table head={['Hostel', 'Plan', 'Period', 'Amount', 'Due', 'Status', '']}>
            {ownerBills.map((b) => (
              <tr key={b.id}>
                <Td><div>{b.hostelName}</div><div className="text-xs text-ink-muted">{b.ownerName || '—'} · +91 {b.ownerPhone}</div></Td>
                <Td>{OWNER_PLANS[b.plan].label}</Td>
                <Td>{dateLabel(b.periodStart)} – {dateLabel(b.periodEnd)}</Td>
                <Td>{rupees(b.amount)}</Td>
                <Td>{dateLabel(b.dueDate)}</Td>
                <Td><StatusBadge status={b.isOverdue ? 'overdue' : b.status} /></Td>
                <Td>
                  {b.status === 'due' && (
                    <form action={voidOwnerBillAction} className="flex gap-1">
                      <Back to={path} /><input type="hidden" name="id" value={b.id} />
                      <span className="w-32 flex-none"><Input name="reason" required minLength={3} placeholder="Reason" className="h-8" aria-label="Reason for waiving" /></span>
                      <SubmitButton size="sm" variant="ghost" confirm="Waive this bill? The owner will not be asked to pay it.">Waive</SubmitButton>
                    </form>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </div>

      <h2 className="mb-3 text-lg font-semibold">Overdue tenant bills ({overdue.length})</h2>
      {overdue.length === 0 ? <p className="mb-8 text-sm text-ink-soft">Nothing overdue.</p> : (
        <div className="mb-8">
          <Table head={['Tenant', 'Phone', 'Hostel', 'Amount', 'Due']}>
            {overdue.map((o) => (
              <tr key={o.invoice.id}><Td>{o.userName}</Td><Td>+91 {o.phone}</Td><Td>{o.hostelName}</Td><Td>{rupees(o.invoice.totalAmount)}</Td><Td className="text-danger">{dateLabel(o.invoice.dueDate)}</Td></tr>
            ))}
          </Table>
        </div>
      )}
      <h2 className="mb-3 text-lg font-semibold">Subscriptions ({subs.length})</h2>
      <div className="mb-8">
        <Table head={['Tenant', 'Hostel', 'Food', 'Since', 'Status']}>
          {subs.map((s) => (
            <tr key={s.subscription.id}>
              <Td><div>{s.user.name || '—'}</div><div className="text-xs text-ink-muted">+91 {s.user.phone}</div></Td>
              <Td>{s.hostelName}</Td>
              <Td>{planLabel(s.subscription.mealPlan)}</Td>
              <Td>{dateLabel(s.subscription.startDate)}{s.subscription.cancelAt && <div className="text-xs text-ink-muted">ends {dateLabel(s.subscription.cancelAt)}</div>}</Td>
              <Td><StatusBadge status={s.subscription.status} /></Td>
            </tr>
          ))}
        </Table>
      </div>
      <h2 className="mb-3 text-lg font-semibold">Scheduled moves ({moves.filter((m) => m.status === 'scheduled').length})</h2>
      <Table head={['Move date', 'Status', 'Created']}>
        {moves.map((m) => <tr key={m.id}><Td>{dateLabel(m.moveDate)}</Td><Td><StatusBadge status={m.status} /></Td><Td>{dateLabel(m.createdAt)}</Td></tr>)}
      </Table>
    </>
  );
}
