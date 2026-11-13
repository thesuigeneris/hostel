import type { Metadata } from 'next';
import Link from 'next/link';
import { SubmitButton } from '@/components/SubmitButton';
import { Badge, Card, Empty, Flash, LinkButton, PageHeader, StatusBadge } from '@/components/ui';
import { api, requireUser } from '@/lib/api';
import { dateLabel } from '@/lib/format';
import { moveOutAction, respondInviteAction } from './actions';

export const metadata: Metadata = { title: 'My hostel', robots: { index: false } };

type Props = { searchParams: Promise<{ error?: string; ok?: string }> };

export default async function StayPage({ searchParams }: Props) {
  const q = await searchParams;
  await requireUser('/stay');
  const client = await api();
  const [stays, myIssues] = await Promise.all([client.me.residencies(), client.resident.myIssues().catch(() => [])]);
  // Issues I reported, per hostel, with updates I haven't opened: the same count as the badge in the menu.
  const newAt = (hostelId: string) => myIssues.filter((i) => i.hostelId === hostelId && i.unreadUpdates > 0).length;
  const newLink = (hostelId: string, name: string) => {
    const n = newAt(hostelId);
    return n > 0 ? (
      <LinkButton href={`/stay/${hostelId}?tab=issues&show=mine`} variant="secondary" size="sm" aria-label={`${n} of your issues at ${name} have new updates`}>
        <Badge tone="info">{n} new</Badge> Updates on your issues
      </LinkButton>
    ) : null;
  };
  const invites = stays.filter((s) => s.status === 'invited');
  const current = stays.filter((s) => s.status === 'active');
  const past = stays.filter((s) => s.status === 'ended');

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <PageHeader title="My hostel" subtitle="Talk to your neighbours, report issues, and review places you've lived." />
      <Flash error={q.error} ok={q.ok} />

      {invites.map((s) => (
        <Card key={s.id} className="mb-4 border-brand bg-brand-soft/40">
          <h2 className="font-medium">{s.hostel.name} added you as a resident</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Since {dateLabel(s.startDate)}, in {s.hostel.area}. Accept to join the hostel community and report issues. You can review the hostel
            after two weeks here.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={respondInviteAction}>
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="accept" value="1" />
              <SubmitButton size="sm" pendingText="Accepting…" aria-label={`Accept: join ${s.hostel.name}`}>Accept</SubmitButton>
            </form>
            <form action={respondInviteAction}>
              <input type="hidden" name="id" value={s.id} />
              <SubmitButton
                size="sm"
                variant="ghost"
                pendingText="Declining…"
                confirm={`Decline the invite from ${s.hostel.name}? They would have to add you again.`}
                aria-label={`Not me: decline the invite from ${s.hostel.name}`}
              >
                Not me
              </SubmitButton>
            </form>
          </div>
        </Card>
      ))}

      {current.length === 0 && invites.length === 0 && (
        <Empty title="You're not linked to a hostel yet">
          Subscribe to a <Link href="/hostels?verified=true">verified hostel</Link>, or ask your hostel owner to add your phone number.
        </Empty>
      )}

      <div className="space-y-3">
        {current.map((s) => (
          <Card key={s.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-lg font-semibold">{s.hostel.name}</div>
                <div className="text-sm text-ink-soft">{s.hostel.area} · since {dateLabel(s.startDate)}</div>
              </div>
              <StatusBadge kind="residency" status={s.status} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <LinkButton href={`/stay/${s.hostel.id}`} size="sm">Open</LinkButton>
              {newLink(s.hostel.id, s.hostel.name)}
              <LinkButton href={`/stay/${s.hostel.id}?tab=issues`} variant="secondary" size="sm">Report an issue</LinkButton>
              {s.canReview && <LinkButton href={`/stay/${s.hostel.id}?tab=review`} variant="secondary" size="sm">{s.hasReview ? 'Edit review' : 'Write a review'}</LinkButton>}
              {s.source === 'owner' ? (
                <form action={moveOutAction}>
                  <input type="hidden" name="id" value={s.id} />
                  <SubmitButton
                    size="sm"
                    variant="ghost"
                    pendingText="Saving…"
                    confirm={`Mark yourself as moved out of ${s.hostel.name}? You leave its community board. You can still review your stay and read issues you reported.`}
                  >
                    I've moved out
                  </SubmitButton>
                </form>
              ) : (
                <LinkButton href="/account" variant="ghost" size="sm">Move or cancel plan</LinkButton>
              )}
            </div>
            {!s.canReview && s.reviewBlockedReason && <p className="mt-3 text-xs text-ink-muted">Reviews: {s.reviewBlockedReason}.</p>}
          </Card>
        ))}
      </div>

      {past.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Places you've lived</h2>
          <div className="space-y-2">
            {past.map((s) => (
              <Card key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                <div>
                  <Link href={`/hostels/${s.hostel.slug}`} className="font-medium">{s.hostel.name}</Link>
                  <div className="text-sm text-ink-soft">{dateLabel(s.startDate)} – {dateLabel(s.endDate)}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {newLink(s.hostel.id, s.hostel.name)}
                  <LinkButton href={`/stay/${s.hostel.id}?tab=issues`} variant="ghost" size="sm" aria-label={`Your issues at ${s.hostel.name}`}>
                    Your issues
                  </LinkButton>
                  {s.canReview ? (
                    <LinkButton href={`/stay/${s.hostel.id}?tab=review`} variant="secondary" size="sm">{s.hasReview ? 'Edit review' : 'Review your stay'}</LinkButton>
                  ) : s.hasReview ? (
                    <Badge tone="green">Reviewed</Badge>
                  ) : null}
                </div>
                {!s.canReview && !s.hasReview && s.reviewBlockedReason && <p className="w-full text-xs text-ink-muted">Reviews: {s.reviewBlockedReason}.</p>}
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
