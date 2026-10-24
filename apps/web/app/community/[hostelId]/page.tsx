import { Board } from '@/components/community/board';
import { CommunityError } from '@/components/community/guard';
import { load } from '@/components/public/safe';
import { requireUser, serverApi } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function BoardPage({ params }: { params: Promise<{ hostelId: string }> }) {
  const { hostelId } = await params;
  const user = await requireUser(`/community/${hostelId}`);
  const r = await load((await serverApi()).community.posts(hostelId));
  if (!r.ok) return <CommunityError result={r} hostelId={hostelId} retryHref={`/community/${hostelId}`} />;
  return <Board hostelId={hostelId} initial={r.data} viewerId={user.id} />;
}
