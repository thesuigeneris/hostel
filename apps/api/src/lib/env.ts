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
