import type { MetadataRoute } from 'next';
import { publicApi, SITE_URL } from '@/lib/api';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fixed = ['', '/hostels', '/for-owners'].map((p) => ({ url: `${SITE_URL}${p}`, changeFrequency: 'daily' as const, priority: p ? 0.8 : 1 }));
  const data = await publicApi(3600).hostels.sitemap().catch(() => null);
  if (!data) return fixed;
  return [
    ...fixed,
    ...data.areas.map((a) => ({ url: `${SITE_URL}/hostels-in/${a.slug}`, changeFrequency: 'daily' as const, priority: 0.7 })),
    ...data.hostels.map((h) => ({ url: `${SITE_URL}/hostels/${h.slug}`, changeFrequency: 'weekly' as const, priority: 0.6 })),
  ];
}
