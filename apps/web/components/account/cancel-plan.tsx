'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/field';
import { api } from '@/lib/client-api';
import { describeError } from '@/lib/errors';

/** Two-step cancel: confirm first, then the plan ends at the end of the paid period. */
export function CancelPlan({ periodEnd }: { periodEnd: string | null }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!confirming) {
    return (
      <Button variant="ghost" className="text-danger" onClick={() => setConfirming(true)}>
        Cancel plan
      </Button>
    );
  }
  return (
    <div className="space-y-3 rounded-xl border border-danger/30 bg-danger-soft p-4">
      <p className="text-sm text-ink">
        Your plan will end {periodEnd ? `on ${periodEnd}` : 'at the end of the current paid period'}. You can stay until then, and no further bills will be raised.
      </p>
      <FormError message={error} />
      <div className="flex gap-2">
        <Button
          variant="danger"
          loading={loading}
          onClick={async () => {
            setLoading(true);
            setError(null);
            try {
              await api.tenant.cancelSubscription();
              router.refresh();
              setConfirming(false);
            } catch (e) {
              setError(describeError(e).message);
            } finally {
              setLoading(false);
            }
          }}
        >
          Yes, cancel
        </Button>
        <Button variant="secondary" onClick={() => setConfirming(false)}>
          Keep my plan
        </Button>
      </div>
    </div>
  );
}
