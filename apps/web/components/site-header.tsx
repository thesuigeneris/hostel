import Link from 'next/link';
import type { User } from '@hostels/shared';
import { SITE_NAME } from '@/lib/config';
import { buttonClass } from './ui/button';
import { SignOutButton } from './sign-out-button';

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight text-brand">
      <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand text-sm font-bold text-white">H</span>
      {SITE_NAME}
    </Link>
  );
}

export function SiteHeader({ user }: { user: User | null }) {
  const links = [
    { href: '/search', label: 'Find a hostel' },
    { href: '/for-hostels', label: 'For hostel owners' },
    ...(user ? [{ href: '/account', label: 'My stay' }, { href: '/community', label: 'Community' }] : []),
    ...(user && (user.role === 'owner' || user.role === 'admin') ? [{ href: '/owner', label: 'Owner dashboard' }] : []),
    ...(user?.role === 'admin' ? [{ href: '/admin', label: 'Admin' }] : []),
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
        <Logo />
        <nav className="hidden flex-1 items-center gap-1 md:flex" aria-label="Main">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-full px-3 py-1.5 text-sm text-muted hover:bg-brand-soft hover:text-brand">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              <Link href="/account/profile" className="hidden text-sm text-muted hover:text-ink sm:block">
                {user.name || user.phone}
              </Link>
              <SignOutButton />
            </>
          ) : (
            <Link href="/login" className={buttonClass('primary', 'sm')}>
              Sign in
            </Link>
          )}
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-line px-4 py-2 md:hidden" aria-label="Main mobile">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="whitespace-nowrap rounded-full px-3 py-1 text-sm text-muted hover:bg-brand-soft">
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm text-muted sm:grid-cols-3">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs">Verified hostels and PGs with food, no advance, and honest reviews from people who live there.</p>
        </div>
        <div className="space-y-2">
          <div className="font-medium text-ink">Find</div>
          <Link href="/search" className="block hover:text-ink">Search hostels</Link>
          <Link href="/hostels-in/gachibowli" className="block hover:text-ink">Hostels in Gachibowli</Link>
          <Link href="/hostels-in/madhapur" className="block hover:text-ink">Hostels in Madhapur</Link>
        </div>
        <div className="space-y-2">
          <div className="font-medium text-ink">Hostel owners</div>
          <Link href="/for-hostels" className="block hover:text-ink">List your hostel free</Link>
          <Link href="/for-hostels#pricing" className="block hover:text-ink">Pricing</Link>
          <Link href="/owner" className="block hover:text-ink">Owner dashboard</Link>
        </div>
      </div>
    </footer>
  );
}
