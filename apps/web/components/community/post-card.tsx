'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { Post, PostComment } from '@hostels/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormError, Textarea } from '@/components/ui/field';
import { Spinner } from '@/components/ui/states';
import { api } from '@/lib/client-api';
import { cn } from '@/lib/cn';
import { describeError } from '@/lib/errors';
import { timeAgo } from '@/lib/format';

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
  return <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand', className)}>{initials || '?'}</span>;
}

export function PostCard({
  post: initial,
  hostelId,
  viewerId,
  initialComments,
  onDeleted,
}: {
  post: Post;
  hostelId: string;
  viewerId: string;
  initialComments?: PostComment[];
  onDeleted?: (id: string) => void;
}) {
  const [post, setPost] = useState(initial);
  const [comments, setComments] = useState<PostComment[] | null>(initialComments ?? null);
  const [open, setOpen] = useState(!!initialComments);
  const [loadingComments, setLoadingComments] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAnnouncement = post.kind === 'announcement';

  async function toggleComments() {
    const next = !open;
    setOpen(next);
    if (next && comments === null) {
      setLoadingComments(true);
      try {
        setComments((await api.community.post(post.id)).comments);
      } catch (e) {
        setError(describeError(e).message);
      } finally {
        setLoadingComments(false);
      }
    }
  }

  async function like() {
    const was = post.likedByMe;
    setPost((p) => ({ ...p, likedByMe: !was, likes: p.likes + (was ? -1 : 1) }));
    try {
      const r = await api.community.toggleLike(post.id);
      setPost((p) => ({ ...p, likedByMe: r.liked, likes: r.likes }));
    } catch (e) {
      setPost((p) => ({ ...p, likedByMe: was, likes: p.likes + (was ? 1 : -1) }));
      setError(describeError(e).message);
    }
  }

  return (
    <Card className={cn('p-4', isAnnouncement && 'border-brand bg-brand-soft/40')}>
      <div className="flex items-start gap-3">
        <Avatar name={post.author.name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{post.author.name}</span>
            {(post.author.role === 'owner' || isAnnouncement) && <Badge tone="brand">Owner</Badge>}
            {post.pinned && <Badge tone="food">Pinned</Badge>}
            {isAnnouncement && <Badge tone="brand">Announcement</Badge>}
            <Link href={`/community/${hostelId}/posts/${post.id}`} className="text-xs text-muted hover:underline">
              {timeAgo(post.createdAt)}
            </Link>
          </div>
          <p className="mt-1 whitespace-pre-line text-sm text-ink">{post.body}</p>
          <div className="mt-3 flex items-center gap-4 text-sm">
            <button type="button" onClick={() => void like()} className={cn('flex items-center gap-1', post.likedByMe ? 'font-medium text-food' : 'text-muted hover:text-ink')} aria-pressed={post.likedByMe}>
              {post.likedByMe ? '♥' : '♡'} {post.likes}
            </button>
            <button type="button" onClick={() => void toggleComments()} className="text-muted hover:text-ink" aria-expanded={open}>
              {post.commentCount} {post.commentCount === 1 ? 'comment' : 'comments'}
            </button>
            {post.author.id === viewerId && onDeleted && (
              <button
                type="button"
                className="ml-auto text-xs text-muted hover:text-danger"
                onClick={async () => {
                  if (!window.confirm('Delete this post?')) return;
                  try {
                    await api.community.deletePost(post.id);
                    onDeleted(post.id);
                  } catch (e) {
                    setError(describeError(e).message);
                  }
                }}
              >
                Delete
              </button>
            )}
          </div>
          <FormError message={error} />
          {open && (
            <div className="mt-3 space-y-3 border-t border-line pt-3">
              {loadingComments && <Spinner className="h-4 w-4" />}
              {comments?.map((c) => (
                <div key={c.id} className="flex gap-2 text-sm">
                  <Avatar name={c.author.name} className="h-7 w-7 text-[10px]" />
                  <div>
                    <span className="font-medium">{c.author.name}</span> <span className="text-xs text-muted">{timeAgo(c.createdAt)}</span>
                    <p className="whitespace-pre-line text-ink">{c.body}</p>
                  </div>
                </div>
              ))}
              <form
                className="flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!draft.trim()) return;
                  setSending(true);
                  setError(null);
                  try {
                    const c = await api.community.comment(post.id, { body: draft.trim() });
                    setComments((cs) => [...(cs ?? []), c]);
                    setPost((p) => ({ ...p, commentCount: p.commentCount + 1 }));
                    setDraft('');
                  } catch (err) {
                    setError(describeError(err).message);
                  } finally {
                    setSending(false);
                  }
                }}
              >
                <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a comment" className="min-h-10" rows={1} maxLength={2000} />
                <Button type="submit" size="sm" loading={sending} disabled={!draft.trim()} className="self-end">
                  Reply
                </Button>
              </form>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
