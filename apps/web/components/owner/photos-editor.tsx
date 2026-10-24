'use client';
import { useRef } from 'react';
import type { HostelPhoto } from '@hostels/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormError } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/states';
import { api } from '@/lib/client-api';
import { useAction } from './use-action';

const MAX_BYTES = 5 * 1024 * 1024;

export function PhotosEditor({ hostelId, photos }: { hostelId: string; photos: HostelPhoto[] }) {
  const input = useRef<HTMLInputElement>(null);
  const { run, pending, error, setError } = useAction();
  const sorted = [...photos].sort((a, b) => a.sortOrder - b.sortOrder);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files);
    const tooBig = list.find((f) => f.size > MAX_BYTES);
    if (tooBig) return setError(`${tooBig.name} is larger than 5 MB.`);
    await run('upload', async () => {
      let order = sorted.length;
      for (const file of list) {
        const { url } = await api.upload(file, file.name);
        await api.owner.addPhoto(hostelId, { url, sortOrder: order++ });
      }
    });
    if (input.current) input.current.value = '';
  }

  function move(index: number, delta: number) {
    const ids = sorted.map((p) => p.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + delta, 0, id!);
    void run(`move-${id}`, () => api.owner.reorderPhotos(hostelId, { photoIds: ids }));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
        <Button onClick={() => input.current?.click()} loading={pending === 'upload'}>
          Upload photos
        </Button>
        <span className="text-xs text-muted">JPEG, PNG or WebP, up to 5 MB each. The first photo is your cover.</span>
      </div>
      <FormError message={error} />
      {sorted.length === 0 ? (
        <EmptyState title="No photos yet">Listings with 5+ real photos get far more visit requests. Show rooms, bathrooms, the kitchen and the entrance.</EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {sorted.map((p, i) => (
            <Card key={p.id} className="overflow-hidden">
              <div className="relative aspect-[4/3] bg-line">
                <img src={p.url} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                {i === 0 && <span className="absolute left-2 top-2 rounded-full bg-brand px-2 py-0.5 text-xs text-white">Cover</span>}
              </div>
              <div className="flex items-center justify-between gap-1 p-2">
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" aria-label="Move earlier" disabled={i === 0 || !!pending} onClick={() => move(i, -1)}>
                    ←
                  </Button>
                  <Button variant="ghost" size="sm" aria-label="Move later" disabled={i === sorted.length - 1 || !!pending} onClick={() => move(i, 1)}>
                    →
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-danger"
                  loading={pending === `del-${p.id}`}
                  onClick={() => {
                    if (confirm('Delete this photo?')) void run(`del-${p.id}`, () => api.owner.deletePhoto(p.id));
                  }}
                >
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
