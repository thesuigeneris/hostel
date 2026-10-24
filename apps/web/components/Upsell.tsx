import { OWNER_PLANS, type OwnerPlanTier } from '@hostels/shared';
import { Card, LinkButton } from './ui';

export function Upsell({ hostelId, plan, feature, suspended }: { hostelId: string; plan: OwnerPlanTier; feature: string; suspended?: boolean }) {
  return (
    <Card className="border-food bg-food-soft/50 text-center">
      <div className="text-lg font-semibold">{feature} is part of {OWNER_PLANS[plan].label}</div>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">
        {suspended
          ? 'Your plan is paused because a bill is overdue. Pay it to turn everything back on.'
          : `Upgrade this hostel to ${OWNER_PLANS[plan].label}. The first month is free.`}
      </p>
      <LinkButton href={`/owner/hostels/${hostelId}/plan`} className="mt-4">{suspended ? 'Pay the bill' : 'See plans'}</LinkButton>
    </Card>
  );
}
