import { ApiError, FOOD_PLANS, MEAL_PLANS, type MySubscription, PENDING_SUBSCRIPTION_TTL_MINUTES } from '@hostels/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { releaseHoldAction, subscribeAction } from '@/app/account/actions';
import { FirstBill } from '@/components/FirstBill';
import { SubmitButton } from '@/components/SubmitButton';
import { Back, Card, cx, Empty, Flash, LinkButton, PageHeader } from '@/components/ui';
import { api, publicApi, requireUser } from '@/lib/api';
import { dateLabel, planLabel, rupees, SHARING_LABEL } from '@/lib/format';
import { holdText } from '@/lib/hold';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string; ok?: string }> };

export const metadata: Metadata = { title: 'Subscribe', robots: { index: false } };

/** A picked card shows a ring; a keyboard-focused one shows the focus ring on top, so the choice is never invisible. */
const choice = (checked: string) =>
  cx(
    'h-full p-4 transition duration-feedback',
    checked,
    'peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-bg',
  );

export default async function SubscribePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { error, ok } = await searchParams;
  // Any signed-in person may take a plan; owners and admins live in hostels too.
  const user = await requireUser(`/subscribe/${slug}`);
  const [h, mine] = await Promise.all([
    publicApi(0)
      .hostels.get(slug)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) notFound();
        throw e;
      }),
    (await api()).me.subscription(),
  ]);
  if (h.ownerId === user.id) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Empty title="This is your hostel" action={<LinkButton href={`/owner/hostels/${h.id}`} variant="secondary">Manage {h.name}</LinkButton>}>
          Plans are for people who live at a hostel, so you can&apos;t take one at a hostel you own. You can still subscribe at any other verified hostel.
        </Empty>
      </div>
    );
  }
  // One plan at a time: a bed already held or a plan already running comes first, with its next step.
  if (mine) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Flash error={error} ok={ok} />
        <ExistingPlan mine={mine} here={h} />
      </div>
    );
  }
  if (!h.isVerified) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Empty title="This hostel isn't a verified partner yet">You can request a visit from the hostel page instead.</Empty>
        <div className="mt-4 text-center"><LinkButton href={`/hostels/${slug}`} variant="secondary">Back to {h.name}</LinkButton></div>
      </div>
    );
  }
  const rooms = h.roomTypes.filter((r) => r.bedsAvailable > 0);
  const plans = h.foodAvailable ? MEAL_PLANS : (['none'] as const);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <PageHeader title={`Subscribe to ${h.name}`} subtitle="One monthly bill for your bed and food. No advance, cancel anytime." />
      <Flash error={error} ok={ok} />
      {rooms.length === 0 ? (
        <Empty
          title="All beds are taken right now"
          action={<LinkButton href={`/hostels?verified=true&area=${encodeURIComponent(h.area)}`} variant="secondary">Verified hostels in {h.area}</LinkButton>}
        >
          Check back soon, or look at other verified hostels nearby.
        </Empty>
      ) : (
        <form action={subscribeAction} className="space-y-6">
          <Back to={`/subscribe/${slug}`} />
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="hostelId" value={h.id} />

          <fieldset>
            <legend className="mb-2 font-medium">1. Pick a room</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {rooms.map((r, i) => (
                <label key={r.id} className="cursor-pointer">
                  <input type="radio" name="roomTypeId" value={r.id} defaultChecked={i === 0} className="peer sr-only" required />
                  <Card className={choice('peer-checked:border-brand peer-checked:ring-2 peer-checked:ring-brand/20')}>
                    <div className="flex justify-between gap-2">
                      <span className="font-medium">{SHARING_LABEL[r.sharing]}</span>
                      <span className="text-sm text-brand">{r.bedsAvailable} free</span>
                    </div>
                    <div className="mt-1 text-lg font-semibold">{rupees(r.monthlyRent)}<span className="text-sm font-normal text-ink-muted"> /month</span></div>
                  </Card>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 font-medium">2. Pick a food plan</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {plans.map((p, i) => (
                <label key={p} className="cursor-pointer">
                  <input type="radio" name="mealPlan" value={p} defaultChecked={i === 0} className="peer sr-only" />
                  <Card className={choice('peer-checked:border-food peer-checked:ring-2 peer-checked:ring-food/20')}>
                    <div className="font-medium">{FOOD_PLANS[p].label}</div>
                    <div className="mt-1 text-lg font-semibold">{FOOD_PLANS[p].price ? `+${rupees(FOOD_PLANS[p].price)}` : 'No food'}</div>
                    <div className="text-xs text-ink-muted">{FOOD_PLANS[p].meals.length ? FOOD_PLANS[p].meals.join(', ') : 'Bed only'}</div>
                  </Card>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-muted">Skip a meal before its cut-off and the credit comes off your next bill.</p>
          </fieldset>

          {h.foodAvailable && (
            <fieldset>
              <legend className="mb-2 font-medium">3. Diet</legend>
              <div className="flex gap-6 text-sm">
                <label className="flex min-h-11 items-center gap-2"><input type="radio" name="diet" value="veg" defaultChecked className="h-5 w-5 accent-brand" /> Veg</label>
                <label className="flex min-h-11 items-center gap-2"><input type="radio" name="diet" value="non-veg" className="h-5 w-5 accent-brand" /> Non-veg</label>
              </div>
            </fieldset>
          )}

          <Card className="bg-brand-soft/40">
            <FirstBill
              rooms={rooms.map((r) => ({ id: r.id, rent: r.monthlyRent, label: SHARING_LABEL[r.sharing] }))}
              plans={plans.map((p) => ({ id: p, label: planLabel(p) }))}
            />
            <p className="mt-3 text-sm text-ink-soft">
              Your plan starts today. We hold the bed for {PENDING_SUBSCRIPTION_TTL_MINUTES} minutes while you pay the first month. After that, bills
              arrive five days before each month starts.
            </p>
            <SubmitButton size="lg" className="mt-4 w-full" pendingText="Holding your bed…">Continue to payment</SubmitButton>
          </Card>
        </form>
      )}
    </div>
  );
}

/** The plan this person already has: a held bed to pay for or release, or a running plan they can move. */
function ExistingPlan({ mine, here }: { mine: MySubscription; here: { slug: string; name: string } }) {
  const sub = mine.subscription;
  const sameHostel = mine.hostel.slug === here.slug;
  const bill = mine.invoices.find((i) => i.status === 'due');
  if (sub.status === 'pending') {
    const hold = holdText(sub.createdAt);
    return (
      <Card>
        <h1 className="font-display text-2xl font-semibold tracking-tight">You’re holding a bed at {mine.hostel.name}</h1>
        <p className="mt-2 text-ink-soft">
          {SHARING_LABEL[mine.roomType.sharing]} · {planLabel(sub.mealPlan)}.{' '}
          {hold.ended
            ? 'The hold time is up, so the bed can be released at any moment.'
            : `We hold it until ${hold.until} while you pay the first month.`}{' '}
          {sameHostel ? 'Pay to confirm it, or release it to pick another room or food plan.' : `To take a plan at ${here.name} instead, release that bed first.`}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {bill && <LinkButton href={`/pay/${bill.id}`}>Pay {rupees(bill.totalAmount)}</LinkButton>}
          <form action={releaseHoldAction}>
            <input type="hidden" name="slug" value={here.slug} />
            <input type="hidden" name="subscriptionId" value={sub.id} />
            <SubmitButton variant="secondary" pendingText="Releasing…">Release the bed and choose again</SubmitButton>
          </form>
        </div>
      </Card>
    );
  }
  return (
    <Empty
      title={sameHostel ? `You already live at ${mine.hostel.name}` : `You already have a plan at ${mine.hostel.name}`}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          {!sameHostel && sub.status === 'active' && !sub.cancelAt && <LinkButton href={`/account/move?to=${encodeURIComponent(here.slug)}`}>Move to {here.name}</LinkButton>}
          <LinkButton href="/account" variant="secondary">See my plan</LinkButton>
        </div>
      }
    >
      {sub.cancelAt
        ? `Your plan ends on ${dateLabel(sub.cancelAt)}. You can take a new plan after that.`
        : sameHostel
          ? 'To change your room, use Move on your plan. It applies from your next bill.'
          : 'You can hold one plan at a time. Moving keeps it running: the new room’s rent starts from your next bill, with no fee.'}
    </Empty>
  );
}
