import { hoursLabel, type PartnerCheck, PARTNER_STANDARDS, TRANSPARENCY_HIDDEN_NOTE, type TransparencyStats } from '@hostels/shared';
import { dateLabel } from '@/lib/format';
import { Card } from './ui';

/**
 * "Verified partner", in plain words: the in-person checks our team ticked for this hostel (from the inspection
 * record, so only what was actually checked is listed), what else the label means, and what it doesn't cover.
 */
export function VerifiedExplainer({ check }: { check: PartnerCheck | null | undefined }) {
  const checks = PARTNER_STANDARDS.filter((s) => check?.checks.includes(s.id));
  return (
    <div className="mt-3 grid gap-4 sm:grid-cols-2">
      <Card className="p-4">
        <h3 className="font-medium">Checked in person</h3>
        {checks.length ? (
          <>
            <p className="mt-1 text-sm text-ink-soft">
              Our team visited{check?.checkedOn ? ` and verified the hostel on ${dateLabel(check.checkedOn)}` : ''}. They checked that:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
              {checks.map((s) => (
                <li key={s.id}>{s.label}</li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-1 text-sm text-ink-soft">
            Our team verified this hostel{check?.checkedOn ? ` on ${dateLabel(check.checkedOn)}` : ''} before it could take subscriptions. The
            item-by-item record isn&apos;t available for this check.
          </p>
        )}
      </Card>
      <div className="grid gap-4">
        <Card className="p-4">
          <h3 className="font-medium">Also part of the label</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
            <li>The listing was reviewed by the Hostels team before going live.</li>
            <li>Rent and food are billed through Hostels: one monthly bill, no advance.</li>
          </ul>
        </Card>
        <Card className="p-4">
          <h3 className="font-medium">Not covered</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
            <li>It is not a government licence or safety certificate.</li>
            <li>House rules and amenities are written by the hostel.</li>
            <li>Things can change after a check. Visit before you move in if you can.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

/** Resident-reported issues as numbers only, or why there is nothing to show yet. */
export function IssueRecord({ stats }: { stats: TransparencyStats | null }) {
  if (!stats) {
    return (
      <div className="mt-4 rounded-xl border border-line bg-surface p-3 text-sm text-ink-soft">
        <h3 className="font-medium text-ink">Issue record</h3>
        <p className="mt-1">{TRANSPARENCY_HIDDEN_NOTE}</p>
      </div>
    );
  }
  return (
    <Card className="mt-4 bg-brand-soft/40">
      <h3 className="font-medium">Issue record, last {stats.windowDays} days</h3>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div className="flex flex-col-reverse"><dt className="text-ink-muted">issues reported</dt><dd className="text-lg font-semibold tabular-nums">{stats.reported}</dd></div>
        <div className="flex flex-col-reverse"><dt className="text-ink-muted">resolved</dt><dd className="text-lg font-semibold tabular-nums">{stats.resolvedPct}%</dd></div>
        <div className="flex flex-col-reverse"><dt className="text-ink-muted">median first response</dt><dd className="text-lg font-semibold tabular-nums">{hoursLabel(stats.medianHoursToFirstResponse)}</dd></div>
        <div className="flex flex-col-reverse"><dt className="text-ink-muted">median time to fix</dt><dd className="text-lg font-semibold tabular-nums">{hoursLabel(stats.medianHoursToResolve)}</dd></div>
      </dl>
      <p className="mt-3 text-xs text-ink-muted">Reported by residents in the Hostels app. Issue details stay private to residents and the hostel.</p>
    </Card>
  );
}
