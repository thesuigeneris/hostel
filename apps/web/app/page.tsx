import { AREAS, FOOD_PLANS, OWNER_PLANS } from '@hostels/shared';
import Link from 'next/link';
import { HostelCard } from '@/components/HostelCard';
import { LinkButton, Select } from '@/components/ui';
import { publicApi } from '@/lib/api';
import { rupees } from '@/lib/format';

export default async function Home() {
  const [featured, areas] = await Promise.all([
    publicApi().hostels.search({ verified: 'true', limit: 6 }).catch(() => ({ items: [] })),
    publicApi().hostels.areas().catch(() => []),
  ]);
  return (
    <>
      <section className="bg-gradient-to-b from-brand-soft to-bg">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <p className="text-sm font-medium uppercase tracking-wider text-brand">Hostels &amp; PGs in Hyderabad</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-ink sm:text-6xl">
            Live anywhere. Eat well. <span className="text-brand">No advance.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-ink-soft">
            Real photos, live beds and reviews only from people who actually lived there. Subscribe to a verified partner hostel and
            pay one monthly bill for your bed and food. Move between partner hostels whenever you like.
          </p>
          <form action="/hostels" className="mt-8 flex max-w-xl flex-col gap-2 rounded-2xl bg-surface p-2 shadow-card sm:flex-row">
            <Select name="area" aria-label="Area" defaultValue="" className="border-0 sm:flex-1">
              <option value="">All areas</option>
              {AREAS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </Select>
            <Select name="verified" aria-label="Type" defaultValue="" className="border-0 sm:w-48">
              <option value="">All hostels</option>
              <option value="true">Verified partners only</option>
            </Select>
            <button type="submit" className="h-10 rounded-xl bg-brand px-6 font-medium text-white hover:bg-brand-dark">Search</button>
          </form>
          <div className="mt-4 flex flex-wrap gap-2">
            {areas.map((a) => (
              <Link key={a.slug} href={`/hostels-in/${a.slug}`} className="rounded-full border border-line bg-surface px-3 py-1 text-sm text-ink-soft no-underline hover:border-brand hover:text-brand">
                {a.area} <span className="text-ink-muted">· {a.count}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="flex items-end justify-between">
          <h2 className="text-2xl font-semibold">Verified partner hostels</h2>
          <Link href="/hostels?verified=true" className="text-sm text-brand">See all</Link>
        </div>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {featured.items.map((h) => (
            <HostelCard key={h.id} h={h} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-2xl font-semibold">One bill. Bed and food.</h2>
        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {[
            ['No advance, ever', 'Partner hostels take no deposit. Your first bill is just your first month.'],
            ['Food that rotates', 'Weekly themed menus, from South Indian week to Chinese day. Skip a meal before the cut-off and it comes off your next bill.'],
            ['Move anytime', 'Switch to another partner hostel from your next bill. No fee, no paperwork.'],
          ].map(([t, d]) => (
            <div key={t} className="rounded-2xl border border-line bg-surface p-6">
              <div className="font-semibold">{t}</div>
              <p className="mt-2 text-sm text-ink-soft">{d}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {Object.entries(FOOD_PLANS).map(([key, p]) => (
            <div key={key} className="rounded-xl bg-food-soft px-4 py-3 text-sm">
              <span className="font-medium text-ink">{p.label}</span>
              <span className="float-right text-food">{p.price ? `${rupees(p.price)}/mo` : 'Free'}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-6 rounded-2xl bg-brand p-8 text-white md:grid-cols-2 md:p-12">
          <div>
            <h2 className="text-2xl font-semibold">Run a hostel? Join under our brand.</h2>
            <p className="mt-3 text-white/80">
              List free with photos, map and live beds. Upgrade to Pro ({rupees(OWNER_PLANS.pro.price)}/month) for the resident app, rent
              tracker and issue desk, or become a verified Partner for subscription tenants with our brand on your board.
            </p>
          </div>
          <div className="flex items-center gap-3 md:justify-end">
            <LinkButton href="/for-owners" variant="secondary" size="lg">See plans</LinkButton>
            <LinkButton href="/login?role=owner&next=/owner" variant="food" size="lg">List your hostel</LinkButton>
          </div>
        </div>
      </section>
    </>
  );
}
