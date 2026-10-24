'use client';
import { useRouter } from 'next/navigation';
import { DEFAULT_PLATFORM_FEE_PCT, OWNER_PLAN_PRICING, type HostelDetail } from '@hostels/shared';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { FormError } from '@/components/ui/field';
import { api } from '@/lib/client-api';
import { rupees } from '@/lib/format';
import { HostelStatusBadge, PartnerBadge, PlanBadge } from './ui';
import { useAction } from './use-action';

export function StatusPanel({ hostel }: { hostel: HostelDetail }) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const canSubmit = hostel.status === 'draft' || hostel.status === 'rejected';
  const missing = [
    hostel.roomTypes.length === 0 && 'add at least one room type',
    hostel.photos.length === 0 && 'upload at least one photo',
  ].filter(Boolean) as string[];

  async function changePlan(plan: 'free' | 'pro') {
    if (plan === 'free' && !confirm('Downgrade to Free? Pro features stop immediately and unpaid Pro invoices are cancelled.')) return;
    const out = await run(`plan-${plan}`, () => api.owner.changePlan(hostel.id, { plan }), { refresh: false });
    if (!out) return;
    if (out.invoice && out.invoice.status === 'due') router.push(`/pay/${out.invoice.id}`);
    else router.refresh();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {error && (
        <div className="lg:col-span-3">
          <FormError message={error} />
        </div>
      )}

      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Listing</h2>
            <HostelStatusBadge status={hostel.status} />
          </div>
          {hostel.status === 'draft' && <p className="text-sm text-muted">Your listing is a draft and not visible yet. Submit it for a quick review.</p>}
          {hostel.status === 'pending' && <p className="text-sm text-muted">Our team is reviewing your listing. This usually takes under 24 hours.</p>}
          {hostel.status === 'live' && <p className="text-sm text-muted">Your listing is live. Edits go live immediately.</p>}
          {hostel.status === 'rejected' && (
            <div className="rounded-xl bg-danger-soft p-3 text-sm text-danger">
              <div className="font-medium">Not approved</div>
              {hostel.rejectionReason && <div className="mt-1">{hostel.rejectionReason}</div>}
              <div className="mt-1 text-ink">Fix the details above and submit again.</div>
            </div>
          )}
          {canSubmit && (
            <>
              {missing.length > 0 && <p className="text-xs text-warn">Before submitting: {missing.join(' and ')}.</p>}
              <Button loading={pending === 'submit'} disabled={missing.length > 0} onClick={() => run('submit', () => api.owner.submit(hostel.id))}>
                Submit for review
              </Button>
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Verified partner</h2>
            <PartnerBadge status={hostel.partnerStatus} />
          </div>
          {hostel.partnerStatus === 'verified' ? (
            <p className="text-sm text-muted">
              You&apos;re verified. Subscribers can book you with no advance. Platform fee: <strong>{hostel.platformFeePct}%</strong> of subscription revenue.
            </p>
          ) : hostel.partnerStatus === 'applied' ? (
            <p className="text-sm text-muted">Application received. We&apos;ll call to schedule a visit.</p>
          ) : (
            <>
              <p className="text-sm text-muted">
                Get the Verified badge, top placement and no-advance subscription tenants. We take {DEFAULT_PLATFORM_FEE_PCT}% of subscription revenue and pay you monthly.
              </p>
              {hostel.partnerStatus === 'rejected' && <p className="text-xs text-danger">Your last application was not approved. You can apply again.</p>}
              <Button
                variant="secondary"
                disabled={hostel.status !== 'live'}
                loading={pending === 'apply'}
                onClick={() => run('apply', () => api.owner.applyPartner(hostel.id))}
              >
                Apply to become a partner
              </Button>
              {hostel.status !== 'live' && <p className="text-xs text-muted">Available once your listing is live.</p>}
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Software plan</h2>
            <PlanBadge plan={hostel.ownerPlan} />
          </div>
          {hostel.ownerPlan === 'pro' ? (
            <>
              <p className="text-sm text-muted">You&apos;re on Hostels Pro — {rupees(OWNER_PLAN_PRICING.pro.price)}/month for this hostel.</p>
              <Button variant="secondary" loading={pending === 'plan-free'} onClick={() => changePlan('free')}>
                Downgrade to Free
              </Button>
            </>
          ) : (
            <>
              <ul className="space-y-1 text-sm text-muted">
                {OWNER_PLAN_PRICING.pro.features.slice(1).map((f) => (
                  <li key={f}>✓ {f}</li>
                ))}
              </ul>
              <Button variant="food" loading={pending === 'plan-pro'} onClick={() => changePlan('pro')}>
                Upgrade to Pro · {rupees(OWNER_PLAN_PRICING.pro.price)}/mo
              </Button>
              <p className="text-xs text-muted">Pro turns on as soon as the first invoice is paid.</p>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
