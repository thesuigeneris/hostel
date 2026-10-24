'use client';
import Link from 'next/link';
import { useState } from 'react';
import { addDays, istDate } from '@hostels/shared';
import { Button, buttonClass } from '@/components/ui/button';
import { Field, FormError, Input, Textarea } from '@/components/ui/field';
import { api } from '@/lib/client-api';
import { describeError } from '@/lib/errors';
import { formatDate } from '@/lib/format';

export function VisitForm({ hostelId, slug, signedIn }: { hostelId: string; slug: string; signedIn: boolean }) {
  const today = istDate();
  const [date, setDate] = useState(addDays(today, 1));
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; fields: Record<string, string> } | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <Link href={`/login?next=${encodeURIComponent(`/hostels/${slug}#visit`)}`} className={buttonClass('secondary', 'md', 'w-full')}>
        Sign in to request a visit
      </Link>
    );
  }
  if (done) {
    return (
      <div className="rounded-xl bg-ok-soft p-3 text-sm text-ok">
        Visit requested for {formatDate(done)}. The hostel will call you to confirm. Track it in <Link href="/account/visits" className="underline">My visits</Link>.
      </div>
    );
  }
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
          await api.hostels.requestVisit(hostelId, { preferredDate: date, message });
          setDone(date);
        } catch (err) {
          setError(describeError(err));
        } finally {
          setSaving(false);
        }
      }}
    >
      <Field label="Preferred date" error={error?.fields.preferredDate}>
        <Input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} required />
      </Field>
      <Field label="Message (optional)" error={error?.fields.message}>
        <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Any questions for the owner?" maxLength={1000} className="min-h-16" />
      </Field>
      <FormError message={error && Object.keys(error.fields).length === 0 ? error.message : null} />
      <Button type="submit" variant="secondary" className="w-full" loading={saving}>
        Request a visit
      </Button>
    </form>
  );
}
