import type { Metadata } from 'next';
import { DEFAULT_PLATFORM_FEE_PCT, OWNER_PLAN_PRICING } from '@hostels/shared';
import { Badge, VerifiedBadge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { rupees } from '@/lib/format';

export const metadata: Metadata = {
  title: 'For hostel owners',
  description:
    'List your hostel or PG free. Get verified, fill empty beds with no-advance subscribers, and run rent, residents and issues from one dashboard.',
};

const SIGNUP = '/login?role=owner&next=/owner/hostels/new';

const PROBLEMS = [
  { title: 'Empty beds every month', body: 'Tenants leave without notice and new ones find you only through brokers and wall posters.' },
  { title: 'WhatsApp chaos', body: 'Complaints, menu questions and rent reminders buried across a dozen groups and personal chats.' },
  { title: 'Cash rent in a notebook', body: 'Who paid, who is late, who left owing — tracked from memory and a register.' },
  { title: 'Bad reviews, no right to reply', body: 'One angry post on a listing site sticks forever, with no record of what you fixed.' },
];

const BENEFITS = [
  { title: 'Free listing', body: 'Photos, exact map pin, room types, rent and live beds free. Seekers request visits or WhatsApp you directly.' },
  { title: 'Verified badge', body: 'We inspect and verify partner hostels. The badge puts you at the top of search and builds instant trust.' },
  { title: 'Subscription demand', body: 'Partners receive tenants who pay one monthly bill for bed + food with no advance — and can move between partner hostels.' },
  { title: 'Food partner meals', body: 'Run a weekly themed menu from your kitchen and add partner-brand nights from EatSure, FreshMenu and more.' },
  { title: 'Software that runs the house', body: 'Resident register, rent ledger, issue desk, announcements and a daily meal headcount after skips.' },
  { title: 'Monthly payouts', body: 'For subscription tenants we collect online and pay you monthly with a clear statement.' },
];

const LOOP = [
  { step: '1', title: 'Residents speak up', body: 'Verified residents rate their stay and report issues on your hostel board.' },
  { step: '2', title: 'You respond in public', body: 'Acknowledge, fix and resolve. Reply to every review. Your response time is on record.' },
  { step: '3', title: 'Seekers trust you', body: 'Hostel pages show verified-resident reviews and how fast you resolve issues.' },
  { step: '4', title: 'Search lifts you', body: 'Well-run hostels rank higher, get more views and more visit requests.' },
];

const FAQ = [
  { q: 'Is listing really free?', a: 'Yes. Listing, photos, the visit inbox, resident reviews and the issue board cost nothing, forever.' },
  {
    q: 'What does Hostels Pro add?',
    a: `For ${rupees(OWNER_PLAN_PRICING.pro.price)} per hostel per month you get the resident register, rent ledger, announcements, issue-desk analytics, boosted placement and insights. Cancel anytime — you drop back to Free immediately.`,
  },
  {
    q: 'How does the verified partner programme work?',
    a: `After a visit we verify your hostel. Subscription tenants then book you with no advance and pay us monthly; we keep a ${DEFAULT_PLATFORM_FEE_PCT}% platform fee and pay you the rest every month.`,
  },
  { q: 'Can residents post anything they like about me?', a: 'Only verified residents can review or report issues. You can reply to every review, and abusive content is moderated by our team.' },
  { q: 'Do I need to change how I run my kitchen?', a: 'No. You publish a weekly menu and see a daily headcount per meal, split veg and non-veg, so you cook the right amount.' },
];

export default function ForHostelsPage() {
  return (
    <div>
      {/* Hero */}
      <section className="border-b border-line bg-brand text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-2 md:py-24">
          <div>
            <Badge className="bg-white/15 text-white">For hostel & PG owners</Badge>
            <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Your hostel, our brand.
              <br />
              Full houses, zero chaos.
            </h1>
            <p className="mt-4 max-w-lg text-lg text-white/80">
              List free, get verified, and fill beds with tenants who pay monthly with no advance. Run rent, residents, food and complaints from one
              dashboard.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href={SIGNUP} size="lg" variant="food">
                List your hostel free
              </ButtonLink>
              <ButtonLink href="#pricing" size="lg" variant="secondary" className="border-white/30 bg-transparent text-white hover:border-white hover:text-white">
                See pricing
              </ButtonLink>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 self-center">
            {[
              ['0', 'advance for subscribers'],
              ['1', 'monthly bill, bed + food'],
              ['24h', 'to go live after review'],
              [`${DEFAULT_PLATFORM_FEE_PCT}%`, 'fee only on subscription revenue'],
            ].map(([n, l]) => (
              <div key={l} className="rounded-[var(--radius-card)] bg-white/10 p-5">
                <div className="text-3xl font-semibold">{n}</div>
                <div className="mt-1 text-sm text-white/75">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Problems */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Running a hostel shouldn&apos;t feel like this</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PROBLEMS.map((p) => (
            <Card key={p.title} className="p-5">
              <div className="text-base font-semibold">{p.title}</div>
              <p className="mt-2 text-sm text-muted">{p.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Benefits */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">What you get with Hostels</h2>
          <p className="mt-2 max-w-2xl text-muted">We become your brand and your back office — the way OYO did for budget hotels, built for hostels and PGs.</p>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {BENEFITS.map((b) => (
              <div key={b.title}>
                <div className="flex items-center gap-2 text-base font-semibold">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-soft text-brand">✓</span>
                  {b.title}
                </div>
                <p className="mt-2 text-sm text-muted">{b.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Transparency loop */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Transparency that fills beds</h2>
        <p className="mt-2 max-w-2xl text-muted">Honest hostels win. Every review and every fixed complaint becomes proof that brings the next tenant.</p>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {LOOP.map((l) => (
            <li key={l.step} className="relative rounded-[var(--radius-card)] border border-line bg-surface p-5">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-food text-sm font-semibold text-white">{l.step}</span>
              <div className="mt-3 text-base font-semibold">{l.title}</div>
              <p className="mt-1 text-sm text-muted">{l.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-20 border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Simple pricing</h2>
          <p className="mt-2 text-muted">Per hostel. No setup fee. No lock-in.</p>
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {(['free', 'pro'] as const).map((key) => {
              const plan = OWNER_PLAN_PRICING[key];
              const pro = key === 'pro';
              return (
                <Card key={key} className={pro ? 'border-2 border-food p-6' : 'p-6'}>
                  <div className="flex items-center justify-between">
                    <div className="text-lg font-semibold">{plan.label}</div>
                    {pro && <Badge tone="food">Most popular</Badge>}
                  </div>
                  <div className="mt-3">
                    <span className="text-3xl font-semibold">{plan.price === 0 ? 'Free' : rupees(plan.price)}</span>
                    {plan.price > 0 && <span className="text-sm text-muted"> / hostel / month</span>}
                  </div>
                  <ul className="mt-5 space-y-2 text-sm">
                    {plan.features.map((f) => (
                      <li key={f} className="flex gap-2">
                        <span className="text-brand">✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <ButtonLink href={SIGNUP} variant={pro ? 'food' : 'secondary'} className="mt-6 w-full">
                    {pro ? 'Start with Pro' : 'List for free'}
                  </ButtonLink>
                </Card>
              );
            })}
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div className="text-lg font-semibold">Verified partner</div>
                <VerifiedBadge />
              </div>
              <div className="mt-3">
                <span className="text-3xl font-semibold">{DEFAULT_PLATFORM_FEE_PCT}%</span>
                <span className="text-sm text-muted"> of subscription revenue</span>
              </div>
              <ul className="mt-5 space-y-2 text-sm">
                {[
                  'Verified badge and top placement',
                  'No-advance subscription tenants',
                  'Weekly menu editor + partner-brand meals',
                  'Daily headcount after meal skips',
                  'Online collection and monthly payouts',
                  'Works with Free or Pro',
                ].map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-brand">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <ButtonLink href={SIGNUP} variant="primary" className="mt-6 w-full">
                Apply after listing
              </ButtonLink>
            </Card>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-16">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Questions owners ask</h2>
        <div className="mt-6 divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface">
          {FAQ.map((f) => (
            <details key={f.q} className="group px-5 py-4">
              <summary className="cursor-pointer list-none font-medium marker:hidden">
                <span className="flex items-center justify-between gap-4">
                  {f.q}
                  <span className="text-muted transition-transform group-open:rotate-45">+</span>
                </span>
              </summary>
              <p className="mt-2 text-sm text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4">
        <div className="flex flex-col items-start justify-between gap-4 rounded-[var(--radius-card)] bg-brand-soft p-8 sm:flex-row sm:items-center">
          <div>
            <div className="text-xl font-semibold text-brand">Ready to fill your beds?</div>
            <p className="text-sm text-muted">Takes ten minutes. Your listing goes live after a quick review.</p>
          </div>
          <ButtonLink href={SIGNUP} size="lg">
            List your hostel free
          </ButtonLink>
        </div>
      </section>
    </div>
  );
}
