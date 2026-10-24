export function adminPhones(): string[] {
  return (process.env.ADMIN_PHONES ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Base URL of the website, used to build payment links. */
export function webUrl(): string {
  return (process.env.WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

/** Public base URL of this API, used for uploaded file URLs. */
export function apiPublicUrl(): string {
  return (process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 4000}`).replace(/\/$/, '');
}

export const isTest = () => process.env.NODE_ENV === 'test';
