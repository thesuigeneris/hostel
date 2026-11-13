import { ISSUE_CATEGORIES, POST_KINDS, type CommunityPost, type IssueView } from '@hostels/shared';
import Link from 'next/link';
import {
  commentAction,
  deletePostAction,
  likeAction,
  moderateAction,
  postAction,
  reportContentAction,
  reportIssueAction,
} from '@/app/stay/actions';
import { titleCase, timeAgo } from '@/lib/format';
import { SubmitButton } from './SubmitButton';
import { Back, Badge, Card, Empty, Field, Input, Select, StatusBadge, Textarea } from './ui';

const tiny = 'text-xs text-ink-muted hover:text-brand';

export function IssueList({ issues, emptyText = 'No issues reported. Nice.' }: { issues: IssueView[]; emptyText?: string }) {
  if (!issues.length) return <Empty title={emptyText} />;
  return (
    <ul className="space-y-2">
      {issues.map((i) => (
        <li key={i.id}>
          <Link href={`/issues/${i.id}`} className="block rounded-2xl border border-line bg-surface p-4 text-ink no-underline hover:border-brand">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{i.title}</span>
              <span className="flex items-center gap-2">
                {i.needsResponse && <Badge tone="red">Waiting on hostel</Badge>}
                <StatusBadge kind="issue" status={i.status} />
              </span>
            </div>
            <div className="mt-1 text-xs text-ink-muted">
              {titleCase(i.category)} · {i.reporter?.name ?? 'A resident'}{i.mine && ' (you)'} · {timeAgo(i.createdAt)} · {i.upvotes} me-too
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function IssueForm({ hostelId, back }: { hostelId: string; back: string }) {
  return (
    <Card>
      <h3 className="font-semibold">Report an issue</h3>
      <p className="mt-1 text-sm text-ink-soft">The hostel sees it right away. How fast issues get fixed shows on the public listing.</p>
      <form action={reportIssueAction} className="mt-3 space-y-3">
        <Back to={back} />
        <input type="hidden" name="hostelId" value={hostelId} />
        <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
          <Field label="Category">
            <Select name="category" defaultValue="maintenance">
              {ISSUE_CATEGORIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
            </Select>
          </Field>
          <Field label="What's wrong?"><Input name="title" required minLength={4} maxLength={120} placeholder="Geyser on 2nd floor not working" /></Field>
        </div>
        <Field label="Details"><Textarea name="description" maxLength={2000} placeholder="Since when, which room, anything that helps" /></Field>
        <Field label="Photo" hint="Optional. JPEG, PNG or WebP up to 5 MB."><input type="file" name="photo" accept="image/jpeg,image/png,image/webp" className="text-sm" /></Field>
        <SubmitButton pendingText="Sending…">Report issue</SubmitButton>
      </form>
    </Card>
  );
}

export function Feed({ hostelId, posts, back, isOwner = false }: { hostelId: string; posts: CommunityPost[]; back: string; isOwner?: boolean }) {
  const kinds = POST_KINDS.filter((k) => isOwner || k !== 'announcement');
  return (
    <div className="space-y-4">
      <Card>
        <form action={postAction} className="space-y-3">
          <Back to={back} />
          <input type="hidden" name="hostelId" value={hostelId} />
          <Textarea name="body" aria-label="Message" required maxLength={1000} placeholder={isOwner ? 'Post an announcement for residents' : 'Ask your neighbours, share something, plan a movie night…'} />
          <div className="flex flex-wrap items-center gap-3">
            <Select name="kind" aria-label="Post type" defaultValue={isOwner ? 'announcement' : 'general'} className="w-auto">
              {kinds.map((k) => <option key={k} value={k}>{titleCase(k)}</option>)}
            </Select>
            <input type="file" name="photo" aria-label="Attach a photo (optional)" accept="image/jpeg,image/png,image/webp" className="text-sm" />
            <SubmitButton size="sm" className="ml-auto" pendingText="Posting…">Post</SubmitButton>
          </div>
        </form>
      </Card>

      {posts.length === 0 && <Empty title="Nothing here yet">Start the conversation.</Empty>}
      {posts.map((p) => (
        <Card key={p.id} className={p.hidden ? 'opacity-60' : ''}>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{p.author}</span>
            <Badge tone={p.kind === 'announcement' ? 'green' : p.kind === 'food' ? 'food' : 'gray'}>{titleCase(p.kind)}</Badge>
            {p.pinned && <Badge tone="green">Pinned</Badge>}
            {p.hidden && <Badge tone="red">Hidden</Badge>}
            <span className="text-xs text-ink-muted">{timeAgo(p.createdAt)}</span>
          </div>
          <p className="mt-2 whitespace-pre-line text-sm">{p.body}</p>
          {p.photoUrl && <img src={p.photoUrl} alt="Attached to the post" className="mt-3 max-h-80 rounded-xl object-cover" />}

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <form action={likeAction}>
              <Back to={back} />
              <input type="hidden" name="postId" value={p.id} />
              <input type="hidden" name="on" value={p.likedByMe ? '0' : '1'} />
              <button
                type="submit"
                aria-pressed={p.likedByMe}
                aria-label={p.likedByMe ? 'Unlike' : 'Like'}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs ${p.likedByMe ? 'border-brand bg-brand-soft text-brand' : 'border-line text-ink-muted hover:border-brand hover:text-brand'}`}
              >
                <span aria-hidden>{p.likedByMe ? '♥' : '♡'}</span> {p.likes}
              </button>
            </form>
            {(p.mine || isOwner) && (
              <form action={deletePostAction}><Back to={back} /><input type="hidden" name="postId" value={p.id} /><button type="submit" className={tiny}>Delete</button></form>
            )}
            {!p.mine && (
              <form action={reportContentAction}><Back to={back} /><input type="hidden" name="type" value="post" /><input type="hidden" name="id" value={p.id} /><button type="submit" className={tiny}>Report</button></form>
            )}
            {isOwner && (
              <>
                <form action={moderateAction}><Back to={back} /><input type="hidden" name="postId" value={p.id} /><input type="hidden" name="pinned" value={p.pinned ? '0' : '1'} /><button type="submit" className={tiny}>{p.pinned ? 'Unpin' : 'Pin'}</button></form>
                <form action={moderateAction}><Back to={back} /><input type="hidden" name="postId" value={p.id} /><input type="hidden" name="hidden" value={p.hidden ? '0' : '1'} /><button type="submit" className={tiny}>{p.hidden ? 'Unhide' : 'Hide'}</button></form>
              </>
            )}
          </div>

          {p.comments.length > 0 && (
            <ul className="mt-3 space-y-2 border-l-2 border-line pl-3">
              {p.comments.map((c) => (
                <li key={c.id} className={`text-sm ${c.hidden ? 'opacity-60' : ''}`}>
                  <span className="font-medium">{c.author}</span> <span className="text-ink-soft">{c.body}</span>{' '}
                  <span className="text-xs text-ink-muted">{timeAgo(c.createdAt)}</span>
                  <span className="ml-2 inline-flex gap-2">
                    {(c.mine || isOwner) && (
                      <form action={deletePostAction} className="inline"><Back to={back} /><input type="hidden" name="commentId" value={c.id} /><button type="submit" className={tiny}>Delete</button></form>
                    )}
                    {!c.mine && (
                      <form action={reportContentAction} className="inline"><Back to={back} /><input type="hidden" name="type" value="comment" /><input type="hidden" name="id" value={c.id} /><button type="submit" className={tiny}>Report</button></form>
                    )}
                    {isOwner && (
                      <form action={moderateAction} className="inline"><Back to={back} /><input type="hidden" name="commentId" value={c.id} /><input type="hidden" name="hidden" value={c.hidden ? '0' : '1'} /><button type="submit" className={tiny}>{c.hidden ? 'Unhide' : 'Hide'}</button></form>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <form action={commentAction} className="mt-3 flex gap-2">
            <Back to={back} />
            <input type="hidden" name="postId" value={p.id} />
            <Input name="body" required maxLength={500} placeholder="Reply" className="h-9" />
            <SubmitButton size="sm" variant="secondary">Reply</SubmitButton>
          </form>
        </Card>
      ))}
    </div>
  );
}
