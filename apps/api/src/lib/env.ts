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
    return process.env.OTP_PEPPER ?? 'dev-otp-pepper';
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
};
