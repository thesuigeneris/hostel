import { DEFAULT_PLATFORM_FEE_PCT, OWNER_PLANS, OWNER_PLAN_TIERS } from '@hostels/shared';
import Link from 'next/link';
import { changePlanAction } from '@/app/owner/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { Badge, Card, Flash, LinkButton, StatusBadge, Table, Td } from '@/components/ui';
import { api } from '@/lib/api';
import { dateLabel, rupees } from '@/lib/format';
import { ownerHostel } from '@/lib/owner';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> };

const BLURB = {
  free: 'Listing, visit requests, verified reviews and issue reporting.',
  pro: 'Adds the resident register, rent tracker and community board.',
  partner: `Adds the verified badge, online subscriptions with no advance, menus and payouts. ${DEFAULT_PLATFORM_FEE_PCT}% fee on collected rent.`,
} as const;

export default async function PlanPage({ params, searchParams }: Props) {
  const { id } = await params;
  const q = await searchParams;
  const [info, hostel] = await Promise.all([(await api()).owner.plan(id), ownerHostel(id)]);
  const current = info.plan?.plan ?? 'free';
  const due = info.bills.find((b) => b.status === 'due');

  return (
    <div className="space-y-6">
      <Flash error={q.error} ok={q.ok} />
      {due && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-food bg-food-soft">
          <div>
            <div className="font-medium">{due.isOverdue ? 'Your plan bill is overdue' : 'Plan bill ready'}</div>
            <div className="text-sm text-ink-soft">{rupees(due.amount)} for {dateLabel(due.periodStart)} – {dateLabel(due.periodEnd)}, due {dateLabel(due.dueDate)}</div>
          </div>
          <LinkButton href={`/pay/${due.id}`} variant="food">Pay now</LinkButton>
        </Card>
      )}
      {info.plan?.pendingPlan && (
        <Card className="text-sm">
          Switching to <strong>{OWNER_PLANS[info.plan.pendingPlan].label}</strong> on {dateLabel(info.plan.pendingPlanOn)}. Choose {OWNER_PLANS[current].label} below to keep your current plan.
        </Card>
      )}
      {info.inTrial && info.plan?.trialEndsOn && <Card className="bg-brand-soft/40 text-sm">Free trial until {dateLabel(info.plan.trialEndsOn)}. Your first bill comes after that.</Card>}

      <div className="grid gap-4 md:grid-cols-3">
        {OWNER_PLAN_TIERS.map((t) => {
          const isCurrent = t === current;
          const applied = t === 'partner' && info.partnerStatus === 'applied';
          return (
            <Card key={t} className={isCurrent ? 'border-brand ring-2 ring-brand/20' : ''}>
              <div className="flex items-center justify-between">
                <div className="text-lg font-semibold">{OWNER_PLANS[t].label}</div>
                {isCurrent && <Badge tone="green">Current</Badge>}
              </div>
              <div className="mt-2 text-2xl font-semibold">{OWNER_PLANS[t].price ? rupees(OWNER_PLANS[t].price) : '₹0'}<span className="text-sm font-normal text-ink-muted"> /month</span></div>
              <p className="mt-2 text-sm text-ink-soft">{BLURB[t]}</p>
              {applied ? (
                <p className="mt-4 text-sm text-food">Application in review. We&apos;ll call you to schedule a visit.</p>
              ) : t === 'partner' && !isCurrent && hostel.status !== 'live' ? (
                <p className="mt-4 text-sm text-ink-soft">You can apply once your listing is live.</p>
              ) : (!isCurrent || info.plan?.pendingPlan) && (
                <form action={changePlanAction} className="mt-4">
                  <input type="hidden" name="hostelId" value={id} />
                  <input type="hidden" name="plan" value={t} />
                  <SubmitButton variant={OWNER_PLAN_TIERS.indexOf(t) > OWNER_PLAN_TIERS.indexOf(current) ? 'primary' : 'secondary'} className="w-full" confirm={t === 'free' ? 'Downgrade to Free? Paid features stop at the end of the period.' : undefined}>
                    {isCurrent ? 'Keep this plan' : t === 'partner' ? 'Apply to become a partner' : `Switch to ${OWNER_PLANS[t].label}`}
                  </SubmitButton>
                </form>
              )}
              {t === 'partner' && info.partnerStatus === 'rejected' && <p className="mt-2 text-xs text-danger">A previous application wasn&apos;t approved. You can apply again.</p>}
            </Card>
          );
        })}
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Plan bills</h2>
        {info.bills.length === 0 ? <p className="text-sm text-ink-soft">No bills yet.</p> : (
          <Table head={['Period', 'Plan', 'Amount', 'Due', 'Status', '']}>
            {info.bills.map((b) => (
              <tr key={b.id}>
                <Td>{dateLabel(b.periodStart)} – {dateLabel(b.periodEnd)}</Td>
                <Td>{OWNER_PLANS[b.plan].label}</Td>
                <Td>{rupees(b.amount)}</Td>
                <Td>{dateLabel(b.dueDate)}</Td>
                <Td><StatusBadge kind="invoice" status={b.isOverdue ? 'overdue' : b.status} /></Td>
                <Td>{b.status === 'due' && <Link href={`/pay/${b.id}`}>Pay</Link>}</Td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </div>
  );
}
