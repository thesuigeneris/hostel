import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ErrorCode } from '@hostels/shared';
import { ZodError, type ZodTypeAny, type z } from 'zod';

export class ApiError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    public code: ErrorCode,
    message: string,
    public issues?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

export const err = {
  validation: (message = 'Invalid request', issues?: { path: string; message: string }[]) => new ApiError(400, 'validation', message, issues),
  unauthorized: (message = 'Please sign in') => new ApiError(401, 'unauthorized', message),
  forbidden: (message = 'You do not have access to this') => new ApiError(403, 'forbidden', message),
  notFound: (what = 'Resource') => new ApiError(404, 'not_found', `${what} not found`),
  conflict: (code: ErrorCode, message: string) => new ApiError(409, code, message),
  domain: (code: ErrorCode, message: string, status: ContentfulStatusCode = 400) => new ApiError(status, code, message),
};

function zodIssues(e: ZodError) {
  return e.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw err.validation('Some fields are invalid', zodIssues(r.error));
  return r.data;
}

/** Parse and validate a JSON body. */
export async function body<S extends ZodTypeAny>(c: Context, schema: S): Promise<z.output<S>> {
  let json: unknown;
  try {
    json = await c.req.json();
  } catch {
    throw err.validation('Request body must be JSON');
  }
  return parse(schema, json);
}

/** Parse and validate the query string. */
export function query<S extends ZodTypeAny>(c: Context, schema: S): z.output<S> {
  return parse(schema, c.req.query());
}

export function onError(e: Error, c: Context) {
  if (e instanceof ApiError) {
    return c.json({ error: e.code, message: e.message, ...(e.issues ? { issues: e.issues } : {}) }, e.status);
  }
  if (e instanceof ZodError) {
    return c.json({ error: 'validation', message: 'Some fields are invalid', issues: zodIssues(e) }, 400);
  }
  // Postgres unique violation that slipped past a service-level check (Drizzle puts the code on `cause`).
  const pg = e as { code?: string; cause?: { code?: string } };
  if (pg.code === '23505' || pg.cause?.code === '23505') {
    return c.json({ error: 'conflict', message: 'That already exists' }, 409);
  }
  console.error('[api] unhandled error', e);
  return c.json({ error: 'internal', message: 'Something went wrong. Please try again.' }, 500);
}

export function notFoundHandler(c: Context) {
  return c.json({ error: 'not_found', message: 'Route not found' }, 404);
}

export function pageParams(page?: number, pageSize?: number, defaultSize = 20) {
  const p = Math.max(1, page ?? 1);
  const size = Math.min(50, Math.max(1, pageSize ?? defaultSize));
  return { page: p, pageSize: size, offset: (p - 1) * size };
}
