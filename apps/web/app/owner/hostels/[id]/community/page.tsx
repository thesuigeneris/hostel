import { ButtonLink } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { AnnouncementComposer } from '@/components/owner/announcement-composer';
import { loadOwnerHostel } from '@/components/owner/hostel-loader';
import { LoadError, ProGate } from '@/components/owner/ui';

export const dynamic = 'force-dynamic';

export default async function CommunityTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await loadOwnerHostel(id);
  if (res.error !== null) return <LoadError message={res.error} />;
  const h = res.data;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardBody>
          <ProGate plan={h.ownerPlan} hostelId={h.id} feature="Announcements">
            <AnnouncementComposer hostelId={h.id} />
          </ProGate>
        </CardBody>
      </Card>
      <Card>
        <CardBody className="space-y-3">
          <h2 className="font-semibold">Resident community</h2>
          <p className="text-sm text-muted">
            Your residents talk, share updates and report issues on the hostel board. Reply there, pin important posts and keep things transparent.
          </p>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/community/${h.id}`} variant="secondary" size="sm">
              Open board
            </ButtonLink>
            <ButtonLink href={`/owner/issues?hostelId=${h.id}`} variant="secondary" size="sm">
              Issue desk
            </ButtonLink>
            <ButtonLink href={`/owner/residents?hostelId=${h.id}`} variant="secondary" size="sm">
              Residents
            </ButtonLink>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
