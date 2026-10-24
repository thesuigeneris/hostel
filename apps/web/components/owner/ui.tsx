import Link from 'next/link';
import type { ReactNode } from 'react';
import type { HostelStatus, IssueSeverity, IssueStatus, OwnerPlan, PartnerStatus } from '@hostels/shared';
import { OWNER_PLAN_PRICING } from '@hostels/shared';
import { Badge, VerifiedBadge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import { HOSTEL_STATUS_LABEL, ISSUE_SEVERITY_LABEL, ISSUE_STATUS_LABEL, PARTNER_STATUS_LABEL, rupees } from '@/lib/format';

export function LoadError({ message }: { message: string }) {
  return <EmptyState title="Couldn't load this">{message}</EmptyState>;
}

export function HostelStatusBadge({ status }: { status: HostelStatus }) {
  const tone = status === 'live' ? 'ok' : status === 'pending' ? 'warn' : status === 'rejected' ? 'danger' : 'neutral';
  return <Badge tone={tone}>{HOSTEL_STATUS_LABEL[status]}</Badge>;
}

export function PartnerBadge({ status }: { status: PartnerStatus }) {
  if (status === 'verified') return <VerifiedBadge />;
  if (status === 'none') return null;
  return <Badge tone={status === 'applied' ? 'warn' : 'danger'}>{PARTNER_STATUS_LABEL[status]}</Badge>;
}

export function PlanBadge({ plan }: { plan: OwnerPlan }) {
  return plan === 'pro' ? <Badge tone="food">Pro</Badge> : <Badge>Free</Badge>;
}

export function IssueStatusBadge({ status }: { status: IssueStatus }) {
  const tone = status === 'open' ? 'danger' : status === 'resolved' || status === 'closed' ? 'ok' : 'warn';
  return <Badge tone={tone}>{ISSUE_STATUS_LABEL[status]}</Badge>;
}

export function SeverityBadge({ severity }: { severity: IssueSeverity }) {
  const tone = severity === 'high' ? 'danger' : severity === 'medium' ? 'warn' : 'neutral';
  return <Badge tone={tone}>{ISSUE_SEVERITY_LABEL[severity]}</Badge>;
}

/**
 * Shows children normally on Pro; on Free shows them blurred behind an upgrade card.
 * `compact` fits small cells (a stat tile): blurred value plus a one-line unlock link.
 */
export function ProGate({ plan, hostelId, feature, compact, children }: { plan: OwnerPlan; hostelId: string; feature: string; compact?: boolean; children: ReactNode }) {
  if (plan === 'pro') return <>{children}</>;
  if (compact)
    return (
      <div className="relative">
        <div className="pointer-events-none select-none blur-sm" aria-hidden>
          {children}
        </div>
        <Link
          href={`/owner/hostels/${hostelId}/status`}
          className="absolute inset-x-0 bottom-2 mx-auto w-fit rounded-full bg-food-soft px-2.5 py-0.5 text-xs font-medium text-food hover:underline"
          aria-label={`${feature} is part of Hostels Pro. Upgrade to unlock`}
        >
          Unlock with Pro
        </Link>
      </div>
    );
  return (
    <div className="relative min-h-40">
      <div className="pointer-events-none select-none blur-sm" aria-hidden>
        {children}
      </div>
      <div className="absolute inset-0 grid place-items-center p-4">
        <div className="max-w-sm rounded-[var(--radius-card)] border border-line bg-surface p-5 text-center shadow-sm">
          <div className="text-sm font-semibold text-ink">{feature} is part of Hostels Pro</div>
          <p className="mt-1 text-xs text-muted">{rupees(OWNER_PLAN_PRICING.pro.price)} per hostel per month. Cancel anytime.</p>
          <ButtonLink href={`/owner/hostels/${hostelId}/status`} size="sm" variant="food" className="mt-3">
            Upgrade to Pro
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}

/** Simple responsive table wrapper. */
export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-line bg-bg text-xs uppercase tracking-wide text-muted">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="px-4 py-2.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top ${className ?? ''}`}>{children}</td>;
}
