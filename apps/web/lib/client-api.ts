'use client';
import { createApiClient } from '@hostels/shared';

/**
 * API client for Client Components. Requests go through the Next.js proxy route,
 * which attaches the httpOnly session cookie as a Bearer token.
 */
export const api = createApiClient('/api/proxy');
