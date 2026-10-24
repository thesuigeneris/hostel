/**
 * A same-site path to come back to; anything else falls back to the home page. The URL parser
 * decides, so tricks like `/\host` or a tab after the slash can't point off-site.
 */
export function safePath(value: FormDataEntryValue | string | null | undefined, fallback = '/'): string {
  const v = typeof value === 'string' ? value : '';
  if (!v.startsWith('/')) return fallback;
  const url = new URL(v, 'http://local.invalid');
  return url.origin === 'http://local.invalid' ? url.pathname + url.search + url.hash : fallback;
}
