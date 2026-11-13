import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/api';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/owner', '/admin', '/account', '/stay', '/pay', '/subscribe', '/issues', '/login'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
