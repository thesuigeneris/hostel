import { describe, expect, test } from 'bun:test';
import { contentSecurityPolicy, newNonce } from '../lib/csp';

const directive = (policy: string, name: string) => policy.split('; ').find((d) => d.startsWith(`${name} `)) ?? '';

describe('content security policy', () => {
  test('scripts need this response nonce: no unsafe-inline, eval only in development', () => {
    const prod = contentSecurityPolicy('abc123', { dev: false, apiOrigin: 'https://api.example.in' });
    const scripts = directive(prod, 'script-src');
    expect(scripts).toBe("script-src 'self' 'nonce-abc123' https://checkout.razorpay.com");
    expect(prod).not.toContain("'unsafe-eval'");
    expect(directive(contentSecurityPolicy('x', { dev: true, apiOrigin: 'http://localhost:4000' }), 'script-src')).toContain("'unsafe-eval'");
    expect(directive(prod, 'img-src')).toContain('https://api.example.in');
    expect(prod).toContain("frame-ancestors 'none'");
  });

  test('nonces are long and never repeat', () => {
    const seen = new Set(Array.from({ length: 500 }, newNonce));
    expect(seen.size).toBe(500);
    for (const n of seen) expect(atob(n)).toHaveLength(16);
  });
});
