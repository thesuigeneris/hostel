import Link from 'next/link';
import { createApiClient } from '@hostels/shared';
import { HostelCard } from '@/components/public/hostel-card';
import { load } from '@/components/public/safe';
import { SearchBox } from '@/components/public/search-box';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { API_URL, TAGLINE } from '@/lib/config';
import { rupees } from '@/lib/format';

export const dynamic = 'force-dynamic';

const HERO = 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1600';

const STEPS = [
  { title: 'Subscribe, no advance', body: 'Pick a verified hostel and room. Pay one monthly bill for bed and food. No deposit, no broker.' },
  { title: 'Food that rotates', body: 'Kitchens cook a themed menu every week, like South Indian week or Hyderabadi week. Skip a meal before the cut-off and get credit on your next bill.' },
  { title: 'Move anytime', body: 'New job across town? Move to another partner hostel. The new room’s rent starts from your next bill.' },
];

export default async function Home() {
  const api = createApiClient(API_URL);
  const [areas, featured] = await Promise.all([
    load(api.areas()),
    load(api.hostels.search({ verified: true, sort: 'recommended', pageSize: 6 })),
  ]);

  return (
    <>
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 md:grid-cols-[1.1fr_1fr] md:py-20">
          <div>
            <p className="mb-3 inline-flex rounded-full bg-brand-soft px-3 py-1 text-xs font-medium text-brand">Hostels & PGs in Hyderabad</p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight text-ink sm:text-5xl">{TAGLINE}</h1>
            <p className="mt-4 max-w-lg text-lg text-muted">
              Verified hostels with home-style food, one monthly bill and no advance. Every review comes from someone who actually lives there.
            </p>
            <SearchBox className="mt-8 max-w-xl" />
            {areas.ok && areas.data.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {areas.data.slice(0, 6).map((a) => (
                  <Link
                    key={a.slug}
                    href={`/hostels-in/${a.slug}`}
                    className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-muted hover:border-brand hover:text-brand"
                  >
                    {a.area} <span className="text-xs">({a.hostelCount})</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="relative hidden md:block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={HERO} alt="A bright, tidy hostel room" className="aspect-[4/5] w-full rounded-[28px] object-cover shadow-xl" />
            <Card className="absolute -bottom-6 -left-6 w-64 p-4 shadow-lg">
              <div className="text-xs font-medium uppercase tracking-wide text-food">This week</div>
              <div className="mt-1 font-semibold">Hyderabadi week</div>
              <div className="mt-1 text-sm text-muted">Chicken dum biryani · Mirchi ka salan · Double ka meetha</div>
            </Card>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Verified partner hostels</h2>
            <p className="mt-1 text-sm text-muted">Subscribe with no advance. Food included. Move between them anytime.</p>
          </div>
          <ButtonLink href="/search?verified=true" variant="secondary" size="sm">
            See all
          </ButtonLink>
        </div>
        {!featured.ok ? (
          <EmptyState title="Hostels are loading slowly">We couldn&apos;t load hostels right now. Try searching instead.</EmptyState>
        ) : featured.data.items.length === 0 ? (
          <EmptyState title="No verified hostels yet">Check back soon, new partners are joining every week.</EmptyState>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featured.data.items.map((h) => (
              <HostelCard key={h.id} h={h} />
            ))}
          </div>
        )}
      </section>

      <section className="bg-surface py-14">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.title}>
                <div className="grid h-10 w-10 place-items-center rounded-full bg-brand text-sm font-semibold text-white">{i + 1}</div>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-muted">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="p-6">
            <div className="text-xs font-medium uppercase tracking-wide text-brand">Trust</div>
            <h3 className="mt-2 text-xl font-semibold">Reviews only from verified residents</h3>
            <p className="mt-2 text-sm text-muted">
              Only people who have actually lived in a hostel can review it. Owners can reply, but they can&apos;t delete what residents write.
            </p>
          </Card>
          <Card className="p-6">
            <div className="text-xs font-medium uppercase tracking-wide text-food">Transparency</div>
            <h3 className="mt-2 text-xl font-semibold">A public record of how issues get fixed</h3>
            <p className="mt-2 text-sm text-muted">
              Residents report problems like WiFi, water or food. Every hostel page shows how many issues were raised, how many got fixed and how fast.
            </p>
          </Card>
        </div>
      </section>

      {areas.ok && areas.data.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-6">
          <h2 className="text-2xl font-semibold tracking-tight">Popular areas</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {areas.data.map((a) => (
              <Link
                key={a.slug}
                href={`/hostels-in/${a.slug}`}
                className="flex items-center justify-between rounded-[var(--radius-card)] border border-line bg-surface p-4 hover:border-brand"
              >
                <div>
                  <div className="font-medium">{a.area}</div>
                  <div className="text-xs text-muted">
                    {a.hostelCount} hostels · {a.city}
                  </div>
                </div>
                <div className="text-sm text-muted">from {rupees(a.minRent)}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="flex flex-col items-start justify-between gap-6 rounded-[28px] bg-brand px-8 py-10 text-white md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-semibold">Run a hostel or PG?</h2>
            <p className="mt-2 max-w-xl text-white/80">
              List for free, get residents through us, and run your hostel with our software: resident register, rent ledger and issue desk.
            </p>
          </div>
          <Link href="/for-hostels" className="rounded-full bg-white px-6 py-3 font-medium text-brand hover:bg-brand-soft">
            Grow your hostel
          </Link>
        </div>
      </section>
    </>
  );
}
