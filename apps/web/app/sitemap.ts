import type { MetadataRoute } from 'next';
import { createApiClient } from '@hostels/shared';
import { API_URL, SITE_URL } from '@/lib/config';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const api = createApiClient(API_URL);
  const entries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/search`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/for-hostels`, changeFrequency: 'monthly', priority: 0.6 },
  ];
  try {
    const areas = await api.areas();
    for (const a of areas) entries.push({ url: `${SITE_URL}/hostels-in/${a.slug}`, changeFrequency: 'daily', priority: 0.7 });
    // Walk all live hostels (50 per page, capped so a huge catalogue can't stall the request).
    for (let page = 1; page <= 40; page++) {
      const r = await api.hostels.search({ page, pageSize: 50 });
      for (const h of r.items) entries.push({ url: `${SITE_URL}/hostels/${h.slug}`, changeFrequency: 'weekly', priority: 0.9 });
      if (page * r.pageSize >= r.total) break;
    }
  } catch {
    // API unavailable: still serve the static entries.
  }
  return entries;
}
