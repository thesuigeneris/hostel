import { describe, expect, test } from 'bun:test';
import type { MyResidency } from '@hostels/shared';
import { dateProblem, dayOptions } from '../lib/dates';
import { photoPart, photoProblem } from '../lib/photo';
import { buildReview, charCount, DEFAULT_SCORES, groupStays, issueMoves, pickTab, scoresFrom, skipControl, tabsFor, textProblem } from '../lib/stay';

const stay = (id: string, status: MyResidency['status']) => ({ id, status }) as MyResidency;

describe('my stay', () => {
  test('residencies split into invites, current and past', () => {
    const g = groupStays([stay('a', 'invited'), stay('b', 'active'), stay('c', 'ended'), stay('d', 'declined')]);
    expect(g.invites.map((s) => s.id)).toEqual(['a']);
    expect(g.current.map((s) => s.id)).toEqual(['b']);
    expect(g.past.map((s) => s.id)).toEqual(['c']);
  });

  test('hostel-life tab comes from the link, defaulting to community; past residents get their issues and review', () => {
    expect(pickTab('issues', true)).toBe('issues');
    expect(pickTab('nope', true)).toBe('community');
    expect(pickTab(undefined, true)).toBe('community');
    expect(pickTab('community', false)).toBe('review');
    expect(pickTab('issues', false)).toBe('issues');
    expect(tabsFor(true)).toEqual(['community', 'issues', 'neighbours', 'review']);
    expect(tabsFor(false)).toEqual(['issues', 'review']);
  });
});

describe('issue status buttons', () => {
  test('the hostel moves an issue forward', () => {
    expect(issueMoves({ status: 'open', mine: false }, true).map((m) => m.status)).toEqual(['acknowledged', 'in_progress', 'resolved']);
    expect(issueMoves({ status: 'in_progress', mine: false }, true).map((m) => m.status)).toEqual(['resolved']);
    expect(issueMoves({ status: 'closed', mine: false }, true)).toEqual([]);
  });

  test('the reporter confirms or reopens a resolved issue; others get nothing', () => {
    const resolvedAt = '2026-11-09T06:00:00.000Z';
    const inWindow = Date.parse('2026-11-16T05:00:00Z');
    expect(issueMoves({ status: 'resolved', mine: true, resolvedAt }, false, inWindow)).toEqual([
      { status: 'closed', label: 'Yes, fixed', primary: true },
      { status: 'open', label: 'Still broken', primary: false },
    ]);
    expect(issueMoves({ status: 'resolved', mine: false, resolvedAt }, false, inWindow)).toEqual([]);
    expect(issueMoves({ status: 'open', mine: true }, false, inWindow)).toEqual([]);
  });

  test('reopening ends 7 days after the fix, as the API says; a reporter who moved out gets no buttons (I4, I5)', () => {
    const resolvedAt = '2026-11-09T06:00:00.000Z';
    const after = Date.parse('2026-11-16T06:01:00Z');
    expect(issueMoves({ status: 'resolved', mine: true, resolvedAt }, false, after).map((m) => m.status)).toEqual(['closed']);
    expect(issueMoves({ status: 'resolved', mine: true, readOnly: true, resolvedAt }, false, Date.parse('2026-11-10T06:00:00Z'))).toEqual([]);
  });
});

describe('review form', () => {
  test('starts from the review already written, so editing changes it', () => {
    const review = { rating: 3, cleanliness: 5, food: null, safety: 4, responsiveness: 2, body: 'x' } as unknown as Parameters<typeof scoresFrom>[0];
    expect(scoresFrom(review)).toEqual({ rating: 3, cleanliness: 5, food: null, safety: 4, responsiveness: 2 });
    expect(scoresFrom(null)).toEqual(DEFAULT_SCORES);
  });

  test('a short review is refused with the API message', () => {
    const r = buildReview(DEFAULT_SCORES, 'Too short');
    expect(r).toEqual({ ok: false, error: 'Write at least 20 characters' });
  });

  test('a full review is trimmed and food may be skipped', () => {
    const r = buildReview({ ...DEFAULT_SCORES, rating: 5 }, '  Clean rooms, quick fixes, friendly staff.  ');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.input).toMatchObject({ rating: 5, food: null, body: 'Clean rooms, quick fixes, friendly staff.' });
  });
});

describe('date chips', () => {
  test('labels today, tomorrow, then weekdays', () => {
    const d = dayOptions('2026-10-24', 4);
    expect(d.map((x) => x.iso)).toEqual(['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27']);
    expect(d.map((x) => x.label)).toEqual(['Today', 'Tomorrow', 'Mon', 'Tue']);
    expect(d[0]!.sub).toBe('24 Oct');
  });

  test('can start later, e.g. tomorrow for a move', () => {
    expect(dayOptions('2026-10-24', 2, 1).map((x) => x.label)).toEqual(['Tomorrow', 'Mon']);
  });

  test('dates must be real and not too early', () => {
    expect(dateProblem('2026-10-25', '2026-10-24')).toBeNull();
    expect(dateProblem('2026-10-23', '2026-10-24')).toBe('Pick 24 Oct 2026 or later');
    expect(dateProblem('2026-02-30', '2026-01-01')).toBe('Pick a date');
    expect(dateProblem('tomorrow', '2026-01-01')).toBe('Pick a date');
  });
});

describe('photo uploads', () => {
  test('uses the picker type and name when given', () => {
    expect(photoPart({ uri: 'file:///x/IMG_1.png', mimeType: 'image/png', fileName: 'IMG_1.png' })).toEqual({ uri: 'file:///x/IMG_1.png', name: 'IMG_1.png', type: 'image/png' });
  });

  test('falls back to the extension, then JPEG', () => {
    expect(photoPart({ uri: 'file:///x/a.webp' })).toMatchObject({ name: 'photo.webp', type: 'image/webp' });
    expect(photoPart({ uri: 'content://media/123' })).toMatchObject({ name: 'photo.jpg', type: 'image/jpeg' });
  });

  test('refuses big or unsupported photos before uploading', () => {
    expect(photoProblem({ uri: 'a.jpg', fileSize: 6 * 1024 * 1024 })).toBe('Photos must be 5 MB or smaller');
    expect(photoProblem({ uri: 'a.heic', mimeType: 'image/heic' })).toBe('Only JPEG, PNG or WebP photos are accepted');
    expect(photoProblem({ uri: 'a.jpg', fileSize: 1000 })).toBeNull();
  });
});

describe('text limits (I10)', () => {
  const smile = String.fromCodePoint(0x1f642);
  test('count characters as people do and refuse what the API refuses', () => {
    expect(charCount(`  ${smile.repeat(3)} `, 1000)).toBe('3/1,000');
    expect(textProblem('post', 'x'.repeat(1000))).toBeNull();
    expect(textProblem('post', smile.repeat(1000))).toBeNull();
    expect(textProblem('post', 'x'.repeat(1001))).toBe('Keep the post to 1,000 characters (it has 1,001)');
    expect(textProblem('post', '   ')).toBe('Write the post first');
    expect(textProblem('reply', 'y'.repeat(501))).toBe('Keep the reply to 500 characters (it has 501)');
  });
});

describe('meal skips (M4, M6)', () => {
  const day = { date: '2026-11-10', hostelId: 'h', theme: null, meals: [] };
  const meal = { meal: 'breakfast' as const, inPlan: true, vegDish: 'Idli', nonVegDish: null, foodPartner: null, skipped: false, cutoff: '2026-11-09T16:30:00.000Z', canChange: true, credit: 50 };
  test('say what a skip earns and until when, in IST', () => {
    expect(skipControl(day, meal)).toEqual({
      title: 'Skip (save ₹50)',
      a11y: 'Skip (save ₹50): breakfast on Tue 10 Nov 2026',
      until: 'until 10:00 pm IST the night before',
      skippedNote: 'Skipped · −₹50',
    });
    expect(skipControl(day, { ...meal, meal: 'lunch', cutoff: '2026-11-10T03:30:00.000Z', canChange: false }).until).toBe('locked since 9:00 am IST');
  });
  test('say so when the plan ends before the bill that would carry the credit', () => {
    const none = skipControl(day, { ...meal, credit: 0 });
    expect(none.title).toBe('Skip (no credit)');
    expect(skipControl(day, { ...meal, credit: 0, skipped: true })).toMatchObject({ title: 'Undo skip', skippedNote: 'Skipped · no credit' });
  });
});

describe('food plan change (1a)', () => {
  const sub = { mealPlan: 'full', diet: 'veg' } as const;
  test('a hostel without food offers only no food; a scheduled change is picked first', async () => {
    const { foodPlanChoices } = await import('../lib/foodPlan');
    const mine = { subscription: sub, scheduledFoodChange: null } as never;
    expect(foodPlanChoices(mine, true)).toEqual({ plans: ['full', 'two-meals', 'none'], mealPlan: 'full', diet: 'veg' });
    expect(foodPlanChoices(mine, false).plans).toEqual(['none']);
    const pending = { subscription: sub, scheduledFoodChange: { mealPlan: 'two-meals', diet: 'non-veg' } } as never;
    expect(foodPlanChoices(pending, true)).toMatchObject({ mealPlan: 'two-meals', diet: 'non-veg' });
  });
  test('saving the plan already in force is caught before asking; diet does not matter without food', async () => {
    const { sameAsNow } = await import('../lib/foodPlan');
    expect(sameAsNow(sub, 'full', 'veg')).toBe(true);
    expect(sameAsNow(sub, 'full', 'non-veg')).toBe(false);
    expect(sameAsNow({ mealPlan: 'none', diet: 'veg' }, 'none', 'non-veg')).toBe(true);
  });
});

describe('in-app signals (1b)', () => {
  test('the tab badge shows only when an issue has something new', async () => {
    const { tabBadge } = await import('../lib/signals');
    expect(tabBadge(null)).toBeUndefined();
    expect(tabBadge({ issuesWithUpdates: 0, issueUpdates: 0 })).toBeUndefined();
    expect(tabBadge({ issuesWithUpdates: 2, issueUpdates: 5 })).toBe(2);
  });
  test('new updates are counted per hostel and worded for one or many', async () => {
    const { newUpdatesAt, newUpdatesLabel } = await import('../lib/signals');
    const issues = [
      { hostelId: 'a', unreadUpdates: 2 },
      { hostelId: 'a', unreadUpdates: 0 },
      { hostelId: 'b', unreadUpdates: 1 },
    ];
    expect(newUpdatesAt(issues, 'a')).toBe(1);
    expect(newUpdatesAt(issues, 'c')).toBe(0);
    expect(newUpdatesLabel(1)).toBe('1 new update');
    expect(newUpdatesLabel(3)).toBe('3 new updates');
    expect(newUpdatesLabel(0)).toBeNull();
  });
});

describe('data rights (1c)', () => {
  test('the delete form needs DELETE typed, and the password when the account has one', async () => {
    const { deleteFormProblem, exportText } = await import('../lib/privacy');
    expect(deleteFormProblem('delete', '', false)).toBe('Type DELETE to confirm.');
    expect(deleteFormProblem(' DELETE ', '', false)).toBeNull();
    expect(deleteFormProblem('DELETE', '', true)).toBe('Enter your password.');
    expect(deleteFormProblem('DELETE', 'secret words', true)).toBeNull();
    expect(exportText({ a: 1 })).toBe('{\n  "a": 1\n}');
  });
});

describe('free maps (Leaflet in a WebView)', () => {
  test('the page pins Leaflet with integrity hashes, uses the tiles given, and hostel names cannot break out of the script', async () => {
    const { leafletHtml, scriptJson } = await import('../lib/leafletMap');
    const { DEFAULT_MAP_TILES } = await import('@hostels/shared');
    const html = leafletHtml({
      pins: [{ id: 'a', lat: 17.44, lng: 78.35, label: 'Sri Sai </script><script>alert(1)</script>', slug: 'sri-sai' }],
      center: { lat: 17.44, lng: 78.35 },
      zoom: 13,
      tiles: DEFAULT_MAP_TILES,
      colors: { verified: '#1F5C46', other: '#E08A2E' },
    });
    expect(html).toContain('integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="');
    expect(html).toContain('tile.openstreetmap.org');
    expect(html).not.toContain('</script><script>alert(1)');
    expect(scriptJson('</script>')).toBe('"\\u003c/script\\u003e"');
  });

  test('messages from the map are checked before use', async () => {
    const { mapMessage } = await import('../lib/leafletMap');
    expect(mapMessage('{"type":"open","slug":"sri-sai-pg"}')).toEqual({ type: 'open', slug: 'sri-sai-pg' });
    expect(mapMessage('{"type":"open","slug":"../admin"}')).toBeNull();
    expect(mapMessage('{"type":"pin","lat":17.4412345678,"lng":78.35}')).toEqual({ type: 'pin', lat: 17.441235, lng: 78.35 });
    expect(mapMessage('{"type":"pin","lat":200,"lng":0}')).toBeNull();
    expect(mapMessage('not json')).toBeNull();
  });
});
