'use client';
import { useRouter } from 'next/navigation';
import type { OwnerPlan } from '@hostels/shared';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/client-api';
import { useAction } from './use-action';

/** Upgrade/downgrade one hostel's software plan; goes to the payment page when an invoice is due. */
export function PlanSwitch({ hostelId, plan }: { hostelId: string; plan: OwnerPlan }) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const target: OwnerPlan = plan === 'pro' ? 'free' : 'pro';
  return (
    <div className="text-right">
      <Button
        size="sm"
        variant={target === 'pro' ? 'food' : 'secondary'}
        loading={!!pending}
        onClick={async () => {
          if (target === 'free' && !confirm('Downgrade to Free? Pro features stop immediately.')) return;
          const out = await run('plan', () => api.owner.changePlan(hostelId, { plan: target }), { refresh: false });
          if (!out) return;
          if (out.invoice?.status === 'due') router.push(`/pay/${out.invoice.id}`);
          else router.refresh();
        }}
      >
        {target === 'pro' ? 'Upgrade to Pro' : 'Downgrade'}
      </Button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
