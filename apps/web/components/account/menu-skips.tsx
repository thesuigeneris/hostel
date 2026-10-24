'use client';
import { useState } from 'react';
import { ApiRequestError, SKIP_CREDITS, istDate, type Meal, type WeekMenuForTenant } from '@hostels/shared';
import { FormError } from '@/components/ui/field';
import { api } from '@/lib/client-api';
import { cn } from '@/lib/cn';
import { describeError } from '@/lib/errors';
import { MEAL_LABEL, formatDate, formatDateTime, rupees } from '@/lib/format';

type Slot = WeekMenuForTenant['days'][number]['meals'][number];

/** Next 7 days of the tenant's menu with per-meal skip toggles. */
export function MenuSkips({ initial }: { initial: WeekMenuForTenant }) {
  const [menu, setMenu] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = istDate();

  const credit = menu.days.reduce((sum, d) => sum + d.meals.filter((m) => m.skipped).reduce((s, m) => s + SKIP_CREDITS[m.meal], 0), 0);

  function patch(date: string, meal: Meal, change: Partial<Slot>) {
    setMenu((m) => ({
      days: m.days.map((d) => (d.date !== date ? d : { ...d, meals: d.meals.map((s) => (s.meal === meal ? { ...s, ...change } : s)) })),
    }));
  }

  async function toggle(date: string, slot: Slot) {
    const key = `${date}:${slot.meal}`;
    setBusy(key);
    setError(null);
    const nowSkipped = !slot.skipped;
    patch(date, slot.meal, { skipped: nowSkipped });
    try {
      if (nowSkipped) await api.tenant.skip({ date, meal: slot.meal });
      else await api.tenant.unskip(date, slot.meal);
    } catch (e) {
      patch(date, slot.meal, { skipped: slot.skipped, ...(e instanceof ApiRequestError && e.code === 'cutoff_passed' ? { canToggle: false } : {}) });
      setError(describeError(e).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] bg-food-soft p-4 text-sm">
        <div>
          <div className="font-medium text-food">Not eating in? Skip it.</div>
          <div className="text-ink">
            Credit: breakfast {rupees(SKIP_CREDITS.breakfast)}, lunch {rupees(SKIP_CREDITS.lunch)}, dinner {rupees(SKIP_CREDITS.dinner)}. Cut-offs: breakfast 10pm the night before, lunch 9am, dinner 3pm.
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted">Credit this week</div>
          <div className="text-xl font-semibold text-food">{rupees(credit)}</div>
        </div>
      </div>
      <FormError message={error} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {menu.days.map((d) => (
          <div key={d.date} className={cn('rounded-[var(--radius-card)] border bg-surface p-4', d.date === today ? 'border-food' : 'border-line')}>
            <div className="mb-3 flex items-center justify-between">
              <span className="font-medium">{formatDate(d.date, { weekday: 'long', day: 'numeric', month: 'short' })}</span>
              {d.date === today && <span className="text-xs font-medium text-food">Today</span>}
            </div>
            <div className="space-y-3">
              {d.meals.map((s) => {
                const key = `${d.date}:${s.meal}`;
                return (
                  <div key={s.meal} className={cn('rounded-xl p-2.5', !s.inPlan && 'opacity-50', s.skipped && 'bg-bg')}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs uppercase tracking-wide text-muted">{MEAL_LABEL[s.meal]}</div>
                        <div className={cn('text-sm', s.skipped && 'text-muted line-through')}>{s.item?.vegDish ?? 'Menu not published'}</div>
                        {s.item?.nonVegDish && <div className={cn('text-xs text-danger', s.skipped && 'line-through opacity-60')}>Non-veg: {s.item.nonVegDish}</div>}
                        {s.item?.foodPartner && <div className="text-xs font-medium text-food">by {s.item.foodPartner.name}</div>}
                      </div>
                      {s.inPlan && (
                        <label className={cn('flex shrink-0 flex-col items-center gap-0.5 text-[11px]', !s.canToggle && 'cursor-not-allowed')}>
                          <input
                            type="checkbox"
                            className="h-5 w-5 accent-[var(--color-food)]"
                            checked={s.skipped}
                            disabled={!s.canToggle || busy === key}
                            onChange={() => void toggle(d.date, s)}
                            aria-label={`Skip ${MEAL_LABEL[s.meal]} on ${d.date}`}
                          />
                          {s.skipped ? 'Skipped' : 'Skip'}
                        </label>
                      )}
                    </div>
                    {s.inPlan && (
                      <div className="mt-1 text-[11px] text-muted">
                        {s.canToggle ? `Change by ${formatDateTime(s.cutoffAt)}` : 'Cut-off passed'}
                        {s.skipped && <span className="text-ok"> · +{rupees(SKIP_CREDITS[s.meal])}</span>}
                      </div>
                    )}
                    {!s.inPlan && <div className="mt-1 text-[11px] text-muted">Not in your plan</div>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
