import { coverPhotoAction, deletePhotoAction, submitHostelAction, updateHostelAction, uploadPhotoAction } from '@/app/owner/actions';
import { HostelForm } from '@/components/HostelForm';
import { SubmitButton } from '@/components/SubmitButton';
import { Card, Flash } from '@/components/ui';
import { ownerHostel } from '@/lib/owner';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> };

export default async function OwnerHostelPage({ params, searchParams }: Props) {
  const { id } = await params;
  const q = await searchParams;
  const h = await ownerHostel(id);
  const missing = [!h.roomTypes.length && 'a room type', !h.photos.length && 'a photo'].filter(Boolean);
  const order = h.photos.map((p) => p.id).join(',');

  return (
    <div className="space-y-6">
      <Flash error={q.error} ok={q.ok} />
      {(h.status === 'draft' || h.status === 'rejected') && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-brand bg-brand-soft/40">
          <div>
            <div className="font-medium">{h.status === 'rejected' ? 'Fix and resubmit' : 'Ready to go live?'}</div>
            <div className="text-sm text-ink-soft">
              {h.status === 'rejected' && h.rejectionReason ? `Our team said: ${h.rejectionReason}. ` : ''}
              {missing.length ? `Add ${missing.join(' and ')} first.` : 'Send it for review. We usually approve within a day.'}
            </div>
          </div>
          <form action={submitHostelAction}>
            <input type="hidden" name="hostelId" value={id} />
            <SubmitButton disabled={missing.length > 0}>Submit for review</SubmitButton>
          </form>
        </Card>
      )}
      {h.status === 'pending' && <Card className="bg-food-soft/50 text-sm">Your listing is in review. You can keep editing meanwhile.</Card>}

      <Card>
        <h2 className="font-semibold">Photos</h2>
        <p className="mt-1 text-sm text-ink-soft">Real photos of rooms, bathrooms and the kitchen get the most calls. The first photo is the cover.</p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {h.photos.map((p, i) => (
            <div key={p.id} className="overflow-hidden rounded-xl border border-line">
              <img src={p.url} alt={`${h.name}, view ${i + 1}`} className="aspect-[4/3] w-full object-cover" />
              <div className="flex justify-between p-2 text-xs">
                {i === 0 ? <span className="text-brand">Cover</span> : (
                  <form action={coverPhotoAction}>
                    <input type="hidden" name="hostelId" value={id} /><input type="hidden" name="photoId" value={p.id} /><input type="hidden" name="order" value={order} />
                    <button type="submit" className="text-ink-soft hover:text-brand">Make cover</button>
                  </form>
                )}
                <form action={deletePhotoAction}>
                  <input type="hidden" name="hostelId" value={id} /><input type="hidden" name="photoId" value={p.id} />
                  <button type="submit" className="text-ink-soft hover:text-danger">Remove</button>
                </form>
              </div>
            </div>
          ))}
        </div>
        <form action={uploadPhotoAction} className="mt-4 flex flex-wrap items-center gap-3">
          <input type="hidden" name="hostelId" value={id} />
          <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" required className="text-sm" />
          <SubmitButton size="sm" variant="secondary" pendingText="Uploading…">Upload photo</SubmitButton>
        </form>
      </Card>

      <Card>
        <h2 className="mb-4 font-semibold">Details</h2>
        <HostelForm action={updateHostelAction} hostel={h} submitLabel="Save changes" />
      </Card>
    </div>
  );
}
