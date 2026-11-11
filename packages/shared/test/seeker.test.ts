import { describe, expect, test } from 'bun:test';
import { createApiClient } from '../src/client';
import { searchSchema, visitRequestSchemaOn } from '../src/schemas';
import {
  hoursLabel,
  RATING_MIN_REVIEWS,
  ratingView,
  suggestionHref,
  suggestSchema,
  VISIT_MAX_DAYS_AHEAD,
  visitDateProblem,
  visitNextStep,
} from '../src/seeker';
import { addDays } from '../src/time';

describe('ratings below the review threshold read as new', () => {
  test('none, new under the threshold, the true average from it', () => {
    expect(ratingView(null, 0)).toEqual({ kind: 'none' });
    expect(ratingView(5, 1)).toEqual({ kind: 'new', count: 1 });
    expect(ratingView(5, RATING_MIN_REVIEWS - 1)).toEqual({ kind: 'new', count: RATING_MIN_REVIEWS - 1 });
    expect(ratingView(4.3, RATING_MIN_REVIEWS)).toEqual({ kind: 'rated', rating: 4.3, count: RATING_MIN_REVIEWS });
  });
});

describe('visit dates', () => {
  const today = '2026-11-09';
  test('today up to the cap is allowed; yesterday and the day after the cap are refused', () => {
    expect(visitDateProblem(today, today)).toBeNull();
    expect(visitDateProblem(addDays(today, VISIT_MAX_DAYS_AHEAD), today)).toBeNull();
    expect(visitDateProblem(addDays(today, -1), today)).toBe('Pick today or a later date');
    expect(visitDateProblem(addDays(today, VISIT_MAX_DAYS_AHEAD + 1), today)).toContain(`next ${VISIT_MAX_DAYS_AHEAD} days`);
    expect(visitDateProblem('2026-02-30', today)).toBe('Use a YYYY-MM-DD date');
  });

  test('the schema applies the same rule against the clock it is given', () => {
    const schema = visitRequestSchemaOn(() => today);
    expect(schema.safeParse({ preferredDate: addDays(today, 90) }).success).toBe(true);
    const far = schema.safeParse({ preferredDate: '2099-01-10' });
    expect(far.success).toBe(false);
    expect(far.error?.issues[0]?.message).toContain('by 7 Feb 2027');
  });

  test('the next step says when a requested date has passed', () => {
    expect(visitNextStep({ status: 'new', preferredDate: today }, today)).toContain('will call you');
    expect(visitNextStep({ status: 'new', preferredDate: addDays(today, -1) }, today)).toContain('has passed');
    expect(visitNextStep({ status: 'contacted', preferredDate: addDays(today, -1) }, today)).toContain('in touch');
  });
});

describe('search text', () => {
  test('long text is refused with a plain message; suggestions need two characters', () => {
    const long = searchSchema.safeParse({ q: 'x'.repeat(500) });
    expect(long.success).toBe(false);
    expect(long.error?.issues[0]?.message).toBe('Search text can be at most 80 characters');
    expect(searchSchema.safeParse({ q: '  50% off_ "quoted" 🏠  ' }).data?.q).toBe('50% off_ "quoted" 🏠');
    expect(suggestSchema.safeParse({ q: ' g ' }).success).toBe(false);
    expect(suggestSchema.parse({ q: ' ga ' })).toEqual({ q: 'ga', limit: 6 });
  });

  test('suggestions link to the hostel, or to the area page keeping the other filters', () => {
    expect(suggestionHref({ kind: 'hostel', label: 'Sunrise', slug: 'sunrise-pg', area: 'Madhapur', isVerified: true })).toBe('/hostels/sunrise-pg');
    expect(suggestionHref({ kind: 'area', label: 'HiTech City', slug: 'hitech-city', count: 2 }, 'food=true')).toBe('/hostels-in/hitech-city?food=true');
  });

  test('hours read as people say them', () => {
    expect([hoursLabel(null), hoursLabel(0.4), hoursLabel(5.4), hoursLabel(72)]).toEqual(['—', 'under 1 h', '5 h', '3 days']);
  });
});

describe('client paths', () => {
  test('slugs and ids are single path segments, so they cannot reach another route', async () => {
    const seen: string[] = [];
    const client = createApiClient('http://api.test', () => 'token', (async (input: string) => {
      seen.push(new URL(input).pathname);
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch);
    await client.hostels.get('../me');
    await client.hostels.get('..');
    await client.hostels.reviews('a/b');
    await client.hostels.requestVisit('../me/subscription/cancel?x=', { preferredDate: '2026-11-10' });
    await client.me.cancelVisit('..');
    expect(seen).toEqual([
      '/hostels/..%2Fme',
      '/hostels/...',
      '/hostels/a%2Fb/reviews',
      '/hostels/..%2Fme%2Fsubscription%2Fcancel%3Fx%3D/visits',
      '/me/visits/...',
    ]);
  });
});
