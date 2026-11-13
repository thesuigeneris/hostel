import type { SearchResult } from '@hostels/shared';
import { expect, test } from '@playwright/test';
import { API, publicGet } from './helpers';

// Photos are uploads served by the API; the Content Security Policy lets images load from nowhere else.

test('listing photos load from the API, and an outside image is refused by the page policy', async ({ page }) => {
  const res = await publicGet<SearchResult>('/hostels?verified=true&limit=50');
  const h = res.items.find((x) => x.coverPhotoUrl);
  expect(h, 'the seed gives listings photos').toBeTruthy();
  expect(new URL(h!.coverPhotoUrl!).origin).toBe(new URL(API).origin);

  const response = await page.goto(`/hostels/${h!.slug}`);
  const imgSrc = response!.headers()['content-security-policy']!.split(';').map((d) => d.trim()).find((d) => d.startsWith('img-src'))!;
  expect(imgSrc.split(' ')).not.toContain('https:');
  await expect.poll(() => page.locator('main img').first().evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  // A stock photo or tracking pixel from another host never loads, whatever the data says.
  const violated = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        document.addEventListener('securitypolicyviolation', (e) => resolve(`${e.effectiveDirective} ${e.blockedURI}`), { once: true });
        const img = new Image();
        img.src = 'https://images.example.com/stock.jpg';
        setTimeout(() => resolve('no violation'), 5000);
      }),
  );
  expect(violated).toBe('img-src https://images.example.com/stock.jpg');
});
