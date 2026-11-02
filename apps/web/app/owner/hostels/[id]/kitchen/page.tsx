import { addDays, istDate, isValidDate } from '@hostels/shared';
import Link from 'next/link';
import { Upsell } from '@/components/Upsell';
import { Card, Empty, LinkButton, StatusBadge, Table, Td } from '@/components/ui';
import { api } from '@/lib/api';
import { dateLabel, planLabel, SHARING_LABEL, weekday } from '@/lib/format';
import { hasPlan, ownerHostel } from '@/lib/owner';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ date?: string }> };

export default async function KitchenPage({ params, searchParams }: Props) {
  const { id } = await params;
  const q = await searchParams;
  const h = await ownerHostel(id);
  // The plan tier, not the effective plan: a paused Partner still feeds its existing subscribers.
  if (!hasPlan(h.plan.plan, 'partner')) return <Upsell hostelId={id} plan="partner" feature="Subscriptions and kitchen headcount" />;
  const today = istDate();
  const date = q.date && isValidDate(q.date) ? q.date : today;
  const client = await api();
  const [count, subs] = await Promise.all([client.owner.headcount(id, date), client.owner.subscribers(id)]);
  const base = `/owner/hostels/${id}/kitchen`;

  return (
    <div className="space-y-8">
      {h.plan.suspended && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-danger/40 bg-danger-soft text-sm">
          <span className="min-w-0 text-ink">
            Your plan is paused for an overdue bill. Existing subscribers still get their meals, so the menu and headcount keep working, but new
            tenants can&apos;t subscribe until it is paid.
          </span>
          <LinkButton href={`/owner/hostels/${id}/plan`} size="sm">Pay the bill</LinkButton>
        </Card>
      )}
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
          <h2 className="text-lg font-semibold">Headcount</h2>
          <Link href={`${base}?date=${addDays(date, -1)}`} className="inline-flex min-h-6 min-w-6 items-center justify-center" aria-label={`Previous day, ${dateLabel(addDays(date, -1))}`}>←</Link>
          <span className="font-medium">{weekday(date)}, {dateLabel(date)}{date === today && ' (today)'}</span>
          <Link href={`${base}?date=${addDays(date, 1)}`} className="inline-flex min-h-6 min-w-6 items-center justify-center" aria-label={`Next day, ${dateLabel(addDays(date, 1))}`}>→</Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {count.meals.map((m) => (
            <Card key={m.meal} className="p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">{m.meal}</div>
              <div className="mt-1 text-3xl font-semibold">{m.total}</div>
              <div className="text-sm text-ink-soft">{m.veg} veg · {m.nonVeg} non-veg{m.skipped > 0 && ` · ${m.skipped} skipped`}</div>
            </Card>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-muted">Counts lock at each meal&apos;s cut-off, so the number you see after it is final.</p>
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Subscribers</h2>
        {subs.length === 0 ? <Empty title="No subscribers yet">Verified partner hostels appear first in search with a Subscribe button.</Empty> : (
          <Table head={['Name', 'Phone', 'Room', 'Food', 'Since', 'Status']}>
            {subs.map((s) => (
              <tr key={s.subscription.id}>
                <Td className="font-medium">{s.user.name || '—'}</Td>
                <Td>+91 {s.user.phone}</Td>
                <Td>{SHARING_LABEL[s.sharing]}</Td>
                <Td>{planLabel(s.subscription.mealPlan)}{s.subscription.mealPlan !== 'none' && ` · ${s.subscription.diet}`}</Td>
                <Td>{dateLabel(s.subscription.startDate)}</Td>
                <Td><StatusBadge kind="subscription" status={s.subscription.cancelAt ? 'cancelled' : s.subscription.status} /></Td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </div>
  );
}
