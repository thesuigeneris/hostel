// Hunts the intermittent hydration attribute mismatch (TODO.md) against the DEV server,
// where React prints the full message. The e2e suite runs a production build, which minifies it to #418.
//
// Usage: bun apps/web/scripts/hunt-hydration.mjs [laps]
//   Needs `bun run dev:api` and `bun run dev:web` already running.
import { chromium } from '@playwright/test';

const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const API = process.env.API_URL ?? 'http://localhost:4000';
const LAPS = Number(process.argv[2] ?? 25);
const OTP = '123456';

async function login(phone) {
  const json = { 'content-type': 'application/json' };
  await fetch(`${API}/auth/otp`, { method: 'POST', headers: json, body: JSON.stringify({ phone }) });
  const r = await fetch(`${API}/auth/verify`, { method: 'POST', headers: json, body: JSON.stringify({ phone, otp: OTP }) });
  return (await r.json()).token;
}

/** Everything React says about a bad hydration, kept whole: the tail names the attribute. */
const isHydration = (t) => /hydrat|didn't match|did not match|#418|#423|#425/i.test(t);

const hits = [];
const token = await login('9000000003').catch(() => null);
const issueIds = token
  ? await fetch(`${API}/me/issues`, { headers: { authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((rows) => rows.map((i) => i.id))
      .catch(() => [])
  : [];

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext();
  if (token) await ctx.addCookies([{ name: 'hostels_session', value: token, url: WEB }]);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (isHydration(m.text())) hits.push({ url: page.url(), text: m.text() }); });
  page.on('pageerror', (e) => { const t = String(e.stack || e.message); if (isHydration(t)) hits.push({ url: page.url(), text: t }); });

  const routes = ['/', '/hostels', '/login', '/for-owners', '/account', '/stay', ...issueIds.map((id) => `/issues/${id}`)];

  for (let lap = 1; lap <= LAPS && hits.length === 0; lap++) {
    for (const r of routes) {
      // Click when the link is on the page: client-side navigation is what triggers it.
      const link = await page.$(`a[href="${r}"]`);
      if (link) await link.click({ timeout: 10000 }).catch(() => {});
      else await page.goto(WEB + r, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(400);
      await page.reload({ waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(400);
      await page.goBack({ timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(300);
      if (hits.length) break;
    }
    console.log(`lap ${lap}/${LAPS}: ${hits.length} hit(s)`);
  }
  await page.close();
  await ctx.close();
} finally {
  await browser.close();
}

if (!hits.length) {
  console.log(`\nNo hydration mismatch in ${LAPS} laps. It is rare; run more laps.`);
  process.exit(0);
}
console.log(`\n=== ${hits.length} HYDRATION MISMATCH(ES) ===`);
for (const h of hits) {
  console.log(`\n--- at ${h.url} ---`);
  console.log(h.text); // full text: the attribute and component stack are at the end
}
process.exit(1);
