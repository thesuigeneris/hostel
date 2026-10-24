'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { Review, ReviewInput } from '@hostels/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, FormError, Input, Textarea } from '@/components/ui/field';
import { StarInput } from '@/components/ui/stars';
import { api } from '@/lib/client-api';
import { describeError } from '@/lib/errors';

type Scores = { overall: number; food: number; cleanliness: number; safety: number; value: number; staff: number };

export function ReviewForm({ hostelId, hostelSlug, servesFood, existing }: { hostelId: string; hostelSlug: string; servesFood: boolean; existing: Review | null }) {
  const [scores, setScores] = useState<Scores>({
    overall: existing?.overall ?? 0,
    food: existing?.food ?? 0,
    cleanliness: existing?.cleanliness ?? 0,
    safety: existing?.safety ?? 0,
    value: existing?.value ?? 0,
    staff: existing?.staff ?? 0,
  });
  const [title, setTitle] = useState(existing?.title ?? '');
  const [body, setBody] = useState(existing?.body ?? '');
  const [saved, setSaved] = useState<Review | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; fields: Record<string, string> } | null>(null);
  const isEdit = !!(existing ?? saved);

  const dims: { key: keyof Scores; label: string }[] = [
    { key: 'overall', label: 'Overall' },
    ...(servesFood ? [{ key: 'food' as const, label: 'Food' }] : []),
    { key: 'cleanliness', label: 'Cleanliness' },
    { key: 'safety', label: 'Safety' },
    { key: 'value', label: 'Value for money' },
    { key: 'staff', label: 'Owner & staff' },
  ];
  const missing = dims.some((d) => scores[d.key] === 0);

  if (saved) {
    return (
      <Card className="p-6 text-center">
        <h2 className="text-lg font-semibold">Thanks, your review is live</h2>
        <p className="mt-1 text-sm text-muted">It helps people searching for a hostel know what it&apos;s really like.</p>
        <div className="mt-4 flex justify-center gap-2">
          <Link href={`/hostels/${hostelSlug}#reviews`} className="text-sm font-medium text-brand underline">
            See it on the hostel page
          </Link>
          <button type="button" className="text-sm text-muted underline" onClick={() => setSaved(null)}>
            Edit again
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <form
        className="space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError(null);
          const input: ReviewInput = {
            overall: scores.overall,
            food: servesFood ? scores.food : null,
            cleanliness: scores.cleanliness,
            safety: scores.safety,
            value: scores.value,
            staff: scores.staff,
            title: title.trim(),
            body: body.trim(),
          };
          try {
            const r = existing ? await api.community.editReview(existing.id, input) : await api.community.writeReview(hostelId, input);
            setSaved(r);
          } catch (err) {
            setError(describeError(err));
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="space-y-3">
          {dims.map((d) => (
            <StarInput key={d.key} label={d.label} value={scores[d.key]} onChange={(v) => setScores((s) => ({ ...s, [d.key]: v }))} />
          ))}
        </div>
        <Field label="Headline" error={error?.fields.title}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Great food, slow WiFi fixes" required minLength={3} maxLength={120} />
        </Field>
        <Field label="Your experience" error={error?.fields.body} hint={`${body.trim().length}/4000 · at least 20 characters`}>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="What's daily life like? Food, cleanliness, safety, how the owner handles problems…" required minLength={20} maxLength={4000} className="min-h-36" />
        </Field>
        <FormError message={error && Object.keys(error.fields).length === 0 ? error.message : null} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={saving} disabled={missing}>
            {isEdit ? 'Update review' : 'Publish review'}
          </Button>
          {missing && <span className="text-xs text-muted">Rate every category to continue.</span>}
        </div>
        <p className="text-xs text-muted">Reviews show your name and a &quot;Verified resident&quot; badge. The owner can reply, but can&apos;t remove your review.</p>
      </form>
    </Card>
  );
}
