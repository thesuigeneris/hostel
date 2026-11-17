import { DIETS, FOOD_PLANS, MEAL_PLANS } from '@hostels/shared';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { changeFoodPlanAction } from '@/app/account/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { Card, cx, Flash, LinkButton, PageHeader } from '@/components/ui';
import { api, publicApi, requireUser } from '@/lib/api';
import { dateLabel, planLabel, rupees } from '@/lib/format';

export const metadata: Metadata = { title: 'Change food plan', robots: { index: false } };

type Props = { searchParams: Promise<{ error?: string }> };

const DIET_LABEL = { veg: 'Veg', 'non-veg': 'Non-veg' } as const;

/** Product gap 1a: change the food plan or diet from the next bill that is not paid yet, without cancelling. */
export default async function FoodPlanPage({ searchParams }: Props) {
  const q = await searchParams;
  await requireUser('/account/food');
  const mine = await (await api()).me.subscription();
  if (!mine || mine.subscription.status !== 'active' || mine.subscription.cancelAt) redirect('/account');
  const sub = mine.subscription;
  const hostel = await publicApi(0).hostels.get(mine.hostel.slug).catch(() => null);
  const foodHere = hostel?.foodAvailable ?? sub.mealPlan !== 'none';
  const plans = foodHere ? MEAL_PLANS : (['none'] as const);
  const pending = mine.scheduledFoodChange;
  const current = pending ?? sub;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <PageHeader
        title="Change food plan"
        subtitle="The change starts with your next bill that isn't paid yet. Bills already paid stay as they are. No fee."
      />
      <Flash error={q.error} />
      <p className="mb-4 text-sm text-ink-soft">
        Now: <strong>{planLabel(sub.mealPlan)}</strong>
        {sub.mealPlan !== 'none' && ` (${DIET_LABEL[sub.diet]})`}.
        {pending && ` Already changing to ${planLabel(pending.mealPlan)} from ${dateLabel(pending.effectiveFrom)}; saving again replaces that.`}
      </p>
      <form action={changeFoodPlanAction} className="space-y-6">
        <fieldset>
          <legend className="mb-2 font-medium">Food plan</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {plans.map((p) => (
              <label key={p} className="cursor-pointer">
                <input type="radio" name="mealPlan" value={p} defaultChecked={p === current.mealPlan} className="peer sr-only" required />
                <Card className={cx('h-full p-4 transition duration-feedback', 'peer-checked:border-food peer-checked:ring-2 peer-checked:ring-food/20 peer-focus-visible:ring-2')}>
                  <div className="font-medium">{FOOD_PLANS[p].label}</div>
                  <div className="mt-1 text-lg font-semibold">{FOOD_PLANS[p].price ? `+${rupees(FOOD_PLANS[p].price)}` : 'No food'}</div>
                  <div className="text-xs text-ink-muted">{FOOD_PLANS[p].meals.length ? FOOD_PLANS[p].meals.join(', ') : 'Bed only'}</div>
                </Card>
              </label>
            ))}
          </div>
          {!foodHere && <p className="mt-2 text-xs text-ink-muted">{mine.hostel.name} doesn't serve food.</p>}
        </fieldset>
        {foodHere && (
          <fieldset>
            <legend className="mb-2 font-medium">Diet</legend>
            <div className="flex gap-6 text-sm">
              {DIETS.map((d) => (
                <label key={d} className="flex min-h-11 items-center gap-2">
                  <input type="radio" name="diet" value={d} defaultChecked={d === current.diet} className="h-5 w-5 accent-brand" /> {DIET_LABEL[d]}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <p className="text-xs text-ink-muted">Skips you've booked for meals the new plan leaves out are removed from its first day.</p>
        <div className="flex gap-2">
          <SubmitButton pendingText="Saving…">Save change</SubmitButton>
          <LinkButton href="/account" variant="ghost">Back</LinkButton>
        </div>
      </form>
    </div>
  );
}
