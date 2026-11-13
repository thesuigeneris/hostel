import { ApiError, createApiClient } from '@hostels/shared';
import { API_URL } from './config';
import { getToken } from './token';

export const api = createApiClient(API_URL, getToken);

/** A message fit to show the person, from any thrown error. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.issues?.[0]?.message ?? e.message;
  if (e instanceof TypeError) return "Can't reach the server. Check your connection.";
  return e instanceof Error ? e.message : 'Something went wrong';
}
