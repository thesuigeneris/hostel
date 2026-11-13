'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, type GenderType, type HostelInput, type OwnerPlanTier, type RentMethod, type SharingType, type VisitStatus } from '@hostels/shared';
import { num, optional, run, safePath, str } from '@/lib/actions';
import { api } from '@/lib/api';
import { uploadPhoto } from '@/lib/upload';

const back = (form: FormData, fallback = '/owner') => safePath(str(form, '_back'), fallback);
const lines = (v: string) => v.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);

function hostelInput(form: FormData): HostelInput {
  return {
    name: str(form, 'name'),
    description: str(form, 'description'),
    area: str(form, 'area'),
    address: str(form, 'address'),
    lat: num(form, 'lat'),
    lng: num(form, 'lng'),
    genderType: str(form, 'genderType') as GenderType,
    amenities: [...form.getAll('amenities').map(String), ...lines(str(form, 'moreAmenities'))],
    rules: lines(str(form, 'rules')),
    contactPhone: str(form, 'contactPhone'),
    whatsappPhone: optional(form, 'whatsappPhone') ?? null,
    foodAvailable: form.get('foodAvailable') === 'on',
  };
}

export async function createHostelAction(form: FormData) {
  await run('/owner/hostels/new', async () => (await api()).owner.create(hostelInput(form)), {
    to: (h) => `/owner/hostels/${h.id}/rooms?ok=${encodeURIComponent('Listing created. Add your rooms next.')}`,
  });
}

export async function updateHostelAction(form: FormData) {
  const id = str(form, 'hostelId');
  await run(`/owner/hostels/${id}`, async () => (await api()).owner.update(id, hostelInput(form)), { ok: 'Saved' });
}

export async function submitHostelAction(form: FormData) {
  const id = str(form, 'hostelId');
  await run(`/owner/hostels/${id}`, async () => (await api()).owner.submit(id), { ok: 'Sent for review. We usually approve within a day.' });
}

export async function uploadPhotoAction(form: FormData) {
  const id = str(form, 'hostelId');
  await run(`/owner/hostels/${id}`, async () => {
    const client = await api();
    const url = await uploadPhoto(client, form);
    if (!url) throw new ApiError(400, 'validation', 'Choose a photo first');
    return client.owner.addPhoto(id, url);
  }, { ok: 'Photo added' });
}

export async function deletePhotoAction(form: FormData) {
  const id = str(form, 'hostelId');
  await run(`/owner/hostels/${id}`, async () => (await api()).owner.deletePhoto(id, str(form, 'photoId')));
}

export async function coverPhotoAction(form: FormData) {
  const id = str(form, 'hostelId');
  const order = str(form, 'order').split(',');
  const first = str(form, 'photoId');
  await run(`/owner/hostels/${id}`, async () => (await api()).owner.reorderPhotos(id, [first, ...order.filter((p) => p !== first)]), { ok: 'Cover photo set' });
}

export async function addRoomAction(form: FormData) {
  const id = str(form, 'hostelId');
  await run(`/owner/hostels/${id}/rooms`, async () => (await api()).owner.addRoom(id, {
    sharing: str(form, 'sharing') as SharingType,
    monthlyRent: num(form, 'monthlyRent'),
    advanceAmount: num(form, 'advanceAmount'),
    totalBeds: num(form, 'totalBeds'),
    bedsAvailable: num(form, 'bedsAvailable'),
  }), { ok: 'Room added' });
}

export async function updateRoomAction(form: FormData) {
  await run(back(form), async () => (await api()).owner.updateRoom(str(form, 'roomId'), {
    monthlyRent: num(form, 'monthlyRent'),
    advanceAmount: num(form, 'advanceAmount'),
    totalBeds: num(form, 'totalBeds'),
    bedsAvailable: num(form, 'bedsAvailable'),
  }), { ok: 'Room updated' });
}

export async function deleteRoomAction(form: FormData) {
  await run(back(form), async () => (await api()).owner.deleteRoom(str(form, 'roomId')), { ok: 'Room removed' });
}

export async function saveMenuAction(form: FormData) {
  const id = str(form, 'hostelId');
  const week = str(form, 'weekStart');
  const items = form.getAll('slot').map(String).flatMap((slot) => {
    const [date, meal] = slot.split('|') as [string, 'breakfast' | 'lunch' | 'dinner'];
    const vegDish = str(form, `veg:${slot}`);
    if (!vegDish) return [];
    return [{ date, meal, vegDish, nonVegDish: str(form, `nonveg:${slot}`) || null, foodPartnerId: str(form, `partner:${slot}`) || null }];
  });
  await run(`/owner/hostels/${id}/menu?week=${week}`, async () => (await api()).owner.saveMenu(id, week, { theme: str(form, 'theme'), items }), { ok: 'Menu saved' });
}

export async function copyMenuAction(form: FormData) {
  const id = str(form, 'hostelId');
  const week = str(form, 'weekStart');
  await run(`/owner/hostels/${id}/menu?week=${week}`, async () => (await api()).owner.copyLastWeek(id, week), { ok: "Copied last week's menu" });
}

export async function addResidentAction(form: FormData) {
  const id = str(form, 'hostelId');
  await run(`/owner/hostels/${id}/residents`, async () => (await api()).owner.addResident(id, {
    phone: str(form, 'phone'),
    name: str(form, 'name'),
    roomTypeId: optional(form, 'roomTypeId') ?? null,
    monthlyRent: num(form, 'monthlyRent'),
    startDate: str(form, 'startDate'),
  }), { ok: 'Resident added. They get an invite when they log in with this number.' });
}

export async function endResidentAction(form: FormData) {
  const id = str(form, 'hostelId');
  await run(`/owner/hostels/${id}/residents`, async () => (await api()).owner.endResident(id, str(form, 'residencyId'), str(form, 'endDate')), { ok: 'Marked as moved out' });
}

export async function recordRentAction(form: FormData) {
  const id = str(form, 'hostelId');
  const month = str(form, 'month');
  await run(`/owner/hostels/${id}/rent?month=${month}`, async () => (await api()).owner.recordRent(id, str(form, 'residencyId'), {
    month,
    amountPaid: num(form, 'amountPaid'),
    paidOn: optional(form, 'paidOn') ?? null,
    method: (optional(form, 'method') as RentMethod | undefined) ?? null,
    note: str(form, 'note'),
  }), { ok: 'Rent recorded' });
}

export async function replyReviewAction(form: FormData) {
  await run(
    back(form),
    async () => {
      const review = await (await api()).owner.reply(str(form, 'reviewId'), str(form, 'reply'));
      // Replies show on the public listing, which caches reviews briefly.
      revalidatePath('/hostels/[slug]', 'page');
      return review;
    },
    { ok: 'Reply posted' },
  );
}

export async function changePlanAction(form: FormData) {
  const id = str(form, 'hostelId');
  const plan = str(form, 'plan') as OwnerPlanTier;
  await run(`/owner/hostels/${id}/plan`, async () => (await api()).owner.changePlan(id, plan), {
    ok: plan === 'partner' ? 'Partner application sent. Our team will call you to schedule a visit.' : 'Plan updated',
  });
}

export async function setVisitAction(form: FormData) {
  await run('/owner/visits', async () => (await api()).owner.setVisit(str(form, 'visitId'), str(form, 'status') as VisitStatus));
}
