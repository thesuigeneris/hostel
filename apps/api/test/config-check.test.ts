import { describe, expect, test } from 'bun:test';
import { assertProductionConfig, productionConfigProblems } from '../src/lib/config-check';
import { DEV_SECRETS } from '../src/lib/env';

const secret = (c: string) => c.repeat(40);

/** A production configuration that may start. Each test breaks one thing. */
const good = {
  NODE_ENV: 'production',
  OTP_PEPPER: secret('p'),
  UPLOAD_SIGNING_SECRET: secret('u'),
  DATABASE_URL: 'postgres://app:pw@db:5432/hostels',
  API_PUBLIC_URL: 'https://api.example.in',
  WEB_URL: 'https://example.in',
  CORS_ORIGINS: 'https://example.in,https://www.example.in',
  ADMIN_PHONES: '9876543210, +91 98765 43211',
};

const problems = (overrides: Record<string, string | undefined>) => productionConfigProblems({ ...good, ...overrides });

describe('production configuration check', () => {
  test('a complete production configuration starts', () => {
    expect(productionConfigProblems(good)).toEqual([]);
  });

  test('development and tests are never blocked', () => {
    expect(productionConfigProblems({})).toEqual([]);
    expect(productionConfigProblems({ NODE_ENV: 'test' })).toEqual([]);
    expect(productionConfigProblems({ NODE_ENV: 'development', OTP_PEPPER: DEV_SECRETS.OTP_PEPPER })).toEqual([]);
  });

  test('secrets must be set, not the public development values, and long enough', () => {
    expect(problems({ OTP_PEPPER: undefined })).toEqual([expect.stringContaining('OTP_PEPPER is not set')]);
    expect(problems({ OTP_PEPPER: DEV_SECRETS.OTP_PEPPER })).toEqual([expect.stringContaining('public development value')]);
    expect(problems({ UPLOAD_SIGNING_SECRET: DEV_SECRETS.UPLOAD_SIGNING_SECRET })).toEqual([
      expect.stringContaining('UPLOAD_SIGNING_SECRET is the public development value'),
    ]);
    expect(problems({ UPLOAD_SIGNING_SECRET: 'short' })).toEqual([expect.stringContaining('too short (5 characters')]);
    expect(problems({ OTP_PEPPER: '   ' })).toEqual([expect.stringContaining('OTP_PEPPER is not set')]);
  });

  test('the two secrets must differ, so rotating one never weakens the other', () => {
    expect(problems({ UPLOAD_SIGNING_SECRET: good.OTP_PEPPER })).toEqual([expect.stringContaining('must be different')]);
  });

  test('public links must be https, except on this machine', () => {
    expect(problems({ API_PUBLIC_URL: 'http://api.example.in' })).toEqual([expect.stringContaining('API_PUBLIC_URL must use https')]);
    expect(problems({ WEB_URL: 'not a link' })).toEqual([expect.stringContaining('WEB_URL is not a valid link')]);
    expect(problems({ API_PUBLIC_URL: undefined })).toEqual([expect.stringContaining('API_PUBLIC_URL is not set')]);
    expect(problems({ CORS_ORIGINS: 'https://example.in,http://evil.example' })).toEqual([
      expect.stringContaining('CORS_ORIGINS entry must use https'),
    ]);
    expect(problems({ CORS_ORIGINS: undefined })).toEqual([expect.stringContaining('CORS_ORIGINS is not set')]);
    expect(problems({ API_PUBLIC_URL: 'http://localhost:4000', WEB_URL: 'http://127.0.0.1:3000', CORS_ORIGINS: 'http://localhost:3000' })).toEqual([]);
  });

  test('keys that come in pairs are set together', () => {
    expect(problems({ RAZORPAY_KEY_ID: 'rzp_live_x' })).toEqual([expect.stringContaining('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET')]);
    expect(problems({ MSG91_TEMPLATE_ID: 't' })).toEqual([expect.stringContaining('MSG91_AUTH_KEY and MSG91_TEMPLATE_ID')]);
    expect(problems({ MSG91_AUTH_KEY: 'k', MSG91_TEMPLATE_ID: 't' })).toEqual([]);
  });

  test('real payments need the webhook secret; a demo instance ignores payment keys, so it needs none', () => {
    const keys = { RAZORPAY_KEY_ID: 'rzp_live_x', RAZORPAY_KEY_SECRET: 's' };
    expect(problems(keys)).toEqual([expect.stringContaining('RAZORPAY_WEBHOOK_SECRET is not set')]);
    expect(problems({ ...keys, RAZORPAY_WEBHOOK_SECRET: 'w' })).toEqual([]);
    expect(problems({ ...keys, APP_MODE: 'demo' })).toEqual([]);
  });

  test('admin phones must be real Indian mobile numbers', () => {
    expect(problems({ ADMIN_PHONES: '9876543210,12345' })).toEqual([expect.stringContaining('"12345"')]);
    expect(problems({ ADMIN_PHONES: '' })).toEqual([]);
  });

  test('every problem is reported at once, so one deploy fixes them all', () => {
    expect(productionConfigProblems({ NODE_ENV: 'production' }).length).toBeGreaterThanOrEqual(6);
  });

  test('an unsafe configuration stops the process with exit code 1 and names each problem', () => {
    const errors: string[] = [];
    const original = console.error;
    console.error = (msg: string) => errors.push(msg);
    let code: number | undefined;
    try {
      assertProductionConfig({ ...good, OTP_PEPPER: DEV_SECRETS.OTP_PEPPER }, ((c: number) => {
        code = c;
      }) as (c: number) => never);
    } finally {
      console.error = original;
    }
    expect(code).toBe(1);
    expect(errors.join('\n')).toContain('OTP_PEPPER is the public development value');
  });
});
