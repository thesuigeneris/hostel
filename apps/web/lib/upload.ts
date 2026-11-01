import 'server-only';
import type { ApiClient } from '@hostels/shared';

/**
 * Forwards an optional photo from a form to the API's upload endpoint and returns the receipt to attach it with.
 * `listing` photos are public; `attachment` photos (issues, community posts) are only shown to the hostel's members.
 */
export async function uploadPhoto(client: ApiClient, form: FormData, purpose: 'listing' | 'attachment', key = 'photo'): Promise<string | null> {
  const file = form.get(key);
  if (!(file instanceof File) || file.size === 0) return null;
  const body = new FormData();
  body.set('file', file, file.name);
  body.set('purpose', purpose);
  const res = await client.request<{ upload: string }>('/uploads', { body });
  return res.upload;
}
