import { expect, type Page, test } from '@playwright/test';

/**
 * Scripts run only with this response's nonce (M14): the policy has no 'unsafe-inline' for scripts, every script the
 * page carries has the nonce, the page still works, and a script injected without the nonce does not run.
 */

/** Records every CSP violation the page reports, from the first byte. */
async function watchViolations(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __violations: string[] };
    w.__violations = [];
    document.addEventListener('securitypolicyviolation', (e) => w.__violations.push(`${e.effectiveDirective} ${e.blockedURI}`));
  });
  return () => page.evaluate(() => (window as unknown as { __violations: string[] }).__violations);
}

const scriptSrc = (policy: string) => policy.split('; ').find((d) => d.startsWith('script-src ')) ?? '';

for (const path of ['/', '/hostels', '/login']) {
  test(`${path}: every script carries the response nonce, nothing is blocked, and the page works`, async ({ page }) => {
    const violations = await watchViolations(page);
    const res = await page.goto(path);
    const policy = res!.headers()['content-security-policy'] ?? '';
    const nonce = /'nonce-([^']+)'/.exec(scriptSrc(policy))?.[1];
    expect(nonce, 'a nonce in script-src').toBeTruthy();
    expect(scriptSrc(policy)).not.toContain("'unsafe-inline'");

    await page.waitForLoadState('networkidle');
    const scripts = await page.evaluate(() => [...document.scripts].filter((s) => !s.type || s.type.includes('javascript')).map((s) => s.nonce));
    expect(scripts.length).toBeGreaterThan(3);
    expect(scripts.every((n) => n === nonce)).toBe(true);
    expect(await violations()).toEqual([]);

    // A fresh nonce on the next load.
    const again = await page.request.get(path);
    expect(again.headers()['content-security-policy']).not.toContain(`'nonce-${nonce}'`);
  });
}

test('a script injected without the nonce is blocked; the page stays interactive; Razorpay Checkout is allowed', async ({ page }) => {
  const violations = await watchViolations(page);
  await page.goto('/hostels');
  // The suggestions box becomes a combobox only once the page's own scripts have run (it is a plain form before).
  await expect(page.getByRole('combobox').first()).toBeVisible();

  await page.evaluate(() => {
    const s = document.createElement('script');
    s.textContent = 'window.__injected = true';
    document.body.append(s);
  });
  expect(await page.evaluate(() => (window as unknown as { __injected?: boolean }).__injected)).toBeUndefined();
  await expect.poll(violations).toContainEqual(expect.stringMatching(/^script-src-elem inline/));

  // The pay page loads Checkout's script from its own host; the policy lets it through (the sandbox may still block
  // the network, which is not a policy violation).
  const before = (await violations()).length;
  await page.evaluate(() => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    document.body.append(s);
  });
  await page.waitForTimeout(500);
  expect((await violations()).slice(before).filter((v) => v.includes('razorpay'))).toEqual([]);
});
