import type { ListingChange, MaterialListingField } from '@hostels/shared';
import { MATERIAL_LISTING_FIELDS, newId } from '@hostels/shared';
import { and, desc, eq, isNotNull, lt, type SQL } from 'drizzle-orm';
import { getDb, schema, type Tx } from '../db';
import { clock } from '../lib/clock';
import { AppError, notFound } from '../lib/errors';
import { assertAllStandards } from './partners';

type HostelRow = typeof schema.hostels.$inferSelect;
type Value = string | number | boolean | null;

const FIELDS = Object.keys(MATERIAL_LISTING_FIELDS) as MaterialListingField[];
/** Where the place is: an in-person check made at the old spot says nothing about the new one. */
const PLACE_FIELDS: MaterialListingField[] = ['address', 'lat', 'lng'];

/** The material fields an edit changed, as [before, after]. */
export function materialDiff(before: HostelRow, after: HostelRow): Partial<Record<MaterialListingField, [Value, Value]>> {
  const out: Partial<Record<MaterialListingField, [Value, Value]>> = {};
  for (const f of FIELDS) {
    const a = before[f] as Value;
    const b = after[f] as Value;
    if (a !== b) out[f] = [a, b];
  }
  return out;
}

/** A verified partner whose place moved, or that started serving food (the kitchen was never checked). */
export function needsPartnerRecheck(before: HostelRow, diff: ReturnType<typeof materialDiff>): boolean {
  if (before.partnerStatus !== 'verified') return false;
  return PLACE_FIELDS.some((f) => f in diff) || diff.foodAvailable?.[1] === true;
}

/**
 * Called inside the edit's transaction with the row as it was (locked) and as it is now. Live listings only: a draft
 * or one in review is read by an admin before it goes live anyway. Editing keeps a live listing live (spec §6); this
 * leaves a trail instead, and flags a verified partner whose check no longer describes the place.
 */
export async function recordMaterialEdit(tx: Tx, before: HostelRow, after: HostelRow, actorId: string) {
  if (before.status !== 'live') return;
  const diff = materialDiff(before, after);
  if (!Object.keys(diff).length) return;
  const recheck = needsPartnerRecheck(before, diff);
  await tx
    .insert(schema.listingChanges)
    .values({ id: newId('lch'), hostelId: before.id, changedBy: actorId, changes: diff, partnerRecheck: recheck, createdAt: clock.now() });
  if (recheck && !before.partnerRecheckSince) {
    await tx.update(schema.hostels).set({ partnerRecheckSince: clock.now() }).where(eq(schema.hostels.id, before.id));
  }
}

const PAGE = 50;

/** Material edits of live listings, newest first. `recheck` keeps the ones that flagged a partner for a new visit. */
export async function listingChanges(filter: { recheck?: boolean; hostelId?: string; before?: string; limit?: number } = {}): Promise<ListingChange[]> {
  const c = schema.listingChanges;
  const where: (SQL | undefined)[] = [
    filter.recheck ? eq(c.partnerRecheck, true) : undefined,
    filter.hostelId ? eq(c.hostelId, filter.hostelId) : undefined,
    filter.before ? lt(c.createdAt, new Date(filter.before)) : undefined,
  ];
  const rows = await getDb()
    .select({ change: c, hostel: schema.hostels, user: { id: schema.users.id, name: schema.users.name, phone: schema.users.phone } })
    .from(c)
    .innerJoin(schema.hostels, eq(schema.hostels.id, c.hostelId))
    .leftJoin(schema.users, eq(schema.users.id, c.changedBy))
    .where(and(...where))
    .orderBy(desc(c.createdAt), desc(c.id))
    .limit(Math.min(filter.limit ?? PAGE, 200));
  return rows.map(({ change, hostel, user }) => ({
    id: change.id,
    hostel: {
      id: hostel.id,
      name: hostel.name,
      slug: hostel.slug,
      area: hostel.area,
      status: hostel.status,
      partnerStatus: hostel.partnerStatus,
      recheckSince: hostel.partnerRecheckSince?.toISOString() ?? null,
    },
    changedBy: user?.id ? { ...user, isOwner: user.id === hostel.ownerId } : null,
    changes: FIELDS.filter((f) => f in change.changes).map((f) => {
      const [before, after] = change.changes[f] as [Value, Value];
      return { field: f, label: MATERIAL_LISTING_FIELDS[f], before, after };
    }),
    partnerRecheck: change.partnerRecheck,
    createdAt: change.createdAt.toISOString(),
  }));
}

/**
 * Records that the team checked a moved partner again, in person, against every brand standard. The check is kept as
 * a new verified application, so the public explainer's "checked on" date is the new visit; the flag is cleared.
 */
export async function recheckPartner(hostelId: string, input: { checklist: string[]; note: string }, actorId: string) {
  const db = getDb();
  const [h] = await db.select().from(schema.hostels).where(eq(schema.hostels.id, hostelId));
  if (!h) throw notFound('Hostel');
  if (h.partnerStatus !== 'verified' || !h.partnerRecheckSince) throw new AppError('invalid_state', 'This partner has no check waiting');
  assertAllStandards(h.foodAvailable, input.checklist);
  return db.transaction(async (tx) => {
    // Conditional: two admins recording the same visit give one record.
    const [row] = await tx
      .update(schema.hostels)
      .set({ partnerRecheckSince: null })
      .where(and(eq(schema.hostels.id, h.id), eq(schema.hostels.partnerStatus, 'verified'), isNotNull(schema.hostels.partnerRecheckSince)))
      .returning();
    if (!row) throw new AppError('invalid_state', 'This check was recorded a moment ago; refresh to see it');
    const now = clock.now();
    await tx.insert(schema.partnerApplications).values({
      id: newId('pap'),
      hostelId: h.id,
      status: 'verified',
      recheck: true,
      checklist: [...new Set(input.checklist)],
      note: input.note,
      decidedBy: actorId,
      appliedAt: now,
      decidedAt: now,
    });
    return row;
  });
}
