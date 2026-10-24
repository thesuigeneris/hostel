import { and, eq, inArray } from 'drizzle-orm';
import { addDays, istDate, monthOf, newId, OWNER_PLAN_PRICING, type IssueCategory, type IssueSeverity, type IssueStatus } from '@hostels/shared';
import { db, schema } from './index';
import type { SeedCtx } from './seed-context';

const NAMES = [
  'Karthik Varma', 'Divya Nair', 'Rahul Sharma', 'Sneha Patil', 'Arjun Menon', 'Priya Iyer', 'Vikram Singh', 'Meera Joshi',
  'Aditya Rao', 'Kavya Reddy', 'Rohan Gupta', 'Ananya Das', 'Siddharth Jain', 'Pooja Kulkarni', 'Nikhil Bose', 'Ishita Kapoor',
  'Manoj Pillai', 'Shreya Ghosh', 'Harsha Vardhan', 'Neha Agarwal', 'Tarun Mishra', 'Swathi Rao', 'Abhishek Yadav', 'Lavanya Krishnan',
  'Sameer Khan', 'Tanvi Shah', 'Gautam Hegde', 'Ritu Saxena', 'Pranav Desai', 'Bhavana Reddy', 'Varun Chandra', 'Deepika Murthy',
  'Kunal Mehta', 'Anjali Verma', 'Suresh Babu', 'Nandini Rao', 'Yash Malhotra', 'Keerthi Prasad', 'Imran Ali', 'Sowmya Shetty',
];

type ReviewSeed = { overall: number; food: number; cleanliness: number; safety: number; value: number; staff: number; title: string; body: string; reply?: string };
const REVIEWS: ReviewSeed[] = [
  { overall: 5, food: 5, cleanliness: 5, safety: 5, value: 4, staff: 5, title: 'Feels like home, food is the highlight', body: 'Been here eight months. The weekly theme menus are genuinely good and the kitchen is spotless. Warden fixes things the same day.', reply: 'Thank you! The kitchen team will be thrilled to hear this.' },
  { overall: 4, food: 4, cleanliness: 4, safety: 5, value: 4, staff: 4, title: 'Safe, clean and close to work', body: 'Ten minutes to the office on foot. Rooms are cleaned daily. WiFi slows down at night but they upgraded the router recently.' },
  { overall: 4, food: 3, cleanliness: 4, safety: 4, value: 5, staff: 4, title: 'Great value, food could be spicier', body: 'For the price you cannot beat it. Food is healthy but a bit bland for my taste. Skipping meals for credit is very handy when I travel.', reply: 'Noted! We have added a spice-level option to the dinner counter.' },
  { overall: 3, food: 3, cleanliness: 3, safety: 4, value: 3, staff: 4, title: 'Decent but the washing machine queue is long', body: 'Rooms are fine and staff are polite. Only two washing machines for the whole floor, so weekends are a struggle. Otherwise okay.' },
  { overall: 5, food: 4, cleanliness: 5, safety: 5, value: 5, staff: 5, title: 'Moved from another PG, never going back', body: 'No advance, one bill, and when I reported a leaking tap it was fixed in two hours. The issue board makes everything transparent.' },
  { overall: 4, food: 5, cleanliness: 4, safety: 4, value: 3, staff: 4, title: 'Biryani Fridays are worth it', body: 'Slightly pricier than nearby PGs, but the food and cleanliness make up for it. The community board is useful for finding cricket partners.' },
  { overall: 2, food: 2, cleanliness: 3, safety: 3, value: 3, staff: 2, title: 'Food quality dipped last month', body: 'The first few months were great but lately dinners have been repetitive and lukewarm. Reported it, waiting for improvement.', reply: 'We changed our dinner cook last week and are tracking feedback daily. Please tell us how it feels now.' },
];

type IssueSeed = { category: IssueCategory; severity: IssueSeverity; title: string; description: string; status: IssueStatus; ageDays: number; responseHours?: number; resolveHours?: number; anonymous?: boolean; isPublic?: boolean; ownerNote?: string };
const ISSUES: IssueSeed[] = [
  { category: 'wifi', severity: 'medium', title: 'WiFi drops on the 2nd floor at night', description: 'Between 9pm and midnight the connection keeps dropping in rooms 201–210.', status: 'closed', ageDays: 40, responseHours: 2, resolveHours: 20, ownerNote: 'Installed a second access point on the floor.' },
  { category: 'water', severity: 'high', title: 'No hot water in the morning', description: 'Geyser on the 3rd floor is not heating since yesterday.', status: 'resolved', ageDays: 12, responseHours: 1, resolveHours: 6, ownerNote: 'Electrician replaced the thermostat.' },
  { category: 'food', severity: 'low', title: 'Breakfast runs out by 9:30', description: 'Late risers find idli finished. Could you make a little more on weekdays?', status: 'in_progress', ageDays: 5, responseHours: 4, ownerNote: 'Increasing the breakfast batch from Monday.' },
  { category: 'cleanliness', severity: 'medium', title: 'Common bathroom not cleaned on Sunday', description: 'Housekeeping seems to skip Sundays. The bathroom near the stairs gets messy.', status: 'acknowledged', ageDays: 2, responseHours: 3 },
  { category: 'maintenance', severity: 'low', title: 'Loose door handle in room 104', description: 'The handle comes off when you pull the door shut.', status: 'open', ageDays: 1 },
  { category: 'safety', severity: 'high', title: 'Main gate lock is broken', description: 'The gate does not lock properly after 11pm. Anyone can walk in.', status: 'open', ageDays: 3, anonymous: true },
  { category: 'staff', severity: 'medium', title: 'Night guard often absent', description: 'Twice this week there was no guard at the desk after midnight.', status: 'resolved', ageDays: 25, responseHours: 30, resolveHours: 96, anonymous: true, isPublic: false, ownerNote: 'Hired a second guard for the night shift.' },
  { category: 'maintenance', severity: 'medium', title: 'Ceiling fan making noise', description: 'Fan in room 305 rattles loudly at full speed.', status: 'closed', ageDays: 60, responseHours: 12, resolveHours: 52 },
];

const POSTS = [
  { body: 'Anyone up for cricket at the ground behind the hostel this Sunday, 7am?', comments: ['Count me in!', 'I can bring the kit.'] },
  { body: 'Found a black umbrella in the lounge. Left it with the warden.', comments: ['That’s mine, thank you!'] },
  { body: 'Looking for someone to share a cab to the airport on Friday evening.', comments: [] },
  { body: 'Friday’s partner-brand dinner was amazing. Can we have it twice a month?', comments: ['+1', 'Seconded, the burritos were great.'] },
];
const ANNOUNCEMENTS = ['Pest control on Saturday 10am–1pm. Please keep food sealed.', 'Water supply will be off on Tuesday 2pm–4pm for tank cleaning.'];

/** Small deterministic PRNG so the demo data is the same every reset. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const hoursAfter = (d: Date, h: number) => new Date(d.getTime() + h * 3_600_000);

/** Seed demo residencies, reviews, issues and posts. */
export async function seedCommunity(ctx: SeedCtx): Promise<void> {
  const rand = rng(42);
  const today = istDate();
  const now = new Date();
  const partners = ctx.hostels.filter((h) => h.partnerStatus === 'verified');
  const free = ctx.hostels.filter((h) => h.partnerStatus !== 'verified');

  const users = await db
    .insert(schema.users)
    .values(NAMES.map((name, i) => ({ id: newId('usr'), phone: `91000000${String(i + 1).padStart(2, '0')}`, name, role: 'tenant' as const })))
    .returning();
  let next = 0;
  const take = () => users[next++ % users.length]!;

  // The demo tenant lives at the first partner hostel unless their subscription already made them a resident.
  const [demoResidency] = await db
    .select()
    .from(schema.residencies)
    .where(and(eq(schema.residencies.userId, ctx.tenant.id), inArray(schema.residencies.status, ['pending', 'active'])));
  if (!demoResidency) {
    await db.insert(schema.residencies).values({
      id: newId('res'),
      userId: ctx.tenant.id,
      hostelId: partners[0]!.id,
      source: 'claim',
      status: 'active',
      startDate: addDays(today, -75),
      roomLabel: '203',
    });
  }

  for (const [hi, h] of partners.entries()) {
    // 3–4 current residents and 2 past residents per partner hostel.
    const current = Array.from({ length: 3 + (hi % 2) }, () => take());
    const past = [take(), take()];
    const currentRes = await db
      .insert(schema.residencies)
      .values(
        current.map((u, k) => ({
          id: newId('res'),
          userId: u.id,
          hostelId: h.id,
          source: (h.ownerPlan === 'pro' && k === 0 ? 'owner' : 'claim') as 'owner' | 'claim',
          status: 'active' as const,
          startDate: addDays(today, -(30 + Math.floor(rand() * 300))),
          roomLabel: `${1 + k}0${1 + hi}`,
          monthlyRent: h.ownerPlan === 'pro' && k === 0 ? 8500 : null,
        })),
      )
      .returning();
    const pastRes = await db
      .insert(schema.residencies)
      .values(
        past.map((u) => {
          const start = addDays(today, -(200 + Math.floor(rand() * 300)));
          return { id: newId('res'), userId: u.id, hostelId: h.id, source: 'claim' as const, status: 'ended' as const, startDate: start, endDate: addDays(start, 90 + Math.floor(rand() * 90)) };
        }),
      )
      .returning();

    // Reviews: 3–6 per partner hostel from current and past residents.
    const reviewers = [...currentRes, ...pastRes].slice(0, 3 + ((hi * 2) % 4));
    await db.insert(schema.reviews).values(
      reviewers.map((r, k) => {
        const s = REVIEWS[(hi + k) % REVIEWS.length]!;
        const createdAt = new Date(now.getTime() - (5 + Math.floor(rand() * 120)) * 86_400_000);
        return {
          id: newId('rev'),
          hostelId: h.id,
          userId: r.userId,
          residencyId: r.id,
          overall: s.overall,
          food: h.foodAvailable ? s.food : null,
          cleanliness: s.cleanliness,
          safety: s.safety,
          value: s.value,
          staff: s.staff,
          title: s.title,
          body: s.body,
          ownerReply: s.reply ?? null,
          ownerRepliedAt: s.reply ? hoursAfter(createdAt, 20) : null,
          createdAt,
          updatedAt: createdAt,
        };
      }),
    );

    // Issues: a rotating slice of the catalogue per hostel.
    const count = 3 + (hi % 3);
    for (let k = 0; k < count; k++) {
      const s = ISSUES[(hi * 3 + k) % ISSUES.length]!;
      const reporter = currentRes[k % currentRes.length]!;
      const createdAt = new Date(now.getTime() - s.ageDays * 86_400_000 - Math.floor(rand() * 10) * 3_600_000);
      const responded = s.responseHours !== undefined ? hoursAfter(createdAt, s.responseHours) : null;
      const resolved = s.resolveHours !== undefined ? hoursAfter(createdAt, s.resolveHours) : null;
      const [issue] = await db
        .insert(schema.issues)
        .values({
          id: newId('iss'),
          hostelId: h.id,
          reporterId: reporter.userId,
          anonymous: s.anonymous ?? false,
          isPublic: s.isPublic ?? true,
          category: s.category,
          severity: s.severity,
          title: s.title,
          description: s.description,
          status: s.status,
          acknowledgedAt: s.status === 'open' ? null : responded,
          firstResponseAt: responded,
          resolvedAt: ['resolved', 'closed'].includes(s.status) ? resolved : null,
          closedAt: s.status === 'closed' && resolved ? hoursAfter(resolved, 10) : null,
          createdAt,
        })
        .returning();
      const comments: (typeof schema.issueComments.$inferInsert)[] = [];
      if (responded && s.ownerNote) comments.push({ id: newId('isc'), issueId: issue!.id, authorId: h.ownerId, body: s.ownerNote, createdAt: responded });
      if (s.status === 'closed' && resolved) comments.push({ id: newId('isc'), issueId: issue!.id, authorId: reporter.userId, body: 'Confirmed fixed, thanks!', createdAt: hoursAfter(resolved, 10) });
      if (comments.length) await db.insert(schema.issueComments).values(comments);
      const voters = currentRes.filter((r) => r.userId !== reporter.userId).slice(0, Math.floor(rand() * currentRes.length));
      if (voters.length) await db.insert(schema.issueUpvotes).values(voters.map((v) => ({ issueId: issue!.id, userId: v.userId })));
    }

    // Board posts with comments and likes.
    for (let k = 0; k < 2 + (hi % 2); k++) {
      const s = POSTS[(hi + k) % POSTS.length]!;
      const author = currentRes[k % currentRes.length]!;
      const createdAt = new Date(now.getTime() - (k * 2 + 1) * 86_400_000);
      const [post] = await db.insert(schema.posts).values({ id: newId('pst'), hostelId: h.id, authorId: author.userId, body: s.body, createdAt }).returning();
      if (s.comments.length) {
        await db.insert(schema.postComments).values(
          s.comments.map((body, ci) => ({ id: newId('pcm'), postId: post!.id, authorId: currentRes[(k + ci + 1) % currentRes.length]!.userId, body, createdAt: hoursAfter(createdAt, ci + 1) })),
        );
      }
      await db.insert(schema.postLikes).values(currentRes.slice(0, 1 + (k % currentRes.length)).map((r) => ({ postId: post!.id, userId: r.userId })));
    }
    if (h.ownerPlan === 'pro') {
      await db.insert(schema.posts).values({
        id: newId('pst'),
        hostelId: h.id,
        authorId: h.ownerId,
        kind: 'announcement',
        body: ANNOUNCEMENTS[hi % ANNOUNCEMENTS.length]!,
        pinned: true,
        createdAt: new Date(now.getTime() - 6 * 3_600_000),
      });
      // Rent ledger for the owner-added resident.
      const offline = currentRes.find((r) => r.source === 'owner');
      if (offline) {
        await db.insert(schema.rentPayments).values([
          { id: newId('rnt'), residencyId: offline.id, periodMonth: monthOf(addDays(today, -31)), amount: 8500, paidOn: addDays(today, -30), note: 'UPI' },
          { id: newId('rnt'), residencyId: offline.id, periodMonth: monthOf(today), amount: 8500, paidOn: addDays(today, -2), note: 'Cash' },
        ]);
      }
      // Pro hostels have already paid this month.
      await db.insert(schema.saasInvoices).values({
        id: newId('sin'),
        hostelId: h.id,
        ownerId: h.ownerId,
        plan: 'pro',
        periodMonth: monthOf(today),
        amount: OWNER_PLAN_PRICING.pro.price,
        dueDate: `${monthOf(today)}-01`,
        status: 'paid',
        paidAt: new Date(`${monthOf(today)}-01T05:00:00Z`),
      });
    }
  }

  // An escalated issue: high severity, untouched for three days, at the second partner hostel.
  const escalatedAt = partners[1] ?? partners[0]!;
  const [someone] = await db
    .select()
    .from(schema.residencies)
    .where(and(eq(schema.residencies.hostelId, escalatedAt.id), eq(schema.residencies.status, 'active')));
  await db.insert(schema.issues).values({
    id: newId('iss'),
    hostelId: escalatedAt.id,
    reporterId: someone!.userId,
    category: 'safety',
    severity: 'high',
    title: 'Fire extinguisher on 4th floor is expired',
    description: 'The tag says it expired in March. Please replace it.',
    status: 'open',
    createdAt: new Date(now.getTime() - 3 * 86_400_000),
  });

  // Past residents review a few free listings too.
  for (const [fi, h] of free.slice(0, 3).entries()) {
    for (let k = 0; k < 2; k++) {
      const u = take();
      const start = addDays(today, -(250 + fi * 30 + k * 40));
      const [r] = await db
        .insert(schema.residencies)
        .values({ id: newId('res'), userId: u.id, hostelId: h.id, source: 'claim', status: 'ended', startDate: start, endDate: addDays(start, 120) })
        .returning();
      const s = REVIEWS[(fi + k + 3) % REVIEWS.length]!;
      await db.insert(schema.reviews).values({
        id: newId('rev'),
        hostelId: h.id,
        userId: u.id,
        residencyId: r!.id,
        overall: s.overall,
        food: h.foodAvailable ? s.food : null,
        cleanliness: s.cleanliness,
        safety: s.safety,
        value: s.value,
        staff: s.staff,
        title: s.title,
        body: s.body,
      });
    }
  }

  // A pending residency claim for the demo owner to approve.
  const claimant = await db.insert(schema.users).values({ id: newId('usr'), phone: '9100000099', name: 'Farhan Qureshi', role: 'tenant' }).returning();
  await db.insert(schema.residencies).values({
    id: newId('res'),
    userId: claimant[0]!.id,
    hostelId: partners[0]!.id,
    source: 'claim',
    status: 'pending',
    startDate: addDays(today, -3),
    roomLabel: '306',
  });

  // 30 days of page views for owner insights.
  const views: (typeof schema.hostelViews.$inferInsert)[] = [];
  for (const h of ctx.hostels) {
    for (let d = 0; d < 30; d++) views.push({ hostelId: h.id, day: addDays(today, -d), count: 5 + Math.floor(rand() * (h.partnerStatus === 'verified' ? 60 : 20)) });
  }
  await db.insert(schema.hostelViews).values(views).onConflictDoNothing();
}
