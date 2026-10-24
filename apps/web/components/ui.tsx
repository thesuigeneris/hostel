import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'food';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-dark',
  secondary: 'bg-surface text-ink border border-line hover:border-ink-muted',
  ghost: 'text-ink-soft hover:bg-brand-soft hover:text-brand',
  danger: 'bg-danger text-white hover:opacity-90',
  food: 'bg-food text-white hover:opacity-90',
};
const SIZES = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-sm', lg: 'h-12 px-6 text-base' };

export function buttonClass(variant: Variant = 'primary', size: keyof typeof SIZES = 'md', extra?: string) {
  return cx(
    'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
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
  food: 'bg-food-soft text-food',
  gray: 'bg-bg text-ink-soft border border-line',
  red: 'bg-danger-soft text-danger',
};
export function Badge({ tone = 'gray', children, className }: { tone?: keyof typeof BADGES; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', BADGES[tone], className)}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const tone: Record<string, keyof typeof BADGES> = {
    live: 'green', verified: 'green', active: 'green', paid: 'green', resolved: 'green', closed: 'gray', contacted: 'green',
    pending: 'food', applied: 'food', due: 'food', invited: 'food', acknowledged: 'food', in_progress: 'food', scheduled: 'food', new: 'food',
    rejected: 'red', void: 'gray', expired: 'gray', cancelled: 'gray', ended: 'gray', declined: 'gray', draft: 'gray', open: 'red', overdue: 'red',
  };
  return <Badge tone={tone[status] ?? 'gray'}>{status.replace(/_/g, ' ')}</Badge>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is passed in as children
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-muted">{hint}</span>}
    </label>
  );
}

const inputBase = 'w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20';
export function Input({ className, ...rest }: ComponentProps<'input'>) {
  return <input className={cx(inputBase, 'h-10', className)} {...rest} />;
}
export function Textarea({ className, ...rest }: ComponentProps<'textarea'>) {
  return <textarea className={cx(inputBase, 'min-h-24 py-2', className)} {...rest} />;
}
export function Select({ className, ...rest }: ComponentProps<'select'>) {
  return <select className={cx(inputBase, 'h-10', className)} {...rest} />;
}

export function Flash({ error, ok }: { error?: string; ok?: string }) {
  if (!error && !ok) return null;
  return (
    <div role={error ? 'alert' : 'status'} className={cx('mb-4 rounded-xl px-4 py-3 text-sm', error ? 'bg-danger-soft text-danger' : 'bg-brand-soft text-brand')}>
      {error ?? ok}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-ink-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-ink">{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-soft">{hint}</div>}
    </Card>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface/60 p-8 text-center">
      <div className="font-medium text-ink">{title}</div>
      {children && <div className="mt-1 text-sm text-ink-soft">{children}</div>}
    </div>
  );
}

export function Stars({ value, size = 'sm' }: { value: number | null; size?: 'sm' | 'lg' }) {
  if (value === null) return <span className="text-sm text-ink-muted">No reviews yet</span>;
  const full = Math.round(value);
  return (
    <span className={cx('inline-flex items-center gap-1', size === 'lg' ? 'text-lg' : 'text-sm')} aria-label={`${value} out of 5`}>
      <span className="text-food">{'★'.repeat(full)}<span className="text-line">{'★'.repeat(5 - full)}</span></span>
      <span className="font-medium text-ink">{value.toFixed(1)}</span>
    </span>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line bg-bg text-xs uppercase tracking-wide text-ink-muted">
          <tr>{head.map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ className, ...rest }: ComponentProps<'td'>) {
  return <td className={cx('px-4 py-3 align-top', className)} {...rest} />;
}

/** A hidden field telling the action which page to come back to. */
export function Back({ to }: { to: string }) {
  return <input type="hidden" name="_back" value={to} />;
}
