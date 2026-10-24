import {
  addDays,
  addMonths,
  billingPeriod,
  computeBill,
  type Diet,
  istDate,
  istInstant,
  type MealPlan,
  MEALS,
  newId,
  OWNER_PLANS,
  planIncludesMeal,
  SKIP_CREDITS,
  weekStart,
} from '@hostels/shared';
import { getTableName, is, sql } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { closeDb, type DB, getDb, schema } from './index';
import { runMigrations } from './migrate';
import { DEMO_PHONES, EXTRA_OWNERS, FOOD_PARTNERS, HOSTELS, PHOTOS, RULES, THEMES } from './seed-data';

/** Every table in the schema, derived from it so a new table can never be missed by a reset. */
export const ALL_TABLES = (Object.values(schema) as unknown[])
  .filter((t): t is PgTable => is(t, PgTable))
  .map((t) => getTableName(t));

export async function truncateAll(db: DB) {
  await db.execute(sql.raw(`truncate table ${ALL_TABLES.map((t) => `"${t}"`).join(', ')} cascade`));
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const RESIDENT_NAMES = [
  'Arjun Reddy', 'Priya Sharma', 'Karthik Rao', 'Sneha Iyer', 'Rahul Verma', 'Ananya Gupta', 'Vikram Naidu',
  'Divya Menon', 'Siddharth Jain', 'Meera Pillai', 'Aditya Kulkarni', 'Neha Joshi', 'Rohan Das', 'Kavya Nair',
];

const REVIEW_TEXTS = [
  'Clean rooms and the food actually changes every week. Owner fixes things within a day.',
  'Good location, WiFi is fast enough for work calls. Breakfast could be warmer.',
  'Safe building with biometric entry. Housekeeping comes daily. Would recommend.',
  'Value for money. Dinner on weekends is the best part. Water pressure is low on the top floor.',
  'Lived here four months; switching rooms was easy and nobody asked for an advance.',
  'Friendly staff and quiet at night. Laundry turnaround is slow during weekdays.',
];

/** Dev seed: Hyderabad hostels, plans, menus, residents with history, and the demo logins. */
export async function seed(db: DB, today = istDate()) {
  await seedData(db, today);
  // Everyone the seed creates is a demo person: they can sign in on dev and demo instances only (PRP-01).
  await db.execute(sql`update users set is_demo = true, phone_verified_at = coalesce(phone_verified_at, created_at)`);
}

/** Refuses to wipe a database that may hold real users. Demo instances reset freely. */
export function assertResetAllowed(nodeEnv = process.env.NODE_ENV, appMode = process.env.APP_MODE) {
  if (nodeEnv === 'production' && appMode !== 'demo') {
    throw new Error('Refusing to reset: NODE_ENV=production on a standard instance. Resets are only for dev, test and APP_MODE=demo.');
  }
}

async function seedData(db: DB, today: string) {
  const adminId = newId('usr');
  const ownerId = newId('usr');
  const tenantId = newId('usr');
  await db.insert(schema.users).values([
    { id: adminId, phone: DEMO_PHONES.admin, name: 'Demo Admin', role: 'admin' },
    { id: ownerId, phone: DEMO_PHONES.owner, name: 'Demo Owner', role: 'owner', email: 'owner@example.com' },
    { id: tenantId, phone: DEMO_PHONES.tenant, name: 'Demo Tenant', role: 'tenant' },
  ]);
  const extraOwnerIds = EXTRA_OWNERS.map(() => newId('usr'));
  await db.insert(schema.users).values(EXTRA_OWNERS.map((o, i) => ({ id: extraOwnerIds[i]!, phone: o.phone, name: o.name, role: 'owner' as const })));

  const partners = FOOD_PARTNERS.map((p) => ({ id: newId('fdp'), name: p.name, cuisine: p.cuisine, active: true }));
  await db.insert(schema.foodPartners).values(partners);
  const partnerId = (name?: string) => (name ? (partners.find((p) => p.name === name)?.id ?? null) : null);

  const thisWeek = weekStart(today);
  const weeks = [thisWeek, addDays(thisWeek, 7)];
  const created: { id: string; partner: boolean; foodAvailable: boolean; rooms: (typeof schema.roomTypes.$inferInsert)[] }[] = [];

  let photoCursor = 0;
  let partnerIndex = 0;
  let freeIndex = 0;
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
    // Partners are on the Partner plan; every other free listing is on Pro so the management app has data.
    const plan = h.partner ? 'partner' : freeIndex++ % 2 === 0 ? 'pro' : 'free';
    const ownerPlanId = newId('opl');
    const planStart = addMonths(today, -2);
    await db.insert(schema.ownerPlans).values({
      id: ownerPlanId,
      hostelId,
      plan,
      startDate: planStart,
      trialEndsOn: plan === 'free' ? null : addMonths(today, -1),
    });
    if (plan !== 'free') {
      // The month after the trial is already paid, so the demo hostels start in good standing.
      const p = billingPeriod(planStart, 1);
      await db.insert(schema.ownerInvoices).values({
        id: newId('oin'),
        ownerPlanId,
        hostelId,
        ownerId: owner,
        plan,
        periodStart: p.start,
        periodEnd: p.end,
        amount: OWNER_PLANS[plan].price,
        dueDate: p.start,
        status: 'paid',
        razorpayPaymentId: `pay_seed_${hostelId.slice(4)}`,
        paidAt: istInstant(p.start, 10),
      });
    }
    await db.insert(schema.hostelPhotos).values(
      [0, 1, 2].map((i) => ({ id: newId('pho'), hostelId, url: PHOTOS[(photoCursor + i) % PHOTOS.length]!, sortOrder: i })),
    );
    photoCursor += 1;
    const rooms = h.rooms.map((r) => ({
      id: newId('rmt'),
      hostelId,
      sharing: r.sharing,
      monthlyRent: r.rent,
      advanceAmount: h.partner ? 0 : r.advance,
      totalBeds: r.beds,
      bedsAvailable: r.free,
      // The demo's bed counts are written on the seed day, so that is when they were last updated.
      bedsUpdatedAt: istInstant(today, 0),
    }));
    await db.insert(schema.roomTypes).values(rooms);
    created.push({ id: hostelId, partner: h.partner, foodAvailable: h.foodAvailable, rooms });

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

  await seedResidents(db, today, { tenantId, ownerId, hostels: created });
}

type SeededHostel = { id: string; partner: boolean; foodAvailable: boolean; rooms: (typeof schema.roomTypes.$inferInsert)[] };

/**
 * Subscribers at partner hostels (the demo tenant among them), past residents with verified reviews,
 * a few issues and community posts, and owner-added residents with a rent sheet at a Pro hostel.
 * Beds already reflect these residents: the seeded beds-free counts are what remains.
 */
async function seedResidents(db: DB, today: string, ctx: { tenantId: string; ownerId: string; hostels: SeededHostel[] }) {
  const partnerHostels = ctx.hostels.filter((h) => h.partner);
  const userIds: string[] = [];
  const users = RESIDENT_NAMES.map((name, i) => {
    const id = newId('usr');
    userIds.push(id);
    return { id, phone: `90000001${String(i).padStart(2, '0')}`, name, role: 'tenant' as const };
  });
  await db.insert(schema.users).values(users);

  const subscribeAt = async (opts: { userId: string; phone: string; name: string; hostel: SeededHostel; start: string; end?: string; plan: MealPlan; diet: Diet }) => {
    const room = opts.hostel.rooms[0]!;
    const subId = newId('sub');
    const ended = !!opts.end;
    await db.insert(schema.subscriptions).values({
      id: subId,
      userId: opts.userId,
      hostelId: opts.hostel.id,
      roomTypeId: room.id,
      mealPlan: opts.plan,
      diet: opts.diet,
      status: ended ? 'ended' : 'active',
      startDate: opts.start,
      cancelAt: opts.end ?? null,
    });
    // Every period that has started is billed and paid.
    for (let n = 0; billingPeriod(opts.start, n).start <= (opts.end ?? today); n++) {
      const p = billingPeriod(opts.start, n);
      await db.insert(schema.invoices).values({
        id: newId('inv'),
        subscriptionId: subId,
        userId: opts.userId,
        hostelId: opts.hostel.id,
        periodStart: p.start,
        periodEnd: p.end,
        ...computeBill({ rent: room.monthlyRent, mealPlan: opts.plan, skipCredits: n === 0 ? 0 : 130 }),
        status: 'paid',
        dueDate: p.start,
        razorpayOrderId: `order_seed_${newId('inv').slice(4)}`,
        razorpayPaymentId: `pay_seed_${newId('inv').slice(4)}`,
        paidAt: istInstant(addDays(p.start, -2), 11),
      });
    }
    const residencyId = newId('res');
    await db.insert(schema.residencies).values({
      id: residencyId,
      userId: opts.userId,
      phone: opts.phone,
      name: opts.name,
      hostelId: opts.hostel.id,
      roomTypeId: room.id,
      source: 'subscription',
      subscriptionId: subId,
      startDate: opts.start,
      endDate: opts.end ?? null,
      status: ended ? 'ended' : 'active',
      directoryOptIn: true,
    });
    return { subId, residencyId };
  };

  // The demo tenant: three weeks into a full-board plan at the first partner hostel.
  const home = partnerHostels[0]!;
  const demo = await subscribeAt({
    userId: ctx.tenantId,
    phone: DEMO_PHONES.tenant,
    name: 'Demo Tenant',
    hostel: home,
    start: addDays(today, -21),
    plan: 'full',
    diet: 'non-veg',
  });

  // Current subscribers spread over the partner hostels (6), with tomorrow's skips for headcount.
  const current = users.slice(0, 6);
  for (const [i, u] of current.entries()) {
    const plan: MealPlan = i % 3 === 2 ? 'two-meals' : 'full';
    const s = await subscribeAt({
      userId: u.id,
      phone: u.phone,
      name: u.name,
      hostel: i < 3 ? home : partnerHostels[i % partnerHostels.length]!,
      start: addDays(today, -(30 + i * 9)),
      plan,
      diet: i % 2 === 0 ? 'veg' : 'non-veg',
    });
    const tomorrow = addDays(today, 1);
    const meal = MEALS[i % 3]!;
    if (planIncludesMeal(plan, meal)) {
      await db.insert(schema.mealSkips).values({ id: newId('skp'), subscriptionId: s.subId, date: tomorrow, meal, creditAmount: SKIP_CREDITS[meal] });
    }
  }

  // Past residents who left verified reviews.
  const past = users.slice(6, 12);
  for (const [i, u] of past.entries()) {
    const hostel = partnerHostels[i % partnerHostels.length]!;
    const start = addMonths(today, -(8 + i));
    const end = addDays(addMonths(start, 4), -1);
    const s = await subscribeAt({ userId: u.id, phone: u.phone, name: u.name, hostel, start, end, plan: 'full', diet: 'veg' });
    const rating = [5, 4, 4, 5, 3, 4][i]!;
    await db.insert(schema.reviews).values({
      id: newId('rev'),
      hostelId: hostel.id,
      userId: u.id,
      residencyId: s.residencyId,
      rating,
      cleanliness: Math.min(5, rating + (i % 2)),
      food: hostel.foodAvailable ? rating : null,
      safety: 5,
      responsiveness: Math.max(3, rating - (i % 2)),
      body: REVIEW_TEXTS[i]!,
      ownerReply: i % 2 === 0 ? 'Thank you for staying with us! Hope to see you again.' : null,
      ownerRepliedAt: i % 2 === 0 ? istInstant(addDays(end, 2), 10) : null,
      createdAt: istInstant(addDays(end, -10), 19),
      updatedAt: istInstant(addDays(end, -10), 19),
    });
  }

  // Issues at the demo tenant's hostel, in every state.
  const issueRows = [
    { reporter: ctx.tenantId, residencyId: demo.residencyId, category: 'wifi' as const, title: 'WiFi drops on the 3rd floor every evening', status: 'in_progress' as const, ageDays: 3 },
    { reporter: current[0]!.id, residencyId: null, category: 'water' as const, title: 'No hot water in bathroom 2B', status: 'resolved' as const, ageDays: 6 },
    { reporter: current[1]!.id, residencyId: null, category: 'cleanliness' as const, title: 'Common area not cleaned on Sunday', status: 'closed' as const, ageDays: 12 },
    { reporter: current[2]!.id, residencyId: null, category: 'maintenance' as const, title: 'Fan regulator broken in room 204', status: 'open' as const, ageDays: 3 },
  ];
  const residencyOf = async (userId: string) =>
    (await db.select().from(schema.residencies).where(sql`${schema.residencies.userId} = ${userId} and ${schema.residencies.status} = 'active'`))[0]!.id;
  for (const row of issueRows) {
    const created = istInstant(addDays(today, -row.ageDays), 20);
    const hours = (h: number) => new Date(created.getTime() + h * 3600_000);
    const issueId = newId('iss');
    await db.insert(schema.issues).values({
      id: issueId,
      hostelId: home.id,
      reporterId: row.reporter,
      residencyId: row.residencyId ?? (await residencyOf(row.reporter)),
      category: row.category,
      title: row.title,
      description: 'Reported from the resident app.',
      status: row.status,
      createdAt: created,
      acknowledgedAt: row.status === 'open' ? null : hours(3),
      resolvedAt: row.status === 'resolved' || row.status === 'closed' ? hours(30) : null,
      closedAt: row.status === 'closed' ? hours(40) : null,
    });
    if (row.status !== 'open') {
      await db.insert(schema.issueUpdates).values({
        id: newId('isu'),
        issueId,
        authorId: ctx.ownerId,
        message: 'Thanks for reporting. Our technician will check it today.',
        fromStatus: 'open',
        toStatus: 'acknowledged',
        createdAt: hours(3),
      });
    }
  }

  await db.insert(schema.communityPosts).values([
    { id: newId('pst'), hostelId: home.id, authorId: ctx.ownerId, kind: 'announcement', body: 'Water tank cleaning on Sunday 10 am to 1 pm. Please store water the night before.', pinned: true },
    { id: newId('pst'), hostelId: home.id, authorId: current[0]!.id, kind: 'event', body: 'Cricket at the ground behind the building this Saturday 7 am. Anyone in?' },
    { id: newId('pst'), hostelId: home.id, authorId: ctx.tenantId, kind: 'food', body: 'The Hyderabadi biryani on Saturday was great. Can we get it every week?' },
  ]);

  // Owner-added residents at the first Pro free listing, with this month's rent half collected.
  const proHostel = ctx.hostels.filter((h) => !h.partner)[0]!;
  const month = today.slice(0, 7);
  for (const [i, u] of users.slice(12).entries()) {
    const residencyId = newId('res');
    await db.insert(schema.residencies).values({
      id: residencyId,
      userId: u.id,
      phone: u.phone,
      name: u.name,
      hostelId: proHostel.id,
      roomTypeId: proHostel.rooms[0]!.id,
      source: 'owner',
      monthlyRent: proHostel.rooms[0]!.monthlyRent,
      startDate: addMonths(today, -3),
      status: 'active',
    });
    if (i === 0) {
      await db.insert(schema.rentRecords).values({
        id: newId('rnt'),
        residencyId,
        month,
        amountDue: proHostel.rooms[0]!.monthlyRent,
        amountPaid: proHostel.rooms[0]!.monthlyRent,
        paidOn: `${month}-03`,
        method: 'upi',
      });
    }
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
    if (reset) {
      assertResetAllowed();
      await truncateAll(db);
    }
    await seed(db);
    console.log('seeded: 12 hostels (6 verified partners), owner plans, menus, residents, reviews, issues');
    console.log(`demo logins (dev or APP_MODE=demo; OTP 123456 in dev): admin ${DEMO_PHONES.admin}, owner ${DEMO_PHONES.owner}, tenant ${DEMO_PHONES.tenant}`);
    console.log('more tenants: 9000000100 to 9000000113');
  }
  await closeDb();
}
