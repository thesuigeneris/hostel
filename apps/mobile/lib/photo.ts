/** Pure helpers for photo uploads, kept apart from expo-image-picker so they can be unit tested. */

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export type PickedPhoto = { uri: string; mimeType?: string | null; fileName?: string | null; fileSize?: number | null };

/** The name and type to send for a picked photo. Falls back to the file extension, then to JPEG. */
export function photoPart(p: PickedPhoto): { uri: string; name: string; type: string } {
  const ext = (p.fileName ?? p.uri).split('?')[0]!.split('.').pop()?.toLowerCase() ?? '';
  const type = (p.mimeType?.startsWith('image/') && p.mimeType) || TYPES[ext] || 'image/jpeg';
  const fallbackExt = Object.entries(TYPES).find(([, t]) => t === type)?.[0] ?? 'jpg';
  const name = p.fileName && /\.\w+$/.test(p.fileName) ? p.fileName : `photo.${TYPES[ext] === type ? ext : fallbackExt}`;
  return { uri: p.uri, name, type };
}

/** Problem with a picked photo before upload, or null. The API checks again. */
export function photoProblem(p: PickedPhoto): string | null {
  if (p.fileSize && p.fileSize > MAX_PHOTO_BYTES) return 'Photos must be 5 MB or smaller';
  if (!Object.values(TYPES).includes(photoPart(p).type)) return 'Only JPEG, PNG or WebP photos are accepted';
  return null;
}
