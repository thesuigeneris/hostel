import type { AdminPartnerApplication, BrandKit, OwnerPartnerInfo, PartnerApplication, PartnerStandardId, User } from '@hostels/shared';
import { istDate, missingStandards, newId, standardsFor } from '@hostels/shared';
import { and, desc, eq } from 'drizzle-orm';
import { getDb, schema, type Tx } from '../db';
import { clock } from '../lib/clock';
import { env } from '../lib/env';
import { AppError, notFound } from '../lib/errors';
import { ownedHostel, requirePlan } from './access';

type AppRow = typeof schema.partnerApplications.$inferSelect;

export function toApplication(r: AppRow): PartnerApplication {
  return {
    id: r.id,
    hostelId: r.hostelId,
    status: r.status === 'none' ? 'rejected' : r.status,
    checklist: r.checklist as PartnerStandardId[],
    note: r.note,
    reason: r.reason,
    appliedAt: r.appliedAt.toISOString(),
    decidedAt: r.decidedAt?.toISOString() ?? null,
  };
}

/** Opens an application row; the partial unique index keeps one open application per hostel. */
export async function openApplication(tx: Tx, hostelId: string) {
  await tx.insert(schema.partnerApplications).values({ id: newId('pap'), hostelId }).onConflictDoNothing();
}

export async function latestApplication(hostelId: string, db: Tx = getDb()) {
  const [row] = await db
    .select()
    .from(schema.partnerApplications)
    .where(eq(schema.partnerApplications.hostelId, hostelId))
    .orderBy(desc(schema.partnerApplications.appliedAt))
    .limit(1);
  return row ?? null;
}

async function openApplicationFor(hostelId: string, db: Tx = getDb()) {
  const [row] = await db
    .select()
    .from(schema.partnerApplications)
    .where(and(eq(schema.partnerApplications.hostelId, hostelId), eq(schema.partnerApplications.status, 'applied')));
  return row ?? null;
}

/**
 * Records the outcome on the open application. A verification that sends a checklist must cover every
 * standard that applies to the hostel; the console always sends one.
 */
export async function closeApplication(
  tx: Tx,
  hostel: { id: string; foodAvailable: boolean },
  decision: { verify: true; checklist?: string[]; note?: string } | { verify: false; reason: string },
  actorId: string | null,
) {
  const open = await openApplicationFor(hostel.id, tx);
  const checklist = decision.verify ? (decision.checklist ?? open?.checklist ?? []) : (open?.checklist ?? []);
  if (decision.verify && decision.checklist) {
    const missing = missingStandards(hostel.foodAvailable, decision.checklist);
    if (missing.length) {
      throw new AppError('validation', `Tick every brand standard before verifying. Still to check: ${missing.map((s) => s.label).join('; ')}`);
    }
  }
  const values = {
    status: decision.verify ? ('verified' as const) : ('rejected' as const),
    checklist,
    note: (decision.verify ? decision.note : undefined) ?? open?.note ?? '',
    reason: decision.verify ? null : decision.reason,
    decidedBy: actorId,
    decidedAt: clock.now(),
  };
  if (open) {
    await tx.update(schema.partnerApplications).set(values).where(eq(schema.partnerApplications.id, open.id));
  } else {
    await tx.insert(schema.partnerApplications).values({ id: newId('pap'), hostelId: hostel.id, ...values });
  }
}

/** Saves inspection progress so a visit can be ticked off over more than one trip. */
export async function saveChecklist(hostelId: string, input: { checklist: string[]; note: string }) {
  const db = getDb();
  const [h] = await db.select().from(schema.hostels).where(eq(schema.hostels.id, hostelId));
  if (!h) throw notFound('Hostel');
  const open = await openApplicationFor(hostelId);
  if (!open || h.partnerStatus !== 'applied') throw new AppError('invalid_state', 'This hostel has no partner application in review');
  const allowed = new Set<string>(standardsFor(h.foodAvailable).map((s) => s.id));
  const [row] = await db
    .update(schema.partnerApplications)
    .set({ checklist: [...new Set(input.checklist)].filter((id) => allowed.has(id)), note: input.note })
    .where(eq(schema.partnerApplications.id, open.id))
    .returning();
  return toApplication(row!);
}

export async function adminApplications(status: 'applied' | 'verified' | 'rejected' = 'applied'): Promise<AdminPartnerApplication[]> {
  const rows = await getDb()
    .select({ app: schema.partnerApplications, hostel: schema.hostels, owner: schema.users })
    .from(schema.partnerApplications)
    .innerJoin(schema.hostels, eq(schema.hostels.id, schema.partnerApplications.hostelId))
    .innerJoin(schema.users, eq(schema.users.id, schema.hostels.ownerId))
    .where(eq(schema.partnerApplications.status, status))
    .orderBy(status === 'applied' ? schema.partnerApplications.appliedAt : desc(schema.partnerApplications.decidedAt));
  return rows.map(({ app, hostel, owner }) => ({
    ...toApplication(app),
    hostel: {
      id: hostel.id,
      name: hostel.name,
      slug: hostel.slug,
      area: hostel.area,
      status: hostel.status,
      foodAvailable: hostel.foodAvailable,
      contactPhone: hostel.contactPhone,
    },
    owner: { id: owner.id, name: owner.name, phone: owner.phone },
  }));
}

/** What the owner sees before and after applying: the standards we check and how their visit went. */
export async function ownerPartnerInfo(user: User, hostelId: string): Promise<OwnerPartnerInfo> {
  const h = await ownedHostel(user, hostelId);
  const app = await latestApplication(h.id);
  return {
    standards: standardsFor(h.foodAvailable).map((s) => ({ id: s.id, label: s.label })),
    application: app ? toApplication(app) : null,
  };
}

/** The print files for a verified partner: signboard, poster and door sticker all use this. */
export async function brandKit(user: User, hostelId: string): Promise<BrandKit> {
  const h = await ownedHostel(user, hostelId);
  await requirePlan(h.id, 'partner');
  if (h.partnerStatus !== 'verified') throw new AppError('not_verified', 'The brand kit unlocks once our team verifies this hostel', 403);
  const db = getDb();
  const [verified] = await db
    .select()
    .from(schema.partnerApplications)
    .where(and(eq(schema.partnerApplications.hostelId, h.id), eq(schema.partnerApplications.status, 'verified')))
    .orderBy(desc(schema.partnerApplications.decidedAt))
    .limit(1);
  return {
    hostelId: h.id,
    name: h.name,
    area: h.area,
    city: h.city,
    contactPhone: h.contactPhone,
    listingUrl: `${env.webUrl}/hostels/${h.slug}`,
    partnerSince: verified?.decidedAt ? istDate(verified.decidedAt) : null,
    tagline: 'Live anywhere. Eat well. No advance.',
  };
}
