import type { Context } from 'hono';
import type { ZodType, ZodTypeDef } from 'zod';
import { AppError } from './errors';

function toAppError(error: { issues: { path: (string | number)[]; message: string }[] }) {
  return new AppError(
    'validation',
    'Some fields are invalid',
    400,
    error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  );
}

export function parse<O, I>(schema: ZodType<O, ZodTypeDef, I>, value: unknown): O {
  const result = schema.safeParse(value);
  if (!result.success) throw toAppError(result.error);
  return result.data;
}

export async function parseBody<O, I>(c: Context, schema: ZodType<O, ZodTypeDef, I>): Promise<O> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new AppError('validation', 'Request body must be JSON', 400);
  }
  return parse(schema, body);
}

export function parseQuery<O, I>(c: Context, schema: ZodType<O, ZodTypeDef, I>): O {
  return parse(schema, c.req.query());
}
