import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { SiteFooter, SiteHeader } from '@/components/SiteHeader';
import { currentUser, health, SITE_URL } from '@/lib/api';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Hostels — Live anywhere. Eat well. No advance.', template: '%s · Hostels' },
  description:
    'Find hostels and PGs in Hyderabad by area, rent, sharing and food, with reviews from residents who stayed. Partner hostels: one monthly bill for bed and food, no advance.',
  openGraph: { siteName: 'Hostels', type: 'website', locale: 'en_IN' },
};

export const viewport: Viewport = { themeColor: '#1F5C46', width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [user, status] = await Promise.all([currentUser().catch(() => null), health()]);
  // Anything that is not the real thing is said on every page, including Razorpay test keys (no real money moves).
  const devNotes = status
    ? [status.msg91 === 'stub' && 'OTP is 123456', status.payments === 'simulated' && 'payments are simulated', status.payments === 'razorpay_test' && 'Razorpay test mode, no real money moves'].filter(
        (n): n is string => !!n,
      )
    : [];
  return (
    <html lang="en-IN">
      <body className="min-h-screen">
        <a
          href="#main"
          className="sr-only z-modal rounded-xl bg-brand px-4 py-3 text-brand-on focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to content
        </a>
        {devNotes.length > 0 && (
          <div className="bg-food-soft px-4 py-1 text-center text-xs text-food-ink">Dev mode: {devNotes.join(' · ')}</div>
        )}
        {status === null && <div className="bg-danger-soft px-4 py-1 text-center text-xs text-danger">The API is not reachable. Start it with `bun run dev:api`.</div>}
        <SiteHeader user={user} />
        <main id="main" tabIndex={-1} className="focus:outline-none">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
