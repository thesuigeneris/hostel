import { HIDE_REASONS } from '@hostels/shared';
import Link from 'next/link';
import { SubmitButton } from '@/components/SubmitButton';
import { Back, Badge, Card, Empty, Field, Flash, Input, PageHeader, Select, Stars } from '@/components/ui';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { moderateContentAction, moderateReviewAction } from '../actions';

const PATH = '/admin/moderation';

/** The rule broken and a note. Hiding needs the rule; keeping needs neither (the note is recorded if given). */
function Decision({ id, label, hideLabel }: { id: string; label: string; hideLabel: string }) {
  return (
    <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] sm:items-end">
      <Field label="Rule it breaks">
        <Select name="rule" required defaultValue="" aria-describedby={`${id}-help`}>
          <option value="" disabled>
            Choose one to hide
          </option>
          {HIDE_REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Note" optional>
        <Input name="note" maxLength={200} placeholder={`Why, in a few words (${label})`} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="action" value="hide" variant="danger" size="sm" className="h-11">
          {hideLabel}
        </SubmitButton>
        {/* Keeping needs no rule, so the form's required check is skipped for it. */}
        <SubmitButton name="action" value="keep" variant="secondary" size="sm" className="h-11" formNoValidate>
          Keep it
        </SubmitButton>
      </div>
      <p id={`${id}-help`} className="text-xs text-ink-muted sm:col-span-3">
        Hiding takes it off the page for everyone except the hostel and admins; it can be shown again below. Keeping clears the reports. Both are logged with the reason.
      </p>
    </div>
  );
}

export default async function AdminModeration({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const q = await searchParams;
  const client = await api();
  const [flagged, reports, hidden, hiddenContent] = await Promise.all([
    client.admin.flaggedReviews(),
    client.admin.reports(),
    client.admin.hiddenReviews(),
    client.admin.hiddenContent(),
  ]);
  return (
    <>
      <PageHeader
        title="Moderation"
        subtitle="Hide only what breaks the rules: abuse, personal details, spam, or not about a stay. A bad rating alone is not a reason."
      />
      <Flash error={q.error} ok={q.ok} />

      <section aria-labelledby="flagged-heading">
        <h2 id="flagged-heading" className="mb-3 text-lg font-semibold">
          Flagged reviews ({flagged.length})
        </h2>
        {flagged.length === 0 ? (
          <Empty title="No flagged reviews">When a reader reports a review, it shows up here with their reason.</Empty>
        ) : (
          <div className="space-y-3">
            {flagged.map((f) => (
              <Card key={f.review.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 text-sm [overflow-wrap:anywhere]">
                    <span className="font-medium">{f.review.author}</span> on{' '}
                    <Link href={`/hostels/${f.hostelSlug}`} className="font-medium">
                      {f.hostelName}
                    </Link>{' '}
                    · {f.flags} {f.flags === 1 ? 'flag' : 'flags'} · first {timeAgo(f.firstFlaggedAt)}
                  </div>
                  <span className="flex items-center gap-2">
                    {f.review.hidden && <Badge tone="red">Hidden</Badge>}
                    <Stars value={f.review.rating} />
                  </span>
                </div>
                <p className="mt-2 text-sm [overflow-wrap:anywhere]">{f.review.body}</p>
                <h3 className="mt-3 text-xs font-medium uppercase tracking-wide text-ink-muted">Why readers flagged it</h3>
                <ul className="mt-1 list-disc pl-5 text-sm text-ink-soft">
                  {f.reasons.map((r, i) => (
                    <li key={`${i}-${r}`}>{r}</li>
                  ))}
                </ul>
                <form action={moderateReviewAction}>
                  <Back to={PATH} />
                  <input type="hidden" name="id" value={f.review.id} />
                  <Decision id={`rev-${f.review.id}`} label={`review by ${f.review.author}`} hideLabel="Hide review" />
                </form>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="reports-heading" className="mt-10">
        <h2 id="reports-heading" className="mb-3 text-lg font-semibold">
          Reported posts and comments ({reports.length})
        </h2>
        {reports.length === 0 ? (
          <Empty title="No open reports">When a resident reports a post or comment on their hostel's board, it shows up here.</Empty>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => {
              const what = r.targetType === 'post' ? 'Post' : 'Comment';
              return (
                <Card key={`${r.targetType}-${r.targetId}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      <span className="font-medium">{what}</span> in {r.hostelName} · {r.reports} {r.reports === 1 ? 'report' : 'reports'} · first{' '}
                      {timeAgo(r.firstReportedAt)}
                    </span>
                    {r.content?.hidden && <Badge tone="red">Hidden</Badge>}
                  </div>
                  {r.content ? (
                    <p className="mt-2 text-sm [overflow-wrap:anywhere]">
                      <span className="font-medium">{r.content.author}:</span> {r.content.body}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-ink-soft">Its author has deleted it. Keep it to clear the reports.</p>
                  )}
                  <h3 className="mt-3 text-xs font-medium uppercase tracking-wide text-ink-muted">Why residents reported it</h3>
                  <ul className="mt-1 list-disc pl-5 text-sm text-ink-soft">
                    {r.reasons.map((x, i) => (
                      <li key={`${i}-${x}`}>{x}</li>
                    ))}
                  </ul>
                  <form action={moderateContentAction}>
                    <Back to={PATH} />
                    <input type="hidden" name="id" value={r.targetId} />
                    <input type="hidden" name="type" value={r.targetType} />
                    <Decision id={`${r.targetType}-${r.targetId}`} label={what.toLowerCase()} hideLabel={`Hide ${what.toLowerCase()}`} />
                  </form>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="hidden-heading" className="mt-10">
        <h2 id="hidden-heading" className="mb-1 text-lg font-semibold">
          Hidden
        </h2>
        <p className="mb-3 text-sm text-ink-soft">The latest hidden reviews, posts and comments. Show one again if it was hidden by mistake.</p>
        {hidden.length + hiddenContent.length === 0 ? (
          <p className="text-sm text-ink-soft">Nothing is hidden.</p>
        ) : (
          <ul className="space-y-2">
            {hidden.map((h) => (
              <li key={h.review.id}>
                <Card className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">
                    <div>
                      <span className="font-medium">Review by {h.review.author}</span> on {h.hostelName} · {h.review.hiddenReason ?? 'no reason recorded'}
                    </div>
                    <p className="mt-1 line-clamp-2 text-ink-soft">{h.review.body}</p>
                  </div>
                  <form action={moderateReviewAction}>
                    <Back to={PATH} />
                    <input type="hidden" name="id" value={h.review.id} />
                    <SubmitButton name="action" value="unhide" size="sm" variant="secondary" aria-label={`Show the review by ${h.review.author} on ${h.hostelName} again`}>
                      Show again
                    </SubmitButton>
                  </form>
                </Card>
              </li>
            ))}
            {hiddenContent.map((h) => (
              <li key={`${h.targetType}-${h.targetId}`}>
                <Card className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">
                    <div>
                      <span className="font-medium">
                        {h.targetType === 'post' ? 'Post' : 'Comment'} by {h.author}
                      </span>{' '}
                      in {h.hostelName}
                    </div>
                    <p className="mt-1 line-clamp-2 text-ink-soft">{h.body}</p>
                  </div>
                  <form action={moderateContentAction}>
                    <Back to={PATH} />
                    <input type="hidden" name="id" value={h.targetId} />
                    <input type="hidden" name="type" value={h.targetType} />
                    <SubmitButton name="action" value="unhide" size="sm" variant="secondary" aria-label={`Show the ${h.targetType} by ${h.author} again`}>
                      Show again
                    </SubmitButton>
                  </form>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
