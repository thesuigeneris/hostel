'use client';
import { useState } from 'react';
import { DEFAULT_PLATFORM_FEE_PCT, type ReviewStatus } from '@hostels/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { useAction } from '@/components/owner/use-action';
import { api } from '@/lib/client-api';

function InlineError({ message }: { message: string | null }) {
  return message ? <p className="mt-1 text-xs text-danger">{message}</p> : null;
}

/** Approve a pending listing, or reject it with a reason shown to the owner. */
export function ListingDecision({ hostelId }: { hostelId: string }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const { run, pending, error } = useAction();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" loading={pending === 'approve'} onClick={() => run('approve', () => api.admin.approve(hostelId))}>
          Approve
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setRejecting((v) => !v)}>
          Reject…
        </Button>
      </div>
      {rejecting && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run('reject', () => api.admin.reject(hostelId, { reason }));
          }}
        >
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason shown to the owner" minLength={3} required className="h-8" />
          <Button type="submit" size="sm" variant="danger" loading={pending === 'reject'}>
            Reject
          </Button>
        </form>
      )}
      <InlineError message={error} />
    </div>
  );
}

/** Verify a partner application with a platform fee %, or reject it. */
export function PartnerDecision({ hostelId, currentFee }: { hostelId: string; currentFee?: number }) {
  const [fee, setFee] = useState(String(currentFee ?? DEFAULT_PLATFORM_FEE_PCT));
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const { run, pending, error } = useAction();
  return (
    <div className="space-y-2">
      <form
        className="flex flex-wrap items-center justify-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run('verify', () => api.admin.verifyPartner(hostelId, { platformFeePct: Math.max(0, Math.min(50, Math.floor(Number(fee) || 0))) }));
        }}
      >
        <label className="flex items-center gap-1 text-xs text-muted">
          Fee
          <Input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="numeric" className="h-8 w-16" aria-label="Platform fee percent" />%
        </label>
        <Button type="submit" size="sm" loading={pending === 'verify'}>
          Verify
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => setRejecting((v) => !v)}>
          Reject…
        </Button>
      </form>
      {rejecting && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run('reject', () => api.admin.rejectPartner(hostelId, { reason }));
          }}
        >
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" minLength={3} required className="h-8" />
          <Button type="submit" size="sm" variant="danger" loading={pending === 'reject'}>
            Reject
          </Button>
        </form>
      )}
      <InlineError message={error} />
    </div>
  );
}

export function ReviewModeration({ reviewId, status }: { reviewId: string; status: ReviewStatus }) {
  const { run, pending, error } = useAction();
  const next: ReviewStatus = status === 'published' ? 'hidden' : 'published';
  return (
    <div className="flex items-center justify-end gap-2">
      <InlineError message={error} />
      <Button size="sm" variant={next === 'hidden' ? 'danger' : 'secondary'} loading={!!pending} onClick={() => run('mod', () => api.admin.moderateReview(reviewId, { status: next }))}>
        {next === 'hidden' ? 'Hide review' : 'Unhide'}
      </Button>
    </div>
  );
}

export function MarkPayoutPaid({ payoutId }: { payoutId: string }) {
  const { run, pending, error } = useAction();
  return (
    <div className="text-right">
      <Button
        size="sm"
        loading={!!pending}
        onClick={() => {
          if (confirm('Mark this payout as paid to the owner?')) void run('paid', () => api.admin.markPayoutPaid(payoutId));
        }}
      >
        Mark paid
      </Button>
      <InlineError message={error} />
    </div>
  );
}

export function GeneratePayouts({ defaultMonth }: { defaultMonth: string }) {
  const [month, setMonth] = useState(defaultMonth);
  const [result, setResult] = useState<string | null>(null);
  const { run, pending, error } = useAction();
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setResult(null);
        const out = await run('gen', () => api.admin.generatePayouts({ periodMonth: month }));
        if (out) setResult(`${out.length} payout${out.length === 1 ? '' : 's'} for ${month}`);
      }}
    >
      <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" aria-label="Payout month" required />
      <Button type="submit" loading={pending === 'gen'}>
        Generate payouts
      </Button>
      {result && <span className="text-sm text-ok">{result}</span>}
      <InlineError message={error} />
    </form>
  );
}

export function RunJobsButton() {
  const [result, setResult] = useState<Record<string, number> | null>(null);
  const { run, pending, error } = useAction();
  return (
    <div>
      <Button
        variant="secondary"
        loading={!!pending}
        onClick={async () => {
          const out = await run('jobs', () => api.admin.runJobs());
          if (out) setResult(out);
        }}
      >
        Run background jobs now
      </Button>
      {result && (
        <div className="mt-2 text-xs text-muted">
          {Object.keys(result).length === 0
            ? 'No jobs registered.'
            : Object.entries(result)
                .map(([k, v]) => `${k}: ${v < 0 ? 'failed' : v}`)
                .join(' · ')}
        </div>
      )}
      <InlineError message={error} />
    </div>
  );
}
