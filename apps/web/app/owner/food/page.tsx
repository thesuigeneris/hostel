import Link from 'next/link';
import { addDays, istDate, isIsoDate, weekStart } from '@hostels/shared';
import { ButtonLink } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { EmptyState, PageHeader } from '@/components/ui/states';
import { load } from '@/components/owner/data';
import { HostelPicker } from '@/components/owner/hostel-picker';
import { MenuEditor } from '@/components/owner/menu-editor';
import { LoadError } from '@/components/owner/ui';
import { formatDate, MEAL_LABEL } from '@/lib/format';
import { serverApi } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function FoodPage({ searchParams }: { searchParams: Promise<{ hostelId?: string; week?: string; date?: string }> }) {
  const sp = await searchParams;
  const api = await serverApi();
  const hostels = await load(() => api.owner.hostels());
  if (hostels.error !== null) return <LoadError message={hostels.error} />;
  const partners = hostels.data.filter((h) => h.partnerStatus === 'verified');
  if (partners.length === 0)
    return (
      <div>
        <PageHeader title="Food" />
        <EmptyState title="Menus and headcount are for verified partners" action={<ButtonLink href="/owner/hostels">Apply from your hostel&apos;s Status tab</ButtonLink>}>
          Partner hostels publish a weekly themed menu, add partner-brand meals and see a daily headcount after residents skip meals.
        </EmptyState>
      </div>
    );

  const hostel = partners.find((h) => h.id === sp.hostelId) ?? partners[0]!;
  const today = istDate();
  const week = sp.week && isIsoDate(sp.week) ? weekStart(sp.week) : weekStart(today);
  const date = sp.date && isIsoDate(sp.date) ? sp.date : today;
  const [menu, foodPartners, headcount] = await Promise.all([
    load(() => api.owner.menu(hostel.id, week)),
    load(() => api.foodPartners()),
    load(() => api.owner.headcount(hostel.id, date)),
  ]);
  const href = (w: string, d = date) => `?hostelId=${hostel.id}&week=${w}&date=${d}`;

  return (
    <div className="space-y-8">
      <PageHeader title="Food" subtitle="Plan the week's menu and see how many plates to cook." actions={<HostelPicker hostels={partners} value={hostel.id} />} />

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Headcount</h2>
          <div className="flex items-center gap-2 text-sm">
            <Link href={href(week, addDays(date, -1))} className="rounded-full border border-line px-3 py-1 hover:border-brand">
              ←
            </Link>
            <span className="min-w-36 text-center font-medium">{date === today ? 'Today' : formatDate(date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
            <Link href={href(week, addDays(date, 1))} className="rounded-full border border-line px-3 py-1 hover:border-brand">
              →
            </Link>
          </div>
        </div>
        {headcount.error !== null ? (
          <LoadError message={headcount.error} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {headcount.data.meals.map((m) => (
              <Card key={m.meal}>
                <CardBody>
                  <div className="text-xs font-medium uppercase tracking-wide text-muted">{MEAL_LABEL[m.meal]}</div>
                  <div className="mt-1 text-3xl font-semibold">{m.total}</div>
                  <div className="mt-2 flex gap-3 text-sm">
                    <span className="text-ok">● Veg {m.veg}</span>
                    <span className="text-danger">● Non-veg {m.nonVeg}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted">{m.skipped} skipped</div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Weekly menu</h2>
          <div className="flex items-center gap-2 text-sm">
            <Link href={href(addDays(week, -7))} className="rounded-full border border-line px-3 py-1 hover:border-brand">
              ← Prev
            </Link>
            <span className="min-w-40 text-center font-medium">Week of {formatDate(week, { day: 'numeric', month: 'short' })}</span>
            <Link href={href(addDays(week, 7))} className="rounded-full border border-line px-3 py-1 hover:border-brand">
              Next →
            </Link>
          </div>
        </div>
        {menu.error !== null ? (
          <LoadError message={menu.error} />
        ) : (
          <MenuEditor key={`${hostel.id}-${week}`} hostelId={hostel.id} week={week} menu={menu.data} partners={foodPartners.data ?? []} />
        )}
      </section>
    </div>
  );
}
