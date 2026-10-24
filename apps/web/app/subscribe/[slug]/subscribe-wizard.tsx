'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DIETS, FOOD_PLANS, MEAL_PLANS, ApiRequestError, addDays, istDate, type Diet, type HostelDetail, type MealPlan } from '@hostels/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, FormError, Input } from '@/components/ui/field';
import { api } from '@/lib/client-api';
import { cn } from '@/lib/cn';
import { describeError } from '@/lib/errors';
import { DIET_LABEL, MEAL_LABEL, SHARING_LABEL, formatDate, rupees } from '@/lib/format';

const STEPS = ['Room', 'Food', 'Start date', 'Summary'] as const;

function Choice({ selected, disabled, onClick, children }: { selected: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        'w-full rounded-[var(--radius-card)] border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        selected ? 'border-brand bg-brand-soft' : 'border-line bg-surface hover:border-brand',
      )}
    >
      {children}
    </button>
  );
}

export function SubscribeWizard({ hostel }: { hostel: HostelDetail }) {
  const router = useRouter();
  const today = istDate();
  const firstAvailable = hostel.roomTypes.find((r) => r.bedsAvailable > 0);
  const [step, setStep] = useState(0);
  const [roomTypeId, setRoomTypeId] = useState(firstAvailable?.id ?? '');
  const [mealPlan, setMealPlan] = useState<MealPlan>('full');
  const [diet, setDiet] = useState<Diet>('veg');
  const [startDate, setStartDate] = useState(today);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code?: string; message: string } | null>(null);

  const room = hostel.roomTypes.find((r) => r.id === roomTypeId);
  const plan = FOOD_PLANS[mealPlan];
  const total = (room?.monthlyRent ?? 0) + plan.price;

  async function submit() {
    if (!room) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.tenant.subscribe({ hostelId: hostel.id, roomTypeId: room.id, mealPlan, diet, startDate });
      router.push(`/pay/${r.invoice.id}`);
    } catch (e) {
      setError({ code: e instanceof ApiRequestError ? e.code : undefined, message: describeError(e).message });
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div>
        <ol className="mb-6 flex gap-2 text-sm">
          {STEPS.map((s, i) => (
            <li key={s} className="flex-1">
              <button
                type="button"
                disabled={i > step}
                onClick={() => setStep(i)}
                className={cn('w-full border-t-4 pt-2 text-left', i <= step ? 'border-brand text-ink' : 'border-line text-muted')}
              >
                <span className="text-xs">Step {i + 1}</span>
                <span className="block font-medium">{s}</span>
              </button>
            </li>
          ))}
        </ol>

        {step === 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Choose your room</h2>
            {hostel.roomTypes.map((r) => (
              <Choice key={r.id} selected={roomTypeId === r.id} disabled={r.bedsAvailable === 0} onClick={() => setRoomTypeId(r.id)}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium">{SHARING_LABEL[r.sharing]}</div>
                    <div className="text-sm text-muted">{r.bedsAvailable > 0 ? `${r.bedsAvailable} beds free` : 'Full'}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{rupees(r.monthlyRent)}</div>
                    <div className="text-xs text-muted">per month</div>
                  </div>
                </div>
              </Choice>
            ))}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Food plan</h2>
              {MEAL_PLANS.map((p) => (
                <Choice key={p} selected={mealPlan === p} onClick={() => setMealPlan(p)}>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-medium">{FOOD_PLANS[p].label}</div>
                      <div className="text-sm text-muted">{FOOD_PLANS[p].meals.length ? FOOD_PLANS[p].meals.map((m) => MEAL_LABEL[m]).join(', ') : 'Cook or eat out yourself'}</div>
                    </div>
                    <div className="font-semibold">{FOOD_PLANS[p].price ? `${rupees(FOOD_PLANS[p].price)}/mo` : 'Free'}</div>
                  </div>
                </Choice>
              ))}
              <p className="text-xs text-muted">Skip a meal before the cut-off and its value comes off your next bill.</p>
            </div>
            {mealPlan !== 'none' && (
              <div>
                <h3 className="mb-2 font-medium">Diet</h3>
                <div className="grid grid-cols-2 gap-3">
                  {DIETS.map((d) => (
                    <Choice key={d} selected={diet === d} onClick={() => setDiet(d)}>
                      <span className="font-medium">{DIET_LABEL[d]}</span>
                    </Choice>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">When do you move in?</h2>
            <Field label="Start date" hint="Your billing month starts on this date.">
              <Input type="date" min={today} max={addDays(today, 60)} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
          </div>
        )}

        {step === 3 && room && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Review and pay your first month</h2>
            <Card className="divide-y divide-line">
              <Row label="Hostel" value={hostel.name} />
              <Row label="Room" value={SHARING_LABEL[room.sharing]} />
              <Row label="Food" value={`${plan.label}${mealPlan !== 'none' ? ` · ${DIET_LABEL[diet]}` : ''}`} />
              <Row label="Starts" value={formatDate(startDate)} />
            </Card>
            {error && (
              <div className="space-y-2">
                <FormError message={error.message} />
                {error.code === 'already_subscribed' && (
                  <Link href="/account" className="text-sm text-brand underline">Go to my current plan</Link>
                )}
              </div>
            )}
            <Button size="lg" className="w-full sm:w-auto" onClick={() => void submit()} loading={loading}>
              Continue to payment · {rupees(total)}
            </Button>
            <p className="text-xs text-muted">Your bed is held for 30 minutes while you pay.</p>
          </div>
        )}

        {step < 3 && (
          <div className="mt-6 flex justify-between">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              Back
            </Button>
            <Button onClick={() => setStep((s) => s + 1)} disabled={step === 0 && !room}>
              Continue
            </Button>
          </div>
        )}
      </div>

      <aside>
        <Card className="p-5 lg:sticky lg:top-24">
          <div className="text-sm text-muted">Monthly bill</div>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><dt>Rent{room ? ` (${SHARING_LABEL[room.sharing]})` : ''}</dt><dd>{rupees(room?.monthlyRent ?? 0)}</dd></div>
            <div className="flex justify-between"><dt>Food ({plan.label})</dt><dd>{rupees(plan.price)}</dd></div>
            <div className="flex justify-between text-ok"><dt>Advance</dt><dd>₹0</dd></div>
            <div className="flex justify-between border-t border-line pt-2 text-base font-semibold"><dt>Total</dt><dd>{rupees(total)}</dd></div>
          </dl>
        </Card>
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 px-4 py-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
