import { loadOwnerHostel } from '@/components/owner/hostel-loader';
import { RoomsEditor } from '@/components/owner/rooms-editor';
import { LoadError } from '@/components/owner/ui';

export const dynamic = 'force-dynamic';

export default async function RoomsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await loadOwnerHostel(id);
  if (res.error !== null) return <LoadError message={res.error} />;
  return <RoomsEditor hostelId={id} rooms={res.data.roomTypes} isPartner={res.data.partnerStatus === 'verified'} />;
}
