import { expect, test } from '@playwright/test';
import { apiGet, DEMO_TENANT, publicGet, signIn } from './helpers';

/**
 * Seeker and resident details: review cards (how the stay was confirmed, stay dates, sub-ratings, dated
 * replies) and reporting with a reason; review pages; withdrawing a visit request; residents editing their
 * own review; the issue timeline; paid dates on bills; and which search pages search engines may index.
 */

test.describe.configure({ mode: 'serial' });

const run = Date.now().toString().slice(-7);
const SEEKER = `973${run}`;
// Seeded subscriber at the first partner hostel for about seven weeks, with no review yet (see seed.ts).
const REVIEWER = '9000000102';

type Card = { slug: string; name: string; isVerified: boolean };
type Stay = { status: string; hostel: { id: string; slug: string; name: string } };

async function hostels() {
  return (await publicGet<{ items: Card[] }>('/hostels?limit=50')).items;
}

test('review cards show the stay, sub-ratings and dated replies; signed-in visitors report with a reason', async ({ browser, page }) => {
  // The seed gives partner hostels past residents with reviews, half of them answered by the owner.
  const reviewed = [];
  for (const h of (await hostels()).filter((x) => x.isVerified)) {
    const reviews = await publicGet<{ ownerReply: string | null }[]>(`/hostels/${h.slug}/reviews`);
    if (reviews.some((r) => r.ownerReply)) reviewed.push(h);
  }
  const h = reviewed[0]!;
  await page.goto(`/hostels/${h.slug}`);
  const card = page.locator('#reviews li').filter({ hasText: 'Reply from the hostel' }).first();
  await expect(card).toContainText(/Lived here .+ – /);
  await expect(card).toContainText(/Written \d/);
  await expect(card).toContainText('Cleanliness');
  await expect(card).toContainText(/Reply from the hostel · \d/);
  await expect(card.getByText(/resident|Paid through Hostels|Added by the hostel/i).first()).toBeVisible();
  // Signed out: nothing to report with.
  await expect(page.getByText('Report this review')).toHaveCount(0);

  const visitor = await signIn(browser, DEMO_TENANT, { next: `/hostels/${h.slug}` });
  const first = visitor.locator('#reviews li').first();
  await first.getByText('Report this review').click();
  await first.getByLabel('Why are you reporting this review?').selectOption('Off-topic or spam');
  await first.getByRole('button', { name: 'Send to our team' }).click();
  await expect(visitor.getByText('Thanks, our team will take a look.')).toBeVisible();
  await visitor.context().close();
});

test('a seeker withdraws a visit request from their account', async ({ browser }) => {
  const free = (await hostels()).find((x) => !x.isVerified)!;
  const seeker = await signIn(browser, SEEKER, { name: 'Neha', next: `/hostels/${free.slug}` });
  const form = seeker.locator('form#visit');
  await form.getByLabel('Note for the owner').fill('Saturday morning works');
  await form.getByRole('button', { name: 'Request visit' }).click();
  await expect(seeker.getByText('Visit requested. The hostel will call you to confirm.')).toBeVisible();
  // The form gives way to the pending request.
  await expect(seeker.getByText(/Visit requested for/)).toBeVisible();
  await expect(seeker.locator('form#visit')).toHaveCount(0);

  await seeker.goto('/account');
  seeker.once('dialog', (d) => d.accept());
  await seeker.getByRole('button', { name: new RegExp(`Withdraw visit request to ${free.name}`) }).click();
  await expect(seeker.getByText('Visit request withdrawn')).toBeVisible();
  await expect(seeker.getByRole('button', { name: /Withdraw visit request/ })).toHaveCount(0);

  await seeker.goto(`/hostels/${free.slug}`);
  await expect(seeker.locator('form#visit')).toBeVisible();
  await seeker.context().close();
});

test('a resident edits their own review in place', async ({ browser }) => {
  const stays = await apiGet<Stay[]>(REVIEWER, '/me/residencies');
  const home = stays.find((s) => s.status === 'active')!.hostel;
  const first = `Quiet floors and the mess food is good on weekdays (${run}).`;
  const edited = `Quiet floors, good weekday food, and the WiFi was fixed within a day (${run}).`;

  const resident = await signIn(browser, REVIEWER, { next: `/stay/${home.id}?tab=review` });
  await expect(resident.getByRole('heading', { name: 'Review your stay' })).toBeVisible();
  await resident.locator('select[name=rating]').selectOption('4');
  await resident.locator('textarea[name=body]').fill(first);
  await resident.getByRole('button', { name: 'Post review' }).click();
  await expect(resident.getByText('Thanks! Your review is live.')).toBeVisible();

  // The form comes back filled in, ready to edit.
  await resident.goto(`/stay/${home.id}?tab=review`);
  await expect(resident.getByRole('heading', { name: 'Update your review' })).toBeVisible();
  await expect(resident.locator('textarea[name=body]')).toHaveValue(first);
  await expect(resident.locator('select[name=rating]')).toHaveValue('4');
  await expect(resident.getByText(/Posted \d/)).toBeVisible();
  await resident.locator('select[name=rating]').selectOption('5');
  await resident.locator('textarea[name=body]').fill(edited);
  await resident.getByRole('button', { name: 'Update review' }).click();
  await expect(resident.getByText('Thanks! Your review is live.')).toBeVisible();
  await resident.context().close();

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(`/hostels/${home.slug}`);
  await expect(visitor.getByText(edited)).toBeVisible();
  await expect(visitor.getByText(first)).toHaveCount(0);
  await visitor.context().close();
});

test('issue pages show where the issue is and when each step happened', async ({ browser }) => {
  const stays = await apiGet<Stay[]>(DEMO_TENANT, '/me/residencies');
  const home = stays.find((s) => s.status === 'active')!.hostel;
  const issues = await apiGet<{ id: string; status: string }[]>(DEMO_TENANT, `/hostels/${home.id}/issues`);
  const inProgress = issues.find((i) => i.status === 'in_progress')!;
  const resident = await signIn(browser, DEMO_TENANT, { next: `/issues/${inProgress.id}` });
  const steps = resident.getByRole('list', { name: 'Issue progress' });
  await expect(steps.getByRole('listitem')).toHaveCount(5);
  await expect(steps.getByRole('listitem').filter({ hasText: 'Reported' })).toContainText('(done)');
  await expect(steps.locator('[aria-current=step]')).toContainText('Being fixed');
  await expect(steps.getByRole('listitem').filter({ hasText: 'Marked fixed' })).toContainText('Not yet');

  // Bills that are paid say when.
  await resident.goto('/account');
  await expect(resident.getByText(/Paid \d+ \w+/).first()).toBeVisible();
  await resident.context().close();
});

test('only the plain search and area pages are indexable', async ({ page }) => {
  const robots = () => page.locator('meta[name=robots]').getAttribute('content');
  await page.goto('/hostels');
  expect(await page.locator('meta[name=robots]').count()).toBe(0);
  await page.goto('/hostels?sharing=2-sharing');
  expect(await robots()).toContain('noindex');
  await page.goto('/hostels?page=2');
  expect(await robots()).toContain('noindex');

  const [area] = await publicGet<{ slug: string }[]>('/areas');
  await page.goto(`/hostels-in/${area!.slug}`);
  expect(await page.locator('meta[name=robots]').count()).toBe(0);
  await page.goto(`/hostels-in/${area!.slug}?sort=rent_asc`);
  expect(await robots()).toContain('noindex');
});
