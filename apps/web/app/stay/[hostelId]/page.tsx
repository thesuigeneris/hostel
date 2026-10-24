import { ApiError } from '@hostels/shared';
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

type Props = { params: Promise<{ hostelId: string }>; searchParams: Promise<{ tab?: string; error?: string; ok?: string }> };

const TABS = [
  { id: 'community', label: 'Community' },
  { id: 'issues', label: 'Issues' },
  { id: 'neighbours', label: 'Neighbours' },
  { id: 'review', label: 'Review' },
] as const;

function RatingSelect({ name, label, optional }: { name: string; label: string; optional?: boolean }) {
  return (
    <Field label={label}>
      <Select name={name} defaultValue={optional ? '' : '4'} required={!optional}>
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
    body = active ? (
      <div className="space-y-6">
        <IssueForm hostelId={hostelId} back={path} />
        <IssueList issues={issues} />
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
    body = stay.canReview ? (
      <Card>
        <h2 className="font-semibold">{stay.hasReview ? 'Update your review' : 'Review your stay'}</h2>
        <p className="mt-1 text-sm text-ink-soft">Your first name and the months you lived here show with the review. Be fair and specific.</p>
        <form action={reviewAction} className="mt-4 space-y-4">
          <Back to={path} />
          <input type="hidden" name="hostelId" value={hostelId} />
          <div className="grid gap-3 sm:grid-cols-5">
            <RatingSelect name="rating" label="Overall" />
            <RatingSelect name="cleanliness" label="Cleanliness" />
            <RatingSelect name="food" label="Food" optional />
            <RatingSelect name="safety" label="Safety" />
            <RatingSelect name="responsiveness" label="Owner response" />
          </div>
          <Field label="Your review" hint="At least 20 characters.">
            <Textarea name="body" required minLength={20} maxLength={2000} placeholder="What was it like to live here?" />
          </Field>
          <SubmitButton>{stay.hasReview ? 'Update review' : 'Post review'}</SubmitButton>
        </form>
      </Card>
    ) : (
      <Empty title="You can review after two weeks here">Reviews come only from people who actually lived here, so they mean something.</Empty>
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
