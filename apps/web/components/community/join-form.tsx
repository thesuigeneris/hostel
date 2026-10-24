'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { istDate, type HostelSummary } from '@hostels/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, FormError, Input } from '@/components/ui/field';
import { Spinner } from '@/components/ui/states';
import { api } from '@/lib/client-api';
import { cn } from '@/lib/cn';
import { describeError } from '@/lib/errors';

type Pick = { id: string; name: string; area: string };

export function JoinForm({ preselected }: { preselected: Pick | null }) {
  const router = useRouter();
  const today = istDate();
  const [picked, setPicked] = useState<Pick | null>(preselected);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<HostelSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [startDate, setStartDate] = useState(today);
  const [roomLabel, setRoomLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; fields: Record<string, string> } | null>(null);

  useEffect(() => {
    if (picked || q.trim().length < 2) return setResults([]);
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      api.hostels
        .search({ q: q.trim(), pageSize: 8 })
        .then((r) => !cancelled && setResults(r.items))
        .catch(() => !cancelled && setResults([]))
        .finally(() => !cancelled && setSearching(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, picked]);

  return (
    <Card className="p-6">
      <form
        className="space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!picked) return;
          setSaving(true);
          setError(null);
          try {
            await api.community.claim({ hostelId: picked.id, startDate, ...(roomLabel.trim() ? { roomLabel: roomLabel.trim() } : {}) });
            router.push('/community');
            router.refresh();
          } catch (err) {
            setError(describeError(err));
            setSaving(false);
          }
        }}
      >
        {picked ? (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-brand-soft p-3">
            <div>
              <div className="text-xs text-muted">Hostel</div>
              <div className="font-medium">
                {picked.name}, {picked.area}
              </div>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setPicked(null)}>
              Change
            </Button>
          </div>
        ) : (
          <Field label="Which hostel do you live in?">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Start typing the hostel name" autoFocus />
            <div className="mt-2 space-y-1">
              {searching && <Spinner className="h-4 w-4" />}
              {results.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => setPicked({ id: h.id, name: h.name, area: h.area })}
                  className={cn('block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-brand-soft')}
                >
                  <span className="font-medium">{h.name}</span> <span className="text-muted">· {h.area}</span>
                </button>
              ))}
              {!searching && q.trim().length >= 2 && results.length === 0 && (
                <p className="text-sm text-muted">No hostel found. Ask your owner to list it, it&apos;s free.</p>
              )}
            </div>
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Living there since" error={error?.fields.startDate}>
            <Input type="date" max={today} value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </Field>
          <Field label="Room number (optional)" error={error?.fields.roomLabel} hint="Helps the owner recognise you.">
            <Input value={roomLabel} onChange={(e) => setRoomLabel(e.target.value)} maxLength={40} placeholder="e.g. 204-B" />
          </Field>
        </div>
        <FormError message={error && Object.keys(error.fields).length === 0 ? error.message : null} />
        <Button type="submit" size="lg" loading={saving} disabled={!picked}>
          Send request to owner
        </Button>
      </form>
    </Card>
  );
}
