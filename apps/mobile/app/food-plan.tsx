import { dateLabel, DIETS, type Diet, FOOD_PLANS, type MealPlan, rupees } from '@hostels/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { Button, Card, Chip, Empty, ErrorState, ErrorText, H2, Loading, P, Row, Screen } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { foodPlanChoices, sameAsNow } from '@/lib/foodPlan';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

const DIET_LABEL: Record<Diet, string> = { veg: 'Veg', 'non-veg': 'Non-veg' };

/** Change the food plan or diet from the next bill that is not paid yet (product gap 1a). */
export default function FoodPlan() {
  const { data, error, loading, reload } = useLoad(async () => {
    const mine = await api.me.subscription();
    const hostel = mine ? await api.hostels.get(mine.hostel.slug).catch(() => null) : null;
    return { mine, foodAvailable: hostel?.foodAvailable ?? (mine?.subscription.mealPlan ?? 'none') !== 'none' };
  });
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null);
  const [diet, setDiet] = useState<Diet>('veg');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the plan first loads
  useEffect(() => {
    if (data?.mine && !mealPlan) {
      const c = foodPlanChoices(data.mine, data.foodAvailable);
      setMealPlan(c.mealPlan);
      setDiet(c.diet);
    }
  }, [data?.mine?.subscription.id]);

  if (loading) return <Loading />;
  if (!data) return <Screen><ErrorState message={error} onRetry={reload} /></Screen>;
  const { mine, foodAvailable } = data;
  if (!mine || mine.subscription.status !== 'active' || mine.subscription.cancelAt) {
    return (
      <Screen>
        <Empty title="No plan to change">You need an active plan that isn't ending.</Empty>
        <Button variant="secondary" title="Back" onPress={() => router.back()} />
      </Screen>
    );
  }
  const sub = mine.subscription;
  const { plans } = foodPlanChoices(mine, foodAvailable);

  async function save() {
    if (!mealPlan) return;
    if (sameAsNow(sub, mealPlan, diet)) return setErr('That is already your food plan.');
    setBusy(true);
    setErr(null);
    try {
      await api.me.changeFoodPlan({ mealPlan, diet });
      router.back();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <P>The change starts with your next bill that isn't paid yet. Bills already paid stay as they are. No fee.</P>
      <P muted>
        Now: {FOOD_PLANS[sub.mealPlan].label}
        {sub.mealPlan !== 'none' ? ` (${DIET_LABEL[sub.diet]})` : ''}.
        {mine.scheduledFoodChange ? ` Already changing from ${dateLabel(mine.scheduledFoodChange.effectiveFrom)}; saving again replaces that.` : ''}
      </P>
      <H2>Food plan</H2>
      {plans.map((p) => (
        <Pressable key={p} accessibilityRole="radio" accessibilityState={{ checked: p === mealPlan }} accessibilityLabel={`${FOOD_PLANS[p].label}, ${FOOD_PLANS[p].price ? rupees(FOOD_PLANS[p].price) : 'no food'}`} onPress={() => setMealPlan(p)}>
          <Card style={p === mealPlan ? { borderColor: theme.colors.brand, borderWidth: 2 } : undefined}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '600', color: theme.colors.text }}>{FOOD_PLANS[p].label}</Text>
              <P>{FOOD_PLANS[p].price ? `+${rupees(FOOD_PLANS[p].price)}` : 'No food'}</P>
            </Row>
          </Card>
        </Pressable>
      ))}
      {!foodAvailable && <P muted>{mine.hostel.name} doesn't serve food.</P>}
      {foodAvailable && mealPlan !== 'none' && (
        <>
          <H2>Diet</H2>
          <Row>{DIETS.map((d) => <Chip key={d} label={DIET_LABEL[d]} active={d === diet} onPress={() => setDiet(d)} />)}</Row>
        </>
      )}
      <P muted>Skips you've booked for meals the new plan leaves out are removed from its first day.</P>
      <ErrorText>{err}</ErrorText>
      <Button title="Save change" onPress={save} busy={busy} disabled={!mealPlan || busy} />
    </Screen>
  );
}
