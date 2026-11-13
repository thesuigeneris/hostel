import { describe, expect, test } from 'bun:test';
import {
  awaitingReplySince,
  issueNeedsResponse,
  OWNER_BILLING_RULES,
  OWNER_PLAN_FEATURES,
  ownerNextStep,
  type NextStepInput,
  PARTNER_REQUIREMENTS,
  pausesOn,
  planPriceLine,
  prorate,
  residencyLabel,
  splitPeriod,
  VISIT_NEXT,
} from '../src/owner';
import { PARTNER_STANDARDS } from '../src/owner-admin';

const T0 = '2026-11-09T06:00:00.000Z';
const at = (iso: string) => new Date(iso);

describe('needs a response (I1): one definition', () => {
  const issue = { status: 'open' as const, createdAt: T0, acknowledgedAt: null, reopenedAt: null, ownerRespondedAt: null };

  test('waits 24 hours from the report: exactly 24 h is still in time, a minute more is not', () => {
    expect(issueNeedsResponse(issue, at('2026-11-10T06:00:00Z'))).toBe(false);
    expect(issueNeedsResponse(issue, at('2026-11-10T06:01:00Z'))).toBe(true);
    expect(awaitingReplySince(issue)?.toISOString()).toBe(T0);
  });

  test('any answer from the hostel counts, a comment included; only open issues can need one', () => {
    expect(issueNeedsResponse({ ...issue, ownerRespondedAt: '2026-11-09T07:00:00Z' }, at('2026-11-12T00:00:00Z'))).toBe(false);
    expect(issueNeedsResponse({ ...issue, acknowledgedAt: '2026-11-09T07:00:00Z' }, at('2026-11-12T00:00:00Z'))).toBe(false);
    for (const status of ['acknowledged', 'in_progress', 'resolved', 'closed'] as const) {
      expect(issueNeedsResponse({ ...issue, status }, at('2026-11-20T00:00:00Z'))).toBe(false);
    }
  });

  test('a reopen asks again, timed from the reopen; an answer before it does not count', () => {
    const reopened = { ...issue, acknowledgedAt: '2026-11-09T08:00:00Z', ownerRespondedAt: '2026-11-09T08:00:00Z', reopenedAt: '2026-11-11T06:00:00Z' };
    expect(issueNeedsResponse(reopened, at('2026-11-12T06:00:00Z'))).toBe(false);
    expect(issueNeedsResponse(reopened, at('2026-11-12T06:01:00Z'))).toBe(true);
    expect(issueNeedsResponse({ ...reopened, ownerRespondedAt: '2026-11-11T09:00:00Z' }, at('2026-11-13T00:00:00Z'))).toBe(false);
  });
});

describe('plan change credits (M8)', () => {
  test('a 31-day month split on its first, middle and last day', () => {
    expect(splitPeriod('2026-12-09', '2027-01-08', '2026-12-09')).toEqual({ periodDays: 31, usedDays: 0, unusedDays: 31 });
    expect(splitPeriod('2026-12-09', '2027-01-08', '2026-12-24')).toEqual({ periodDays: 31, usedDays: 15, unusedDays: 16 });
    expect(splitPeriod('2026-12-09', '2027-01-08', '2027-01-08')).toEqual({ periodDays: 31, usedDays: 30, unusedDays: 1 });
    // A month not started yet is all unused.
    expect(splitPeriod('2027-01-09', '2027-02-08', '2027-01-06')).toEqual({ periodDays: 31, usedDays: 0, unusedDays: 31 });
  });

  test('prorated to whole rupees, never more than the amount, never negative', () => {
    expect(prorate(999, 31, 31)).toBe(999);
    expect(prorate(999, 16, 31)).toBe(516);
    expect(prorate(999, 1, 31)).toBe(32);
    expect(prorate(999, 40, 31)).toBe(999);
    expect(prorate(999, -3, 31)).toBe(0);
    expect(prorate(0, 10, 31)).toBe(0);
  });

  test('the pause starts on the 16th day past due', () => {
    expect(pausesOn('2026-12-09')).toBe('2026-12-25');
  });
});

describe('next step on the owner home (O6): every state has one', () => {
  const base: NextStepInput = { status: 'live', rejectionReason: null, partnerStatus: 'none', rooms: 1, photos: 1, plan: { plan: 'free', suspended: false } };
  const step = (patch: Partial<NextStepInput>) => ownerNextStep({ ...base, ...patch }, '2026-11-09');

  test('a draft walks through rooms, photos, then review', () => {
    expect(step({ status: 'draft', rooms: 0, photos: 0 }).action).toEqual({ label: 'Add rooms', section: 'rooms' });
    expect(step({ status: 'draft', photos: 0 }).action).toEqual({ label: 'Add photos', section: 'listing' });
    expect(step({ status: 'draft' }).action).toEqual({ label: 'Send for review', section: 'listing' });
  });

  test('in review says so; rejected says why and how to fix', () => {
    expect(step({ status: 'pending' })).toMatchObject({ tone: 'info', text: expect.stringContaining('In review') });
    expect(step({ status: 'rejected', rejectionReason: 'Photos are blurry' })).toMatchObject({
      tone: 'danger',
      text: expect.stringContaining('Photos are blurry'),
      action: { section: 'listing' },
    });
  });

  test('a paused plan comes first: pay the bill', () => {
    expect(step({ status: 'rejected', plan: { plan: 'pro', suspended: true } })).toMatchObject({ tone: 'danger', action: { label: 'Pay the bill', section: 'plan' } });
  });

  test('issues waiting, then an unpaid bill with its pause date, then live', () => {
    expect(step({ needsResponse: 2 })).toMatchObject({ tone: 'warn', action: { section: 'issues' }, text: expect.stringContaining('2 issues') });
    expect(step({ unpaidBill: { amount: 999, dueDate: '2026-11-09' } })).toMatchObject({ tone: 'info', text: expect.stringContaining('25 Nov 2026') });
    expect(step({ unpaidBill: { amount: 999, dueDate: '2026-10-25' } })).toMatchObject({ tone: 'warn', text: expect.stringContaining('Overdue') });
    expect(step({ partnerStatus: 'applied' }).action?.section).toBe('plan');
    expect(step({})).toMatchObject({ tone: 'ok', action: { section: 'rooms' } });
  });
});

describe('owner copy comes from the rules', () => {
  test('plan prices, billing rules and the verified-partner checklist', () => {
    expect(planPriceLine('pro')).toBe('₹999 a month');
    expect(planPriceLine('partner')).toBe('₹1,999 a month + 10% of subscriber bills paid through Hostels');
    expect(OWNER_PLAN_FEATURES.pro.features).toContain('Public replies to reviews');
    expect(OWNER_BILLING_RULES.join(' ')).toMatch(/free for the first month, once per hostel/);
    expect(OWNER_BILLING_RULES.join(' ')).toMatch(/At 15 days overdue/);
    expect(PARTNER_REQUIREMENTS.checks).toHaveLength(PARTNER_STANDARDS.length);
  });

  test('a stay with a move-out date ahead reads "Leaving on"', () => {
    expect(residencyLabel({ status: 'active', endDate: '2026-11-20' }, '2026-11-09')).toBe('Leaving on 20 Nov 2026');
    expect(residencyLabel({ status: 'active', endDate: null }, '2026-11-09')).toBe('Living here');
    expect(residencyLabel({ status: 'ended', endDate: '2026-11-01' }, '2026-11-09')).toBe('Moved out');
  });

  test('visit requests only move forward; closed is final', () => {
    expect(VISIT_NEXT).toEqual({ new: ['contacted', 'closed'], contacted: ['closed'], closed: [] });
  });
});
