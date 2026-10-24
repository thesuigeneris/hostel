import { ButtonLink } from '@/components/ui/button';
import { EmptyState, PageHeader } from '@/components/ui/states';
import { load } from '@/components/owner/data';
import { HostelPicker } from '@/components/owner/hostel-picker';
import { ResidentsManager } from '@/components/owner/residents-manager';
import { LoadError } from '@/components/owner/ui';
import { serverApi } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function ResidentsPage({ searchParams }: { searchParams: Promise<{ hostelId?: string }> }) {
  const sp = await searchParams;
  const api = await serverApi();
  const hostels = await load(() => api.owner.hostels());
  if (hostels.error !== null) return <LoadError message={hostels.error} />;
  if (hostels.data.length === 0) return <EmptyState title="No hostels yet" action={<ButtonLink href="/owner/hostels/new">Add a hostel</ButtonLink>} />;
  const hostel = hostels.data.find((h) => h.id === sp.hostelId) ?? hostels.data[0]!;
  const residents = await load(() => api.owner.residents(hostel.id));

  return (
    <div>
      <PageHeader title="Residents" subtitle="Who lives at your hostel. Residents can join your community board, report issues and leave reviews." actions={<HostelPicker hostels={hostels.data} value={hostel.id} />} />
      {residents.error !== null ? <LoadError message={residents.error} /> : <ResidentsManager hostelId={hostel.id} plan={hostel.ownerPlan} residents={residents.data} />}
    </div>
  );
}
