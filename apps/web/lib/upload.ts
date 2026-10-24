import 'server-only';
import type { ApiClient } from '@hostels/shared';

/** Forwards an optional photo from a form to the API's upload endpoint and returns its URL. */
export async function uploadPhoto(client: ApiClient, form: FormData, key = 'photo'): Promise<string | null> {
  const file = form.get(key);
  if (!(file instanceof File) || file.size === 0) return null;
  const body = new FormData();
  body.set('file', file, file.name);
  const res = await client.request<{ url: string }>('/uploads', { body });
  return res.url;
}
