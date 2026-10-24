import Link from 'next/link';
import { FOOD_PLANS } from '@hostels/shared';
import { CancelPlan } from '@/components/account/cancel-plan';
import { HostelCard } from '@/components/public/hostel-card';
import { LoadError } from '@/components/public/load-error';
import { load } from '@/components/public/safe';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { DIET_LABEL, SHARING_LABEL, SUBSCRIPTION_STATUS_LABEL, formatDate, rupees } from '@/lib/format';
import { serverApi } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function MyStayPage() {
  const r = await load((await serverApi()).tenant.stay());
  if (!r.ok) return <LoadError message={r.message} retryHref="/account" />;
  const { subscription: sub, hostel, roomType, upcomingMove, currentInvoice } = r.data;

  if (!sub || !hostel) {
    return (
      <EmptyState
        title="You don't have a plan yet"
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <ButtonLink href="/search?verified=true">Find a partner hostel</ButtonLink>
            <ButtonLink href="/community" variant="secondary">Already living somewhere? Join its community</ButtonLink>
          </div>
        }
      >
        Subscribe to a verified hostel: one monthly bill for bed and food, no advance, and you can move anytime.
      </EmptyState>
    );
  }

  const plan = FOOD_PLANS[sub.mealPlan];
  const statusTone = sub.status === 'active' ? 'ok' : sub.status === 'pending' ? 'warn' : sub.status === 'cancelled' ? 'danger' : 'neutral';

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Your plan</h2>
            <Badge tone={statusTone}>{SUBSCRIPTION_STATUS_LABEL[sub.status]}</Badge>
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-muted">Room</dt><dd className="font-medium">{roomType ? `${SHARING_LABEL[roomType.sharing]} · ${rupees(roomType.monthlyRent)}/mo` : '—'}</dd></div>
            <div><dt className="text-muted">Food</dt><dd className="font-medium">{plan.label}{sub.mealPlan !== 'none' && ` · ${DIET_LABEL[sub.diet]}`} · {rupees(plan.price)}/mo</dd></div>
            <div><dt className="text-muted">Member since</dt><dd className="font-medium">{formatDate(sub.startDate)}</dd></div>
            {sub.cancelAt && <div><dt className="text-muted">Ends on</dt><dd className="font-medium text-danger">{formatDate(sub.cancelAt)}</dd></div>}
          </dl>
          {sub.status === 'pending' && currentInvoice && (
            <div className="mt-4 rounded-xl bg-warn-soft p-3 text-sm text-warn">
              Pay your first bill to confirm your bed. Unpaid bookings are released after 30 minutes.{' '}
              <Link href={`/pay/${currentInvoice.id}`} className="font-medium underline">Pay now</Link>
            </div>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            {sub.mealPlan !== 'none' && <ButtonLink href="/account/menu" variant="secondary" size="sm">This week&apos;s menu</ButtonLink>}
            {sub.status === 'active' && <ButtonLink href="/account/move" variant="secondary" size="sm">Move hostel</ButtonLink>}
            <ButtonLink href={`/community/${hostel.id}`} variant="secondary" size="sm">Resident community</ButtonLink>
          </div>
        </Card>

        {upcomingMove && (
          <Card className="border-brand p-5">
            <h2 className="font-semibold">Move scheduled</h2>
            <p className="mt-1 text-sm text-muted">You&apos;re moving on {formatDate(upcomingMove.moveDate)}. The new room&apos;s rent applies from your next bill.</p>
            <Link href="/account/move" className="mt-2 inline-block text-sm text-brand underline">Manage move</Link>
          </Card>
        )}

        {currentInvoice && sub.status !== 'pending' && (
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Current bill</h2>
              {currentInvoice.status === 'paid' ? <Badge tone="ok">Paid</Badge> : currentInvoice.overdue ? <Badge tone="danger">Overdue</Badge> : <Badge tone="warn">Due {formatDate(currentInvoice.dueDate)}</Badge>}
            </div>
            <div className="mt-3 flex items-end justify-between gap-4">
              <div className="text-sm text-muted">
                {formatDate(currentInvoice.periodStart)} – {formatDate(currentInvoice.periodEnd)}
                {currentInvoice.creditAmount > 0 && <div className="text-ok">Includes {rupees(currentInvoice.creditAmount)} skipped-meal credit</div>}
              </div>
              <div className="text-2xl font-semibold">{rupees(currentInvoice.totalAmount)}</div>
            </div>
            {currentInvoice.status === 'due' && <ButtonLink href={`/pay/${currentInvoice.id}`} className="mt-4">Pay now</ButtonLink>}
          </Card>
        )}

        {(sub.status === 'active' || sub.status === 'pending') && !sub.cancelAt && (
          <div className="flex justify-end">
            <CancelPlan periodEnd={currentInvoice ? formatDate(currentInvoice.periodEnd) : null} />
          </div>
        )}
      </div>
      <div>
        <HostelCard h={hostel} compact />
      </div>
    </div>
  );
}
