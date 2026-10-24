import { CommunityError } from '@/components/community/guard';
import { Avatar } from '@/components/community/post-card';
import { load } from '@/components/public/safe';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { formatDate } from '@/lib/format';
import { requireUser, serverApi } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function ResidentsPage({ params }: { params: Promise<{ hostelId: string }> }) {
  const { hostelId } = await params;
  const user = await requireUser(`/community/${hostelId}/residents`);
  const r = await load((await serverApi()).community.residents(hostelId));
  if (!r.ok) return <CommunityError result={r} hostelId={hostelId} retryHref={`/community/${hostelId}/residents`} />;
  if (r.data.length === 0) return <EmptyState title="No residents listed yet">Residents appear here once the owner confirms them.</EmptyState>;

  return (
    <div>
      <p className="mb-4 text-sm text-muted">
        {r.data.length} {r.data.length === 1 ? 'person lives' : 'people live'} here. Phone numbers are never shown. Say hi on the board.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {r.data.map((p) => (
          <Card key={p.id} className="flex items-center gap-3 p-3">
            <Avatar name={p.name} />
            <div className="min-w-0">
              <div className="truncate font-medium">
                {p.name}
                {p.id === user.id && <span className="text-xs font-normal text-muted"> (you)</span>}
              </div>
              <div className="text-xs text-muted">
                Since {formatDate(p.since, { month: 'short', year: 'numeric' })}
                {p.roomLabel && ` · Room ${p.roomLabel}`}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
