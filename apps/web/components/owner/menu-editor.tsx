'use client';
import { useMemo, useState } from 'react';
import { addDays, MEALS, type FoodPartner, type Meal, type MenuWeek } from '@hostels/shared';
import { Button } from '@/components/ui/button';
import { Field, FormError, Input, Select } from '@/components/ui/field';
import { api } from '@/lib/client-api';
import { formatDate, MEAL_LABEL } from '@/lib/format';
import { useAction } from './use-action';

type Cell = { vegDish: string; nonVegDish: string; foodPartnerId: string };
const key = (date: string, meal: Meal) => `${date}|${meal}`;

function cellsFrom(menu: MenuWeek | null): Record<string, Cell> {
  const out: Record<string, Cell> = {};
  for (const i of menu?.items ?? []) out[key(i.date, i.meal)] = { vegDish: i.vegDish, nonVegDish: i.nonVegDish ?? '', foodPartnerId: i.foodPartner?.id ?? '' };
  return out;
}

export function MenuEditor({ hostelId, week, menu, partners }: { hostelId: string; week: string; menu: MenuWeek | null; partners: FoodPartner[] }) {
  const [theme, setTheme] = useState(menu?.theme ?? '');
  const [cells, setCells] = useState<Record<string, Cell>>(() => cellsFrom(menu));
  const [saved, setSaved] = useState(false);
  const { run, pending, error } = useAction();
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week]);
  const activePartners = partners.filter((p) => p.active);

  const update = (date: string, meal: Meal, patch: Partial<Cell>) => {
    setSaved(false);
    const empty: Cell = { vegDish: '', nonVegDish: '', foodPartnerId: '' };
    setCells((c) => ({ ...c, [key(date, meal)]: { ...empty, ...c[key(date, meal)], ...patch } }));
  };

  async function save() {
    const items = days.flatMap((date) =>
      MEALS.flatMap((meal) => {
        const c = cells[key(date, meal)];
        if (!c?.vegDish.trim()) return [];
        return [{ date, meal, vegDish: c.vegDish.trim(), nonVegDish: c.nonVegDish.trim() || null, foodPartnerId: c.foodPartnerId || null }];
      }),
    );
    const out = await run('save', () => api.owner.saveMenu(hostelId, week, { theme, items }));
    if (out) {
      setCells(cellsFrom(out));
      setSaved(true);
    }
  }

  async function copyLast() {
    if (Object.keys(cells).length > 0 && !confirm("Replace this week's menu with last week's?")) return;
    const out = await run('copy', () => api.owner.copyLastWeek(hostelId, week));
    if (out) {
      setTheme(out.theme);
      setCells(cellsFrom(out));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Theme" className="w-full max-w-sm">
          <Input
            value={theme}
            onChange={(e) => {
              setSaved(false);
              setTheme(e.target.value);
            }}
            placeholder="South Indian week"
            maxLength={80}
          />
        </Field>
        <Button variant="secondary" onClick={copyLast} loading={pending === 'copy'}>
          Copy last week
        </Button>
        <Button onClick={save} loading={pending === 'save'}>
          Save menu
        </Button>
        {saved && <span className="text-sm text-ok">Saved</span>}
      </div>
      <FormError message={error} />
      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-line bg-bg text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="w-28 px-3 py-2 text-left font-medium">Day</th>
              {MEALS.map((m) => (
                <th key={m} className="px-3 py-2 text-left font-medium">
                  {MEAL_LABEL[m]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {days.map((date) => (
              <tr key={date}>
                <td className="px-3 py-2 align-top font-medium">
                  {formatDate(date, { weekday: 'short' })}
                  <div className="text-xs font-normal text-muted">{formatDate(date, { day: 'numeric', month: 'short' })}</div>
                </td>
                {MEALS.map((meal) => {
                  const c = cells[key(date, meal)];
                  return (
                    <td key={meal} className="space-y-1.5 px-3 py-2 align-top">
                      <Input aria-label={`${MEAL_LABEL[meal]} veg dish on ${date}`} placeholder="Veg dish" value={c?.vegDish ?? ''} onChange={(e) => update(date, meal, { vegDish: e.target.value })} className="h-8" />
                      <Input aria-label={`${MEAL_LABEL[meal]} non-veg dish on ${date}`} placeholder="Non-veg (optional)" value={c?.nonVegDish ?? ''} onChange={(e) => update(date, meal, { nonVegDish: e.target.value })} className="h-8" />
                      {activePartners.length > 0 && (
                        <Select aria-label={`${MEAL_LABEL[meal]} food partner on ${date}`} value={c?.foodPartnerId ?? ''} onChange={(e) => update(date, meal, { foodPartnerId: e.target.value })} className="h-8 text-xs">
                          <option value="">Our kitchen</option>
                          {activePartners.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </Select>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Meals without a veg dish are left off the menu. Residents see this menu and can skip meals before the cut-off.</p>
    </div>
  );
}
