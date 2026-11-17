import {
  istDate,
  MEAL_LABEL,
  NO_CREDIT_REASON,
  PASSWORD_MIN_LENGTH,
  PENDING_SUBSCRIPTION_TTL_MINUTES,
  skipCreditText,
  skipCutoffText,
  visitNextStep,
} from '@hostels/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  cancelFoodPlanChangeAction,
  cancelMoveAction,
  cancelSubscriptionAction,
  cancelVisitAction,
  changePasswordAction,
  releaseHoldAction,
  skipMealAction,
  updateProfileAction,
} from '@/app/account/actions';
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
  // Any role can hold a plan (an owner may live in someone else's hostel), so always load it.
  const [mine, menu, visits, invoices] = await Promise.all([
    client.me.subscription(),
    client.me.menu(3).catch(() => null),
    client.me.visits(),
    client.me.invoices(),
  ]);
  const sub = mine?.subscription;
  const isTenant = user.role === 'tenant' || !!sub || invoices.length > 0;
  const dueBill = invoices.find((i) => i.status === 'due');
  const today = istDate();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <PageHeader
        title={user.name ? `Hi, ${user.name.split(' ')[0]}` : 'Your account'}
        subtitle={`+91 ${user.phone}${user.phoneVerified ? ' · verified' : ' · not verified yet (log in once with a text-message code to verify)'}`}
      />
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
        <div className="min-w-0 space-y-6">
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
                    <StatusBadge kind="subscription" status={sub.status} />
                  </div>
                  <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                    <div><div className="text-ink-muted">Member since</div><div className="font-medium">{dateLabel(sub.startDate)}</div></div>
                    <div><div className="text-ink-muted">This period</div><div className="font-medium">{dateLabel(mine.currentPeriod.start)} – {dateLabel(mine.currentPeriod.end)}</div></div>
                    <div><div className="text-ink-muted">Rent</div><div className="font-medium">{rupees(mine.roomType.monthlyRent)} /month</div></div>
                  </div>
                  {sub.cancelAt && <p className="mt-4 rounded-xl bg-bg p-3 text-sm">Your plan ends on {dateLabel(sub.cancelAt)}. No more bills after that.</p>}
                  {mine.cancelledMove && (
                    <p role="note" className="mt-4 rounded-xl bg-info-soft p-3 text-sm text-info">
                      Your move to {mine.cancelledMove.toHostelName} on {dateLabel(mine.cancelledMove.moveDate)} was cancelled — {mine.cancelledMove.cancelReason}.
                      You're staying at {mine.hostel.name}, and your bills are for this room.
                    </p>
                  )}
                  {mine.scheduledMove && (
                    <form action={cancelMoveAction} className="mt-4 rounded-xl bg-brand-soft p-3 text-sm">
                      <input type="hidden" name="moveId" value={mine.scheduledMove.id} />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          Moving to {mine.scheduledMove.toHostelName}
                          {mine.scheduledMove.toSharing && ` (${SHARING_LABEL[mine.scheduledMove.toSharing]})`} on {dateLabel(mine.scheduledMove.moveDate)}.
                        </span>
                        <SubmitButton variant="secondary" size="sm" pendingText="Cancelling…" confirm="Cancel this move? The bed held for you there is released.">
                          Cancel move
                        </SubmitButton>
                      </div>
                      {!mine.scheduledMove.toHostelOpen && (
                        <p className="mt-2 text-food-ink">
                          {mine.scheduledMove.toHostelName} isn't taking new residents right now. If that's still so on the move date, the move is
                          cancelled and you stay here.
                        </p>
                      )}
                    </form>
                  )}
                  {mine.scheduledFoodChange && (
                    <form action={cancelFoodPlanChangeAction} className="mt-4 rounded-xl bg-food-soft p-3 text-sm text-food-ink">
                      <input type="hidden" name="changeId" value={mine.scheduledFoodChange.id} />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          Food plan changes to {planLabel(mine.scheduledFoodChange.mealPlan)}
                          {mine.scheduledFoodChange.mealPlan !== 'none' && ` (${mine.scheduledFoodChange.diet})`} from {dateLabel(mine.scheduledFoodChange.effectiveFrom)}, with that bill.
                        </span>
                        <SubmitButton variant="secondary" size="sm" pendingText="Cancelling…">Keep my current plan</SubmitButton>
                      </div>
                    </form>
                  )}
                  {sub.status === 'active' && !sub.cancelAt && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {!mine.scheduledMove && <LinkButton href="/account/move" variant="secondary" size="sm">Move hostel or room</LinkButton>}
                      <LinkButton href="/account/food" variant="secondary" size="sm">Change food plan</LinkButton>
                      <LinkButton href={`/stay/${mine.hostel.id}`} variant="secondary" size="sm">Hostel community</LinkButton>
                      <form action={cancelSubscriptionAction}>
                        <SubmitButton variant="ghost" size="sm" confirm="Cancel your plan at the end of this billing period?">Cancel plan</SubmitButton>
                      </form>
                    </div>
                  )}
                  {sub.status === 'pending' && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-bg p-3 text-sm">
                      <p className="text-ink-soft">
                        Pay the first bill to confirm your bed. Unpaid holds are released after {PENDING_SUBSCRIPTION_TTL_MINUTES} minutes.
                      </p>
                      <form action={releaseHoldAction}>
                        <input type="hidden" name="subscriptionId" value={sub.id} />
                        <SubmitButton variant="secondary" size="sm" pendingText="Releasing…">Release the bed</SubmitButton>
                      </form>
                    </div>
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
            <section aria-labelledby="meals-heading">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-1">
                <h2 id="meals-heading" className="text-lg font-semibold">Meals</h2>
                <span className="text-xs text-ink-muted">Skip before the cut-off (IST) to get credit on your next bill</span>
              </div>
              {menu.noCreditFrom && menu.days.some((d) => d.date >= menu.noCreditFrom!) && (
                <p role="note" className="mb-3 rounded-xl bg-food-soft p-3 text-sm text-food-ink">
                  {NO_CREDIT_REASON}. Skipping still tells the kitchen to cook less.
                </p>
              )}
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
                            {m.skipped && <Badge>{m.credit > 0 ? `Skipped · −${rupees(m.credit)}` : 'Skipped · no credit'}</Badge>}
                          </div>
                          <div className={m.skipped ? 'text-ink-muted line-through' : 'text-ink-soft'}>
                            {(menu.diet === 'non-veg' && m.nonVegDish) || m.vegDish || 'Menu not posted yet'}
                          </div>
                          {m.canChange ? (
                            <form action={skipMealAction} className="mt-1 flex flex-wrap items-center gap-x-2">
                              <Back to="/account" />
                              <input type="hidden" name="date" value={d.date} />
                              <input type="hidden" name="meal" value={m.meal} />
                              {m.skipped && <input type="hidden" name="undo" value="1" />}
                              <SubmitButton
                                variant="ghost"
                                size="xs"
                                className="font-medium text-brand"
                                pendingText="Saving…"
                                aria-label={`${m.skipped ? 'Undo skip' : `Skip (${skipCreditText(m.credit)})`}: ${MEAL_LABEL[m.meal].toLowerCase()} on ${weekday(d.date)} ${dateLabel(d.date)}`}
                              >
                                {m.skipped ? 'Undo skip' : `Skip (${skipCreditText(m.credit)})`}
                              </SubmitButton>
                              <span className="text-xs text-ink-muted">until {skipCutoffText(d.date, m.cutoff)}</span>
                            </form>
                          ) : (
                            <div className="mt-1 text-xs text-ink-muted">Locked since {skipCutoffText(d.date, m.cutoff)}</div>
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
              <Table head={['Period', 'Rent', 'Food', 'Meal credit', 'Total', 'Status', '']}>
                {invoices.map((i) => (
                  <tr key={i.id}>
                    <Td>{dateLabel(i.periodStart)} – {dateLabel(i.periodEnd)}</Td>
                    <Td>{rupees(i.rentAmount)}</Td>
                    <Td>{rupees(i.foodAmount)}</Td>
                    <Td>{i.creditAmount ? `−${rupees(i.creditAmount)}` : '—'}</Td>
                    <Td className="font-medium">{rupees(i.totalAmount)}</Td>
                    <Td><StatusBadge kind="invoice" status={i.isOverdue ? 'overdue' : i.status} /></Td>
                    <Td>
                      {i.status === 'due' && (
                        <Link href={`/pay/${i.id}`} aria-label={`Pay ${rupees(i.totalAmount)} for ${dateLabel(i.periodStart)} – ${dateLabel(i.periodEnd)}`}>
                          Pay
                        </Link>
                      )}
                      {i.status === 'paid' && <span className="text-xs text-ink-muted">Paid {dateLabel(i.paidAt)}</span>}
                    </Td>
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
                  <Card key={v.id} className="flex items-start justify-between gap-3 p-4">
                    <div>
                      <Link href={`/hostels/${v.hostel.slug}`} className="font-medium">{v.hostel.name}</Link>
                      <div className="text-sm text-ink-soft">{dateLabel(v.preferredDate)}{v.message && ` · ${v.message}`}</div>
                      <div className="mt-1 text-xs text-ink-muted">{visitNextStep(v, today)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge kind="visit" status={v.status} />
                      {v.status === 'new' && (
                        <form action={cancelVisitAction}>
                          <input type="hidden" name="visitId" value={v.id} />
                          <SubmitButton size="sm" variant="secondary" confirm="Withdraw this visit request?" aria-label={`Withdraw visit request to ${v.hostel.name}`}>
                            Withdraw
                          </SubmitButton>
                        </form>
                      )}
                    </div>
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
          {!user.isDemo && (
            <Card>
              <h2 className="font-semibold">Password</h2>
              <p className="mt-1 text-sm text-ink-soft">
                {user.hasPassword ? 'Change the password you log in with.' : 'No password yet. Set one to log in without a text-message code.'}
              </p>
              <form action={changePasswordAction} className="mt-3 space-y-3">
                {/* Lets password managers attach the password to the right account. */}
                <input type="hidden" name="username" autoComplete="username" value={user.phone} readOnly />
                {user.hasPassword && (
                  <Field label="Current password">
                    <Input type="password" name="currentPassword" autoComplete="current-password" required maxLength={128} />
                  </Field>
                )}
                <Field label="New password" hint={`At least ${PASSWORD_MIN_LENGTH} characters. A few words with spaces works well.`}>
                  <Input type="password" name="newPassword" autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH} maxLength={128} />
                </Field>
                <SubmitButton variant="secondary" className="w-full" pendingText="Saving…">
                  {user.hasPassword ? 'Change password' : 'Set password'}
                </SubmitButton>
              </form>
            </Card>
          )}
          {!user.isDemo && (
            <Card>
              <h2 className="font-semibold">Your data</h2>
              <p className="mt-1 text-sm text-ink-soft">Get a copy of everything we hold about you, or delete your account.</p>
              <div className="mt-3 flex flex-col gap-2">
                <LinkButton href="/account/export" variant="secondary" className="w-full">Download my data</LinkButton>
                <LinkButton href="/account/delete" variant="ghost" className="w-full">Delete my account</LinkButton>
              </div>
            </Card>
          )}
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
