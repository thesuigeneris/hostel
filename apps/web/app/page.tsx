import {
  AREAS,
  DEFAULT_PLATFORM_FEE_PCT,
  FOOD_PLANS,
  ISSUE_AUTOCLOSE_DAYS,
  OWNER_PLANS,
  OWNER_TRIAL_MONTHS,
  REVIEW_MIN_STAY_DAYS,
  SKIP_CREDITS,
  SKIP_CUTOFFS,
  TRANSPARENCY_MIN_ISSUES,
  TRANSPARENCY_WINDOW_DAYS,
} from '@hostels/shared';
import Link from 'next/link';
import { HeroVisual } from '@/components/hero/HeroVisual';
import { HostelCard } from '@/components/HostelCard';
import { Reveal } from '@/components/motion';
import { buttonClass, Empty, focusRing, Input, LinkButton, Select } from '@/components/ui';
import { publicApi } from '@/lib/api';
import { rupees } from '@/lib/format';

/** "10 pm the night before" / "9 am": derived from the real cut-off rules so the copy can't drift. */
function cutoffText(meal: keyof typeof SKIP_CUTOFFS) {
  const c = SKIP_CUTOFFS[meal];
  const h = c.hour % 12 || 12;
  const time = `${h}${c.minute ? `:${String(c.minute).padStart(2, '0')}` : ''} ${c.hour < 12 ? 'am' : 'pm'}`;
  return c.dayOffset < 0 ? `${time} the night before` : time;
}

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Do I pay an advance?',
    a: 'Not at verified partner hostels: your first bill is your first month. Free listings set their own terms, including any advance, and show it on their page.',
  },
  {
    q: 'What does the monthly bill include?',
    a: `Rent for your room type plus your food plan (${Object.values(FOOD_PLANS)
      .map((p) => `${p.label} ${p.price ? rupees(p.price) : 'free'}`)
      .join(', ')}), minus credits for meals you skipped.`,
  },
  {
    q: 'How do skipped meals work?',
    a: `Skip a meal in the app before its cut-off (breakfast by ${cutoffText('breakfast')}, lunch by ${cutoffText('lunch')}, dinner by ${cutoffText('dinner')}) and it comes off your next bill: ${rupees(SKIP_CREDITS.breakfast)} for breakfast, ${rupees(SKIP_CREDITS.lunch)} for lunch or dinner.`,
  },
  {
    q: 'Can I move to another hostel?',
    a: 'Yes, between partner hostels. The new room’s rent applies from your next bill. There’s no fee.',
  },
  {
    q: 'How do I cancel?',
    a: 'Cancel any time from your plan. It ends at the close of the period you’ve already paid for, and no further bills are made.',
  },
  {
    q: 'Who can write a review?',
    a: `Only people who lived at the hostel for at least ${REVIEW_MIN_STAY_DAYS} days. Each review says how the stay was confirmed, and the hostel can reply publicly.`,
  },
];

export default async function Home() {
  const [featured, areas] = await Promise.all([
    publicApi().hostels.search({ verified: 'true', limit: 6 }).catch(() => ({ items: [], total: 0 })),
    publicApi().hostels.areas().catch(() => []),
  ]);

  return (
    <>
      {/* Hero: the search is plain HTML and works before (and without) the 3D illustration. */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-soft/70 via-bg to-bg">
        <div className="mx-auto grid max-w-content items-center gap-10 px-4 pb-14 pt-12 sm:pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:pb-20">
          <div>
            <p className="text-sm font-medium uppercase tracking-wider text-brand">Hostels &amp; PGs in Hyderabad</p>
            <h1 className="mt-3 font-display text-4xl font-semibold leading-[1.08] tracking-tight text-ink sm:text-5xl lg:text-6xl">
              Find a place you can feel good about living in.
            </h1>
            <p className="mt-5 max-w-prose text-lg text-ink-soft">
              Compare hostels by area, rent, sharing and food, and read reviews from people who actually stayed. At verified partner hostels, pay one
              monthly bill for your bed and food, with no advance.
            </p>

            <search aria-label="Find a hostel" className="mt-8 block">
            <form action="/hostels" className="rounded-2xl border border-line bg-surface p-3 shadow-raised">
              <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr_auto]">
                <label className="block">
                  <span className="sr-only">Hostel name or street</span>
                  <Input name="q" type="search" placeholder="Hostel name or street" autoComplete="off" enterKeyHint="search" />
                </label>
                <label className="block">
                  <span className="sr-only">Area</span>
                  <Select name="area" defaultValue="">
                    <option value="">All areas</option>
                    {AREAS.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </Select>
                </label>
                <button type="submit" className={buttonClass('primary', 'md', 'px-6')}>
                  Search
                </button>
              </div>
              <label className="mt-2 flex min-h-9 items-center gap-2 px-1 text-sm text-ink-soft">
                <input type="checkbox" name="verified" value="true" className={`h-4 w-4 accent-brand ${focusRing}`} />
                Only verified partners (no advance)
              </label>
            </form>
            </search>

            {areas.length > 0 && (
              <nav aria-label="Popular areas" className="mt-5 flex flex-wrap gap-2">
                {areas.map((a) => (
                  <Link
                    key={a.slug}
                    href={`/hostels-in/${a.slug}`}
                    className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-ink-soft no-underline transition duration-feedback hover:border-brand hover:text-brand"
                  >
                    {a.area} <span className="text-ink-muted">· {a.count}</span>
                  </Link>
                ))}
              </nav>
            )}
          </div>
          <HeroVisual />
        </div>
      </section>

      {/* Trust: what each label means, in plain words. */}
      <section aria-labelledby="trust-heading" className="mx-auto max-w-content px-4 py-14">
        <Reveal>
          <h2 id="trust-heading" className="font-display text-3xl font-semibold tracking-tight">What you can rely on here</h2>
          <p className="mt-2 max-w-prose text-ink-soft">We only show what we can stand behind. Here’s what each label means.</p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <TrustCard title="Verified partner" icon="shield">
              Our team approves every listing before it goes live, and checks partner hostels before they can take subscriptions. Partners take no advance.
            </TrustCard>
            <TrustCard title="Reviews from residents" icon="chat">
              Only people who stayed at least {REVIEW_MIN_STAY_DAYS} days can review, and each review says how the stay was confirmed. Hostels can reply, never edit.
            </TrustCard>
            <TrustCard title="Issues, out in the open" icon="check">
              Hostel pages show how many resident issues were reported in the last {TRANSPARENCY_WINDOW_DAYS} days and how fast they were fixed, once there are
              at least {TRANSPARENCY_MIN_ISSUES}.
            </TrustCard>
          </div>
          <p className="mt-4 text-sm text-ink-muted">Beds free are updated by each hostel. Confirm with them before you visit.</p>
        </Reveal>
      </section>

      <section aria-labelledby="featured-heading" className="mx-auto max-w-content px-4 py-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="featured-heading" className="font-display text-3xl font-semibold tracking-tight">Verified partner hostels</h2>
          <Link href="/hostels?verified=true" className="text-sm font-medium text-brand">
            See all partners <span aria-hidden>→</span>
          </Link>
        </div>
        {featured.items.length ? (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featured.items.map((h) => (
              <HostelCard key={h.id} h={h} />
            ))}
          </div>
        ) : (
          <Empty title="No partner hostels to show right now" action={<LinkButton href="/hostels" variant="secondary">Browse all hostels</LinkButton>}>
            Free listings are still searchable.
          </Empty>
        )}
      </section>

      <section aria-labelledby="how-heading" className="mx-auto max-w-content px-4 py-14">
        <Reveal>
          <h2 id="how-heading" className="font-display text-3xl font-semibold tracking-tight">How finding and staying works</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            <Step n={1} title="Search and compare">
              Filter by area, rent, sharing, who it’s for and food. See photos, rooms, this week’s menu and resident reviews.
            </Step>
            <Step n={2} title="Visit or subscribe">
              Request a visit with any hostel. At a partner hostel, pick a room and food plan and pay your first month online. That’s it.
            </Step>
            <Step n={3} title="Live, eat, move">
              Skip meals before the cut-off and get credit on your next bill. Move between partner hostels from your next bill, or cancel at the end of a paid
              month.
            </Step>
          </ol>
        </Reveal>
      </section>

      <section aria-labelledby="food-heading" className="mx-auto max-w-content px-4 py-6">
        <Reveal>
          <div className="grid gap-6 rounded-2xl border border-line bg-surface p-6 sm:p-8 lg:grid-cols-[1fr_1.2fr] lg:items-center">
            <div>
              <h2 id="food-heading" className="font-display text-2xl font-semibold tracking-tight">Food plans at partner hostels</h2>
              <p className="mt-2 text-ink-soft">The same prices everywhere. Weekly menus are set by each hostel’s kitchen.</p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-3">
              {Object.entries(FOOD_PLANS).map(([key, p]) => (
                <li key={key} className="rounded-xl bg-food-soft px-4 py-3">
                  <div className="text-sm font-medium text-ink">{p.label}</div>
                  <div className="mt-1 text-lg font-semibold tabular-nums text-food-ink">{p.price ? `${rupees(p.price)}/mo` : 'Free'}</div>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </section>

      <section aria-labelledby="issues-heading" className="mx-auto max-w-content px-4 py-14">
        <Reveal>
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 id="issues-heading" className="font-display text-3xl font-semibold tracking-tight">When something breaks, it gets tracked</h2>
              <p className="mt-3 max-w-prose text-ink-soft">
                Residents report problems from their hostel page or the app. Neighbours can add a “me too”. The hostel replies and updates the status, and the
                resident confirms the fix. If they don’t answer, a resolved issue closes after {ISSUE_AUTOCLOSE_DAYS} days.
              </p>
            </div>
            <ol aria-label="How an issue moves" className="relative space-y-4 border-l-2 border-line pl-6">
              {[
                ['Reported', 'A resident describes the problem, with a photo if it helps.'],
                ['Acknowledged', 'The hostel replies, so the resident knows it was seen.'],
                ['Resolved', 'The hostel marks it fixed and says what they did.'],
                ['Confirmed', 'The resident confirms, or reopens it if it isn’t fixed.'],
              ].map(([t, d], i) => (
                <li key={t} className="relative">
                  <span aria-hidden className={`absolute -left-[33px] top-1 grid h-4 w-4 place-items-center rounded-full ring-4 ring-bg ${i === 3 ? 'bg-brand' : 'bg-control'}`} />
                  <div className="font-medium">{t}</div>
                  <p className="text-sm text-ink-soft">{d}</p>
                </li>
              ))}
            </ol>
          </div>
        </Reveal>
      </section>

      <section aria-labelledby="owners-heading" className="mx-auto max-w-content px-4 py-10">
        <div className="grid gap-8 rounded-2xl bg-brand p-8 text-brand-on md:p-12 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <h2 id="owners-heading" className="font-display text-3xl font-semibold tracking-tight">Run a hostel? List it free.</h2>
            <p className="mt-3 max-w-prose text-brand-on/85">
              List with photos, a map pin and the beds you have free. Pro adds the resident register, rent tracker and issue desk. Partners also get
              subscription tenants with no advance and our verified label; we keep {DEFAULT_PLATFORM_FEE_PCT}% of subscription bills. New Pro and Partner plans
              start with {OWNER_TRIAL_MONTHS === 1 ? 'a free month' : `${OWNER_TRIAL_MONTHS} free months`}.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <LinkButton href="/login?role=owner&next=/owner" variant="food" size="lg">
                List your hostel
              </LinkButton>
              <LinkButton href="/for-owners" variant="secondary" size="lg">
                Compare plans
              </LinkButton>
            </div>
          </div>
          <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {Object.entries(OWNER_PLANS).map(([key, p]) => (
              <li key={key} className="flex items-baseline justify-between rounded-xl bg-white/10 px-4 py-3">
                <span className="font-medium">{p.label}</span>
                <span className="tabular-nums">{p.price ? `${rupees(p.price)}/month` : 'Free'}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="faq" aria-labelledby="faq-heading" className="mx-auto max-w-content px-4 py-14">
        <h2 id="faq-heading" className="font-display text-3xl font-semibold tracking-tight">Questions</h2>
        <div className="mt-6 divide-y divide-line rounded-2xl border border-line bg-surface">
          {FAQ.map((f) => (
            <details key={f.q} className="group px-5 py-1">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 font-medium [&::-webkit-details-marker]:hidden">
                {f.q}
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 shrink-0 fill-ink-muted transition duration-feedback group-open:rotate-45">
                  <path d="M9 4h2v12H9zM4 9h12v2H4z" />
                </svg>
              </summary>
              <p className="pb-4 text-ink-soft">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}

const ICONS = {
  shield: 'M10 1l7 3v5c0 4.6-3 8.5-7 10-4-1.5-7-5.4-7-10V4l7-3zm-1 11.6l5.3-5.3-1.4-1.4L9 9.8 7.1 7.9 5.7 9.3z',
  chat: 'M3 3h14a1 1 0 011 1v9a1 1 0 01-1 1H8l-4 3v-3H3a1 1 0 01-1-1V4a1 1 0 011-1zm3 4v2h8V7zm0 3v2h5v-2z',
  check: 'M10 1a9 9 0 110 18 9 9 0 010-18zm-1.2 12.2l5.6-5.6-1.4-1.4-4.2 4.2-2-2-1.4 1.4z',
} as const;

function TrustCard({ title, icon, children }: { title: string; icon: keyof typeof ICONS; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-6">
      <span aria-hidden className="grid h-10 w-10 place-items-center rounded-xl bg-brand-soft">
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 fill-brand"><path d={ICONS[icon]} /></svg>
      </span>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-ink-soft">{children}</p>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="rounded-2xl border border-line bg-surface p-6">
      <span aria-hidden className="font-display text-3xl font-semibold text-brand">{n}</span>
      <h3 className="mt-2 font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-ink-soft">{children}</p>
    </li>
  );
}
