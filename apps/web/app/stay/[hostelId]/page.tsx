import { ApiError, type IssueView } from '@hostels/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Feed, IssueForm, IssueList } from '@/components/Community';
import { SubmitButton } from '@/components/SubmitButton';
import { Back, Card, cx, Empty, Field, Flash, PageHeader, Select, Textarea } from '@/components/ui';
import { api, requireUser } from '@/lib/api';
import { dateLabel, SHARING_LABEL } from '@/lib/format';
import { directoryAction, reviewAction } from '../actions';

export const metadata: Metadata = { title: 'My hostel', robots: { index: false } };

type Props = { params: Promise<{ hostelId: string }>; searchParams: Promise<{ tab?: string; show?: string; error?: string; ok?: string }> };

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

function RatingSelect({ name, label, optional, value }: { name: string; label: string; optional?: boolean; value?: number | null }) {
  return (
    <Field label={label}>
      <Select name={name} defaultValue={value ? String(value) : optional ? '' : '4'} required={!optional}>
        {optional && <option value="">Didn't eat here</option>}
        {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{'★'.repeat(n)} {n}</option>)}
      </Select>
    </Field>
  );
}

export default async function StayHostelPage({ params, searchParams }: Props) {
  const { hostelId } = await params;
  const q = await searchParams;
  const tab = TABS.find((t) => t.id === q.tab)?.id ?? 'community';
  const path = `/stay/${hostelId}?tab=${tab}`;
  await requireUser(path);
  const client = await api();
  const stays = await client.me.residencies();
  const stay = stays.find((s) => s.hostel.id === hostelId && (s.status === 'active' || s.status === 'ended'));
  if (!stay) redirect('/stay');
  const active = stay.status === 'active';

  let body: React.ReactNode = null;
  if (tab === 'community') {
    if (!active) body = <Empty title="The community board is for current residents" />;
    else {
      const posts = await client.resident.feed(hostelId).catch((e) => (e instanceof ApiError && e.code === 'plan_required' ? null : Promise.reject(e)));
      body = posts ? <Feed hostelId={hostelId} posts={posts} back={path} /> : <Empty title="This hostel hasn't turned on the community board yet">You can still report issues.</Empty>;
    }
  } else if (tab === 'issues') {
    const issues = active ? await client.resident.issues(hostelId) : [];
    const filter = ISSUE_FILTERS.find((f) => f.id === q.show) ?? ISSUE_FILTERS[0];
    const shown = issues.filter(filter.match);
    body = active ? (
      <div className="space-y-6">
        <IssueForm hostelId={hostelId} back={path} />
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Issues at this hostel</h2>
            <div className="flex gap-1 text-sm">
              {ISSUE_FILTERS.map((f) => (
                <Link key={f.id} href={`/stay/${hostelId}?tab=issues&show=${f.id}`} className={cx('rounded-lg px-3 py-1 no-underline', f.id === filter.id ? 'bg-brand text-white' : 'text-ink-soft hover:bg-brand-soft')}>
                  {f.label} <span className="opacity-70">{issues.filter(f.match).length}</span>
                </Link>
              ))}
            </div>
          </div>
          <IssueList issues={shown} emptyText={filter.id === 'active' ? 'Nothing waiting on a fix. Nice.' : 'No issues here.'} />
          <p className="mt-3 text-xs text-ink-muted">Other residents see issues without your name. Add a me-too on ones that affect you too.</p>
        </section>
      </div>
    ) : <Empty title="Issues are for current residents" />;
  } else if (tab === 'neighbours') {
    const people = active ? await client.resident.directory(hostelId) : [];
    body = (
      <div className="space-y-4">
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">{stay.directoryOptIn ? 'Neighbours can see your first name and room type.' : 'You are hidden from the neighbour list.'}</div>
          <form action={directoryAction}>
            <Back to={path} />
            <input type="hidden" name="id" value={stay.id} />
            <input type="hidden" name="on" value={stay.directoryOptIn ? '0' : '1'} />
            <SubmitButton size="sm" variant="secondary">{stay.directoryOptIn ? 'Hide me' : 'Show me'}</SubmitButton>
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
        ) : <Empty title="No one has joined the list yet" />}
      </div>
    );
  } else {
    const mine = stay.review;
    body = stay.canReview ? (
      <Card>
        <h2 className="font-semibold">{mine ? 'Update your review' : 'Review your stay'}</h2>
        <p className="mt-1 text-sm text-ink-soft">Your first name and the months you lived here show with the review. Be fair and specific.</p>
        {mine?.hidden && (
          <p className="mt-3 rounded-xl bg-danger-soft p-3 text-sm text-danger">
            Our team hid this review{mine.hiddenReason ? ` (${mine.hiddenReason})` : ''}. It does not show on the hostel page or count toward its rating.
          </p>
        )}
        {mine?.ownerReply && (
          <div className="mt-3 rounded-xl bg-bg p-3 text-sm"><span className="font-medium">The hostel replied:</span> {mine.ownerReply}</div>
        )}
        <form action={reviewAction} className="mt-4 space-y-4">
          <Back to={path} />
          <input type="hidden" name="hostelId" value={hostelId} />
          <input type="hidden" name="slug" value={stay.hostel.slug} />
          <div className={cx('grid gap-3', stay.hostel.foodAvailable ? 'sm:grid-cols-5' : 'sm:grid-cols-4')}>
            <RatingSelect name="rating" label="Overall" value={mine?.rating} />
            <RatingSelect name="cleanliness" label="Cleanliness" value={mine?.cleanliness} />
            {stay.hostel.foodAvailable && <RatingSelect name="food" label="Food" optional value={mine?.food} />}
            <RatingSelect name="safety" label="Safety" value={mine?.safety} />
            <RatingSelect name="responsiveness" label="Owner response" value={mine?.responsiveness} />
          </div>
          <Field label="Your review" hint="20 to 2,000 characters.">
            <Textarea name="body" required minLength={20} maxLength={2000} defaultValue={mine?.body} placeholder="What was it like to live here?" />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton>{mine ? 'Update review' : 'Post review'}</SubmitButton>
            {mine && <span className="text-xs text-ink-muted">Posted {dateLabel(mine.createdAt)}{Date.parse(mine.updatedAt) - Date.parse(mine.createdAt) > 60_000 && `, last edited ${dateLabel(mine.updatedAt)}`}</span>}
          </div>
        </form>
      </Card>
    ) : (
      <Empty title={mine ? 'Reviews for this stay are closed' : 'You cannot review this stay yet'}>
        {stay.reviewBlockedReason ?? 'Only residents can review this hostel'}. Reviews come only from verified residents, so they mean something.
      </Empty>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <PageHeader
        title={stay.hostel.name}
        subtitle={<>{stay.hostel.area} · {active ? `living here since ${dateLabel(stay.startDate)}` : `lived here until ${dateLabel(stay.endDate)}`} · <Link href={`/hostels/${stay.hostel.slug}`}>public page</Link></>}
      />
      <Flash error={q.error} ok={q.ok} />
      <nav className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-line bg-surface p-1">
        {TABS.map((t) => (
          <Link key={t.id} href={`/stay/${hostelId}?tab=${t.id}`} className={cx('whitespace-nowrap rounded-xl px-4 py-2 text-sm no-underline', t.id === tab ? 'bg-brand text-white' : 'text-ink-soft hover:bg-brand-soft')}>
            {t.label}
          </Link>
        ))}
      </nav>
      {body}
    </div>
  );
}
