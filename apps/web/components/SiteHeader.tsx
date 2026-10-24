import type { User } from '@hostels/shared';
import Link from 'next/link';
import { logoutAction } from '@/app/login/actions';

function navFor(user: User | null) {
  const links = [{ href: '/hostels', label: 'Find a hostel' }];
  if (!user || user.role === 'tenant') links.push({ href: '/for-owners', label: 'For owners' });
  if (user?.role === 'tenant') links.push({ href: '/account', label: 'My plan' }, { href: '/stay', label: 'My hostel' });
  if (user?.role === 'owner' || user?.role === 'admin') links.push({ href: '/owner', label: 'Owner dashboard' });
  if (user?.role === 'admin') links.push({ href: '/admin', label: 'Admin' });
  return links;
}

export function SiteHeader({ user }: { user: User | null }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold text-ink no-underline">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-white">H</span>
          <span>Hostels</span>
        </Link>
        <nav className="hidden flex-1 items-center gap-1 md:flex">
          {navFor(user).map((l) => (
            <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sm text-ink-soft no-underline hover:bg-brand-soft hover:text-brand">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              <Link href={user.role === 'tenant' ? '/account' : '/owner'} className="hidden text-sm text-ink-soft no-underline sm:block">
                {user.name || `+91 ${user.phone}`}
              </Link>
              <form action={logoutAction}>
                <button type="submit" className="rounded-lg px-3 py-2 text-sm text-ink-soft hover:bg-brand-soft">
                  Log out
                </button>
              </form>
            </>
          ) : (
            <Link href="/login" className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white no-underline hover:bg-brand-dark">
              Log in
            </Link>
          )}
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-line px-2 py-1 md:hidden">
        {navFor(user).map((l) => (
          <Link key={l.href} href={l.href} className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-ink-soft no-underline">
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm text-ink-soft sm:grid-cols-3">
        <div>
          <div className="font-semibold text-ink">Hostels</div>
          <p className="mt-2">Live anywhere. Eat well. No advance.</p>
        </div>
        <div className="space-y-2">
          <div className="font-medium text-ink">Find</div>
          <Link href="/hostels-in/gachibowli" className="block no-underline hover:text-brand">Hostels in Gachibowli</Link>
          <Link href="/hostels-in/madhapur" className="block no-underline hover:text-brand">Hostels in Madhapur</Link>
          <Link href="/hostels-in/hitech-city" className="block no-underline hover:text-brand">Hostels in HiTech City</Link>
        </div>
        <div className="space-y-2">
          <div className="font-medium text-ink">Owners</div>
          <Link href="/for-owners" className="block no-underline hover:text-brand">List your hostel free</Link>
          <Link href="/for-owners#plans" className="block no-underline hover:text-brand">Pro and Partner plans</Link>
        </div>
      </div>
    </footer>
  );
}
