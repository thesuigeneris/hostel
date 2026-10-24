import { DEFAULT_PLATFORM_FEE_PCT, ISSUE_AUTOCLOSE_DAYS, OWNER_DOWNGRADE_DAYS, OWNER_PLANS, OWNER_TRIAL_MONTHS, REVIEW_MIN_STAY_DAYS, TRANSPARENCY_WINDOW_DAYS } from '@hostels/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, cx, focusRing, LinkButton } from '@/components/ui';
import { currentUser } from '@/lib/api';
import { rupees } from '@/lib/format';

export const metadata: Metadata = {
  title: 'For hostel owners',
  description: 'List your hostel free, run it on our software, or join the Hostels brand as a verified partner with online monthly billing.',
  alternates: { canonical: '/for-owners' },
};

const TIERS = [
  {
    id: 'free',
    tagline: 'Get found',
    features: ['Listing with photos, rooms and bed counts', 'Visit requests by phone and WhatsApp', 'Reviews from your residents', 'Issue reporting for your residents'],
  },
  {
    id: 'pro',
    tagline: 'Run your hostel',
    features: ['Everything in Free', 'Resident register with phone invites', 'Rent tracker: who paid, who is due', 'Community board with announcements'],
  },
  {
    id: 'partner',
    tagline: 'Join the Hostels brand',
    features: [
      'Everything in Pro',
      '“Verified partner” badge, listed first in search',
      'Residents subscribe and pay online, no advance',
      'Weekly menus, meal skips and kitchen headcount',
      `Monthly payouts, ${DEFAULT_PLATFORM_FEE_PCT}% platform fee on resident bills paid through Hostels`,
    ],
  },
] as const;

const STEPS = [
  ['Create the listing', 'Name, address, map pin, amenities and house rules. About five minutes.'],
  ['Add rooms and photos', 'Each sharing type with its rent, advance and free beds, plus photos of rooms, bathrooms and the kitchen.'],
  ['Send it for review', 'The Hostels team reads the listing before it appears in search. If something needs changing, you see the reason.'],
  ['Go live, upgrade if you want', 'Free stays free. Pro and Partner can be switched on per hostel, and switched off again.'],
] as const;

const HERO_BUTTON = cx('inline-flex h-12 items-center justify-center rounded-xl px-6 text-base font-medium no-underline transition duration-feedback', focusRing);

export default async function ForOwnersPage() {
  const user = await currentUser();
  const start = user?.role === 'owner' || user?.role === 'admin' ? '/owner/hostels/new' : '/login?role=owner&next=/owner/hostels/new';
  const faq = [
    ['What happens in the review?', 'The Hostels team reads your listing before it appears in search, and approves it or sends it back with a reason. It is not an in-person inspection; Partner verification is.'],
    [
      'How does Partner verification work?',
      'Someone from the Hostels team visits in person and checks that the photos match, rooms are clean and the kitchen is safe. The badge appears only after that visit.',
    ],
    [
      'What does a Partner pay?',
      `${rupees(OWNER_PLANS.partner.price)} a month for the plan, plus ${DEFAULT_PLATFORM_FEE_PCT}% of the resident bills (rent and food) paid through Hostels, taken from your monthly payout. Residents pay no advance and no booking fee.`,
    ],
    [
      'Is there a free trial?',
      `Pro and Partner are free for the first ${OWNER_TRIAL_MONTHS === 1 ? 'month' : `${OWNER_TRIAL_MONTHS} months`}. If a plan bill is ${OWNER_DOWNGRADE_DAYS} days overdue, the hostel goes back to the Free features until it is paid; the listing stays up.`,
    ],
    [
      'Who can review my hostel?',
      `Only people who have lived there for at least ${REVIEW_MIN_STAY_DAYS} days: residents who subscribed through Hostels, or residents you added to your register. Each review says which. You can reply publicly.`,
    ],
    [
      'What is the public issue record?',
      `For the last ${TRANSPARENCY_WINDOW_DAYS} days, how many issues residents reported and how fast they were answered and fixed. Details stay private. Resolved issues close on their own after ${ISSUE_AUTOCLOSE_DAYS} days if the resident doesn't respond.`,
    ],
  ] as const;

  return (
    <div>
      <section className="bg-brand text-brand-on">
        <div className="mx-auto max-w-content px-4 py-16 sm:py-24">
          <p className="text-sm font-medium uppercase tracking-wide text-brand-on/80">For hostel and PG owners in Hyderabad</p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            Fill your beds. Run your hostel from your phone. Grow with a brand residents trust.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-brand-on/90">
            List free today. Switch on our software or the Hostels brand later, per hostel, when it’s worth it to you.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {/* Own classes rather than overriding a variant: Tailwind resolves conflicting colours by stylesheet order, not class order. */}
            <Link href={start} className={cx(HERO_BUTTON, 'bg-surface text-brand hover:bg-brand-soft')}>List your hostel free</Link>
            <a href="#plans" className={cx(HERO_BUTTON, 'border border-white/50 text-brand-on hover:bg-white/10')}>See plans</a>
          </div>
        </div>
      </section>

      <section aria-labelledby="why-heading" className="mx-auto max-w-content px-4 py-14">
        <h2 id="why-heading" className="sr-only">Why list on Hostels</h2>
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            ['Visibility', 'Your listing shows in search, on area pages and to search engines, with the bed count you keep up to date, so people call when you have room.'],
            ['Trust', `Only residents who stayed ${REVIEW_MIN_STAY_DAYS}+ days can review, and your issue response time is public. Well-run hostels stand out.`],
            ['Less work', 'Rent tracking, resident lists, menus and announcements in one place instead of notebooks and WhatsApp groups.'],
          ].map(([title, text]) => (
            <div key={title}>
              <h3 className="text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-ink-soft">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="steps-heading" className="border-y border-line bg-surface">
        <div className="mx-auto max-w-content px-4 py-14">
          <h2 id="steps-heading" className="font-display text-3xl font-semibold tracking-tight">From sign-up to live</h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(([title, text], i) => (
              <li key={title} className="flex gap-4 lg:block">
                <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-soft font-semibold text-brand">{i + 1}</span>
                <div className="lg:mt-4">
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-1 text-sm text-ink-soft">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="plans" aria-labelledby="plans-heading" className="mx-auto max-w-content scroll-mt-24 px-4 py-14">
        <h2 id="plans-heading" className="font-display text-3xl font-semibold tracking-tight">Plans</h2>
        <p className="mt-1 text-ink-soft">
          Per hostel, billed monthly. Pro and Partner are free for the first {OWNER_TRIAL_MONTHS === 1 ? 'month' : `${OWNER_TRIAL_MONTHS} months`}. Downgrade anytime.
        </p>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {TIERS.map((t) => (
            <Card key={t.id} className={t.id === 'partner' ? 'flex flex-col border-brand ring-2 ring-brand/20' : 'flex flex-col'}>
              <div className="text-sm font-medium text-ink-muted">{t.tagline}</div>
              <h3 className="mt-1 text-xl font-semibold">{OWNER_PLANS[t.id].label}</h3>
              <div className="mt-3 text-3xl font-semibold tabular-nums">
                {OWNER_PLANS[t.id].price ? rupees(OWNER_PLANS[t.id].price) : '₹0'}
                <span className="text-base font-normal text-ink-muted"> /month</span>
              </div>
              {t.id === 'partner' && <div className="text-sm text-ink-soft">+ {DEFAULT_PLATFORM_FEE_PCT}% of resident bills paid through Hostels</div>}
              <ul className="mt-5 flex-1 space-y-2 text-sm">
                {t.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0 fill-brand"><path d="m8 13.6-3.6-3.6L3 11.4l5 5 9-9L15.6 6z" /></svg>
                    {f}
                  </li>
                ))}
              </ul>
              <LinkButton href={start} variant={t.id === 'partner' ? 'primary' : 'secondary'} className="mt-6 w-full">
                {t.id === 'free' ? 'List free' : `Start with ${OWNER_PLANS[t.id].label}`}
              </LinkButton>
            </Card>
          ))}
        </div>
        <p className="mt-4 text-xs text-ink-muted">You choose a plan after your listing is created. Every listing starts on Free.</p>
      </section>

      <section aria-labelledby="owner-faq-heading" className="mx-auto max-w-prose px-4 pb-16">
        <h2 id="owner-faq-heading" className="font-display text-3xl font-semibold tracking-tight">Questions owners ask</h2>
        <div className="mt-6 divide-y divide-line rounded-2xl border border-line bg-surface">
          {faq.map(([q, a]) => (
            <details key={q} className="group px-5 py-4">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                {q}
                <span aria-hidden="true" className="text-xl text-ink-muted transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 text-sm text-ink-soft">{a}</p>
            </details>
          ))}
        </div>
        <div className="mt-8 text-center">
          <LinkButton href={start} size="lg">List your hostel free</LinkButton>
        </div>
      </section>
    </div>
  );
}
