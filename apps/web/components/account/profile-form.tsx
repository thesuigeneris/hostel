'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { User } from '@hostels/shared';
import { Button } from '@/components/ui/button';
import { Field, FormError, Input } from '@/components/ui/field';
import { api } from '@/lib/client-api';
import { describeError } from '@/lib/errors';

export function ProfileForm({ user }: { user: User }) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<{ message: string; fields: Record<string, string> } | null>(null);

  return (
    <form
      className="max-w-md space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        setSaved(false);
        setError(null);
        try {
          await api.me.update({ name, email: email.trim() ? email.trim() : null });
          setSaved(true);
          router.refresh();
        } catch (err) {
          setError(describeError(err));
        } finally {
          setSaving(false);
        }
      }}
    >
      <Field label="Mobile number" hint="Your sign-in number. It's never shown to other residents.">
        <Input value={`+91 ${user.phone}`} disabled />
      </Field>
      <Field label="Name" error={error?.fields.name}>
        <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoComplete="name" />
      </Field>
      <Field label="Email (for receipts)" error={error?.fields.email}>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </Field>
      <FormError message={error && Object.keys(error.fields).length === 0 ? error.message : null} />
      <div className="flex items-center gap-3">
        <Button type="submit" loading={saving}>Save</Button>
        {saved && <span className="text-sm text-ok">Saved</span>}
      </div>
    </form>
  );
}
