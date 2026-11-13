/** Postgres unique_violation, optionally for one constraint or index. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const e = error as { code?: string; constraint_name?: string; cause?: unknown } | null;
  if (!e) return false;
  if (e.code === '23505') return !constraint || e.constraint_name === constraint;
  return e.cause ? isUniqueViolation(e.cause, constraint) : false;
}
