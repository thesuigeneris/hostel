import { expect, type Page, test } from '@playwright/test';
import { apiPost, istToday, pageProblems, setApiClock } from './a11y';
import { API, apiGet, apiToken, signIn } from './helpers';

/**
 * The resident journey, R1 to R4 in docs/product/acceptance.md, on one owner-added resident:
 * 1. an owner adds them (with a start date months back) at two hostels; they decline one and accept the other;
 * 2. they post on the board, like it, and join the neighbour list;
 * 3. they report an issue with a private photo; the owner resolves it; they reopen it; it is resolved again and they
 *    confirm it with a double click that closes it once;
 * 4. they can't review on day one (the 14 days count from the day they were added), then can 14 days later (the
 *    API's clock moved ahead), and the public card says how the stay was confirmed;
 * 5. they move out: the issue they reported stays readable, read-only.
 */

test.describe.configure({ mode: 'serial' });

const run = Date.now().toString().slice(-7);
const RESIDENT = `974${run}`;
const NAME = 'Kavya Iyer';
// Seeded owner of two Pro hostels, Sri Sai PG and Comfort Inn PG (see apps/api/src/db/seed.ts).
const PRO_OWNER = '9000000004';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const label = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

type Owned = { id: string; name: string; slug: string };
let home: Owned;
let other: Owned;
let issueTitle = '';
let issuePath = '';
const claimedStart = istToday(-60);

async function residentPage(browser: Parameters<typeof signIn>[0], next: string): Promise<Page> {
  return signIn(browser, RESIDENT, { name: NAME, next });
}

test('1. the resident declines one invite and accepts the other', async ({ browser }) => {
  const hostels = await apiGet<Owned[]>(PRO_OWNER, '/owner/hostels');
  home = hostels.find((h) => h.name === 'Sri Sai PG')!;
  other = hostels.find((h) => h.name === 'Comfort Inn PG')!;
  const owner = await apiToken(PRO_OWNER);
  await apiPost(owner, `/owner/hostels/${home.id}/residents`, { phone: RESIDENT, name: NAME, monthlyRent: 7500, startDate: claimedStart });
  await apiPost(owner, `/owner/hostels/${other.id}/residents`, { phone: RESIDENT, name: NAME, monthlyRent: 7000, startDate: istToday() });

  const page = await residentPage(browser, '/stay');
  await expect(page.getByRole('heading', { name: `${home.name} added you as a resident` })).toBeVisible();
  await expect(page.getByRole('heading', { name: `${other.name} added you as a resident` })).toBeVisible();
  expect(await pageProblems(page, '/stay with two invites')).toEqual([]);

  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: `Not me: decline the invite from ${other.name}` }).click();
  await expect(page.getByText('Invite declined')).toBeVisible();
  await expect(page.getByRole('heading', { name: `${other.name} added you as a resident` })).toHaveCount(0);

  await page.getByRole('button', { name: `Accept: join ${home.name}` }).click();
  await expect(page.getByText('Welcome! You can now see your hostel community.')).toBeVisible();
  // T1 on screen: the hostel typed a start date two months back, but the review clock starts today.
  await expect(page.getByText(`Reviews: You can review after 14 days here, counted from ${label(istToday())} when the hostel added you (14 days to go).`)).toBeVisible();
  // Answering the declined invite again is refused by the API, not just hidden.
  const stays = await apiGet<{ id: string; status: string; hostel: { id: string } }[]>(RESIDENT, '/me/residencies');
  const declined = stays.find((s) => s.hostel.id === other.id)!;
  expect(declined.status).toBe('declined');
  const again = await fetch(`${API}/me/residencies/${declined.id}/accept`, {
    method: 'POST',
    headers: { authorization: `Bearer ${await apiToken(RESIDENT)}` },
  });
  expect(again.status).toBe(409);
  await page.context().close();
});

test('2. the resident posts on the board, likes it and joins the neighbour list', async ({ browser }) => {
  const page = await residentPage(browser, `/stay/${home.id}?tab=community`);
  const tabs = page.getByRole('navigation', { name: 'Hostel life' });
  await expect(tabs.getByRole('link', { name: 'Community' })).toHaveAttribute('aria-current', 'page');
  const text = `Anyone up for badminton on Sunday morning? (${run})`;
  await page.getByLabel('Message').fill(text);
  await page.getByLabel('Post type').selectOption('event');
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  const post = page.locator('div.rounded-2xl', { hasText: text });
  await expect(post).toBeVisible();
  await expect(post.getByText('Kavya', { exact: true })).toBeVisible();
  await post.getByRole('button', { name: 'Like' }).click();
  await expect(page.locator('div.rounded-2xl', { hasText: text }).getByRole('button', { name: 'Unlike' })).toContainText('1');
  expect(await pageProblems(page, 'community tab')).toEqual([]);

  await tabs.getByRole('link', { name: 'Neighbours' }).click();
  await page.getByRole('button', { name: 'Show me' }).click();
  await expect(page.getByText('Neighbours can see your first name, last initial and room type. Never your phone number.')).toBeVisible();
  await expect(page.getByText('Kavya I.', { exact: true })).toBeVisible();
  await expect(page.getByText(RESIDENT)).toHaveCount(0);
  expect(await pageProblems(page, 'neighbours tab')).toEqual([]);
  await page.context().close();
});

test('3. an issue with a private photo is resolved, reopened, resolved again and confirmed once', async ({ browser }) => {
  issueTitle = `Corridor light flickers all night ${run}`;
  const page = await residentPage(browser, `/stay/${home.id}?tab=issues`);
  await page.locator('select[name=category]').selectOption('electricity');
  await page.locator('input[name=title]').fill(issueTitle);
  await page.locator('textarea[name=description]').fill('Second floor, outside room 204. Started on Monday.');
  await page.locator('input[name=photo]').setInputFiles('e2e/fixtures/room.png');
  await page.getByRole('button', { name: 'Report issue' }).click();
  await expect(page).toHaveURL(/\/issues\/iss_/);
  issuePath = new URL(page.url()).pathname;
  await expect(page.getByText('Issue reported. The hostel has been notified.')).toBeVisible();
  // The photo is private: a signed, expiring link that loads; the bare file is not served.
  const photo = page.getByRole('img', { name: issueTitle });
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  const src = new URL((await photo.getAttribute('src'))!);
  expect(src.searchParams.get('sig')).toBeTruthy();
  expect((await fetch(`${src.origin}${src.pathname}`)).status).toBe(404);
  expect(await pageProblems(page, 'new issue')).toEqual([]);

  const owner = await signIn(browser, PRO_OWNER, { next: '/owner/issues' });
  await owner.getByRole('link', { name: new RegExp(issueTitle) }).click();
  await expect(owner.getByText(`reported by ${NAME}`)).toBeVisible();
  await owner.locator('textarea[name=message]').fill('Electrician replaced the tube light.');
  await owner.getByRole('button', { name: 'Mark resolved' }).click();
  await expect(owner.getByText('Electrician replaced the tube light.')).toBeVisible();

  await page.goto(issuePath);
  await expect(page.getByText(/Confirm the fix or reopen it by/)).toBeVisible();
  await page.locator('textarea[name=message]').fill('Still flickers after 10 pm.');
  await page.getByRole('button', { name: 'Still broken, reopen' }).click();
  await expect(page.getByText('Still flickers after 10 pm.')).toBeVisible();
  await expect(page.locator('input[name=from]')).toHaveValue('open');

  // The owner's page still shows "resolved"; after a refresh it shows the reopen and can resolve again.
  await expect(owner.locator('input[name=from]')).toHaveValue('resolved');
  await owner.reload();
  await expect(owner.getByText('Still flickers after 10 pm.')).toBeVisible();
  await owner.locator('textarea[name=message]').fill('Replaced the choke as well.');
  await owner.getByRole('button', { name: 'Mark resolved' }).click();
  await expect(owner.getByText('Replaced the choke as well.')).toBeVisible();
  await owner.context().close();

  await page.reload();
  // A double click confirms once: one "Closed" entry in the timeline.
  await page.getByRole('button', { name: 'Confirm fixed' }).dblclick();
  await expect(page.getByText(/This issue is closed since/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('listitem').filter({ hasText: /moved it to\s*Closed/ })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Me too' })).toHaveCount(0);
  await page.context().close();
});

test('4. the review opens 14 days after the hostel added the resident', async ({ browser }) => {
  const page = await residentPage(browser, `/stay/${home.id}?tab=review`);
  await expect(page.getByText('You cannot review this stay yet')).toBeVisible();
  await expect(page.getByText(/counted from .+ when the hostel added you \(14 days to go\)/)).toBeVisible();

  test.skip(!(await setApiClock(14)), 'needs the browser-test API (bun run e2e:fresh) to move the clock');
  try {
    await page.goto('/stay');
    await page.getByRole('link', { name: 'Write a review' }).click();
    await expect(page.getByRole('heading', { name: 'Review your stay' })).toBeVisible();
    const body = `Rooms are cleaned daily and the owner fixed the corridor light properly in the end (${run}).`;
    await page.locator('select[name=rating]').selectOption('4');
    await page.locator('select[name=food]').selectOption('3');
    await page.locator('textarea[name=body]').fill(body);
    await page.getByRole('button', { name: 'Post review' }).click();
    await expect(page.getByText('Thanks! Your review is live.')).toBeVisible();
    expect(await pageProblems(page, 'review tab after posting')).toEqual([]);

    const visitor = await (await browser.newContext()).newPage();
    await visitor.goto(`/hostels/${home.slug}`);
    const card = visitor.locator('#reviews li', { hasText: body });
    await expect(card).toBeVisible();
    await expect(card.getByText('Resident · added by the hostel')).toBeVisible();
    await expect(card.getByText('Kavya I.', { exact: true })).toBeVisible();
    // The stay span is the one the hostel recorded.
    const [y, m] = claimedStart.split('-');
    await expect(card).toContainText(`Lived here ${MONTHS[Number(m) - 1]} ${y} – now`);
    await expect(card.getByText('Edited after the owner replied.')).toHaveCount(0);

    // T3: the owner replies, the resident edits a day later; readers are told the reply answers an earlier version.
    const reviews = await apiGet<{ id: string; body: string }[]>(PRO_OWNER, `/owner/hostels/${home.id}/reviews`);
    await apiPost(await apiToken(PRO_OWNER), `/owner/reviews/${reviews.find((r) => r.body === body)!.id}/reply`, { reply: `Thanks Kavya, glad it is sorted (${run}).` });
    await setApiClock(15);
    await page.goto(`/stay/${home.id}?tab=review`);
    await expect(page.getByText('If you edit your review now, readers see “Edited after the owner replied” next to the reply.')).toBeVisible();
    await page.locator('textarea[name=body]').fill(`${body} Water pressure dropped this week though.`);
    await page.getByRole('button', { name: 'Update review' }).click();
    await expect(page.getByText('Thanks! Your review is live.')).toBeVisible();
    await visitor.goto(`/hostels/${home.slug}`);
    const edited = visitor.locator('#reviews li', { hasText: 'Water pressure dropped this week though.' });
    await expect(edited.getByText(`Thanks Kavya, glad it is sorted (${run}).`)).toBeVisible();
    await expect(edited.getByText('Edited after the owner replied.')).toBeVisible();
    await visitor.context().close();
  } finally {
    await setApiClock(0);
  }
  await page.context().close();
});

test('5. after moving out, the issue they reported stays readable, read-only', async ({ browser }) => {
  const page = await residentPage(browser, '/stay');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: "I've moved out" }).click();
  await expect(page.getByText('Marked as moved out. You can still review your stay.')).toBeVisible();
  await expect(page.getByRole('heading', { name: "Places you've lived" })).toBeVisible();

  await page.getByRole('link', { name: `Your issues at ${home.name}` }).click();
  await expect(page.getByRole('heading', { name: 'Issues you reported here' })).toBeVisible();
  // Only the tabs that still apply after moving out.
  await expect(page.getByRole('navigation', { name: 'Hostel life' }).getByRole('link')).toHaveText(['Issues', 'Review']);
  expect(await pageProblems(page, 'past stay issues')).toEqual([]);
  await page.getByRole('link', { name: new RegExp(issueTitle) }).click();
  await expect(page).toHaveURL(new RegExp(issuePath));
  await expect(page.getByText("You've moved out, so this issue is read-only for you.")).toBeVisible();
  await expect(page.locator('textarea[name=message]')).toHaveCount(0);
  expect(await pageProblems(page, 'read-only issue')).toEqual([]);
  await page.context().close();
});
