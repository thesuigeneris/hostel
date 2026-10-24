import { describe, expect, test } from 'bun:test';
import type { Hostel, MenuWeek, OwnerPlanInfo } from '@hostels/shared';
import {
  coverOrder,
  dashboardStats,
  draftFromHostel,
  draftToInput,
  feeOn,
  HOSTEL_SECTIONS,
  hasPlan,
  issuesByHostel,
  lastMonth,
  menuGrid,
  menuItems,
  missingForSubmit,
  OWNER_NEXT,
  parseCoord,
  parseFee,
  photoPart,
  planChoices,
  rentDraft,
  rentInput,
  roomNumbers,
  sectionLocked,
  shiftMonth,
  splitIssues,
} from '../lib/owner';

const hostel: Hostel = {
  id: 'hst_1', ownerId: 'usr_1', slug: 'sai', name: 'Sri Sai Comforts', description: 'Near the gate', city: 'Hyderabad', area: 'Gachibowli',
  address: 'Plot 12', lat: 17.44, lng: 78.35, genderType: 'boys', amenities: ['WiFi', 'Terrace'], rules: ['Gate closes at 11 pm'],
  contactPhone: '9876543210', whatsappPhone: null, foodAvailable: true, status: 'draft', partnerStatus: 'none', platformFeePct: 10,
  rejectionReason: null, createdAt: '2026-10-01T00:00:00Z',
};

describe('plans and sections', () => {
  test('plan rank gates features', () => {
    expect(hasPlan('free', 'pro')).toBe(false);
    expect(hasPlan('pro', 'pro')).toBe(true);
    expect(hasPlan('partner', 'pro')).toBe(true);
    expect(hasPlan('pro', 'partner')).toBe(false);
  });

  test('sections lock below their plan', () => {
    const locked = (p: 'free' | 'pro' | 'partner') => HOSTEL_SECTIONS.filter((s) => sectionLocked(s, p)).map((s) => s.path);
    expect(locked('free')).toEqual(['residents', 'rent', 'menu', 'kitchen']);
    expect(locked('pro')).toEqual(['menu', 'kitchen']);
    expect(locked('partner')).toEqual([]);
  });

  const info = (plan: OwnerPlanInfo['plan'], partnerStatus: OwnerPlanInfo['partnerStatus'] = 'none') => ({ plan, partnerStatus });
  const proPlan = { id: 'opl', hostelId: 'hst_1', plan: 'pro' as const, pendingPlan: null, pendingPlanOn: null, startDate: '2026-10-01', trialEndsOn: null, suspended: false };

  test('free hostel can switch to pro but must be live to apply for partner', () => {
    const [free, pro, partner] = planChoices(info(null), 'draft');
    expect(free).toMatchObject({ current: true, action: null });
    expect(pro!.action).toMatchObject({ label: 'Switch to Pro', primary: true });
    expect(partner).toMatchObject({ action: null, note: 'You can apply once your listing is live.' });
    expect(planChoices(info(null), 'live')[2]!.action!.label).toBe('Apply to become a partner');
  });

  test('downgrading asks for confirmation; a pending change offers to keep the plan', () => {
    const [free, pro] = planChoices(info(proPlan), 'live');
    expect(free!.action).toMatchObject({ label: 'Switch to Free', primary: false });
    expect(free!.action!.confirm).toContain('Downgrade');
    expect(pro!.action).toBeNull();
    const pending = planChoices(info({ ...proPlan, pendingPlan: 'free', pendingPlanOn: '2026-11-01' }), 'live');
    expect(pending[1]!.action!.label).toBe('Keep this plan');
  });

  test('partner application in review shows a note instead of a button', () => {
    expect(planChoices(info(proPlan, 'applied'), 'live')[2]).toMatchObject({ action: null, note: expect.stringContaining('in review') });
    expect(planChoices(info(proPlan, 'rejected'), 'live')[2]!.note).toContain("wasn't approved");
  });
});

describe('listing form', () => {
  test('round-trips a hostel, splitting known and other amenities', () => {
    const d = draftFromHostel(hostel);
    expect(d.amenities).toEqual(['WiFi']);
    expect(d.moreAmenities).toBe('Terrace');
    const r = draftToInput({ ...d, rules: 'Gate closes at 11 pm\nNo smoking', moreAmenities: 'Terrace, Rooftop' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.amenities).toEqual(['WiFi', 'Terrace', 'Rooftop']);
      expect(r.value.rules).toEqual(['Gate closes at 11 pm', 'No smoking']);
      expect(r.value.whatsappPhone).toBeNull();
    }
  });

  test('a new draft starts in Hyderabad and needs a name, area and phone', () => {
    const d = draftFromHostel();
    expect(d.lat).toBeCloseTo(17.4435);
    const r = draftToInput(d);
    expect(r).toEqual({ ok: false, error: expect.stringContaining('Hostel name') });
    const bad = draftToInput({ ...d, name: 'Sai PG', area: 'Kondapur', contactPhone: '12345' });
    expect(bad).toEqual({ ok: false, error: expect.stringContaining('Contact phone') });
    expect(draftToInput({ ...d, name: 'Sai PG', area: 'Kondapur', contactPhone: '+91 98765 43210' }).ok).toBe(true);
  });

  test('submit needs a room and a photo', () => {
    expect(missingForSubmit({ roomTypes: [], photos: [] })).toEqual(['a room type', 'a photo']);
    expect(missingForSubmit({ roomTypes: [1], photos: [1] })).toEqual([]);
  });

  test('cover goes first, others keep their order', () => {
    expect(coverOrder(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b']);
  });

  test('coordinates typed by hand', () => {
    expect(parseCoord('17.44', 'lat')).toBe(17.44);
    expect(parseCoord('91', 'lat')).toBeNull();
    expect(parseCoord('-179.9', 'lng')).toBe(-179.9);
    expect(parseCoord('abc', 'lng')).toBeNull();
    expect(parseCoord('', 'lat')).toBeNull();
  });

  test('photo parts get a name and an image type', () => {
    expect(photoPart({ uri: 'file:///x/IMG_1.JPG' })).toEqual({ name: 'photo.jpg', type: 'image/jpeg' });
    expect(photoPart({ uri: 'file:///x/a', mimeType: 'image/png', fileName: 'room.png' })).toEqual({ name: 'room.png', type: 'image/png' });
    expect(photoPart({ uri: 'blob:abc', mimeType: 'image/webp' })).toEqual({ name: 'photo.webp', type: 'image/webp' });
  });
});

describe('rooms, rent and months', () => {
  test('room numbers are validated like the API', () => {
    expect(roomNumbers({ monthlyRent: '9000', advanceAmount: '', totalBeds: '4', bedsAvailable: '2' })).toEqual({ ok: true, value: { monthlyRent: 9000, advanceAmount: 0, totalBeds: 4, bedsAvailable: 2 } });
    expect(roomNumbers({ monthlyRent: '9000', advanceAmount: '0', totalBeds: '2', bedsAvailable: '3' })).toEqual({ ok: false, error: 'Beds free cannot exceed total beds' });
    expect(roomNumbers({ monthlyRent: '9k', advanceAmount: '0', totalBeds: '2', bedsAvailable: '1' }).ok).toBe(false);
    expect(roomNumbers({ monthlyRent: '9000', advanceAmount: '0', totalBeds: '0', bedsAvailable: '0' }).ok).toBe(false);
  });

  test('rent rows default to paid in full today by UPI', () => {
    const row = { residencyId: 'res_1', name: 'Ravi', phone: '9876543210', amountDue: 8000, amountPaid: 0, paidOn: null, method: null, note: '', status: 'unpaid' as const };
    expect(rentDraft(row, '2026-10-24')).toEqual({ amountPaid: '8000', paidOn: '2026-10-24', method: 'upi', note: '' });
    expect(rentInput({ amountPaid: '8000', paidOn: '2026-10-24', method: 'cash', note: '' }, '2026-10')).toEqual({ ok: true, value: { month: '2026-10', amountPaid: 8000, paidOn: '2026-10-24', method: 'cash', note: '' } });
    expect(rentInput({ amountPaid: '8000', paidOn: '24/10/2026', method: 'cash', note: '' }, '2026-10')).toEqual({ ok: false, error: expect.stringContaining('Paid on') });
    expect(rentInput({ amountPaid: 'abc', paidOn: '', method: 'cash', note: '' }, '2026-10').ok).toBe(false);
  });

  test('months shift across years', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-05', 0)).toBe('2026-05');
    expect(lastMonth('2026-01-15')).toBe('2025-12');
  });

  test('platform fee', () => {
    expect(feeOn(10000, 10)).toBe(1000);
    expect(feeOn(9999, 12.5)).toBe(1250);
    expect(parseFee('12.5')).toBe(12.5);
    expect(parseFee('12.3')).toBeNull();
    expect(parseFee('60')).toBeNull();
    expect(parseFee('')).toBeNull();
  });
});

describe('issues and dashboard', () => {
  test('owners only move issues forward', () => {
    expect(OWNER_NEXT.open).toEqual(['acknowledged', 'in_progress', 'resolved']);
    expect(OWNER_NEXT.resolved).toEqual([]);
  });

  const issues = [
    { hostelId: 'h2', status: 'open' as const, needsResponse: true },
    { hostelId: 'h1', status: 'resolved' as const, needsResponse: false },
    { hostelId: 'h1', status: 'in_progress' as const, needsResponse: false },
  ];

  test('splits open from done and groups by hostel order', () => {
    const { open, done } = splitIssues(issues);
    expect(open).toHaveLength(2);
    expect(done).toHaveLength(1);
    const groups = issuesByHostel(issues, [{ id: 'h1', name: 'One' }, { id: 'h2', name: 'Two' }]);
    expect(groups.map((g) => [g.name, g.issues.length])).toEqual([['One', 2], ['Two', 1]]);
  });

  test('dashboard totals', () => {
    const hs = [{ status: 'live', roomTypes: [{ bedsAvailable: 2 }, { bedsAvailable: 3 }] }, { status: 'draft', roomTypes: [] }];
    expect(dashboardStats(hs, 4, issues)).toEqual({ hostels: 2, live: 1, freeBeds: 5, newVisits: 4, openIssues: 2, waiting: 1 });
  });
});

describe('weekly menu', () => {
  const menu: MenuWeek = {
    id: 'mnu', hostelId: 'hst_1', weekStart: '2026-10-19', theme: 'South Indian',
    items: [{ id: 'i1', menuWeekId: 'mnu', date: '2026-10-20', meal: 'lunch', vegDish: 'Sambar rice', nonVegDish: 'Chicken curry', foodPartnerId: null }],
  };

  test('grid has 21 slots filled from the saved menu', () => {
    const grid = menuGrid('2026-10-19', menu);
    expect(grid).toHaveLength(21);
    expect(grid[0]).toEqual({ date: '2026-10-19', meal: 'breakfast', vegDish: '', nonVegDish: '', foodPartnerId: null });
    expect(grid.find((s) => s.date === '2026-10-20' && s.meal === 'lunch')!.vegDish).toBe('Sambar rice');
    expect(grid[20]!.date).toBe('2026-10-25');
  });

  test('only slots with a veg dish are saved', () => {
    const grid = menuGrid('2026-10-19', menu);
    grid[0]!.vegDish = '  Idli ';
    grid[0]!.nonVegDish = ' ';
    expect(menuItems(grid)).toEqual([
      { date: '2026-10-19', meal: 'breakfast', vegDish: 'Idli', nonVegDish: null, foodPartnerId: null },
      { date: '2026-10-20', meal: 'lunch', vegDish: 'Sambar rice', nonVegDish: 'Chicken curry', foodPartnerId: null },
    ]);
  });
});
