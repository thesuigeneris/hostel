import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'brand' | 'food' | 'ok' | 'warn' | 'danger';
const tones: Record<Tone, string> = {
  neutral: 'bg-bg text-muted border border-line',
  brand: 'bg-brand-soft text-brand',
  food: 'bg-food-soft text-food',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone], className)}>{children}</span>;
}

export function VerifiedBadge() {
  return (
    <Badge tone="brand">
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
        <path d="M10 1l2.4 2.1 3.2-.3.7 3.1 2.7 1.8-1.3 2.9 1.3 2.9-2.7 1.8-.7 3.1-3.2-.3L10 21l-2.4-2.1-3.2.3-.7-3.1L1 14.3l1.3-2.9L1 8.5l2.7-1.8.7-3.1 3.2.3z" />
        <path d="M8.6 13.4L5.8 10.6l1.1-1.1 1.7 1.7 4.5-4.5 1.1 1.1z" fill="white" />
      </svg>
      Verified
    </Badge>
  );
}
