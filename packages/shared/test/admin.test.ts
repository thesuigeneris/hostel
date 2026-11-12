import { describe, expect, test } from 'bun:test';
import { AUDIT_ACTION_LABELS, AUDIT_ACTIONS, changeValueText, moderationReason } from '../src/owner-admin';

describe('admin wording', () => {
  test('moderation reasons combine the rule and the note', () => {
    expect(moderationReason('Shares personal details', 'phone number in the text')).toBe('Shares personal details: phone number in the text');
    expect(moderationReason('Spam or advertising')).toBe('Spam or advertising');
    expect(moderationReason('', '  only a note ')).toBe('only a note');
  });

  test('listing change values read plainly', () => {
    expect(changeValueText('foodAvailable', true)).toBe('Serves food');
    expect(changeValueText('genderType', 'coliving')).toBe('Co-living');
    expect(changeValueText('lat', 17.4)).toBe('17.40000');
    expect(changeValueText('whatsappPhone', null)).toBe('none');
    expect(changeValueText('contactPhone', '9876500000')).toBe('+91 9876500000');
  });

  test('every audit action has a label', () => {
    for (const a of AUDIT_ACTIONS) expect(AUDIT_ACTION_LABELS[a]).toBeTruthy();
  });
});
