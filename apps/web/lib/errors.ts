import { ApiRequestError } from '@hostels/shared';

/** A friendly message for any thrown error, plus per-field messages for validation errors. */
export function describeError(e: unknown): { message: string; fields: Record<string, string> } {
  if (e instanceof ApiRequestError) {
    const fields: Record<string, string> = {};
    for (const i of e.issues ?? []) fields[i.path] = i.message;
    return { message: e.message, fields };
  }
  return { message: e instanceof Error ? e.message : 'Something went wrong', fields: {} };
}
