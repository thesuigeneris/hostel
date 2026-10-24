/** Server-side base URL of the API. */
export const API_URL = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
export const SESSION_COOKIE = 'hostels_session';
export const SITE_NAME = 'Hostels';
export const TAGLINE = 'Live anywhere. Eat well. No advance.';
