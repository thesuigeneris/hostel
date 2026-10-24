import { loadOwnerHostel } from '@/components/owner/hostel-loader';
import { StatusPanel } from '@/components/owner/status-panel';
import { LoadError } from '@/components/owner/ui';

export const dynamic = 'force-dynamic';

export default async function StatusTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await loadOwnerHostel(id);
  if (res.error !== null) return <LoadError message={res.error} />;
  return <StatusPanel hostel={res.data} />;
}
