/** Drizzle wraps driver errors (`DrizzleQueryError`), so the Postgres code may be on `cause`. */
export function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } } | null;
  return err?.code === '23505' || err?.cause?.code === '23505';
}
