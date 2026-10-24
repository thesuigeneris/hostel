'use client';
import { useState } from 'react';
import type { Paginated, Post } from '@hostels/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormError, Textarea } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/states';
import { api } from '@/lib/client-api';
import { describeError } from '@/lib/errors';
import { PostCard } from './post-card';

function order(posts: Post[]) {
  return [...posts].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));
}

export function Board({ hostelId, initial, viewerId }: { hostelId: string; initial: Paginated<Post>; viewerId: string }) {
  const [posts, setPosts] = useState(order(initial.items));
  const [page, setPage] = useState(initial.page);
  const [total, setTotal] = useState(initial.total);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            setPosting(true);
            setError(null);
            try {
              const p = await api.community.createPost(hostelId, { body: draft.trim() });
              setPosts((ps) => order([p, ...ps]));
              setTotal((t) => t + 1);
              setDraft('');
            } catch (err) {
              setError(describeError(err).message);
            } finally {
              setPosting(false);
            }
          }}
        >
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Say hi, find a cricket partner, share a cab to the office…"
            maxLength={4000}
            aria-label="New post"
          />
          <FormError message={error} />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">Only residents and the owner can see this board.</span>
            <Button type="submit" loading={posting} disabled={!draft.trim()}>
              Post
            </Button>
          </div>
        </form>
      </Card>

      {posts.length === 0 ? (
        <EmptyState title="It's quiet here">Be the first to post. Introduce yourself to your neighbours.</EmptyState>
      ) : (
        posts.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            hostelId={hostelId}
            viewerId={viewerId}
            onDeleted={(id) => {
              setPosts((ps) => ps.filter((x) => x.id !== id));
              setTotal((t) => t - 1);
            }}
          />
        ))
      )}

      {posts.length < total && (
        <div className="text-center">
          <Button
            variant="secondary"
            loading={loadingMore}
            onClick={async () => {
              setLoadingMore(true);
              try {
                const next = await api.community.posts(hostelId, page + 1);
                setPosts((ps) => order([...ps, ...next.items.filter((n) => !ps.some((p) => p.id === n.id))]));
                setPage(next.page);
                setTotal(next.total);
              } catch (e) {
                setError(describeError(e).message);
              } finally {
                setLoadingMore(false);
              }
            }}
          >
            Load older posts
          </Button>
        </div>
      )}
    </div>
  );
}
