import { describe, expect, test } from 'bun:test';
import { issueInputSchema, photoInputSchema, postInputSchema } from '../src/schemas';

describe('photos', () => {
  const receipt = 'pho_0123456789abcdef.jpg.0123456789abcdef0123456789abcdef';

  test('are upload receipts, never links', () => {
    expect(photoInputSchema.safeParse({ photo: receipt }).success).toBe(true);
    for (const photo of ['https://example.com/a.jpg', '/uploads/pho_0123456789abcdef.jpg', 'javascript:alert(1)', 'data:image/png;base64,AAAA']) {
      expect(photoInputSchema.safeParse({ photo }).success).toBe(false);
      expect(issueInputSchema.safeParse({ category: 'wifi', title: 'No wifi', photo }).success).toBe(false);
      expect(postInputSchema.safeParse({ body: 'hi', photo }).success).toBe(false);
    }
    expect(issueInputSchema.safeParse({ category: 'wifi', title: 'No wifi', photo: receipt.replace('pho_', 'att_') }).success).toBe(true);
    expect(postInputSchema.safeParse({ body: 'hi', photo: null }).success).toBe(true);
  });
});
