'use client';
import { useState } from 'react';
import { api } from '@/lib/client-api';
import { cn } from '@/lib/cn';

/** "Me too" toggle for an issue. */
export function Upvote({ issueId, upvotes, upvotedByMe }: { issueId: string; upvotes: number; upvotedByMe: boolean }) {
  const [state, setState] = useState({ upvotes, upvotedByMe });
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      aria-pressed={state.upvotedByMe}
      title="Affects me too"
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setBusy(true);
        const prev = state;
        setState({ upvotedByMe: !prev.upvotedByMe, upvotes: prev.upvotes + (prev.upvotedByMe ? -1 : 1) });
        try {
          const r = await api.community.toggleUpvote(issueId);
          setState({ upvotedByMe: r.upvoted, upvotes: r.upvotes });
        } catch {
          setState(prev);
        } finally {
          setBusy(false);
        }
      }}
      className={cn(
        'flex shrink-0 flex-col items-center rounded-xl border px-3 py-1.5 text-xs font-medium',
        state.upvotedByMe ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-surface text-muted hover:border-brand',
      )}
    >
      <span aria-hidden>▲</span>
      {state.upvotes}
      <span className="sr-only">upvotes, me too</span>
    </button>
  );
}
