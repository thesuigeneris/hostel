import { MEALS, type MenuWeek } from '@hostels/shared';
import { cn } from '@/lib/cn';
import { MEAL_LABEL, formatDate } from '@/lib/format';

/** Read-only weekly menu: days as columns on desktop, stacked on mobile. */
export function MenuWeekView({ menu, today }: { menu: MenuWeek; today?: string }) {
  const dates = [...new Set(menu.items.map((i) => i.date))].sort();
  return (
    <div>
      {menu.theme && <div className="mb-3 inline-flex rounded-full bg-food-soft px-3 py-1 text-sm font-medium text-food">{menu.theme}</div>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {dates.map((d) => (
          <div key={d} className={cn('rounded-xl border p-3 text-sm', d === today ? 'border-food bg-food-soft/40' : 'border-line bg-surface')}>
            <div className="mb-2 font-medium">{formatDate(d, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
            {MEALS.map((m) => {
              const item = menu.items.find((i) => i.date === d && i.meal === m);
              if (!item) return null;
              return (
                <div key={m} className="mb-2 last:mb-0">
                  <div className="text-xs uppercase tracking-wide text-muted">{MEAL_LABEL[m]}</div>
                  <div>{item.vegDish}</div>
                  {item.nonVegDish && <div className="text-xs text-danger">Non-veg: {item.nonVegDish}</div>}
                  {item.foodPartner && <div className="text-xs font-medium text-food">by {item.foodPartner.name}</div>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
