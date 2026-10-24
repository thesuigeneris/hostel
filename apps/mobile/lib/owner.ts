import {
  addDays,
  DEFAULT_PLATFORM_FEE_PCT,
  type GenderType,
  type Hostel,
  hostelInputSchema,
  type HostelInput,
  type IssueStatus,
  type IssueView,
  isValidDate,
  type Meal,
  MEALS,
  type MenuWeek,
  type MenuWeekInput,
  monthOf,
  OWNER_PLAN_TIERS,
  type OwnerPlanInfo,
  type OwnerPlanTier,
  type RentMethod,
  rentRecordSchema,
  type RentRecordInput,
  type RentSheet,
  residentInputSchema,
  type ResidentInput,
} from '@hostels/shared';

/** Owner and admin screen logic that has no UI, kept here so it can be unit tested. Mirrors the website's owner pages. */

// ---------------------------------------------------------------------------
// Plans and the sections of a hostel

const RANK: Record<OwnerPlanTier, number> = { free: 0, pro: 1, partner: 2 };
export const hasPlan = (effective: OwnerPlanTier, needed: OwnerPlanTier) => RANK[effective] >= RANK[needed];

export type HostelSection = { path: string; label: string; hint: string; needs?: OwnerPlanTier };

/** The website's owner tabs, as rows on the hostel screen. `needs` locks a row below that plan. */
export const HOSTEL_SECTIONS: HostelSection[] = [
  { path: 'listing', label: 'Listing and photos', hint: 'Details, map pin, amenities, photos' },
  { path: 'rooms', label: 'Rooms and free beds', hint: 'Rent, advance and beds per room type' },
  { path: 'residents', label: 'Residents', hint: 'Resident register with phone invites', needs: 'pro' },
  { path: 'rent', label: 'Rent tracker', hint: 'Who paid this month, who is due', needs: 'pro' },
  { path: 'community', label: 'Issues and community', hint: 'Answer issues, post announcements' },
  { path: 'reviews', label: 'Reviews', hint: 'Reply to verified residents' },
  { path: 'menu', label: 'Weekly menu', hint: 'Meals subscribers see in their app', needs: 'partner' },
  { path: 'kitchen', label: 'Kitchen and subscribers', hint: 'Daily headcount and subscriber list', needs: 'partner' },
  { path: 'plan', label: 'Plan and billing', hint: 'Change plan, pay your bill' },
];

export const sectionLocked = (s: HostelSection, effective: OwnerPlanTier) => !!s.needs && !hasPlan(effective, s.needs);

export const PLAN_BLURB: Record<OwnerPlanTier, string> = {
  free: 'Listing, visit requests, verified reviews and issue reporting.',
  pro: 'Adds the resident register, rent tracker and community board.',
  partner: `Adds the verified badge, online subscriptions with no advance, menus and payouts. ${DEFAULT_PLATFORM_FEE_PCT}% fee on collected rent.`,
};

export type PlanChoice = {
  tier: OwnerPlanTier;
  current: boolean;
  /** The button to show, or null when there is nothing to press. */
  action: { label: string; primary: boolean; confirm?: string } | null;
  note: string | null;
};

/** What each plan card offers, given the hostel's plan and listing status. Same rules as the website's plan page. */
export function planChoices(info: Pick<OwnerPlanInfo, 'plan' | 'partnerStatus'>, hostelStatus: Hostel['status']): PlanChoice[] {
  const current = info.plan?.plan ?? 'free';
  const pending = !!info.plan?.pendingPlan;
  return OWNER_PLAN_TIERS.map((tier) => {
    const isCurrent = tier === current;
    const rejectedNote = tier === 'partner' && info.partnerStatus === 'rejected' ? "A previous application wasn't approved. You can apply again." : null;
    if (tier === 'partner' && info.partnerStatus === 'applied') {
      return { tier, current: isCurrent, action: null, note: "Application in review. We'll call you to schedule a visit." };
    }
    if (tier === 'partner' && !isCurrent && hostelStatus !== 'live') {
      return { tier, current: isCurrent, action: null, note: 'You can apply once your listing is live.' };
    }
    if (isCurrent && !pending) return { tier, current: true, action: null, note: rejectedNote };
    const label = isCurrent ? 'Keep this plan' : tier === 'partner' ? 'Apply to become a partner' : `Switch to ${tier === 'pro' ? 'Pro' : 'Free'}`;
    return {
      tier,
      current: isCurrent,
      action: {
        label,
        primary: RANK[tier] > RANK[current],
        confirm: tier === 'free' && !isCurrent ? 'Downgrade to Free? Paid features stop at the end of the period.' : undefined,
      },
      note: rejectedNote,
    };
  });
}

export const planChangedMessage = (tier: OwnerPlanTier) =>
  tier === 'partner' ? 'Partner application sent. Our team will call you to schedule a visit.' : 'Plan updated';

// ---------------------------------------------------------------------------
// The listing form

export const COMMON_AMENITIES = ['WiFi', 'AC', 'Hot water', 'Laundry', 'Housekeeping', 'Power backup', 'CCTV', 'Parking', 'Gym', 'Study room', 'RO water', 'Lift'];
export const HYDERABAD = { lat: 17.4435, lng: 78.3772 };

export type HostelDraft = {
  name: string;
  genderType: GenderType;
  area: string;
  address: string;
  contactPhone: string;
  whatsappPhone: string;
  description: string;
  lat: number;
  lng: number;
  amenities: string[];
  moreAmenities: string;
  foodAvailable: boolean;
  rules: string;
};

/** Splits a text box on new lines and commas, dropping blanks. */
export const splitList = (v: string) => v.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);

export function draftFromHostel(h?: Hostel | null): HostelDraft {
  return {
    name: h?.name ?? '',
    genderType: h?.genderType ?? 'boys',
    area: h?.area ?? '',
    address: h?.address ?? '',
    contactPhone: h?.contactPhone ?? '',
    whatsappPhone: h?.whatsappPhone ?? '',
    description: h?.description ?? '',
    lat: h?.lat ?? HYDERABAD.lat,
    lng: h?.lng ?? HYDERABAD.lng,
    amenities: (h?.amenities ?? []).filter((a) => COMMON_AMENITIES.includes(a)),
    moreAmenities: (h?.amenities ?? []).filter((a) => !COMMON_AMENITIES.includes(a)).join(', '),
    foodAvailable: h?.foodAvailable ?? true,
    rules: (h?.rules ?? []).join('\n'),
  };
}

const FIELD_LABEL: Record<string, string> = {
  name: 'Hostel name',
  area: 'Area',
  address: 'Street address',
  contactPhone: 'Contact phone',
  whatsappPhone: 'WhatsApp number',
  description: 'Description',
  lat: 'Map pin',
  lng: 'Map pin',
  amenities: 'Amenities',
  rules: 'House rules',
  phone: 'Phone',
  monthlyRent: 'Rent',
  startDate: 'Since',
  amountPaid: 'Amount paid',
  paidOn: 'Paid on',
  note: 'Note',
};

type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

function firstIssue(issues: { path: PropertyKey[]; message: string }[]): string {
  const i = issues[0];
  if (!i) return 'Check the form';
  const label = FIELD_LABEL[String(i.path[0])];
  return label ? `${label}: ${i.message}` : i.message;
}

/** Checks the form with the same schema the API uses, so mistakes show before sending. */
export function draftToInput(d: HostelDraft): Checked<HostelInput> {
  const input: HostelInput = {
    name: d.name,
    description: d.description,
    area: d.area,
    address: d.address,
    lat: Number(d.lat.toFixed(6)),
    lng: Number(d.lng.toFixed(6)),
    genderType: d.genderType,
    amenities: [...new Set([...d.amenities, ...splitList(d.moreAmenities)])],
    rules: splitList(d.rules),
    contactPhone: d.contactPhone,
    whatsappPhone: d.whatsappPhone.trim() || null,
    foodAvailable: d.foodAvailable,
  };
  const parsed = hostelInputSchema.safeParse(input);
  return parsed.success ? { ok: true, value: input } : { ok: false, error: firstIssue(parsed.error.issues) };
}

/** What a draft or rejected listing still needs before it can be sent for review. */
export function missingForSubmit(h: { roomTypes: unknown[]; photos: unknown[] }): string[] {
  return [!h.roomTypes.length && 'a room type', !h.photos.length && 'a photo'].filter((s): s is string => !!s);
}

/** Photo order with `coverId` first; the API treats the first photo as the cover. */
export const coverOrder = (photoIds: string[], coverId: string) => [coverId, ...photoIds.filter((p) => p !== coverId)];

/** A coordinate typed by hand, or null when it is not a number in range. */
export function parseCoord(v: string, kind: 'lat' | 'lng'): number | null {
  const n = Number(v.trim());
  if (!v.trim() || !Number.isFinite(n)) return null;
  const max = kind === 'lat' ? 90 : 180;
  return Math.abs(n) <= max ? n : null;
}

/** File name and type for a picked photo. The API sniffs the bytes, but multipart needs both. */
export function photoPart(asset: { uri: string; mimeType?: string | null; fileName?: string | null }): { name: string; type: string } {
  const fromName = /\.(jpe?g|png|webp|heic)$/i.exec(asset.fileName ?? asset.uri.split('?')[0] ?? '')?.[1]?.toLowerCase();
  const ext = asset.mimeType?.startsWith('image/') ? asset.mimeType.slice(6).replace('jpeg', 'jpg') : fromName?.replace('jpeg', 'jpg') ?? 'jpg';
  const type = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  const name = asset.fileName && /\.\w+$/.test(asset.fileName) ? asset.fileName : `photo.${ext}`;
  return { name, type };
}

// ---------------------------------------------------------------------------
// Rooms

export type RoomDraft = { monthlyRent: string; advanceAmount: string; totalBeds: string; bedsAvailable: string };

/** Whole numbers from room fields, or an error the owner can act on. */
export function roomNumbers(d: RoomDraft): Checked<{ monthlyRent: number; advanceAmount: number; totalBeds: number; bedsAvailable: number }> {
  const n = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : Number.NaN);
  const value = { monthlyRent: n(d.monthlyRent), advanceAmount: d.advanceAmount.trim() ? n(d.advanceAmount) : 0, totalBeds: n(d.totalBeds), bedsAvailable: n(d.bedsAvailable) };
  if (Number.isNaN(value.monthlyRent)) return { ok: false, error: 'Enter the monthly rent in rupees' };
  if (Number.isNaN(value.advanceAmount)) return { ok: false, error: 'Advance must be a whole number' };
  if (Number.isNaN(value.totalBeds) || value.totalBeds < 1) return { ok: false, error: 'Total beds must be at least 1' };
  if (Number.isNaN(value.bedsAvailable)) return { ok: false, error: 'Enter the free beds' };
  if (value.bedsAvailable > value.totalBeds) return { ok: false, error: 'Beds free cannot exceed total beds' };
  return { ok: true, value };
}

// ---------------------------------------------------------------------------
// Residents and rent

export function checkResident(input: ResidentInput): Checked<ResidentInput> {
  const parsed = residentInputSchema.safeParse(input);
  return parsed.success ? { ok: true, value: input } : { ok: false, error: firstIssue(parsed.error.issues) };
}

export type RentDraft = { amountPaid: string; paidOn: string; method: RentMethod; note: string };

/** Starting values for a rent row: what was recorded, or the full amount paid today by UPI. */
export function rentDraft(row: RentSheet['rows'][number], today: string): RentDraft {
  return { amountPaid: String(row.amountPaid || row.amountDue), paidOn: row.paidOn ?? today, method: row.method ?? 'upi', note: row.note };
}

export function rentInput(d: RentDraft, month: string): Checked<RentRecordInput> {
  const input: RentRecordInput = {
    month,
    amountPaid: /^\d+$/.test(d.amountPaid.trim()) ? Number(d.amountPaid.trim()) : Number.NaN,
    paidOn: d.paidOn.trim() || null,
    method: d.method,
    note: d.note,
  };
  if (Number.isNaN(input.amountPaid)) return { ok: false, error: 'Amount paid must be a whole number' };
  const parsed = rentRecordSchema.safeParse(input);
  return parsed.success ? { ok: true, value: input } : { ok: false, error: firstIssue(parsed.error.issues) };
}

/** `YYYY-MM` moved by whole months. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const t = y * 12 + (m - 1) + delta;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

/** The month before the one containing `today`; admin payouts default to it because it has closed. */
export const lastMonth = (today: string) => shiftMonth(monthOf(today), -1);

export const isDate = (v: string) => isValidDate(v.trim());

// ---------------------------------------------------------------------------
// Issues

export const OWNER_NEXT: Record<IssueStatus, IssueStatus[]> = {
  open: ['acknowledged', 'in_progress', 'resolved'],
  acknowledged: ['in_progress', 'resolved'],
  in_progress: ['resolved'],
  resolved: [],
  closed: [],
};

export const MOVE_LABEL: Record<IssueStatus, string> = {
  open: 'Reopen',
  acknowledged: 'Acknowledge',
  in_progress: 'Start work',
  resolved: 'Mark resolved',
  closed: 'Close',
};

const isDone = (s: IssueStatus) => s === 'resolved' || s === 'closed';

export function splitIssues<T extends Pick<IssueView, 'status'>>(issues: T[]): { open: T[]; done: T[] } {
  return { open: issues.filter((i) => !isDone(i.status)), done: issues.filter((i) => isDone(i.status)) };
}

/** Issues grouped by hostel, in the order the hostels are listed, for the owner's all-issues screen. */
export function issuesByHostel<T extends Pick<IssueView, 'hostelId'>>(issues: T[], hostels: { id: string; name: string }[]) {
  const ids = [...new Set(issues.map((i) => i.hostelId))];
  const order = new Map(hostels.map((h, n) => [h.id, n]));
  ids.sort((a, b) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9));
  return ids.map((id) => ({ hostelId: id, name: hostels.find((h) => h.id === id)?.name ?? 'Hostel', issues: issues.filter((i) => i.hostelId === id) }));
}

// ---------------------------------------------------------------------------
// Dashboard

export function dashboardStats(
  hostels: { status: string; roomTypes: { bedsAvailable: number }[] }[],
  newVisits: number,
  issues: Pick<IssueView, 'status' | 'needsResponse'>[],
) {
  const open = splitIssues(issues).open;
  return {
    hostels: hostels.length,
    live: hostels.filter((h) => h.status === 'live').length,
    freeBeds: hostels.reduce((n, h) => n + h.roomTypes.reduce((m, r) => m + r.bedsAvailable, 0), 0),
    newVisits,
    openIssues: open.length,
    waiting: open.filter((i) => i.needsResponse).length,
  };
}

export const minRent = (rooms: { monthlyRent: number }[]) => (rooms.length ? Math.min(...rooms.map((r) => r.monthlyRent)) : null);

// ---------------------------------------------------------------------------
// Weekly menu

export type MenuSlot = { date: string; meal: Meal; vegDish: string; nonVegDish: string; foodPartnerId: string | null };

/** All 21 slots of a week (Monday first), filled from the saved menu where it has a dish. */
export function menuGrid(week: string, menu: MenuWeek | null): MenuSlot[] {
  return Array.from({ length: 7 }, (_, i) => addDays(week, i)).flatMap((date) =>
    MEALS.map((meal) => {
      const it = menu?.items.find((x) => x.date === date && x.meal === meal);
      return { date, meal, vegDish: it?.vegDish ?? '', nonVegDish: it?.nonVegDish ?? '', foodPartnerId: it?.foodPartnerId ?? null };
    }),
  );
}

/** Slots with a veg dish become menu items; an empty veg dish means the meal is not served. */
export function menuItems(grid: MenuSlot[]): MenuWeekInput['items'] {
  return grid
    .filter((s) => s.vegDish.trim())
    .map((s) => ({ date: s.date, meal: s.meal, vegDish: s.vegDish.trim(), nonVegDish: s.nonVegDish.trim() || null, foodPartnerId: s.foodPartnerId }));
}

// ---------------------------------------------------------------------------
// Misc

export const phoneLink = (p: string) => `tel:+91${p}`;
export const whatsappLink = (p: string, text: string) => `https://wa.me/91${p}?text=${encodeURIComponent(text)}`;

/** Fee in rupees on a given rent, for the admin's fee preview. */
export const feeOn = (rent: number, pct: number) => Math.round((rent * pct) / 100);

/** Platform fee typed by an admin: 0–50, in steps of 0.5. */
export function parseFee(v: string): number | null {
  const n = Number(v.trim());
  if (!v.trim() || !Number.isFinite(n) || n < 0 || n > 50 || Math.round(n * 2) !== n * 2) return null;
  return n;
}
