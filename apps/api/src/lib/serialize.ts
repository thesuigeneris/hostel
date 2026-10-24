/**
 * Row → API DTO mappers. Dates become ISO strings; shapes match `@hostels/shared` schemas.
 * Add a mapper here when you add a DTO so every route serialises the same way.
 */
import type * as T from '@hostels/shared';
import type { schema } from '../db';

type Row<K extends keyof typeof schema> = (typeof schema)[K] extends { $inferSelect: infer R } ? R : never;

export const iso = (d: Date) => d.toISOString();
export const isoOrNull = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function toUser(u: Row<'users'>): T.User {
  return { id: u.id, phone: u.phone, name: u.name, email: u.email, role: u.role, createdAt: iso(u.createdAt) };
}

export function toPublicUser(u: Pick<Row<'users'>, 'id' | 'name'>): T.PublicUser {
  return { id: u.id, name: u.name || 'Resident' };
}

export function toHostel(h: Row<'hostels'>): T.Hostel {
  return {
    id: h.id,
    ownerId: h.ownerId,
    slug: h.slug,
    name: h.name,
    description: h.description,
    city: h.city,
    area: h.area,
    address: h.address,
    lat: h.lat,
    lng: h.lng,
    genderType: h.genderType,
    amenities: h.amenities,
    rules: h.rules,
    contactPhone: h.contactPhone,
    whatsappPhone: h.whatsappPhone,
    foodAvailable: h.foodAvailable,
    status: h.status,
    rejectionReason: h.rejectionReason,
    partnerStatus: h.partnerStatus,
    platformFeePct: h.platformFeePct,
    ownerPlan: h.ownerPlan,
    createdAt: iso(h.createdAt),
  };
}

export function toRoomType(r: Row<'roomTypes'>): T.RoomType {
  return {
    id: r.id,
    hostelId: r.hostelId,
    sharing: r.sharing,
    monthlyRent: r.monthlyRent,
    advanceAmount: r.advanceAmount,
    totalBeds: r.totalBeds,
    bedsAvailable: r.bedsAvailable,
  };
}

export function toPhoto(p: Row<'hostelPhotos'>): T.HostelPhoto {
  return { id: p.id, hostelId: p.hostelId, url: p.url, sortOrder: p.sortOrder };
}
