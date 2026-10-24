'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FormError, Textarea } from '@/components/ui/field';
import { api } from '@/lib/client-api';
import { useAction } from './use-action';

export function AnnouncementComposer({ hostelId }: { hostelId: string }) {
  const [body, setBody] = useState('');
  const [sent, setSent] = useState(false);
  const { run, pending, error, fields } = useAction();
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const out = await run('send', () => api.owner.announce(hostelId, { body }));
        if (out) {
          setBody('');
          setSent(true);
        }
      }}
    >
      <Field label="Announcement to all residents" error={fields.body} hint="Shows at the top of your hostel's community board.">
        <Textarea
          value={body}
          onChange={(e) => {
            setSent(false);
            setBody(e.target.value);
          }}
          rows={4}
          maxLength={4000}
          placeholder="Water supply will be off 10am–1pm on Saturday for tank cleaning."
          required
        />
      </Field>
      <FormError message={error} />
      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending === 'send'} disabled={!body.trim()}>
          Post announcement
        </Button>
        {sent && <span className="text-sm text-ok">Posted</span>}
      </div>
    </form>
  );
}
