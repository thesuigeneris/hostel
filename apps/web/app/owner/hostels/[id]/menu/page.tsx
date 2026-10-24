import { addDays, ApiError, istDate, isMonday, MEALS, weekStart } from '@hostels/shared';
import Link from 'next/link';
import { copyMenuAction, saveMenuAction } from '@/app/owner/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { Upsell } from '@/components/Upsell';
import { Card, Flash, Input, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { dateLabel, weekday } from '@/lib/format';
import { hasPlan, ownerHostel } from '@/lib/owner';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ week?: string; error?: string; ok?: string }> };

export default async function MenuPage({ params, searchParams }: Props) {
  const { id } = await params;
  const q = await searchParams;
  const h = await ownerHostel(id);
  if (!hasPlan(h.plan.effective, 'partner')) return <Upsell hostelId={id} plan="partner" feature="Weekly menus" suspended={h.plan.suspended} />;
  const thisWeek = weekStart(istDate());
  const week = q.week && isMonday(q.week) ? q.week : thisWeek;
  const client = await api();
  const [menu, partners] = await Promise.all([
    client.owner.menu(id, week).catch((e) => (e instanceof ApiError && e.status === 404 ? null : Promise.reject(e))),
    client.hostels.foodPartners().catch(() => []),
  ]);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const item = (date: string, meal: string) => menu?.items.find((i) => i.date === date && i.meal === meal);
  const base = `/owner/hostels/${id}/menu`;

  return (
    <div className="space-y-4">
      <Flash error={q.error} ok={q.ok} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Link href={`${base}?week=${addDays(week, -7)}`}>← Previous</Link>
          <span className="font-medium">Week of {dateLabel(week)}{week === thisWeek && ' (this week)'}</span>
          <Link href={`${base}?week=${addDays(week, 7)}`}>Next →</Link>
        </div>
        <form action={copyMenuAction}>
          <input type="hidden" name="hostelId" value={id} />
          <input type="hidden" name="weekStart" value={week} />
          <SubmitButton size="sm" variant="secondary" confirm="Replace this week with last week's menu?">Copy last week</SubmitButton>
        </form>
      </div>
      <form action={saveMenuAction}>
        <input type="hidden" name="hostelId" value={id} />
        <input type="hidden" name="weekStart" value={week} />
        <Card className="space-y-4">
          <label className="block max-w-sm text-sm">
            <span className="mb-1 block font-medium">Theme</span>
            <Input name="theme" maxLength={80} defaultValue={menu?.theme} placeholder="South Indian week" />
          </label>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr><th className="py-2 pr-2">Day</th>{MEALS.map((m) => <th key={m} className="px-2 py-2">{m}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {days.map((d) => (
                  <tr key={d}>
                    <td className="py-2 pr-2 align-top font-medium">{weekday(d)}<div className="text-xs font-normal text-ink-muted">{dateLabel(d)}</div></td>
                    {MEALS.map((m) => {
                      const slot = `${d}|${m}`;
                      const it = item(d, m);
                      return (
                        <td key={m} className="space-y-1 px-2 py-2 align-top">
                          <input type="hidden" name="slot" value={slot} />
                          <Input name={`veg:${slot}`} defaultValue={it?.vegDish} placeholder="Veg dish" className="h-8" />
                          <Input name={`nonveg:${slot}`} defaultValue={it?.nonVegDish ?? ''} placeholder="Non-veg (optional)" className="h-8" />
                          {partners.length > 0 && (
                            <Select name={`partner:${slot}`} defaultValue={it?.foodPartnerId ?? ''} className="h-8 text-xs">
                              <option value="">Own kitchen</option>
                              {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
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
          <p className="text-xs text-ink-muted">Leave a veg dish empty to skip that meal. Subscribers see the menu in their app and can skip meals before the cut-off.</p>
          <SubmitButton>Save menu</SubmitButton>
        </Card>
      </form>
    </div>
  );
}
