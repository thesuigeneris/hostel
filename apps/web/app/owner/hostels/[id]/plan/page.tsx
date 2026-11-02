import { OWNER_BILLING_RULES, OWNER_PLAN_FEATURES, OWNER_PLAN_TIERS, OWNER_PLANS, PARTNER_REQUIREMENTS, pausesOn, planPriceLine } from '@hostels/shared';
import Link from 'next/link';
import { changePlanAction } from '@/app/owner/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { Badge, Card, Flash, LinkButton, StatusBadge, Table, Td } from '@/components/ui';
import { api } from '@/lib/api';
import { dateLabel, PAYMENT_MODE_LABEL, rupees } from '@/lib/format';
import { ownerHostel } from '@/lib/owner';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> };

export default async function PlanPage({ params, searchParams }: Props) {
  const { id } = await params;
  const q = await searchParams;
  const client = await api();
  const [info, hostel, partner] = await Promise.all([client.owner.plan(id), ownerHostel(id), client.owner.partnerInfo(id)]);
  const app = partner.application;
  const current = info.plan?.plan ?? 'free';
  const unpaid = info.bills.filter((b) => b.status === 'due').sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const due = unpaid[0];
  // A scheduled downgrade can be called off; a partner application waits for our team instead.
  const scheduled = info.plan?.pendingPlan && info.plan.pendingPlanOn ? info.plan : null;
  const rank = (t: string) => OWNER_PLAN_TIERS.indexOf(t as (typeof OWNER_PLAN_TIERS)[number]);

  return (
    <div className="space-y-6">
      <Flash error={q.error} ok={q.ok} />
      {info.plan?.suspended && (
        <Card role="alert" className="border-danger/40 bg-danger-soft">
          <div className="font-medium text-ink">Paid features are paused</div>
          <p className="mt-1 text-sm text-ink-soft">
            A plan bill is more than 15 days overdue, so this hostel has the Free features for now. Your listing, residents and records are kept, and
            everything comes back the moment the bill is paid.
          </p>
        </Card>
      )}
      {due && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-food bg-food-soft">
          <div className="min-w-0">
            <div className="font-medium">{due.isOverdue ? 'Your plan bill is overdue' : 'Plan bill ready'}</div>
            <div className="text-sm text-ink-soft">
              {rupees(due.amount)} for {dateLabel(due.periodStart)} – {dateLabel(due.periodEnd)}, due {dateLabel(due.dueDate)}.
              {!info.plan?.suspended && ` Unpaid on ${dateLabel(pausesOn(due.dueDate))}, paid features pause.`}
              {unpaid.length > 1 && ` ${unpaid.length} bills unpaid, ${rupees(unpaid.reduce((n, b) => n + b.amount, 0))} in all.`}
            </div>
          </div>
          <LinkButton href={`/pay/${due.id}`} variant="food">Pay now</LinkButton>
        </Card>
      )}
      {scheduled && (
        <Card className="text-sm">
          Switching to <strong>{OWNER_PLANS[scheduled.pendingPlan!].label}</strong> on {dateLabel(scheduled.pendingPlanOn)}, at the end of the month you paid
          for. Choose {OWNER_PLANS[current].label} below to keep your current plan.
        </Card>
      )}
      {info.inTrial && info.plan?.trialEndsOn && (
        <Card className="bg-brand-soft/40 text-sm">Free month until {dateLabel(info.plan.trialEndsOn)}. Your first bill comes after that, 5 days ahead of its month.</Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {OWNER_PLAN_TIERS.map((t) => {
          const isCurrent = t === current;
          const applied = t === 'partner' && info.partnerStatus === 'applied';
          return (
            <Card key={t} className={isCurrent ? 'flex flex-col border-brand ring-2 ring-brand/20' : 'flex flex-col'}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">{OWNER_PLANS[t].label}</h2>
                {isCurrent && <Badge tone="green">Current</Badge>}
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums">
                {OWNER_PLANS[t].price ? rupees(OWNER_PLANS[t].price) : '₹0'}
                <span className="text-sm font-normal text-ink-muted"> /month</span>
              </div>
              <p className="text-xs text-ink-muted">{planPriceLine(t)}</p>
              <ul className="mt-3 flex-1 space-y-1.5 text-sm text-ink-soft">
                {OWNER_PLAN_FEATURES[t].features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span aria-hidden="true" className="text-brand">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              {applied ? (
                <p className="mt-4 text-sm text-food-ink">Application in review. We&apos;ll call you to schedule the visit.</p>
              ) : t === 'partner' && !isCurrent && hostel.status !== 'live' ? (
                <p className="mt-4 text-sm text-ink-soft">You can apply once your listing is live.</p>
              ) : (
                (!isCurrent || (scheduled && isCurrent)) && (
                  <form action={changePlanAction} className="mt-4">
                    <input type="hidden" name="hostelId" value={id} />
                    <input type="hidden" name="plan" value={t} />
                    <SubmitButton
                      variant={rank(t) > rank(current) ? 'primary' : 'secondary'}
                      className="w-full"
                      confirm={
                        rank(t) < rank(current) && !isCurrent
                          ? `Move to ${OWNER_PLANS[t].label}? ${info.inTrial ? 'You are in the free month, so it happens now.' : 'It happens at the end of the month you paid for.'}`
                          : undefined
                      }
                    >
                      {isCurrent ? 'Keep this plan' : t === 'partner' ? 'Apply to become a partner' : `Switch to ${OWNER_PLANS[t].label}`}
                    </SubmitButton>
                  </form>
                )
              )}
              {t === 'partner' && info.partnerStatus === 'rejected' && <p className="mt-2 text-xs text-danger">A previous application wasn&apos;t approved. You can apply again.</p>}
            </Card>
          );
        })}
      </div>

      <section aria-labelledby="rules-heading">
        <h2 id="rules-heading" className="mb-2 text-lg font-semibold">How billing works</h2>
        <ul className="max-w-prose list-disc space-y-1 pl-5 text-sm text-ink-soft">
          {OWNER_BILLING_RULES.map((r) => <li key={r}>{r}</li>)}
        </ul>
      </section>

      <section aria-labelledby="standards-heading">
        <h2 id="standards-heading" className="text-lg font-semibold">Partner brand standards</h2>
        <p className="mb-3 max-w-prose text-sm text-ink-soft">
          {app?.status === 'verified'
            ? `Verified${app.decidedAt ? ` on ${dateLabel(app.decidedAt)}` : ''}. Keep these up: residents report issues and their reviews are public.`
            : app?.status === 'applied'
              ? 'Our team will visit and check each of these. Getting them ready before the visit speeds things up.'
              : PARTNER_REQUIREMENTS.intro}
        </p>
        <Card>
          <ul className="space-y-2 text-sm">
            {partner.standards.map((s) => {
              const done = app?.checklist.includes(s.id);
              return (
                <li key={s.id} className="flex gap-2">
                  <span aria-hidden className={done ? 'text-brand' : 'text-ink-muted'}>{done ? '✓' : '○'}</span>
                  <span className={done ? 'text-ink' : 'text-ink-soft'}>
                    {s.label}
                    <span className="sr-only">{done ? ' (checked)' : ' (not checked yet)'}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          {app?.status === 'rejected' && app.reason && <p className="mt-3 text-sm text-danger">Last visit: {app.reason}</p>}
        </Card>
      </section>

      <section aria-labelledby="bills-heading">
        <h2 id="bills-heading" className="mb-3 text-lg font-semibold">Plan bills</h2>
        {info.bills.length === 0 ? (
          <p className="text-sm text-ink-soft">
            No bills yet.{current === 'free' ? ' Free has no bills.' : info.inTrial ? ' The first one comes after the free month.' : ''}
          </p>
        ) : (
          <Table head={['Period', 'Plan', 'Amount', 'Due', 'Status', '']}>
            {info.bills.map((b) => (
              <tr key={b.id}>
                <Td className="whitespace-nowrap">
                  {dateLabel(b.periodStart)} – {dateLabel(b.periodEnd)}
                  {b.note && <div className="max-w-xs whitespace-normal text-xs text-ink-muted">{b.note}</div>}
                </Td>
                <Td>{OWNER_PLANS[b.plan].label}</Td>
                <Td className="tabular-nums">
                  {rupees(b.amount)}
                  {b.creditAmount > 0 && (
                    <div className="text-xs text-ink-muted">
                      {rupees(b.amount + b.creditAmount)} − {rupees(b.creditAmount)} credit
                    </div>
                  )}
                </Td>
                <Td className="whitespace-nowrap">{dateLabel(b.dueDate)}</Td>
                <Td>
                  <StatusBadge kind="invoice" status={b.isOverdue ? 'overdue' : b.paymentMode === 'waived' ? 'waived' : b.status} />
                  {b.status === 'paid' && b.paymentMode && b.paymentMode !== 'razorpay_live' && (
                    <div className="mt-1 text-xs text-ink-muted">{PAYMENT_MODE_LABEL[b.paymentMode]}</div>
                  )}
                </Td>
                <Td>{b.status === 'due' && <Link href={`/pay/${b.id}`}>Pay<span className="sr-only"> {rupees(b.amount)}</span></Link>}</Td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </div>
  );
}
