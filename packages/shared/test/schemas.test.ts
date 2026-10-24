import { describe, expect, test } from 'bun:test';
import { issueInputSchema, photoInputSchema, postInputSchema } from '../src/schemas';

describe('photo links', () => {
  test('only http and https links are accepted', () => {
    expect(photoInputSchema.safeParse({ url: 'https://example.com/a.jpg' }).success).toBe(true);
    expect(photoInputSchema.safeParse({ url: 'javascript:alert(1)' }).success).toBe(false);
    expect(photoInputSchema.safeParse({ url: 'data:image/png;base64,AAAA' }).success).toBe(false);
    expect(issueInputSchema.safeParse({ category: 'wifi', title: 'No wifi', photoUrl: 'javascript:alert(1)' }).success).toBe(false);
    expect(postInputSchema.safeParse({ body: 'hi', photoUrl: null }).success).toBe(true);
  });
});
