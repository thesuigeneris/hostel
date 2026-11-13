import { ApiError, EDITED_AFTER_REPLY, type IssueView, type MyResidency, POST_KINDS, reviewEdits } from '@hostels/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Feed, IssueForm, IssueList } from '@/components/Community';
import { SubmitButton } from '@/components/SubmitButton';
import { Back, Card, cx, Empty, Field, Flash, focusRing, PageHeader, pillClass, Select, Textarea } from '@/components/ui';
import { api, requireUser } from '@/lib/api';
import { dateLabel, SHARING_LABEL, titleCase } from '@/lib/format';
import { directoryAction, reviewAction } from '../actions';

export const metadata: Metadata = { title: 'My hostel', robots: { index: false } };

type Props = { params: Promise<{ hostelId: string }>; searchParams: Promise<{ tab?: string; show?: string; kind?: string; error?: string; ok?: string }> };

const ISSUE_FILTERS = [
  { id: 'active', label: 'Not fixed yet', match: (i: IssueView) => i.status !== 'resolved' && i.status !== 'closed' },
  { id: 'fixed', label: 'Fixed', match: (i: IssueView) => i.status === 'resolved' || i.status === 'closed' },
  { id: 'mine', label: 'Mine', match: (i: IssueView) => i.mine },
  { id: 'all', label: 'All', match: () => true },
] as const;

const TABS = [
  { id: 'community', label: 'Community' },
  { id: 'issues', label: 'Issues' },
  { id: 'neighbours', label: 'Neighbours' },
  { id: 'review', label: 'Review' },
] as const;
type Tab = (typeof TABS)[number]['id'];
/** After moving out: your own issues (read-only) and your review. */
const PAST_TABS: Tab[] = ['issues', 'review'];

function RatingSelect({ name, label, optional, value }: { name: string; label: string; optional?: boolean; value?: number | null }) {
  return (
    <Field label={label}>
      <Select name={name} defaultValue={value ? String(value) : optional ? '' : '4'} required={!optional}>
        {optional && <option value="">Didn't eat here</option>}
        {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{'★'.repeat(n)} {n} of 5</option>)}
      </Select>
    </Field>
  );
}

/** The board, or why it isn't there: never turned on, or paused with nothing lost (the API says which). */
async function CommunityTab({ hostelId, path, kind }: { hostelId: string; path: string; kind?: string }) {
  const client = await api();
  const result = await client.resident
    .feed(hostelId)
    .then((posts) => ({ posts, off: null }))
    .catch((e) => (e instanceof ApiError && e.code === 'plan_required' ? { posts: null, off: e.message } : Promise.reject(e)));
  if (!result.posts) return <Empty title="The community board is off">{result.off}</Empty>;
  const current = POST_KINDS.find((k) => k === kind);
  const shown = current ? result.posts.filter((p) => p.kind === current) : result.posts;
  return (
    <div className="space-y-4">
      <nav aria-label="Filter posts" className="flex flex-wrap gap-2">
        {[undefined, ...POST_KINDS].map((k) => (
          <Link
            key={k ?? 'all'}
            href={`/stay/${hostelId}?tab=community${k ? `&kind=${k}` : ''}`}
            aria-current={k === current ? 'page' : undefined}
            className={pillClass(k === current)}
          >
            {k ? titleCase(k) : 'All'}
          </Link>
        ))}
      </nav>
      <Feed hostelId={hostelId} posts={shown} back={current ? `${path}&kind=${current}` : path} />
    </div>
  );
}

async function IssuesTab({ stay, path, show }: { stay: MyResidency; path: string; show?: string }) {
  const client = await api();
  const hostelId = stay.hostel.id;
  if (stay.status !== 'active') {
    // Moved out: the issues you reported stay on the hostel's record, and you can still read them.
    const mine = (await client.resident.myIssues()).filter((i) => i.hostelId === hostelId);
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Issues you reported here</h2>
        <p className="text-sm text-ink-soft">You've moved out, so these are read-only. They stay on the hostel's record, and the hostel can still fix them.</p>
        <IssueList issues={mine} emptyText="You didn't report any issues here." />
      </section>
    );
  }
  const issues = await client.resident.issues(hostelId);
  const filter = ISSUE_FILTERS.find((f) => f.id === show) ?? ISSUE_FILTERS[0];
  const shown = issues.filter(filter.match);
  return (
    <div className="space-y-6">
      <IssueForm hostelId={hostelId} back={path} />
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Issues at this hostel</h2>
          <nav aria-label="Filter issues" className="flex flex-wrap gap-2">
            {ISSUE_FILTERS.map((f) => (
              <Link
                key={f.id}
                href={`/stay/${hostelId}?tab=issues&show=${f.id}`}
                aria-current={f.id === filter.id ? 'page' : undefined}
                className={pillClass(f.id === filter.id)}
              >
                {f.label} <span className="tabular-nums">({issues.filter(f.match).length})</span>
              </Link>
            ))}
          </nav>
        </div>
        <IssueList issues={shown} emptyText={filter.id === 'active' ? 'Nothing waiting on a fix. Nice.' : 'No issues here.'} />
        <p className="mt-3 text-xs text-ink-muted">Other residents see issues without your name. Add a me-too on ones that affect you too.</p>
      </section>
    </div>
  );
}

async function NeighboursTab({ stay, path }: { stay: MyResidency; path: string }) {
  const people = await (await api()).resident.directory(stay.hostel.id);
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          {stay.directoryOptIn
            ? 'Neighbours can see your first name, last initial and room type. Never your phone number.'
            : 'You are hidden from the neighbour list. If you show yourself, neighbours see your first name, last initial and room type, never your phone number.'}
        </p>
        <form action={directoryAction}>
          <Back to={path} />
          <input type="hidden" name="id" value={stay.id} />
          <input type="hidden" name="on" value={stay.directoryOptIn ? '0' : '1'} />
          <SubmitButton size="sm" variant="secondary" pendingText="Saving…">{stay.directoryOptIn ? 'Hide me' : 'Show me'}</SubmitButton>
        </form>
      </Card>
      {people.length ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {people.map((p) => (
            <li key={`${p.name}-${p.since}`} className="rounded-2xl border border-line bg-surface p-3 text-sm">
              <div className="font-medium">{p.name}</div>
              <div className="text-ink-muted">{p.sharing ? SHARING_LABEL[p.sharing] : 'Resident'} · since {dateLabel(p.since)}</div>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="No one has joined the list yet">Neighbours who choose to show themselves appear here.</Empty>
      )}
    </div>
  );
}

function ReviewTab({ stay, path }: { stay: MyResidency; path: string }) {
  const mine = stay.review;
  if (!stay.canReview) {
    return (
      <Empty title={mine ? 'Reviews for this stay are closed' : 'You cannot review this stay yet'}>
        {stay.reviewBlockedReason ?? 'Only residents can review this hostel'}. Reviews come only from verified residents, so they mean something.
      </Empty>
    );
  }
  const edits = mine ? reviewEdits(mine) : null;
  return (
    <Card>
      <h2 className="font-semibold">{mine ? 'Update your review' : 'Review your stay'}</h2>
      <p className="mt-1 text-sm text-ink-soft">Your first name, last initial and the months you lived here show with the review. Be fair and specific.</p>
      {mine?.hidden && (
        <p className="mt-3 rounded-xl bg-danger-soft p-3 text-sm text-danger">
          Our team hid this review{mine.hiddenReason ? ` (${mine.hiddenReason})` : ''}. It does not show on the hostel page or count toward its rating,
          and editing it doesn't change that.
        </p>
      )}
      {mine?.ownerReply && (
        <div className="mt-3 rounded-xl bg-bg p-3 text-sm">
          <p>
            <span className="font-medium">The hostel replied{mine.ownerRepliedAt ? ` on ${dateLabel(mine.ownerRepliedAt)}` : ''}:</span> {mine.ownerReply}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            {edits?.editedAfterReply
              ? `You edited your review after this reply, so readers see “${EDITED_AFTER_REPLY}” next to it.`
              : `If you edit your review now, readers see “${EDITED_AFTER_REPLY}” next to the reply.`}
          </p>
        </div>
      )}
      <form action={reviewAction} className="mt-4 space-y-4">
        <Back to={path} />
        <input type="hidden" name="hostelId" value={stay.hostel.id} />
        <input type="hidden" name="slug" value={stay.hostel.slug} />
        <fieldset className={cx('grid gap-3', stay.hostel.foodAvailable ? 'sm:grid-cols-5' : 'sm:grid-cols-4')}>
          <legend className="sr-only">Ratings, 1 to 5 stars</legend>
          <RatingSelect name="rating" label="Overall" value={mine?.rating} />
          <RatingSelect name="cleanliness" label="Cleanliness" value={mine?.cleanliness} />
          {stay.hostel.foodAvailable && <RatingSelect name="food" label="Food" optional value={mine?.food} />}
          <RatingSelect name="safety" label="Safety" value={mine?.safety} />
          <RatingSelect name="responsiveness" label="Owner response" value={mine?.responsiveness} />
        </fieldset>
        <Field label="Your review" hint="20 to 2,000 characters.">
          <Textarea name="body" required minLength={20} maxLength={2000} defaultValue={mine?.body} placeholder="What was it like to live here?" />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton pendingText="Saving…">{mine ? 'Update review' : 'Post review'}</SubmitButton>
          {mine && (
            <span className="text-xs text-ink-muted">
              Posted {dateLabel(mine.createdAt)}
              {edits?.edited && `, last edited ${dateLabel(mine.updatedAt)}`}
            </span>
          )}
        </div>
      </form>
    </Card>
  );
}

export default async function StayHostelPage({ params, searchParams }: Props) {
  const { hostelId } = await params;
  const q = await searchParams;
  const asked = TABS.find((t) => t.id === q.tab)?.id;
  await requireUser(`/stay/${hostelId}${asked ? `?tab=${asked}` : ''}`);
  const stays = await (await api()).me.residencies();
  const stay = stays.find((s) => s.hostel.id === hostelId && (s.status === 'active' || s.status === 'ended'));
  if (!stay) redirect('/stay');
  const active = stay.status === 'active';
  const tabs = TABS.filter((t) => active || PAST_TABS.includes(t.id));
  const tab: Tab = tabs.find((t) => t.id === asked)?.id ?? (active ? 'community' : 'review');
  const path = `/stay/${hostelId}?tab=${tab}`;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <PageHeader
        title={stay.hostel.name}
        subtitle={<>{stay.hostel.area} · {active ? `living here since ${dateLabel(stay.startDate)}` : `lived here ${dateLabel(stay.startDate)} – ${dateLabel(stay.endDate)}`} · <Link href={`/hostels/${stay.hostel.slug}`}>public page</Link></>}
      />
      <Flash error={q.error} ok={q.ok} />
      <nav aria-label="Hostel life" className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-line bg-surface p-1">
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={`/stay/${hostelId}?tab=${t.id}`}
            aria-current={t.id === tab ? 'page' : undefined}
            className={cx('inline-flex min-h-11 items-center whitespace-nowrap rounded-xl px-4 text-sm no-underline', focusRing, t.id === tab ? 'bg-brand text-white' : 'text-ink-soft hover:bg-brand-soft')}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === 'community' ? (
        <CommunityTab hostelId={hostelId} path={path} kind={q.kind} />
      ) : tab === 'issues' ? (
        <IssuesTab stay={stay} path={path} show={q.show} />
      ) : tab === 'neighbours' ? (
        <NeighboursTab stay={stay} path={path} />
      ) : (
        <ReviewTab stay={stay} path={path} />
      )}
    </div>
  );
}
