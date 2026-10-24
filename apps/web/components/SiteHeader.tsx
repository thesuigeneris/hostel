import type { User } from '@hostels/shared';
import Link from 'next/link';
import { logoutAction } from '@/app/login/actions';
import { type NavItem, NavLinks } from './NavLinks';
import { buttonClass } from './ui';

function navFor(user: User | null): NavItem[] {
  const links: NavItem[] = [{ href: '/hostels', label: 'Find a hostel' }];
  if (!user || user.role === 'tenant') links.push({ href: '/for-owners', label: 'For owners' });
  if (user?.role === 'tenant') links.push({ href: '/account', label: 'My plan' }, { href: '/stay', label: 'My hostel' });
  if (user?.role === 'owner' || user?.role === 'admin') links.push({ href: '/owner', label: 'Owner dashboard' });
  if (user?.role === 'admin') links.push({ href: '/admin', label: 'Admin' });
  return links;
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold text-ink no-underline">
      <span aria-hidden className="grid h-9 w-9 place-items-center rounded-xl bg-brand font-display text-lg text-brand-on">H</span>
      <span className="font-display text-lg tracking-tight">Hostels</span>
    </Link>
  );
}

export function SiteHeader({ user }: { user: User | null }) {
  const items = navFor(user);
  const account = user ? (
    <>
      <Link href={user.role === 'tenant' ? '/account' : '/owner'} className="hidden max-w-40 truncate text-sm text-ink-soft no-underline hover:text-brand sm:block">
        {user.name || `+91 ${user.phone}`}
      </Link>
      <form action={logoutAction}>
        <button type="submit" className={buttonClass('ghost', 'sm')}>
          Log out
        </button>
      </form>
    </>
  ) : (
    <Link href="/login" className={buttonClass('primary', 'sm')}>
      Log in
    </Link>
  );
  return (
    <header className="sticky top-0 z-header border-b border-line bg-bg/90 backdrop-blur supports-[backdrop-filter]:bg-bg/80">
      <div className="mx-auto flex h-16 max-w-content items-center gap-4 px-4">
        <Logo />
        <nav aria-label="Main" className="ml-4 hidden flex-1 md:block">
          <NavLinks items={items} variant="bar" />
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {account}
          {/* Small screens: a disclosure menu that works without JavaScript and with the keyboard. */}
          <details className="group relative md:hidden">
            <summary className={buttonClass('secondary', 'sm', 'cursor-pointer list-none [&::-webkit-details-marker]:hidden')}>
              <span>Menu</span>
              <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-current transition group-open:rotate-180"><path d="M5 7l5 6 5-6z" /></svg>
            </summary>
            <nav aria-label="Main" className="absolute right-0 top-12 z-drawer w-64 rounded-2xl border border-line bg-raised shadow-overlay">
              <NavLinks items={items} variant="menu" />
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-content gap-8 px-4 py-12 text-sm text-ink-soft sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs">Hostels and PGs in Hyderabad. Partner hostels: one monthly bill for bed and food, no advance.</p>
        </div>
        <nav aria-label="Find a hostel" className="space-y-2">
          <div className="font-medium text-ink">Find</div>
          <Link href="/hostels" className="block no-underline hover:text-brand">All hostels</Link>
          <Link href="/hostels?verified=true" className="block no-underline hover:text-brand">Verified partners</Link>
          <Link href="/hostels-in/gachibowli" className="block no-underline hover:text-brand">Hostels in Gachibowli</Link>
          <Link href="/hostels-in/madhapur" className="block no-underline hover:text-brand">Hostels in Madhapur</Link>
        </nav>
        <nav aria-label="For owners" className="space-y-2">
          <div className="font-medium text-ink">Owners</div>
          <Link href="/for-owners" className="block no-underline hover:text-brand">List your hostel free</Link>
          <Link href="/for-owners#plans" className="block no-underline hover:text-brand">Pro and Partner plans</Link>
          <Link href="/login?role=owner&next=/owner" className="block no-underline hover:text-brand">Owner login</Link>
        </nav>
        <nav aria-label="Residents" className="space-y-2">
          <div className="font-medium text-ink">Residents</div>
          <Link href="/account" className="block no-underline hover:text-brand">My plan and bills</Link>
          <Link href="/stay" className="block no-underline hover:text-brand">My hostel community</Link>
          <Link href="/#faq" className="block no-underline hover:text-brand">Questions</Link>
        </nav>
      </div>
    </footer>
  );
}
