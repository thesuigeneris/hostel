/** Development fallbacks. They are public, so a production instance refuses to start with any of them. */
export const DEV_SECRETS = {
  OTP_PEPPER: 'dev-otp-pepper',
  UPLOAD_SIGNING_SECRET: 'dev-upload-signing-secret',
} as const;

/** Runtime configuration. Read lazily so tests can set variables before use. */
export const env = {
  get databaseUrl() {
    return process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/hostels';
  },
  get port() {
    return Number(process.env.PORT ?? 4000);
  },
  get isProduction() {
    return process.env.NODE_ENV === 'production';
  },
  /**
   * `standard` serves real users. `demo` is a public demo instance: only seeded demo accounts can sign in,
   * nobody can sign up, no SMS is sent and payments are always simulated.
   */
  get appMode(): 'standard' | 'demo' {
    return process.env.APP_MODE === 'demo' ? 'demo' : 'standard';
  },
  /** Demo accounts may sign in on demo instances and in development, never on a production standard instance. */
  get demoLoginEnabled() {
    if (this.appMode === 'demo') return true;
    return !this.isProduction && process.env.DEMO_LOGIN !== 'off';
  },
  get adminPhones(): string[] {
    return (process.env.ADMIN_PHONES ?? '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
  },
  /** Secret mixed into OTP hashes so a leaked table cannot be brute-forced offline. */
  get otpPepper() {
    return process.env.OTP_PEPPER ?? DEV_SECRETS.OTP_PEPPER;
  },
  /**
   * Signs upload receipts and private photo links. Kept apart from the OTP pepper so rotating one never
   * breaks or weakens the other.
   */
  get uploadSigningSecret() {
    return process.env.UPLOAD_SIGNING_SECRET ?? DEV_SECRETS.UPLOAD_SIGNING_SECRET;
  },
  get corsOrigins(): string[] {
    return (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:8081')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
  },
  get publicUrl() {
    return process.env.API_PUBLIC_URL ?? `http://localhost:${this.port}`;
  },
  get webUrl() {
    return process.env.WEB_URL ?? 'http://localhost:3000';
  },
  /**
   * `TRUST_PROXY=1`: every request reaches the API through our own proxy (Caddy) or the website, which put the
   * client's address last in X-Forwarded-For. Only then is the header believed; otherwise the connection's address is.
   */
  get trustProxy() {
    return process.env.TRUST_PROXY === '1';
  },
  /** Multiplies every rate limit (see lib/rate-limit.ts). Tests raise it; production leaves it at 1. */
  get rateLimitFactor() {
    const f = Number(process.env.RATE_LIMIT_FACTOR ?? 1);
    return Number.isFinite(f) && f > 0 ? f : 1;
  },
  /** Per-rule overrides, `rule=requests/seconds,...`. */
  get rateLimitOverrides() {
    return process.env.RATE_LIMITS;
  },
};
