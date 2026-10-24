'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FormError, Textarea } from '@/components/ui/field';
import { api } from '@/lib/client-api';
import { useAction } from './use-action';

export function ReviewReply({ reviewId, existing }: { reviewId: string; existing: string | null }) {
  const [open, setOpen] = useState(!existing);
  const [reply, setReply] = useState(existing ?? '');
  const { run, pending, error } = useAction();
  if (!open)
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Edit reply
      </Button>
    );
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const out = await run('reply', () => api.owner.replyReview(reviewId, { reply }));
        if (out) setOpen(false);
      }}
    >
      <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} maxLength={2000} placeholder="Thank the resident and say what you've changed." required />
      <FormError message={error} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={pending === 'reply'} disabled={!reply.trim()}>
          {existing ? 'Update reply' : 'Post public reply'}
        </Button>
        {existing && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
