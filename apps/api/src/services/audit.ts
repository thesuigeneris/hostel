import type { AuditAction, AuditEvent } from '@hostels/shared';
import { newId } from '@hostels/shared';
import { and, desc, eq, ilike, lt, or, type SQL } from 'drizzle-orm';
import { getDb, schema, type Tx } from '../db';

/** Records an admin action. Called after the action succeeded, so the log only holds things that happened. */
export async function audit(
  actorId: string | null,
  action: AuditAction,
  target: { type: string; id: string },
  summary = '',
  db: Tx = getDb(),
) {
  await db.insert(schema.auditEvents).values({ id: newId('aud'), actorId, action, targetType: target.type, targetId: target.id, summary });
}

export async function listAudit(filter: { action?: AuditAction; targetId?: string; q?: string; before?: string; limit?: number } = {}): Promise<AuditEvent[]> {
  const a = schema.auditEvents;
  const where: (SQL | undefined)[] = [
    filter.action ? eq(a.action, filter.action) : undefined,
    filter.targetId ? eq(a.targetId, filter.targetId) : undefined,
    filter.before ? lt(a.createdAt, new Date(filter.before)) : undefined,
    filter.q ? or(ilike(a.summary, `%${filter.q}%`), ilike(a.targetId, `%${filter.q}%`), ilike(schema.users.name, `%${filter.q}%`)) : undefined,
  ];
  const rows = await getDb()
    .select({ event: a, actor: { id: schema.users.id, name: schema.users.name, phone: schema.users.phone } })
    .from(a)
    .leftJoin(schema.users, eq(schema.users.id, a.actorId))
    .where(and(...where))
    .orderBy(desc(a.createdAt))
    .limit(filter.limit ?? 100);
  return rows.map(({ event, actor }) => ({
    id: event.id,
    action: event.action as AuditAction,
    targetType: event.targetType,
    targetId: event.targetId,
    summary: event.summary,
    actor: actor?.id ? actor : null,
    createdAt: event.createdAt.toISOString(),
  }));
}
