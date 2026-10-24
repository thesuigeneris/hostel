import { cn } from '@/lib/cn';

/** Read-only star rating, e.g. 4.3 → ★★★★☆ */
export function Stars({ value, className, size = 'sm' }: { value: number | null; className?: string; size?: 'sm' | 'md' }) {
  const v = value ?? 0;
  const px = size === 'sm' ? 'h-3.5 w-3.5' : 'h-5 w-5';
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-food', className)} aria-label={value ? `${value.toFixed(1)} out of 5` : 'No rating yet'}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} viewBox="0 0 20 20" className={cn(px, i <= Math.round(v) ? 'opacity-100' : 'opacity-25')} fill="currentColor" aria-hidden>
          <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9z" />
        </svg>
      ))}
    </span>
  );
}

/** Clickable 1-5 star input. */
export function StarInput({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-ink">{label}</span>
      <span className="inline-flex gap-1" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={value === i}
            aria-label={`${i} star${i > 1 ? 's' : ''}`}
            onClick={() => onChange(i)}
            className={cn('text-food transition-opacity', i <= value ? 'opacity-100' : 'opacity-25 hover:opacity-60')}
          >
            <svg viewBox="0 0 20 20" className="h-6 w-6" fill="currentColor" aria-hidden>
              <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9z" />
            </svg>
          </button>
        ))}
      </span>
    </div>
  );
}
