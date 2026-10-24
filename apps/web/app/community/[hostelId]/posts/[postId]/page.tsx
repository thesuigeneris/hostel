import Link from 'next/link';
import { CommunityError } from '@/components/community/guard';
import { PostCard } from '@/components/community/post-card';
import { load } from '@/components/public/safe';
import { requireUser, serverApi } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function PostPage({ params }: { params: Promise<{ hostelId: string; postId: string }> }) {
  const { hostelId, postId } = await params;
  const user = await requireUser(`/community/${hostelId}/posts/${postId}`);
  const r = await load((await serverApi()).community.post(postId), { notFoundOn404: true });
  if (!r.ok) return <CommunityError result={r} hostelId={hostelId} retryHref={`/community/${hostelId}/posts/${postId}`} />;
  const { comments, ...post } = r.data;
  return (
    <div className="space-y-4">
      <Link href={`/community/${hostelId}`} className="text-sm text-muted hover:text-ink">
        ← Back to board
      </Link>
      <PostCard post={post} hostelId={hostelId} viewerId={user.id} initialComments={comments} />
    </div>
  );
}
