import { describe, expect, test } from 'bun:test';
import type { MyResidency } from '@hostels/shared';
import { dateProblem, dayOptions } from '../lib/dates';
import { photoPart, photoProblem } from '../lib/photo';
import { buildReview, DEFAULT_SCORES, groupStays, issueMoves, pickTab } from '../lib/stay';

const stay = (id: string, status: MyResidency['status']) => ({ id, status }) as MyResidency;

describe('my stay', () => {
  test('residencies split into invites, current and past', () => {
    const g = groupStays([stay('a', 'invited'), stay('b', 'active'), stay('c', 'ended'), stay('d', 'declined')]);
    expect(g.invites.map((s) => s.id)).toEqual(['a']);
    expect(g.current.map((s) => s.id)).toEqual(['b']);
    expect(g.past.map((s) => s.id)).toEqual(['c']);
  });

  test('hostel-life tab comes from the link, defaulting to community; past residents only review', () => {
    expect(pickTab('issues', true)).toBe('issues');
    expect(pickTab('nope', true)).toBe('community');
    expect(pickTab(undefined, true)).toBe('community');
    expect(pickTab('community', false)).toBe('review');
  });
});

describe('issue status buttons', () => {
  test('the hostel moves an issue forward', () => {
    expect(issueMoves({ status: 'open', mine: false }, true).map((m) => m.status)).toEqual(['acknowledged', 'in_progress', 'resolved']);
    expect(issueMoves({ status: 'in_progress', mine: false }, true).map((m) => m.status)).toEqual(['resolved']);
    expect(issueMoves({ status: 'closed', mine: false }, true)).toEqual([]);
  });

  test('the reporter confirms or reopens a resolved issue; others get nothing', () => {
    expect(issueMoves({ status: 'resolved', mine: true }, false)).toEqual([
      { status: 'closed', label: 'Yes, fixed', primary: true },
      { status: 'open', label: 'Still broken', primary: false },
    ]);
    expect(issueMoves({ status: 'resolved', mine: false }, false)).toEqual([]);
    expect(issueMoves({ status: 'open', mine: true }, false)).toEqual([]);
  });
});

describe('review form', () => {
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
