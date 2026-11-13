# Hostels Platform — Addendum: Seekers, Branded Owners, Residents

**Date:** 2026-10-24
**Status:** Requested by the founder on 2026-10-24; extends [the platform design](./2026-10-12-hostels-platform-design.md)
**Changes to the base spec:** moves "reviews and ratings" into scope, adds owner plans (what owners pay us), resident issue reporting and a per-hostel community board. Everything else in the base spec stands.

## 1. Why

The founder's ask, in short: one web app, end to end, for three people.

1. **Seekers** searching for a hostel need something they can trust. Today's listings have fake photos and fake reviews.
2. **Owners** of unorganised hostels join under our brand, OYO-style. We give them branding and a web app to run the hostel, and we charge them for it.
3. **Residents** living in a hostel can connect with each other and report issues, so the hostel's record is visible. That record is what makes reviews trustworthy for seekers and gives good hostels visibility.

The loop: owners run their hostel on our app → residents are known to the app → residents' reviews and issue history are verified → seekers trust them → good hostels get more tenants → more owners join.

## 2. Residency: who counts as a resident

A **residency** links a user to a hostel for a span of time. It is the single source of "this person really lives / lived here".

- Created automatically when a subscription becomes `active` (source `subscription`), ended when the subscription ends or the tenant moves out (a move ends one residency and starts another on the move date).
- Created by an owner on a Pro or Partner plan from the resident roster (source `owner`): owner enters the resident's phone, room type, monthly rent and start date. The resident gets the residency on first login with that phone; they can decline it.
- Ended by the owner (move-out date) or by the resident ("I've moved out").

Only residencies make someone a **verified resident** of a hostel.

## 3. Verified reviews (seekers)

- A user can review a hostel if they hold a residency there that has lasted at least **14 days**, or has ended within the last **180 days**. One review per user per hostel; it can be edited, and an edit re-stamps `updatedAt`.
- Fields: overall rating 1–5, sub-ratings 1–5 for cleanliness, food, safety and owner responsiveness (food is skipped when the hostel has no food), text 20–2,000 characters, the stay span (month/year from the residency, shown as "Lived here Mar–Sep 2026").
- Every review shows a **Verified resident** badge. There are no unverified reviews.
- The owner can post one public reply per review. The owner cannot edit or delete reviews.
- Admin moderation: hide a review with a reason (abuse, personal data, off-topic). Hidden reviews are excluded from averages. Users can flag a review; flags land in the admin queue.
- Hostel summary and page show the average rating, count, sub-rating averages, and the newest reviews first. Search can sort by rating and filter "4★ and up".

## 4. Issue reporting (residents → owner, transparency for seekers)

- A resident with an **active** residency can report an issue: category (`maintenance`, `cleanliness`, `food`, `safety`, `wifi`, `water`, `electricity`, `other`), title, description, optional photo (uses `POST /uploads`).
- Status flow: `open` → `acknowledged` → `in_progress` → `resolved` → `closed`. The owner moves it forward and can add updates. When the owner marks it `resolved`, the reporter can confirm (`closed`) or reopen it within 7 days; after 7 days with no answer it closes on its own (background job).
- Other residents of the same hostel see the hostel's issue list without the reporter's name, can add "me too" (one per user), and can comment. The owner sees reporter names. Admin sees everything.
- **Public transparency** on the hostel page (no issue text, only numbers, last 90 days): issues reported, % resolved, median time to first response, median time to resolve. Shown only once a hostel has at least 3 issues in the window, so one complaint does not define a hostel.
- Owner dashboard: open issues by age, a "needs response" list (no acknowledgement within 24 hours), and per-category counts.

## 5. Community board (residents ↔ residents)

- One board per hostel, visible only to its current residents (active residency) and its owner. This is posts with comments, not live chat (live chat stays out of scope).
- Post kinds: `general`, `food`, `event`, `lost_found`, `buy_sell`. Owners can also post `announcement`, which is pinned at the top.
- Text up to 1,000 characters plus an optional photo. Comments up to 500 characters.
- Members can report a post or comment; the owner or admin can hide it. Authors can delete their own.
- Residents see a directory of fellow residents who opt in (name and room type only, never phone numbers).

## 6. Owner plans (what owners pay us)

Owners pick a plan per hostel. Prices live in `packages/shared/src/pricing.ts`.

| Plan | Price | What the owner gets |
|---|---|---|
| `free` | ₹0 | Listing with photos, map, rooms, beds free, visit requests, reviews from residents the platform already knows about (subscribers) |
| `pro` | ₹999 / month per hostel | Everything in Free, plus the management app: resident roster and residencies, monthly rent tracker, issue tracker, community board, review replies, occupancy view |
| `partner` | ₹1,999 / month per hostel, plus the platform fee on subscription bills (default 10%, from the base spec) | Everything in Pro, plus our brand: "Verified" badge and brand kit (signboard and print files with the hostel name), subscription tenants with no advance, menus, headcount, payouts, priority in search |

- **Partner requires verification**, as in the base spec: applying for `partner` puts the hostel in the admin review queue. Until verified, the hostel stays on its current plan.
- **Plan billing:** a monthly owner bill per hostel is generated on the same 5-day lead as tenant bills, anchored on the plan start date. It is paid through the same `/pay/[invoiceId]` page (Razorpay in test mode, or "Simulate payment" in stub mode). Owner bills carry their own table so tenant billing stays unchanged.
- **First month free** for new Pro and Partner plans, so owners can try before they pay.
- **Unpaid owner bills:** shown as overdue after 7 days. After 15 days overdue the hostel drops to the `free` feature set (data is kept and comes back when the bill is paid). A Partner hostel that drops this way loses Subscribe for new tenants, but existing subscriptions continue.
- **Downgrade / cancel:** effective at the end of the paid month.

### Rent tracker (Pro and Partner)

For residents the owner added (not platform subscribers, who are billed by us), the owner records the monthly rent: amount due, paid on, method (`cash`, `upi`, `bank`, `other`). The tracker shows who is unpaid this month. It is a ledger only; we do not collect this money in v1.

## 7. Data model additions

| Table | Key fields |
|---|---|
| `residencies` | id, userId (nullable until the phone signs in), phone, hostelId, roomTypeId (nullable), source (`subscription` / `owner`), subscriptionId (nullable), monthlyRent (nullable, owner-added only), startDate, endDate (nullable), status (`invited` / `active` / `ended` / `declined`), directoryOptIn, createdAt |
| `reviews` | id, hostelId, userId, residencyId, rating, cleanliness, food (nullable), safety, responsiveness, body, ownerReply (nullable), ownerRepliedAt, hidden, hiddenReason, createdAt, updatedAt; unique(hostelId, userId) |
| `review_flags` | id, reviewId, userId, reason, createdAt; unique(reviewId, userId) |
| `issues` | id, hostelId, reporterId, residencyId, category, title, description, photoUrl, status, createdAt, acknowledgedAt, resolvedAt, closedAt |
| `issue_updates` | id, issueId, authorId, message, fromStatus, toStatus, createdAt |
| `issue_upvotes` | issueId, userId (pk both) |
| `community_posts` | id, hostelId, authorId, kind, body, photoUrl, pinned, hidden, createdAt |
| `community_comments` | id, postId, authorId, body, hidden, createdAt |
| `content_reports` | id, targetType (`post` / `comment`), targetId, userId, reason, createdAt |
| `owner_plans` | id, hostelId (unique), plan (`free` / `pro` / `partner`), startDate, trialEndsOn, cancelAt (nullable), createdAt |
| `owner_invoices` | id, ownerPlanId, hostelId, ownerId, plan, periodStart, periodEnd, amount, status (`due` / `paid` / `void`), dueDate, razorpayOrderId, razorpayPaymentId, paidAt; unique(ownerPlanId, periodStart) where not void |
| `rent_records` | id, residencyId, month (`YYYY-MM`), amountDue, amountPaid, paidOn, method, note; unique(residencyId, month) |

## 8. API additions

- **Public:** reviews list per hostel (`GET /hostels/:slug/reviews`), transparency stats on hostel detail, rating fields on search summaries, `sort=rating`, `minRating`.
- **Resident (`/me/...`):** residencies (list, accept, decline, move out), review create/update for a hostel, flag a review, issues (create, list for my hostel, confirm/reopen, me-too, comment), community (feed, post, comment, delete own, report), directory opt-in.
- **Owner (`/owner/...`):** plans (view, change, cancel), owner bills, resident roster (add by phone, end), rent tracker, issues (list, update status, comment), community (announce, hide), review replies.
- **Admin (`/admin/...`):** review flag queue and hide/unhide, content reports, owner plans and owner bills overview.
- **Jobs:** generate owner bills; auto-close resolved issues after 7 days; downgrade hostels with owner bills 15+ days overdue.
- **New error codes:** `not_a_resident`, `review_not_allowed`, `plan_required`.

## 9. Surfaces

- **Website:** review list and transparency panel on hostel pages; a resident area at `/stay` (my hostel, issues, community, write a review); owner dashboard gains Plan & billing, Residents, Rent, Issues, Community, Reviews; admin console gains Moderation and Owner billing.
- **Mobile:** My Stay gains Issues and Community tabs and a "Write a review" prompt after 14 days.

## 10. Phasing

These fold into the base spec's phases: the schema and API go into **Phase 2**, the website screens into **Phase 3**, the mobile screens into **Phase 4**, and the Playwright golden path in **Phase 5** grows a step: the resident reports an issue → the owner resolves it → the resident leaves a verified review.
