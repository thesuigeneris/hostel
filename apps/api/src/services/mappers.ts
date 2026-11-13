import type { Hostel, RoomType, User } from '@hostels/shared';
import type { schema } from '../db';

type Row<T extends { $inferSelect: unknown }> = T['$inferSelect'];

export function toUser(r: Row<typeof schema.users>): User {
  return {
    id: r.id,
    phone: r.phone,
    name: r.name,
    email: r.email,
    role: r.role,
    createdAt: r.createdAt.toISOString(),
    phoneVerified: r.phoneVerifiedAt !== null,
    hasPassword: r.passwordHash !== null,
    isDemo: r.isDemo,
  };
}

export function toHostel(r: Row<typeof schema.hostels>): Hostel {
  return { ...r, createdAt: r.createdAt.toISOString() };
}

export function toRoomType(r: Row<typeof schema.roomTypes>): RoomType {
  return { ...r, bedsUpdatedAt: r.bedsUpdatedAt?.toISOString() ?? null };
}
