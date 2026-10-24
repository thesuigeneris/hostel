import { HostelForm } from '@/components/owner/hostel-form';
import { loadOwnerHostel } from '@/components/owner/hostel-loader';
import { LoadError } from '@/components/owner/ui';

export const dynamic = 'force-dynamic';

export default async function HostelDetailsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await loadOwnerHostel(id);
  if (res.error !== null) return <LoadError message={res.error} />;
  return (
    <div className="max-w-3xl">
      <HostelForm hostel={res.data} />
    </div>
  );
}
