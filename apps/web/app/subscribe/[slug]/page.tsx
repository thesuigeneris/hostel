import { ApiError, FOOD_PLANS, MEAL_PLANS } from '@hostels/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { subscribeAction } from '@/app/account/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { Back, Card, Empty, Flash, LinkButton, PageHeader } from '@/components/ui';
import { publicApi, requireUser } from '@/lib/api';
import { rupees, SHARING_LABEL } from '@/lib/format';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string }> };

export const metadata: Metadata = { title: 'Subscribe', robots: { index: false } };

export default async function SubscribePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { error } = await searchParams;
  await requireUser(`/subscribe/${slug}`, 'tenant');
  const h = await publicApi(0).hostels.get(slug).catch((e) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });
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
      <Flash error={error} />
      {rooms.length === 0 ? (
        <Empty title="All beds are taken right now">Check back soon, or look at other verified hostels nearby.</Empty>
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
                  <Card className="p-4 peer-checked:border-brand peer-checked:ring-2 peer-checked:ring-brand/20">
                    <div className="flex justify-between">
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
                  <Card className="h-full p-4 peer-checked:border-food peer-checked:ring-2 peer-checked:ring-food/20">
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
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2"><input type="radio" name="diet" value="veg" defaultChecked /> Veg</label>
                <label className="flex items-center gap-2"><input type="radio" name="diet" value="non-veg" /> Non-veg</label>
              </div>
            </fieldset>
          )}

          <Card className="bg-brand-soft/40">
            <p className="text-sm text-ink-soft">
              Your plan starts today. We hold the bed for 30 minutes while you pay the first month. After that, bills arrive five days before each month starts.
            </p>
            <SubmitButton size="lg" className="mt-4 w-full" pendingText="Holding your bed…">Continue to payment</SubmitButton>
          </Card>
        </form>
      )}
    </div>
  );
}
