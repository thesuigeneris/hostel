'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ISSUE_CATEGORIES, ISSUE_SEVERITIES, type IssueCategory, type IssueSeverity } from '@hostels/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, FormError, Input, Select, Textarea } from '@/components/ui/field';
import { api } from '@/lib/client-api';
import { describeError } from '@/lib/errors';
import { ISSUE_CATEGORY_LABEL, ISSUE_SEVERITY_LABEL } from '@/lib/format';

const MAX_PHOTOS = 6;
const MAX_BYTES = 5 * 1024 * 1024;

export function ReportIssue({ hostelId }: { hostelId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<IssueCategory>('maintenance');
  const [severity, setSeverity] = useState<IssueSeverity>('medium');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [anonymous, setAnonymous] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; fields: Record<string, string> } | null>(null);

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} variant="food">
        Report an issue
      </Button>
    );
  }

  async function upload(files: FileList | null) {
    if (!files) return;
    setError(null);
    const list = [...files].slice(0, MAX_PHOTOS - photos.length);
    const tooBig = list.find((f) => f.size > MAX_BYTES);
    if (tooBig) return setError({ message: `${tooBig.name} is larger than 5 MB`, fields: {} });
    setUploading(true);
    try {
      for (const f of list) {
        const r = await api.upload(f, f.name);
        setPhotos((p) => [...p, r.url]);
      }
    } catch (e) {
      setError(describeError(e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="font-semibold">Report an issue</h2>
      <p className="mt-1 text-sm text-muted">The owner is notified straight away. Residents can upvote it, and how fast it&apos;s fixed shows on the hostel&apos;s public page.</p>
      <form
        className="mt-4 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError(null);
          try {
            const issue = await api.community.reportIssue(hostelId, { category, severity, title, description, photoUrls: photos, anonymous, isPublic });
            router.push(`/community/${hostelId}/issues/${issue.id}`);
          } catch (err) {
            setError(describeError(err));
            setSaving(false);
          }
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" error={error?.fields.category}>
            <Select value={category} onChange={(e) => setCategory(e.target.value as IssueCategory)}>
              {ISSUE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{ISSUE_CATEGORY_LABEL[c]}</option>
              ))}
            </Select>
          </Field>
          <Field label="How urgent?" error={error?.fields.severity}>
            <Select value={severity} onChange={(e) => setSeverity(e.target.value as IssueSeverity)}>
              {ISSUE_SEVERITIES.map((s) => (
                <option key={s} value={s}>{ISSUE_SEVERITY_LABEL[s]}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Title" error={error?.fields.title}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. No hot water on 2nd floor" required minLength={3} maxLength={120} />
        </Field>
        <Field label="What's happening?" error={error?.fields.description}>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Since when, where exactly, who is affected" required minLength={5} maxLength={4000} />
        </Field>
        <Field label={`Photos (up to ${MAX_PHOTOS})`} error={error?.fields.photoUrls} hint="JPEG, PNG or WebP, 5 MB max each.">
          <div className="flex flex-wrap gap-2">
            {photos.map((u) => (
              <div key={u} className="relative h-20 w-20 overflow-hidden rounded-lg border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="" className="h-full w-full object-cover" />
                <button type="button" aria-label="Remove photo" onClick={() => setPhotos((p) => p.filter((x) => x !== u))} className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-xs text-white">
                  ×
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <label className="grid h-20 w-20 cursor-pointer place-items-center rounded-lg border border-dashed border-line text-xs text-muted hover:border-brand">
                {uploading ? 'Uploading…' : '+ Add'}
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => void upload(e.target.files)} disabled={uploading} />
              </label>
            )}
          </div>
        </Field>
        <div className="space-y-2 rounded-xl bg-bg p-3 text-sm">
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]" />
            <span>
              <span className="font-medium">Report anonymously</span>
              <span className="block text-muted">The owner and other residents won&apos;t see your name.</span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]" />
            <span>
              <span className="font-medium">Show on the public issue record</span>
              <span className="block text-muted">People searching for hostels see the title and status, never who reported it.</span>
            </span>
          </label>
        </div>
        <FormError message={error && Object.keys(error.fields).length === 0 ? error.message : null} />
        <div className="flex gap-2">
          <Button type="submit" loading={saving} disabled={uploading}>
            Submit issue
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
