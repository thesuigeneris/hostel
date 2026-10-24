import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

/** Visible keyboard focus for every interactive element (2px ring, offset from the element). */
export const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'food';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-brand-on hover:bg-brand-dark',
  secondary: 'bg-surface text-ink border border-control/60 hover:border-ink-soft',
  ghost: 'text-ink-soft hover:bg-brand-soft hover:text-brand',
  danger: 'bg-danger text-white hover:bg-danger/90',
  // White on amber is 2.7:1, so amber buttons carry dark text (5.9:1).
  food: 'bg-food text-ink hover:bg-food/90',
};
const SIZES = { sm: 'h-9 px-3 text-sm', md: 'h-11 px-4 text-sm', lg: 'h-12 px-6 text-base' };

export function buttonClass(variant: Variant = 'primary', size: keyof typeof SIZES = 'md', extra?: string) {
  return cx(
    'inline-flex select-none items-center justify-center gap-2 rounded-xl font-medium no-underline transition duration-feedback ease-out active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
    focusRing,
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

export function Button({ variant, size, className, ...rest }: ComponentProps<'button'> & { variant?: Variant; size?: keyof typeof SIZES }) {
  return <button className={buttonClass(variant, size, className)} {...rest} />;
}

export function LinkButton({ variant, size, className, ...rest }: ComponentProps<typeof Link> & { variant?: Variant; size?: keyof typeof SIZES }) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}

export function Card({ className, ...rest }: ComponentProps<'div'>) {
  return <div className={cx('rounded-2xl border border-line bg-surface p-5 shadow-card', className)} {...rest} />;
}

const BADGES = {
  green: 'bg-brand-soft text-brand',
  food: 'bg-food-soft text-food-ink',
  gray: 'bg-bg text-ink-soft border border-line',
  red: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
};
export function Badge({ tone = 'gray', children, className }: { tone?: keyof typeof BADGES; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', BADGES[tone], className)}>{children}</span>;
}

/** Status shown as text plus colour, never colour alone. */
export function StatusBadge({ status }: { status: string }) {
  const tone: Record<string, keyof typeof BADGES> = {
    live: 'green', verified: 'green', active: 'green', paid: 'green', resolved: 'green', closed: 'gray', contacted: 'green',
    pending: 'food', applied: 'food', due: 'food', invited: 'food', acknowledged: 'food', in_progress: 'food', scheduled: 'food', new: 'food',
    rejected: 'red', void: 'gray', expired: 'gray', cancelled: 'gray', ended: 'gray', declined: 'gray', draft: 'gray', open: 'red', overdue: 'red',
  };
  return <Badge tone={tone[status] ?? 'gray'}>{status.replace(/_/g, ' ')}</Badge>;
}

/** "Verified partner" with what it actually means, so the badge never over-promises. */
export function VerifiedLabel({ compact }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand" title="Listing approved and partner checked by the Hostels team">
      <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current"><path d="M8 0l2 1.5 2.5-.2.8 2.4 2.1 1.4-.8 2.4.8 2.4-2.1 1.4-.8 2.4-2.5-.2L8 16l-2-1.5-2.5.2-.8-2.4L.6 10.9l.8-2.4-.8-2.4 2.1-1.4.8-2.4 2.5.2zm-1 10.6l4.6-4.6-1-1L7 8.6 5.4 7l-1 1z" /></svg>
      {compact ? 'Verified partner' : 'Verified partner · no advance'}
    </span>
  );
}

export function Field({ label, hint, optional, children }: { label: string; hint?: string; optional?: boolean; children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is passed in as children
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink">
        {label}
        {optional && <span className="ml-1 font-normal text-ink-muted">(optional)</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-muted">{hint}</span>}
    </label>
  );
}

const inputBase = cx(
  'w-full rounded-xl border border-control/70 bg-surface px-3 text-base text-ink placeholder:text-ink-muted transition duration-feedback sm:text-sm',
  'hover:border-control focus:border-brand focus:outline-none focus:ring-2 focus:ring-ring/25',
  'disabled:cursor-not-allowed disabled:bg-bg disabled:opacity-70 aria-[invalid=true]:border-danger',
);
export function Input({ className, ...rest }: ComponentProps<'input'>) {
  return <input className={cx(inputBase, 'h-11', className)} {...rest} />;
}
export function Textarea({ className, ...rest }: ComponentProps<'textarea'>) {
  return <textarea className={cx(inputBase, 'min-h-24 py-2', className)} {...rest} />;
}
export function Select({ className, ...rest }: ComponentProps<'select'>) {
  return <select className={cx(inputBase, 'h-11 pr-8', className)} {...rest} />;
}
export function Checkbox({ label, className, ...rest }: Omit<ComponentProps<'input'>, 'type'> & { label: ReactNode }) {
  return (
    <label className={cx('flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink-soft', className)}>
      <input type="checkbox" className={cx('h-5 w-5 rounded border-control accent-brand', focusRing)} {...rest} />
      {label}
    </label>
  );
}

export function Flash({ error, ok }: { error?: string; ok?: string }) {
  if (!error && !ok) return null;
  return (
    <div
      role={error ? 'alert' : 'status'}
      className={cx('mb-4 flex items-start gap-2 rounded-xl px-4 py-3 text-sm', error ? 'bg-danger-soft text-danger' : 'bg-ok-soft text-ok')}
    >
      <span aria-hidden className="font-semibold">{error ? '!' : '✓'}</span>
      <span className="min-w-0 [overflow-wrap:anywhere]">{error ?? ok}</span>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-balance text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-ink-soft [overflow-wrap:anywhere]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-soft">{hint}</div>}
    </Card>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface/60 p-8 text-center">
      <div className="font-medium text-ink">{title}</div>
      {children && <div className="mx-auto mt-1 max-w-prose text-sm text-ink-soft">{children}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx('animate-pulse rounded-xl bg-line/60 motion-reduce:animate-none', className)} />;
}

export function Stars({ value, size = 'sm' }: { value: number | null; size?: 'sm' | 'lg' }) {
  if (value === null) return <span className="text-sm text-ink-muted">No reviews yet</span>;
  const full = Math.round(value);
  return (
    <span className={cx('inline-flex items-center gap-1', size === 'lg' ? 'text-lg' : 'text-sm')}>
      <span aria-hidden className="text-food-star">
        {'★'.repeat(full)}
        <span className="text-line">{'★'.repeat(5 - full)}</span>
      </span>
      <span className="font-medium tabular-nums text-ink">{value.toFixed(1)}</span>
      <span className="sr-only">out of 5</span>
    </span>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line bg-bg text-xs uppercase tracking-wide text-ink-muted">
          <tr>{head.map((h) => <th key={h} scope="col" className="whitespace-nowrap px-4 py-3 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ className, ...rest }: ComponentProps<'td'>) {
  return <td className={cx('px-4 py-3 align-top', className)} {...rest} />;
}

/** Page links with a window around the current page, so 40 pages don't render 40 buttons. */
export function Pagination({ page, pages, href }: { page: number; pages: number; href: (page: number) => string }) {
  if (pages <= 1) return null;
  const nums = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const list = [...nums].sort((a, b) => a - b);
  const item = cx('grid h-11 min-w-11 place-items-center rounded-xl px-3 text-sm no-underline', focusRing);
  return (
    <nav aria-label="Pages" className="mt-8 flex flex-wrap items-center justify-center gap-2">
      {page > 1 && <Link href={href(page - 1)} className={cx(item, 'bg-surface text-ink-soft hover:text-brand')} rel="prev">Previous</Link>}
      {list.map((p, i) => (
        <span key={p} className="contents">
          {i > 0 && p - list[i - 1]! > 1 && <span aria-hidden className="px-1 text-ink-muted">…</span>}
          <Link href={href(p)} aria-current={p === page ? 'page' : undefined} className={cx(item, p === page ? 'bg-brand text-brand-on' : 'bg-surface text-ink-soft hover:text-brand')}>
            {p}
          </Link>
        </span>
      ))}
      {page < pages && <Link href={href(page + 1)} className={cx(item, 'bg-surface text-ink-soft hover:text-brand')} rel="next">Next</Link>}
    </nav>
  );
}

/** A hidden field telling the action which page to come back to. */
export function Back({ to }: { to: string }) {
  return <input type="hidden" name="_back" value={to} />;
}
