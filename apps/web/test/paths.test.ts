import { describe, expect, test } from 'bun:test';
import { safePath } from '../lib/paths';

describe('safePath', () => {
  test('keeps same-site paths with their query and hash', () => {
    expect(safePath('/pay/inv_x?ok=1')).toBe('/pay/inv_x?ok=1');
    expect(safePath('/owner/hostels/h1/menu?week=2026-11-09#x')).toBe('/owner/hostels/h1/menu?week=2026-11-09#x');
  });

  test('falls back for anything that leaves the site', () => {
    for (const bad of ['//evil.example', '/\\evil.example', '/\t/evil.example', '/\n/evil.example', 'https://evil.example', 'evil', '', null, undefined]) {
      expect(safePath(bad, '/home')).toBe('/home');
    }
  });
});
