import { DEFAULT_PLATFORM_FEE_PCT, OWNER_PLANS } from '@hostels/shared';
import type { Metadata } from 'next';
import { Card, LinkButton } from '@/components/ui';
import { currentUser } from '@/lib/api';
import { rupees } from '@/lib/format';

export const metadata: Metadata = {
  title: 'For hostel owners',
  description: 'List your hostel free, run it on our software, or join the Hostels brand as a verified partner. Fill beds with tenants who pay online every month.',
  alternates: { canonical: '/for-owners' },
};

const TIERS = [
  {
    id: 'free',
    tagline: 'Get found',
    features: ['Listing with photos, rooms and bed counts', 'Visit requests by phone and WhatsApp', 'Verified reviews from your residents', 'Issue reporting for your residents'],
  },
  {
    id: 'pro',
    tagline: 'Run your hostel',
    features: ['Everything in Free', 'Resident register with phone invites', 'Rent tracker: who paid, who is due', 'Community board with announcements'],
  },
  {
    id: 'partner',
    tagline: 'Join the Hostels brand',
    features: ['Everything in Pro', '“Verified partner” badge and top placement', 'Tenants subscribe and pay online, no advance', 'Weekly menus, meal skips and kitchen headcount', `Monthly payouts, ${DEFAULT_PLATFORM_FEE_PCT}% platform fee on collected rent`],
  },
] as const;

export default async function ForOwnersPage() {
  const user = await currentUser();
  const start = user?.role === 'owner' || user?.role === 'admin' ? '/owner/hostels/new' : '/login?role=owner&next=/owner/hostels/new';
  return (
    <div>
      <section className="bg-brand text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <p className="text-sm font-medium uppercase tracking-wide text-white/70">For hostel and PG owners</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">Fill your beds. Run your hostel from your phone. Grow with a brand tenants trust.</h1>
          <p className="mt-4 max-w-2xl text-lg text-white/80">
            Thousands of students and young professionals look for hostels in Hyderabad every month. List free today, and upgrade when you want our software or the Hostels brand.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton href={start} size="lg" className="bg-white text-brand hover:bg-brand-soft">List your hostel free</LinkButton>
            <LinkButton href="#plans" size="lg" variant="ghost" className="text-white hover:bg-white/10 hover:text-white">See plans</LinkButton>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-14 sm:grid-cols-3">
        {[
          ['Visibility', 'Your listing shows on search, area pages and Google, with live bed counts so tenants call when you actually have room.'],
          ['Trust', 'Reviews come only from verified residents, and your issue response time is public. Good hostels finally stand out.'],
          ['Less work', 'Rent tracking, resident lists, menus and announcements in one place instead of notebooks and WhatsApp groups.'],
        ].map(([title, text]) => (
          <div key={title}>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="mt-2 text-ink-soft">{text}</p>
          </div>
        ))}
      </section>

      <section id="plans" className="mx-auto max-w-6xl scroll-mt-24 px-4 pb-16">
        <h2 className="text-2xl font-semibold">Plans</h2>
        <p className="mt-1 text-ink-soft">Per hostel, billed monthly. Pro and Partner are free for the first month. Downgrade anytime.</p>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {TIERS.map((t) => (
            <Card key={t.id} className={t.id === 'partner' ? 'border-brand ring-2 ring-brand/20' : ''}>
              <div className="text-sm font-medium text-ink-muted">{t.tagline}</div>
              <div className="mt-1 text-xl font-semibold">{OWNER_PLANS[t.id].label}</div>
              <div className="mt-3 text-3xl font-semibold">
                {OWNER_PLANS[t.id].price ? rupees(OWNER_PLANS[t.id].price) : '₹0'}
                <span className="text-base font-normal text-ink-muted"> /month</span>
              </div>
              {t.id === 'partner' && <div className="text-sm text-ink-soft">+ {DEFAULT_PLATFORM_FEE_PCT}% of rent collected through us</div>}
              <ul className="mt-5 space-y-2 text-sm">
                {t.features.map((f) => <li key={f} className="flex gap-2"><span className="text-brand">✓</span>{f}</li>)}
              </ul>
              <LinkButton href={start} variant={t.id === 'partner' ? 'primary' : 'secondary'} className="mt-6 w-full">
                {t.id === 'free' ? 'List free' : `Start with ${OWNER_PLANS[t.id].label}`}
              </LinkButton>
            </Card>
          ))}
        </div>
        <p className="mt-4 text-xs text-ink-muted">Partner hostels are checked in person by our team before the badge goes live. You choose your plan after your listing is created.</p>
      </section>
    </div>
  );
}
