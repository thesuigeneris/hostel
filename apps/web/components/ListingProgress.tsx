import Link from 'next/link';
import { cx, focusRing } from './ui';

type Listing = { id: string; status: 'draft' | 'pending' | 'live' | 'rejected'; roomTypes: unknown[]; photos: unknown[] } | null;

/**
 * Where a new listing is on its way to going live, worked out from the listing itself: details, rooms,
 * photos, then the team's review. `null` is a listing that hasn't been created yet.
 */
export function ListingProgress({ hostel }: { hostel: Listing }) {
  const base = hostel ? `/owner/hostels/${hostel.id}` : null;
  const steps = [
    { label: 'Details', done: !!hostel, href: base },
    { label: 'Rooms and prices', done: !!hostel?.roomTypes.length, href: base && `${base}/rooms` },
    { label: 'Photos', done: !!hostel?.photos.length, href: base },
    {
      label: hostel?.status === 'pending' ? 'In review' : hostel?.status === 'rejected' ? 'Changes requested' : 'Send for review',
      done: hostel?.status === 'live',
      href: base,
    },
  ];
  const current = steps.findIndex((s) => !s.done);
  if (current === -1) return null;
  return (
    <nav aria-label="Listing progress" className="mb-6 rounded-2xl border border-line bg-surface p-4 shadow-card">
      <p className="text-sm font-medium text-ink">
        Step {current + 1} of {steps.length}: {steps[current]!.label}
      </p>
      <ol className="mt-3 grid grid-cols-4 gap-2">
        {steps.map((s, i) => {
          const state = s.done ? 'done' : i === current ? 'current' : 'todo';
          const body = (
            <>
              <span
                aria-hidden="true"
                className={cx(
                  'block h-1.5 rounded-full',
                  state === 'done' ? 'bg-brand' : state === 'current' ? (hostel?.status === 'rejected' && i === 3 ? 'bg-danger' : 'bg-food') : 'bg-line',
                )}
              />
              <span className={cx('mt-1.5 block text-xs', state === 'todo' ? 'text-ink-muted' : 'font-medium text-ink')}>
                {s.label}
                <span className="sr-only">{state === 'done' ? ' (done)' : state === 'current' ? ' (current step)' : ' (to do)'}</span>
              </span>
            </>
          );
          return (
            <li key={s.label} aria-current={state === 'current' ? 'step' : undefined}>
              {s.href && state !== 'todo' ? (
                <Link href={s.href} className={cx('block rounded-md no-underline', focusRing)}>{body}</Link>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
