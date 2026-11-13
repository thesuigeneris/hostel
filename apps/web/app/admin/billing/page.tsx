import { type AdminOwnerInvoice, OWNER_PLAN_TIERS, OWNER_PLANS, type OwnerPlanTier, REFUND_REASON_LABEL } from '@hostels/shared';
import Link from 'next/link';
import { SubmitButton } from '@/components/SubmitButton';
import { Back, Badge, Checkbox, Field, Flash, Input, PageHeader, pillClass, Select, Stat, StatusBadge, Table, Td } from '@/components/ui';
import { api } from '@/lib/api';
import { dateLabel, monthLabel, notCountedLabel, PAYMENT_MODE_LABEL, planLabel, rupees } from '@/lib/format';
import { markRefundedAction, voidOwnerBillAction } from '../actions';

type Props = { searchParams: Promise<{ q?: string; plan?: string; paused?: string; bills?: string; error?: string; ok?: string }> };

const BILL_FILTERS = { all: 'All', due: 'Unpaid', overdue: 'Overdue', paid: 'Paid', waived: 'Waived' } as const;

/** Waived (an admin chose to) is told apart from cancelled (a plan change dropped the bill). */
const billStatus = (b: AdminOwnerInvoice) => (b.isOverdue ? 'overdue' : b.status === 'void' && b.paymentMode === 'waived' ? 'waived' : b.status);

export default async function AdminBilling({ searchParams }: Props) {
  const q = await searchParams;
  const plan = OWNER_PLAN_TIERS.includes(q.plan as OwnerPlanTier) ? (q.plan as OwnerPlanTier) : undefined;
  const billFilter = (q.bills && q.bills in BILL_FILTERS ? q.bills : 'all') as keyof typeof BILL_FILTERS;
  const client = await api();
  const filtered = !!(q.q || plan || q.paused === '1');
  const [subs, overdue, plans, allPlans, ownerBills, moves, refunds, revenue] = await Promise.all([
    client.admin.subscriptions(),
    client.admin.overdue(),
    client.admin.ownerPlans({ q: q.q, plan, suspended: q.paused === '1' ? true : undefined }),
    filtered ? client.admin.ownerPlans() : null,
    client.admin.ownerInvoices({
      q: q.q,
      overdue: billFilter === 'overdue' ? true : undefined,
      status: billFilter === 'due' || billFilter === 'paid' ? billFilter : undefined,
      mode: billFilter === 'waived' ? 'waived' : undefined,
    }),
    client.admin.moves(),
    client.admin.paymentExceptions(),
    client.admin.revenue(),
  ]);
  const params = new URLSearchParams(Object.entries({ q: q.q, plan: q.plan, paused: q.paused, bills: q.bills }).filter((e): e is [string, string] => !!e[1]));
  const path = `/admin/billing${params.size ? `?${params}` : ''}`;
  const totals = allPlans ?? plans;
  const refundsDue = refunds.filter((r) => r.status === 'refund_due');

  return (
    <>
      <PageHeader title="Subscriptions & bills" />
      <Flash error={q.error} ok={q.ok} />

      <section id="refunds" aria-labelledby="refunds-heading" className="mb-8">
        <h2 id="refunds-heading" className="mb-1 text-lg font-semibold">Payments to refund ({refundsDue.length})</h2>
        <p className="mb-3 text-sm text-ink-soft">
          Money that reached us after its bill had closed (the bed hold ran out and the bed went, the bill was waived or already paid).
          Refund it in the Razorpay dashboard, then record it here.
        </p>
        {refunds.length === 0 ? <p className="text-sm text-ink-soft">None. Every payment so far was applied to its bill.</p> : (
          <Table head={['Payer', 'Hostel', 'Amount', 'Why', 'Received', 'Refund']}>
            {refunds.map((r) => (
              <tr key={r.id}>
                <Td><div>{r.payer.name || '—'}</div><div className="text-xs text-ink-muted">+91 {r.payer.phone}</div></Td>
                <Td>{r.hostelName}<div className="text-xs text-ink-muted">{r.billKind === 'owner' ? 'Owner plan bill' : 'Tenant bill'}</div></Td>
                <Td>{rupees(r.amount)}<div className="text-xs text-ink-muted">{PAYMENT_MODE_LABEL[r.paymentMode]} · {r.razorpayPaymentId}</div></Td>
                <Td className="max-w-xs text-sm">{REFUND_REASON_LABEL[r.reason]}</Td>
                <Td>{dateLabel(r.createdAt)}</Td>
                <Td>
                  {r.status === 'refund_due' ? (
                    <form action={markRefundedAction} className="flex items-center gap-2">
                      <Back to={path} /><input type="hidden" name="id" value={r.id} />
                      <Input name="note" required minLength={3} placeholder="Refund reference" className="h-9 w-40" aria-label={`How the ${rupees(r.amount)} payment from ${r.payer.name || r.payer.phone} was refunded`} />
                      <SubmitButton size="sm" variant="secondary" confirm="Record this payment as refunded?">Mark refunded</SubmitButton>
                    </form>
                  ) : (
                    <div><StatusBadge kind="refund" status={r.status} /><div className="text-xs text-ink-muted">{dateLabel(r.refundedAt)}{r.refundNote ? ` · ${r.refundNote}` : ''}</div></div>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <h2 className="mb-3 text-lg font-semibold">Owner plans</h2>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Paying plans" value={totals.filter((p) => p.plan !== 'free' && !p.inTrial).length} hint={`${totals.filter((p) => p.inTrial).length} in free trial`} />
        <Stat
          label={`Plan bills paid · ${monthLabel(revenue.month)}`}
          value={rupees(revenue.ownerPlans)}
          hint={notCountedLabel(revenue.notCounted.owner) ?? 'Real money only: live Razorpay payments'}
        />
        <Stat label="Owed by owners" value={rupees(totals.reduce((n, p) => n + p.amountDue, 0))} />
        <Stat label="Paused hostels" value={totals.filter((p) => p.suspended).length} hint="Bill 15+ days overdue" />
      </div>
      <form className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-64">
          <Field label="Search">
            <Input name="q" defaultValue={q.q} placeholder="Hostel, area, owner or phone" />
          </Field>
        </div>
        <div className="w-40">
          <Field label="Plan">
            <Select name="plan" defaultValue={plan ?? ''}>
              <option value="">All plans</option>
              {OWNER_PLAN_TIERS.map((t) => <option key={t} value={t}>{OWNER_PLANS[t].label}</option>)}
            </Select>
          </Field>
        </div>
        <Checkbox name="paused" value="1" defaultChecked={q.paused === '1'} label="Paused only" />
        {q.bills && <input type="hidden" name="bills" value={q.bills} />}
        <SubmitButton variant="secondary">Filter</SubmitButton>
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
        <nav aria-label="Filter bills" className="flex flex-wrap gap-2 text-sm">
          {Object.entries(BILL_FILTERS).map(([k, label]) => {
            const next = new URLSearchParams(params);
            if (k === 'all') next.delete('bills');
            else next.set('bills', k);
            return (
              <Link
                key={k}
                href={`/admin/billing${next.size ? `?${next}` : ''}`}
                aria-current={k === billFilter ? 'page' : undefined}
                className={pillClass(k === billFilter)}
              >
                {label}
              </Link>
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
                <Td>
                  <StatusBadge kind="invoice" status={billStatus(b)} />
                  {b.status === 'paid' && b.paymentMode && b.paymentMode !== 'razorpay_live' && <div className="text-xs text-ink-muted">{PAYMENT_MODE_LABEL[b.paymentMode]}</div>}
                </Td>
                <Td>
                  {b.status === 'due' && (
                    <form action={voidOwnerBillAction} className="flex items-center gap-2">
                      <Back to={path} /><input type="hidden" name="id" value={b.id} />
                      <Input name="reason" required minLength={3} placeholder="Reason" className="h-9 w-36" aria-label={`Reason for waiving the ${b.hostelName} bill`} />
                      <SubmitButton size="sm" variant="secondary" confirm="Waive this bill? The owner will not be asked to pay it.">Waive</SubmitButton>
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
              <Td><StatusBadge kind="subscription" status={s.subscription.status} /></Td>
            </tr>
          ))}
        </Table>
      </div>
      <h2 className="mb-3 text-lg font-semibold">Scheduled moves ({moves.filter((m) => m.status === 'scheduled').length})</h2>
      <Table head={['Move date', 'Status', 'Created']}>
        {moves.map((m) => <tr key={m.id}><Td>{dateLabel(m.moveDate)}</Td><Td><StatusBadge kind="move" status={m.status} /></Td><Td>{dateLabel(m.createdAt)}</Td></tr>)}
      </Table>
    </>
  );
}
