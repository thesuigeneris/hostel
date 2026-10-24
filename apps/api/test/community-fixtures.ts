/** Fixtures shared by owner/community/admin tests. */
import { addDays, istDate, newId } from '@hostels/shared';
import { db, schema } from '../src/db';
import { createHostel, login } from './helpers';

export const today = () => istDate();

/** An owner with one live hostel (verified partner by default). */
export async function ownerWithHostel(overrides: Parameters<typeof createHostel>[1] = {}, room: Parameters<typeof createHostel>[2] = {}) {
  const owner = await login('owner', undefined, 'Owner');
  const { hostel, roomType } = await createHostel(owner.user.id, overrides, room);
  return { owner, hostel, roomType };
}

/** A signed-in user with an active residency at the hostel. */
export async function resident(hostelId: string, name = 'Resident', status: 'active' | 'ended' | 'pending' = 'active') {
  const r = await login('tenant', undefined, name);
  const [residency] = await db
    .insert(schema.residencies)
    .values({
      id: newId('res'),
      userId: r.user.id,
      hostelId,
      source: 'claim',
      status,
      startDate: addDays(today(), -60),
      endDate: status === 'ended' ? addDays(today(), -5) : null,
    })
    .returning();
  return { ...r, residency: residency! };
}

/** Insert an active subscription directly (bypassing billing). */
export async function insertSubscription(opts: {
  userId: string;
  hostelId: string;
  roomTypeId: string;
  mealPlan?: 'full' | 'two-meals' | 'none';
  diet?: 'veg' | 'non-veg';
  status?: 'active' | 'pending' | 'cancelled' | 'ended';
  startDate?: string;
}) {
  const [s] = await db
    .insert(schema.subscriptions)
    .values({
      id: newId('sub'),
      userId: opts.userId,
      hostelId: opts.hostelId,
      roomTypeId: opts.roomTypeId,
      mealPlan: opts.mealPlan ?? 'full',
      diet: opts.diet ?? 'veg',
      status: opts.status ?? 'active',
      startDate: opts.startDate ?? addDays(today(), -10),
    })
    .returning();
  return s!;
}

export async function insertUser(name = 'Someone', phone?: string) {
  const [u] = await db
    .insert(schema.users)
    .values({ id: newId('usr'), phone: phone ?? `8${Math.floor(100000000 + Math.random() * 899999999)}`, name })
    .returning();
  return u!;
}

export const reviewBody = {
  overall: 4,
  food: 5,
  cleanliness: 4,
  safety: 5,
  value: 3,
  staff: 4,
  title: 'Good food, friendly staff',
  body: 'Lived here for two months. Food is fresh and the warden responds quickly to problems.',
};

export const issueBody = {
  category: 'wifi',
  severity: 'medium',
  title: 'WiFi drops every evening',
  description: 'Between 8pm and 11pm the WiFi on the second floor keeps disconnecting.',
} as const;

/** A tiny valid PNG. */
export const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d,
  0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);
