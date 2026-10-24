import type { Metadata } from 'next';
import { DevBanner } from '@/components/dev-banner';
import { SiteFooter, SiteHeader } from '@/components/site-header';
import { SITE_NAME, SITE_URL, TAGLINE } from '@/lib/config';
import { getCurrentUser } from '@/lib/session';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} — ${TAGLINE}`, template: `%s · ${SITE_NAME}` },
  description: 'Find verified hostels and PGs with food in Hyderabad. One monthly bill, no advance, honest reviews from residents.',
  openGraph: { siteName: SITE_NAME, type: 'website', locale: 'en_IN' },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser().catch(() => null);
  return (
    <html lang="en-IN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen">
        <DevBanner />
        <SiteHeader user={user} />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
