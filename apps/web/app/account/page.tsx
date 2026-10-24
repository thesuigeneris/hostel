import type { Metadata } from 'next';
import Link from 'next/link';
import { cancelMoveAction, cancelSubscriptionAction, skipMealAction, updateProfileAction } from '@/app/account/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { Back, Badge, Card, Empty, Field, Flash, Input, LinkButton, PageHeader, StatusBadge, Table, Td } from '@/components/ui';
import { api, requireUser } from '@/lib/api';
import { dateLabel, planLabel, rupees, SHARING_LABEL, titleCase, weekday } from '@/lib/format';

export const metadata: Metadata = { title: 'My plan', robots: { index: false } };

type Props = { searchParams: Promise<{ error?: string; ok?: string }> };

export default async function AccountPage({ searchParams }: Props) {
  const q = await searchParams;
  const user = await requireUser('/account');
  const client = await api();
  const isTenant = user.role === 'tenant';
  const [mine, menu, visits, invoices] = await Promise.all([
    isTenant ? client.me.subscription() : Promise.resolve(null),
    isTenant ? client.me.menu(3).catch(() => null) : Promise.resolve(null),
    client.me.visits(),
    isTenant ? client.me.invoices() : Promise.resolve([]),
  ]);
  const sub = mine?.subscription;
  const dueBill = invoices.find((i) => i.status === 'due');

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <PageHeader title={user.name ? `Hi, ${user.name.split(' ')[0]}` : 'Your account'} subtitle={`+91 ${user.phone}`} />
      <Flash error={q.error} ok={q.ok} />

      {dueBill && (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-3 border-food bg-food-soft">
          <div>
            <div className="font-medium">{dueBill.isOverdue ? 'Your bill is overdue' : 'A bill is ready'}</div>
            <div className="text-sm text-ink-soft">{rupees(dueBill.totalAmount)} for {dateLabel(dueBill.periodStart)} – {dateLabel(dueBill.periodEnd)}, due {dateLabel(dueBill.dueDate)}</div>
          </div>
          <LinkButton href={`/pay/${dueBill.id}`} variant="food">Pay now</LinkButton>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {isTenant && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">My plan</h2>
              {mine && sub ? (
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link href={`/hostels/${mine.hostel.slug}`} className="text-lg font-semibold">{mine.hostel.name}</Link>
                      <div className="text-sm text-ink-soft">{mine.hostel.area} · {SHARING_LABEL[mine.roomType.sharing]} · {planLabel(sub.mealPlan)}{sub.mealPlan !== 'none' && ` (${sub.diet})`}</div>
                    </div>
                    <StatusBadge status={sub.status} />
                  </div>
                  <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                    <div><div className="text-ink-muted">Member since</div><div className="font-medium">{dateLabel(sub.startDate)}</div></div>
                    <div><div className="text-ink-muted">This period</div><div className="font-medium">{dateLabel(mine.currentPeriod.start)} – {dateLabel(mine.currentPeriod.end)}</div></div>
                    <div><div className="text-ink-muted">Rent</div><div className="font-medium">{rupees(mine.roomType.monthlyRent)} /month</div></div>
                  </div>
                  {sub.cancelAt && <p className="mt-4 rounded-xl bg-bg p-3 text-sm">Your plan ends on {dateLabel(sub.cancelAt)}.</p>}
                  {mine.scheduledMove && (
                    <form action={cancelMoveAction} className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-soft p-3 text-sm">
                      <input type="hidden" name="moveId" value={mine.scheduledMove.id} />
                      <span>Move scheduled for {dateLabel(mine.scheduledMove.moveDate)}.</span>
                      <SubmitButton variant="secondary" size="sm">Cancel move</SubmitButton>
                    </form>
                  )}
                  {sub.status === 'active' && !sub.cancelAt && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {!mine.scheduledMove && <LinkButton href="/account/move" variant="secondary" size="sm">Move hostel or room</LinkButton>}
                      <LinkButton href={`/stay/${mine.hostel.id}`} variant="secondary" size="sm">Hostel community</LinkButton>
                      <form action={cancelSubscriptionAction}>
                        <SubmitButton variant="ghost" size="sm" confirm="Cancel your plan at the end of this billing period?">Cancel plan</SubmitButton>
                      </form>
                    </div>
                  )}
                  {sub.status === 'pending' && dueBill && (
                    <p className="mt-4 text-sm text-ink-soft">Pay the first bill to confirm your bed. Unpaid holds are released after 30 minutes.</p>
                  )}
                </Card>
              ) : (
                <Empty title="No plan yet">
                  Verified partner hostels offer one monthly bill for bed and food, with no advance. <Link href="/hostels?verified=true">Browse them</Link>.
                </Empty>
              )}
            </section>
          )}

          {menu && sub?.status === 'active' && sub.mealPlan !== 'none' && (
            <section>
              <div className="mb-3 flex items-end justify-between">
                <h2 className="text-lg font-semibold">Meals</h2>
                <span className="text-xs text-ink-muted">Skip before the cut-off to get credit on your next bill</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {menu.days.map((d) => (
                  <Card key={d.date} className="p-4">
                    <div className="font-medium">{weekday(d.date)}, {dateLabel(d.date)}</div>
                    {d.theme && <Badge tone="food" className="mt-1">{d.theme}</Badge>}
                    <ul className="mt-3 space-y-3">
                      {d.meals.filter((m) => m.inPlan).map((m) => (
                        <li key={m.meal} className="text-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-medium capitalize">{m.meal}</span>
                            {m.skipped && <Badge>Skipped · −{rupees(m.credit)}</Badge>}
                          </div>
                          <div className={m.skipped ? 'text-ink-muted line-through' : 'text-ink-soft'}>
                            {(menu.diet === 'non-veg' && m.nonVegDish) || m.vegDish || 'Menu not posted yet'}
                          </div>
                          {m.canChange ? (
                            <form action={skipMealAction} className="mt-1">
                              <Back to="/account" />
                              <input type="hidden" name="date" value={d.date} />
                              <input type="hidden" name="meal" value={m.meal} />
                              {m.skipped && <input type="hidden" name="undo" value="1" />}
                              <button type="submit" className="text-xs font-medium text-brand hover:underline">{m.skipped ? 'Undo skip' : `Skip (save ${rupees(m.credit)})`}</button>
                            </form>
                          ) : (
                            <div className="mt-1 text-xs text-ink-muted">Locked</div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {isTenant && invoices.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">Bills</h2>
              <Table head={['Period', 'Rent', 'Food', 'Credit', 'Total', 'Status', '']}>
                {invoices.map((i) => (
                  <tr key={i.id}>
                    <Td>{dateLabel(i.periodStart)} – {dateLabel(i.periodEnd)}</Td>
                    <Td>{rupees(i.rentAmount)}</Td>
                    <Td>{rupees(i.foodAmount)}</Td>
                    <Td>{i.creditAmount ? `−${rupees(i.creditAmount)}` : '—'}</Td>
                    <Td className="font-medium">{rupees(i.totalAmount)}</Td>
                    <Td><StatusBadge status={i.isOverdue ? 'overdue' : i.status} /></Td>
                    <Td>{i.status === 'due' && <Link href={`/pay/${i.id}`}>Pay</Link>}</Td>
                  </tr>
                ))}
              </Table>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-lg font-semibold">Visit requests</h2>
            {visits.length ? (
              <div className="space-y-2">
                {visits.map((v) => (
                  <Card key={v.id} className="flex items-center justify-between p-4">
                    <div>
                      <Link href={`/hostels/${v.hostel.slug}`} className="font-medium">{v.hostel.name}</Link>
                      <div className="text-sm text-ink-soft">{dateLabel(v.preferredDate)}{v.message && ` · ${v.message}`}</div>
                    </div>
                    <StatusBadge status={v.status} />
                  </Card>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-soft">You haven&apos;t requested any visits.</p>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <Card>
            <h2 className="font-semibold">Profile</h2>
            <form action={updateProfileAction} className="mt-3 space-y-3">
              <Field label="Name"><Input name="name" defaultValue={user.name} required maxLength={80} /></Field>
              <Field label="Email" hint="For bill receipts. Optional."><Input type="email" name="email" defaultValue={user.email ?? ''} /></Field>
              <SubmitButton variant="secondary" className="w-full">Save</SubmitButton>
            </form>
          </Card>
          <Card>
            <h2 className="font-semibold">Living in a hostel?</h2>
            <p className="mt-1 text-sm text-ink-soft">Report issues, talk to your neighbours and review your stay.</p>
            <LinkButton href="/stay" variant="secondary" className="mt-3 w-full">My hostel</LinkButton>
          </Card>
          <p className="px-1 text-xs text-ink-muted">Signed in as {titleCase(user.role)}.</p>
        </aside>
      </div>
    </div>
  );
}
