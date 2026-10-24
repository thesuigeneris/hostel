'use client';
import type { VisitStatus } from '@hostels/shared';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/client-api';
import { useAction } from './use-action';

const NEXT: Record<VisitStatus, { to: VisitStatus; label: string }[]> = {
  new: [
    { to: 'contacted', label: 'Mark contacted' },
    { to: 'closed', label: 'Close' },
  ],
  contacted: [{ to: 'closed', label: 'Close' }],
  closed: [{ to: 'new', label: 'Reopen' }],
};

export function VisitActions({ visitId, status, phone }: { visitId: string; status: VisitStatus; phone: string }) {
  const { run, pending, error } = useAction();
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <a href={`tel:+91${phone}`} className="text-sm text-brand hover:underline">
        Call
      </a>
      <a href={`https://wa.me/91${phone}`} target="_blank" rel="noreferrer" className="text-sm text-brand hover:underline">
        WhatsApp
      </a>
      {NEXT[status].map((n) => (
        <Button key={n.to} size="sm" variant={n.to === 'contacted' ? 'primary' : 'secondary'} loading={pending === n.to} onClick={() => run(n.to, () => api.owner.setVisitStatus(visitId, { status: n.to }))}>
          {n.label}
        </Button>
      ))}
      {error && <span className="w-full text-right text-xs text-danger">{error}</span>}
    </div>
  );
}
