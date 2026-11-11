import { describe, expect, test } from 'bun:test';
import { dateLabel } from '../src/format';
import { billingPeriod, invoiceGenerationDate } from '../src/pricing';
import {
  canReopen,
  firstNameAndInitial,
  hasVisibleText,
  istTime,
  publicFirstName,
  reviewEdits,
  skipCreditText,
  skipCutoffText,
  textLength,
} from '../src/resident';
import { commentInputSchema, issueUpdateSchema, postInputSchema, reviewInputSchema } from '../src/schemas';
import { addDays } from '../src/time';

// Spelled with code points so no invisible or composed character hides in the source.
const SMILE = String.fromCodePoint(0x1f642);
const ZERO_WIDTH = String.fromCharCode(0x200b, 0x2060, 0xfeff);
const ACUTE = String.fromCharCode(0x301);

describe('names shown to other people (T11)', () => {
  test('first name and last initial, in any script; never a phone number', () => {
    expect(firstNameAndInitial('Asha Rao')).toBe('Asha R.');
    expect(firstNameAndInitial('राहुल शर्मा')).toBe('राहुल श.');
    expect(firstNameAndInitial('Asha')).toBe('Asha');
    expect(firstNameAndInitial('')).toBe('Resident');
    expect(firstNameAndInitial('   ')).toBe('Resident');
    expect(firstNameAndInitial(null)).toBe('Resident');
    expect(firstNameAndInitial('98765 43210')).toBe('Resident');
    expect(firstNameAndInitial('+91-98765-43210')).toBe('Resident');
    expect(firstNameAndInitial('Room 204')).toBe('Room 2.');
    // An initial is one whole character: never half an emoji, never a letter without its accent.
    expect(firstNameAndInitial(`Ravi ${SMILE}smile`)).toBe(`Ravi ${SMILE}.`);
    expect(firstNameAndInitial(`Zoe A${ACUTE}lvarez`)).toBe(`Zoe A${ACUTE}.`);
    expect(publicFirstName('  Meera   Pillai ')).toBe('Meera');
    expect(publicFirstName('9876543210')).toBe('Resident');
  });
});

describe('text lengths (I10)', () => {
  test('count characters as people do', () => {
    expect(textLength('hello')).toBe(5);
    expect(textLength(SMILE.repeat(2))).toBe(2);
    expect(textLength('नमस्ते')).toBe(6);
    expect(hasVisibleText(' \n\t')).toBe(false);
    expect(hasVisibleText(ZERO_WIDTH)).toBe(false);
    expect(hasVisibleText(' a ')).toBe(true);
  });

  test('posts, replies, comments and reviews use the same count', () => {
    const post = (body: string) => postInputSchema.safeParse({ body });
    expect(post('x'.repeat(1000)).success).toBe(true);
    expect(post('x'.repeat(1001)).success).toBe(false);
    expect(post(SMILE.repeat(1000)).success).toBe(true);
    expect(post('   ').success).toBe(false);
    expect(post(ZERO_WIDTH).success).toBe(false);
    expect(post(`  ${'x'.repeat(1000)}  `).data?.body).toHaveLength(1000);
    expect(commentInputSchema.safeParse({ body: 'y'.repeat(500) }).success).toBe(true);
    expect(commentInputSchema.safeParse({ body: 'y'.repeat(501) }).success).toBe(false);
    const review = { rating: 4, cleanliness: 4, safety: 4, responsiveness: 4 };
    expect(reviewInputSchema.safeParse({ ...review, body: SMILE.repeat(20) }).success).toBe(true);
    expect(reviewInputSchema.safeParse({ ...review, body: 'Too short' }).error?.issues[0]?.message).toBe('Write at least 20 characters');
    expect(issueUpdateSchema.safeParse({ message: '  ' }).success).toBe(false);
    expect(issueUpdateSchema.safeParse({ status: 'resolved', from: 'in_progress' }).success).toBe(true);
    expect(issueUpdateSchema.safeParse({ status: 'resolved', from: 'gone' }).success).toBe(false);
  });
});

describe('reviews edited after the owner replied (T3)', () => {
  const at = (day: number) => `2026-11-${String(day).padStart(2, '0')}T06:00:00.000Z`;
  test('only an edit made after the reply is labelled', () => {
    expect(reviewEdits({ createdAt: at(10), updatedAt: at(10), ownerRepliedAt: null })).toEqual({ edited: false, editedAfterReply: false });
    // A save within a minute is the same review.
    expect(reviewEdits({ createdAt: at(10), updatedAt: '2026-11-10T06:00:59.000Z', ownerRepliedAt: null }).edited).toBe(false);
    expect(reviewEdits({ createdAt: at(10), updatedAt: at(11), ownerRepliedAt: at(12) })).toEqual({ edited: true, editedAfterReply: false });
    expect(reviewEdits({ createdAt: at(10), updatedAt: at(13), ownerRepliedAt: at(12) })).toEqual({ edited: true, editedAfterReply: true });
  });
});

describe('the 7-day reopen window (I4)', () => {
  const resolvedAt = '2026-11-09T06:00:00.000Z';
  test('open up to and including 7 days after the fix', () => {
    expect(canReopen({ status: 'resolved', resolvedAt }, Date.parse('2026-11-16T05:00:00Z'))).toBe(true);
    expect(canReopen({ status: 'resolved', resolvedAt }, Date.parse('2026-11-16T06:00:00Z'))).toBe(true);
    expect(canReopen({ status: 'resolved', resolvedAt }, Date.parse('2026-11-16T06:01:00Z'))).toBe(false);
    expect(canReopen({ status: 'closed', resolvedAt }, Date.parse('2026-11-10T06:00:00Z'))).toBe(false);
  });
});

describe('IST on screen (M6, X4)', () => {
  test('skip cut-offs read in IST, whatever the device clock zone', () => {
    expect(istTime('2026-11-10T03:30:00.000Z')).toBe('9:00 am');
    expect(istTime('2026-11-10T09:30:00.000Z')).toBe('3:00 pm');
    expect(istTime('2026-11-09T18:30:00.000Z')).toBe('12:00 am');
    expect(istTime('2026-11-10T06:30:00.000Z')).toBe('12:00 pm');
    expect(skipCutoffText('2026-11-10', '2026-11-09T16:30:00.000Z')).toBe('10:00 pm IST the night before');
    expect(skipCutoffText('2026-11-10', '2026-11-10T03:30:00.000Z')).toBe('9:00 am IST');
    expect(skipCreditText(80)).toBe('save ₹80');
    expect(skipCreditText(0)).toBe('no credit');
  });

  test('an instant is labelled with its IST date, not its UTC date', () => {
    expect(dateLabel('2026-11-09T18:29:00.000Z')).toBe('9 Nov 2026');
    expect(dateLabel('2026-11-09T18:30:00.000Z')).toBe('10 Nov 2026');
    expect(dateLabel('2026-11-09')).toBe('9 Nov 2026');
  });
});

describe('plans starting on the 28th to the 31st (M5)', () => {
  test('periods follow each other with no gap or overlap for two years, leap February included', () => {
    for (const year of [2027, 2028]) {
      for (const day of [28, 29, 30, 31]) {
        const start = `${year}-01-${day}`;
        for (let n = 0; n < 24; n++) {
          const p = billingPeriod(start, n);
          const next = billingPeriod(start, n + 1);
          expect(next.start).toBe(addDays(p.end, 1));
          expect(p.end >= p.start).toBe(true);
          // Each period starts on the start day, or on the month's last day when the month is shorter.
          expect(Number(p.start.slice(8))).toBeLessThanOrEqual(day);
          expect(invoiceGenerationDate(next.start)).toBe(addDays(next.start, -5));
        }
      }
    }
    expect(billingPeriod('2028-01-30', 1)).toEqual({ index: 1, start: '2028-02-29', end: '2028-03-29' });
    expect(billingPeriod('2027-01-29', 1)).toEqual({ index: 1, start: '2027-02-28', end: '2027-03-28' });
    expect(billingPeriod('2028-01-29', 1)).toEqual({ index: 1, start: '2028-02-29', end: '2028-03-28' });
  });
});
