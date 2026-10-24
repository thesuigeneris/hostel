import { addDays, istDate, MEALS, newId, weekStart } from '@hostels/shared';
import { sql } from 'drizzle-orm';
import { closeDb, type DB, getDb, schema } from './index';
import { runMigrations } from './migrate';
import { DEMO_PHONES, EXTRA_OWNERS, FOOD_PARTNERS, HOSTELS, PHOTOS, RULES, THEMES } from './seed-data';

export const ALL_TABLES = [
  'payouts',
  'move_requests',
  'meal_skips',
  'invoices',
  'subscriptions',
  'menu_items',
  'menu_weeks',
  'food_partners',
  'visit_requests',
  'room_types',
  'hostel_photos',
  'hostels',
  'sessions',
  'otp_codes',
  'users',
];

export async function truncateAll(db: DB) {
  await db.execute(sql.raw(`truncate table ${ALL_TABLES.map((t) => `"${t}"`).join(', ')} cascade`));
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Dev seed: Hyderabad hostels, food partners, two weeks of menus and the demo logins. */
export async function seed(db: DB, today = istDate()) {
  const adminId = newId('usr');
  const ownerId = newId('usr');
  await db.insert(schema.users).values([
    { id: adminId, phone: DEMO_PHONES.admin, name: 'Demo Admin', role: 'admin' },
    { id: ownerId, phone: DEMO_PHONES.owner, name: 'Demo Owner', role: 'owner', email: 'owner@example.com' },
    { id: newId('usr'), phone: DEMO_PHONES.tenant, name: 'Demo Tenant', role: 'tenant' },
  ]);
  const extraOwnerIds = EXTRA_OWNERS.map(() => newId('usr'));
  await db.insert(schema.users).values(EXTRA_OWNERS.map((o, i) => ({ id: extraOwnerIds[i]!, phone: o.phone, name: o.name, role: 'owner' as const })));

  const partners = FOOD_PARTNERS.map((p) => ({ id: newId('fdp'), name: p.name, cuisine: p.cuisine, active: true }));
  await db.insert(schema.foodPartners).values(partners);
  const partnerId = (name?: string) => (name ? (partners.find((p) => p.name === name)?.id ?? null) : null);

  const thisWeek = weekStart(today);
  const weeks = [thisWeek, addDays(thisWeek, 7)];

  let photoCursor = 0;
  let partnerIndex = 0;
  for (const h of HOSTELS) {
    const hostelId = newId('hst');
    const owner = h.owner === undefined ? ownerId : extraOwnerIds[h.owner]!;
    const contact = h.owner === undefined ? DEMO_PHONES.owner : EXTRA_OWNERS[h.owner]!.phone;
    await db.insert(schema.hostels).values({
      id: hostelId,
      ownerId: owner,
      slug: slugify(`${h.name} ${h.name.toLowerCase().includes(h.area.toLowerCase()) ? '' : h.area}`),
      name: h.name,
      description: h.description,
      city: 'Hyderabad',
      area: h.area,
      address: `${h.address}, Hyderabad`,
      lat: h.lat,
      lng: h.lng,
      genderType: h.genderType,
      amenities: h.amenities,
      rules: RULES,
      contactPhone: contact,
      whatsappPhone: contact,
      foodAvailable: h.foodAvailable,
      status: 'live',
      partnerStatus: h.partner ? 'verified' : 'none',
      platformFeePct: 10,
    });
    await db.insert(schema.hostelPhotos).values(
      [0, 1, 2].map((i) => ({ id: newId('pho'), hostelId, url: PHOTOS[(photoCursor + i) % PHOTOS.length]!, sortOrder: i })),
    );
    photoCursor += 1;
    await db.insert(schema.roomTypes).values(
      h.rooms.map((r) => ({
        id: newId('rmt'),
        hostelId,
        sharing: r.sharing,
        monthlyRent: r.rent,
        advanceAmount: h.partner ? 0 : r.advance,
        totalBeds: r.beds,
        bedsAvailable: r.free,
      })),
    );

    if (!h.partner) continue;
    for (const [w, start] of weeks.entries()) {
      const menu = THEMES[(partnerIndex + w) % THEMES.length]!;
      const menuWeekId = newId('mnw');
      await db.insert(schema.menuWeeks).values({ id: menuWeekId, hostelId, weekStart: start, theme: menu.theme });
      await db.insert(schema.menuItems).values(
        menu.days.flatMap((day, d) =>
          MEALS.map((meal) => ({
            id: newId('mni'),
            menuWeekId,
            date: addDays(start, d),
            meal,
            vegDish: day[meal].veg,
            nonVegDish: day[meal].nonVeg ?? null,
            foodPartnerId: partnerId(day[meal].partner),
          })),
        ),
      );
    }
    partnerIndex += 1;
  }
}

if (import.meta.main) {
  const reset = process.argv.includes('--reset');
  await runMigrations();
  const db = getDb();
  const [{ count }] = (await db.execute(sql`select count(*)::int as count from users`)) as unknown as [{ count: number }];
  if (count > 0 && !reset) {
    console.log('database already has data; run `bun run db:reset` to wipe and reseed');
  } else {
    if (reset) await truncateAll(db);
    await seed(db);
    console.log('seeded: 12 hostels (6 verified partners), 4 food partners, 2 weeks of menus');
    console.log(`logins (OTP 123456): admin ${DEMO_PHONES.admin}, owner ${DEMO_PHONES.owner}, tenant ${DEMO_PHONES.tenant}`);
  }
  await closeDb();
}
