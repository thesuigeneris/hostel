import { phoneSchema } from '@hostels/shared';
import { DEV_SECRETS } from './env';
import { rateLimitConfigProblems } from './rate-limit';

type Env = Record<string, string | undefined>;

const MIN_SECRET_LENGTH = 32;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

const isSet = (v: string | undefined): v is string => !!v && v.trim().length > 0;

/** A public link must be https, except on this machine (running the production build locally to test it). */
function linkProblem(name: string, value: string | undefined): string | null {
  if (!isSet(value)) return `${name} is not set. Set it to the public https address.`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return `${name} is not a valid link: "${value}".`;
  }
  if (url.protocol !== 'https:' && !LOCAL_HOSTS.has(url.hostname)) return `${name} must use https (got ${url.origin}).`;
  return null;
}

function secretProblem(name: keyof typeof DEV_SECRETS, value: string | undefined): string | null {
  if (!isSet(value)) return `${name} is not set. Set it to a random value of at least ${MIN_SECRET_LENGTH} characters.`;
  if (value === DEV_SECRETS[name]) return `${name} is the public development value. Set a random value of at least ${MIN_SECRET_LENGTH} characters.`;
  if (value.length < MIN_SECRET_LENGTH) return `${name} is too short (${value.length} characters; at least ${MIN_SECRET_LENGTH}).`;
  return null;
}

function pairProblem(a: string, b: string, e: Env): string | null {
  return isSet(e[a]) !== isSet(e[b]) ? `${a} and ${b} must be set together, or both left empty.` : null;
}

/**
 * What stops this configuration from serving real users, in plain words. Empty means it may start.
 * Only production is checked: development runs on safe fallbacks, and tests set what they need.
 */
export function productionConfigProblems(e: Env = process.env): string[] {
  if (e.NODE_ENV !== 'production') return [];
  const problems: (string | null)[] = [
    secretProblem('OTP_PEPPER', e.OTP_PEPPER),
    secretProblem('UPLOAD_SIGNING_SECRET', e.UPLOAD_SIGNING_SECRET),
    isSet(e.OTP_PEPPER) && e.OTP_PEPPER === e.UPLOAD_SIGNING_SECRET
      ? 'OTP_PEPPER and UPLOAD_SIGNING_SECRET must be different values.'
      : null,
    isSet(e.DATABASE_URL) ? null : 'DATABASE_URL is not set.',
    linkProblem('API_PUBLIC_URL', e.API_PUBLIC_URL),
    linkProblem('WEB_URL', e.WEB_URL),
    pairProblem('RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', e),
    pairProblem('MSG91_AUTH_KEY', 'MSG91_TEMPLATE_ID', e),
  ];

  if (!isSet(e.CORS_ORIGINS)) {
    problems.push('CORS_ORIGINS is not set. List the website origin(s) that call the API from the browser.');
  } else {
    for (const origin of e.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)) {
      problems.push(linkProblem('CORS_ORIGINS entry', origin));
    }
  }

  // A demo instance ignores Razorpay keys (it only simulates), so only a standard instance takes real payments.
  const razorpay = e.APP_MODE !== 'demo' && isSet(e.RAZORPAY_KEY_ID) && isSet(e.RAZORPAY_KEY_SECRET);
  // Without the webhook, a payment made in a tab that was then closed is never recorded.
  if (razorpay && !isSet(e.RAZORPAY_WEBHOOK_SECRET)) problems.push('RAZORPAY_WEBHOOK_SECRET is not set; payments from closed tabs would be lost.');

  // Behind Caddy every request comes from the proxy: without TRUST_PROXY all visitors would share one limit.
  if (e.TRUST_PROXY !== undefined && e.TRUST_PROXY !== '' && e.TRUST_PROXY !== '0' && e.TRUST_PROXY !== '1') {
    problems.push(`TRUST_PROXY must be 1 (behind Caddy or another proxy that sets X-Forwarded-For) or 0 (got "${e.TRUST_PROXY}").`);
  }
  problems.push(...rateLimitConfigProblems(e));

  for (const phone of (e.ADMIN_PHONES ?? '').split(',').map((p) => p.trim()).filter(Boolean)) {
    if (!phoneSchema.safeParse(phone).success) problems.push(`ADMIN_PHONES has an invalid phone number: "${phone}".`);
  }
  return problems.filter((p): p is string => p !== null);
}

/** Stops the process before it listens when production configuration is unsafe. */
export function assertProductionConfig(e: Env = process.env, exit: (code: number) => never = process.exit) {
  const problems = productionConfigProblems(e);
  if (!problems.length) return;
  console.error('hostels-api will not start in production with this configuration:');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('See docs/RUN.md, "Production settings".');
  exit(1);
}
