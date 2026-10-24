import { loadOwnerHostel } from '@/components/owner/hostel-loader';
import { PhotosEditor } from '@/components/owner/photos-editor';
import { LoadError } from '@/components/owner/ui';

export const dynamic = 'force-dynamic';

export default async function PhotosTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await loadOwnerHostel(id);
  if (res.error !== null) return <LoadError message={res.error} />;
  return <PhotosEditor hostelId={id} photos={res.data.photos} />;
}
