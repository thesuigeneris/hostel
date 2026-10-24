'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { addDays, istDate, type HostelDetail, type HostelSummary, type MoveRequest } from '@hostels/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, FormError, Input, Select } from '@/components/ui/field';
import { Spinner } from '@/components/ui/states';
import { api } from '@/lib/client-api';
import { describeError } from '@/lib/errors';
import { SHARING_LABEL, formatDate, rupees } from '@/lib/format';

export function ScheduledMove({ move, toName }: { move: MoveRequest; toName: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card className="border-brand p-5">
      <h2 className="font-semibold">Move scheduled</h2>
      <p className="mt-1 text-sm text-muted">
        Moving to <span className="font-medium text-ink">{toName}</span> on {formatDate(move.moveDate)}. Your bed there is reserved. The new rent applies from your next bill.
      </p>
      <FormError message={error} />
      <Button
        variant="secondary"
        className="mt-4"
        loading={loading}
        onClick={async () => {
          setLoading(true);
          setError(null);
          try {
            await api.tenant.cancelMove(move.id);
            router.refresh();
          } catch (e) {
            setError(describeError(e).message);
          } finally {
            setLoading(false);
          }
        }}
      >
        Cancel this move
      </Button>
    </Card>
  );
}

export function MoveForm({ hostels, currentHostelId, currentRoomTypeId }: { hostels: HostelSummary[]; currentHostelId: string; currentRoomTypeId: string }) {
  const router = useRouter();
  const tomorrow = addDays(istDate(), 1);
  const [slug, setSlug] = useState('');
  const [detail, setDetail] = useState<HostelDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [roomTypeId, setRoomTypeId] = useState('');
  const [moveDate, setMoveDate] = useState(tomorrow);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; fields: Record<string, string> } | null>(null);

  useEffect(() => {
    if (!slug) return setDetail(null);
    let cancelled = false;
    setLoadingDetail(true);
    setRoomTypeId('');
    api.hostels
      .get(slug)
      .then((d) => !cancelled && setDetail(d))
      .catch((e) => !cancelled && setError(describeError(e)))
      .finally(() => !cancelled && setLoadingDetail(false));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const rooms = (detail?.roomTypes ?? []).filter((r) => !(detail?.id === currentHostelId && r.id === currentRoomTypeId));

  return (
    <Card className="p-5">
      <h2 className="font-semibold">Move to another partner hostel</h2>
      <p className="mt-1 text-sm text-muted">No fee, no advance. We reserve your new bed now and switch you over on the move date.</p>
      <form
        className="mt-4 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!detail || !roomTypeId) return;
          setSaving(true);
          setError(null);
          try {
            await api.tenant.move({ toHostelId: detail.id, toRoomTypeId: roomTypeId, moveDate });
            router.refresh();
          } catch (err) {
            setError(describeError(err));
          } finally {
            setSaving(false);
          }
        }}
      >
        <Field label="Hostel">
          <Select value={slug} onChange={(e) => setSlug(e.target.value)} required>
            <option value="">Choose a hostel</option>
            {hostels.map((h) => (
              <option key={h.id} value={h.slug}>
                {h.name}, {h.area} (from {rupees(h.minRent)})
              </option>
            ))}
          </Select>
        </Field>
        {loadingDetail && <Spinner />}
        {detail && (
          <Field label="Room" error={error?.fields.toRoomTypeId}>
            <div className="space-y-2">
              {rooms.length === 0 && <p className="text-sm text-muted">No other rooms here.</p>}
              {rooms.map((r) => (
                <label key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                  <span className="flex items-center gap-2">
                    <input type="radio" name="room" value={r.id} checked={roomTypeId === r.id} onChange={() => setRoomTypeId(r.id)} disabled={r.bedsAvailable === 0} className="accent-[var(--color-brand)]" />
                    {SHARING_LABEL[r.sharing]} · {r.bedsAvailable > 0 ? `${r.bedsAvailable} free` : 'Full'}
                  </span>
                  <span className="font-medium">{rupees(r.monthlyRent)}/mo</span>
                </label>
              ))}
            </div>
          </Field>
        )}
        <Field label="Move date" error={error?.fields.moveDate} hint="Tomorrow at the earliest.">
          <Input type="date" min={tomorrow} value={moveDate} onChange={(e) => setMoveDate(e.target.value)} required />
        </Field>
        <FormError message={error && Object.keys(error.fields).length === 0 ? error.message : null} />
        <Button type="submit" loading={saving} disabled={!roomTypeId}>
          Schedule move
        </Button>
      </form>
    </Card>
  );
}
