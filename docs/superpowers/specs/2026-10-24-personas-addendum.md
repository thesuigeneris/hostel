# Hostels Platform — Personas Addendum

**Date:** 2026-10-24
**Builds on:** [2026-10-12-hostels-platform-design.md](./2026-10-12-hostels-platform-design.md). Where this doc and that one disagree, this one wins.

## 1. Why

The product now serves four personas end to end on the website:

| Persona | What they get |
|---|---|
| **Seeker** — looking for a hostel | Search with map and filters, hostel pages with photos, rooms, live beds, menu, **verified-resident reviews** and a **public issue-handling record**, visit requests, subscribe with no advance. |
| **Owner** — runs an unorganised hostel/PG | We are their brand and their software (the "OYO for hostels" model). Free listing; **Hostels Pro** (₹999 / hostel / month) adds a resident register, rent ledger, issue desk analytics, announcements, boosted placement and insights; **Verified partner** adds our subscription demand, and we take the platform fee % on that revenue. |
| **Resident** — lives in a hostel | Community board for their hostel (posts, comments, likes), resident directory, **report issues** and track them to resolution, upvote others' issues, write a review. Subscribers also get My Stay (bills, menu, skips, moves). |
| **Admin** — us | Listing and partner review, review moderation, escalated issues, subscriptions, payouts, owner software invoices. |

Reviews, issues and community, which the base spec listed as out of scope, are now in scope. The daily food features (menu, skips) also move onto the website.

## 2. Residencies (who counts as a resident)

`residencies` link a user to a hostel. Status: `pending` → `active` → `ended`, or `pending` → `rejected`.

- **subscription**: when a subscription becomes `active`, create an `active` residency (`source = subscription`, `subscriptionId`, `startDate` = subscription start). When the subscription ends, set the residency to `ended` with `endDate`. When a move completes, end the old residency and create a new active one at the destination.
- **claim**: any signed-in user can claim residency at a `live` hostel (`pending`). The owner approves (`active`) or rejects. A user can have at most one pending/active residency per hostel.
- **owner**: an owner adds a resident by phone and name. This creates the user if needed and an `active` residency. It is a Pro feature (`plan_required` otherwise). Owners on any plan can approve or reject claims and end residencies.
- "Resident of H" means an `active` residency at H. "Past resident" means an `ended` one.

## 3. Reviews

- Only active or past residents of a hostel can review it, and only once per hostel (`already_reviewed`). The author can edit their review. Every review is from a verified resident (`verifiedResident: true`), and `stayedFrom` / `stayedTo` come from the residency.
- Scores are 1–5 for overall, cleanliness, safety, value and staff, plus food when the hostel serves food. Title is 3–120 characters, body 20–4000.
- The owner can reply (one reply, editable). An admin can hide or unhide a review. Hidden reviews are excluded from listings and averages.
- `ratingSummary` and `ratingSummaries` in `apps/api/src/services/reputation.ts` are the only rating maths. Hostel summaries use `overall` and `count`.

## 4. Issues (transparency)

- **Who can report:** active residents only (`not_resident`). Fields: category, severity, title, description, up to 6 photos, `anonymous`, `isPublic`.
- **Visibility:**
  - Residents of the hostel see all of its issues.
  - The owner sees all issues for their hostel.
  - Admin sees everything.
  - The public endpoint `/hostels/:slug/issues` lists only `isPublic` issues.
  - `reporter` is `null` for anonymous issues unless the viewer is the reporter or an admin. Public listings always return `reporter: null`.
- **Status flow** (`invalid_transition` otherwise):
  - The owner (or admin) can move `open → acknowledged`, `open | acknowledged → in_progress`, and `open | acknowledged | in_progress → resolved`.
  - The reporter (or admin) can move `resolved → closed` to confirm the fix, or `resolved → open` to reopen. Reopening clears `resolvedAt`.
  - An optional `note` on a status change is saved as a comment by that user.
  - `acknowledgedAt`, `resolvedAt` and `closedAt` are set when those statuses are reached.
- **First response:** `firstResponseAt` is the earlier of the first owner comment and the move to acknowledged or later.
- **Upvotes:** residents of the hostel can toggle an upvote on any issue there.
- **Public stats:** `issueStats` in `reputation.ts` covers the last 90 days: totals, resolved (`resolved` + `closed`), open, median hours to resolution and median hours to first response. These are shown on hostel pages.
- **Escalated** (admin view): any issue that is `open` or `acknowledged` for more than 7 days, or a `high` severity issue that is `open` or `acknowledged` for more than 48 hours.

## 5. Community board

- Active residents and the hostel's owner (plus admin) can read and write a hostel's board. Anyone else gets `not_resident` (or `forbidden` for non-owners).
- Residents create posts with `kind = post`. Owners create announcements via `/owner/hostels/:id/announcements` with `kind = announcement`; announcements are Pro (`plan_required`). Owners can pin and unpin posts.
- Board order: pinned first, then newest. Posts can be deleted by their author, the hostel owner or an admin. Comments and likes work for anyone who can read the board.
- The residents directory lists active residents' names, `since` and `roomLabel`. It never includes phone numbers.

## 6. Owner software plan (how we charge owners)

- Plans are `free` and `pro`. Prices live in `OWNER_PLAN_PRICING` (`packages/shared/src/pricing.ts`).
- **Upgrading:** `POST /owner/hostels/:id/plan {plan:'pro'}` creates (or returns the existing) `due` saas invoice for the current IST month, due today. The hostel stays `free` until that invoice is paid; payment flips `ownerPlan` to `pro`. The owner pays at `/pay/sin_…`, which is the same payments flow as tenant invoices.
- **Downgrading:** `{plan:'free'}` takes effect immediately and voids any unpaid saas invoices.
- **Monthly job:** each `pro` hostel gets an invoice for the current IST month, due on the 1st. A `pro` hostel with a saas invoice still unpaid 15 days after its due date is downgraded to `free`.
- **Pro-gated** (`plan_required`, HTTP 402): add resident manually, rent ledger, announcements. Insights numbers are returned for every plan, and the website shows them blurred for Free.
- **Ranking:** `sort=recommended` orders verified partners first, then Pro, then by rating, then by newest.

## 7. Payments

`/payments/:invoiceId/{checkout,verify,simulate}` accepts both tenant invoices (`inv_…`) and saas invoices (`sin_…`). Only the invoice's own user (tenant invoice) or owner (saas invoice) can pay it. `simulate` exists only in stub mode, when there are no Razorpay keys. Paying is idempotent; paying twice returns `invoice_already_paid`. The Razorpay webhook handles `payment.captured` and `order.paid` for both kinds of invoice, idempotently.

## 8. Views and insights

`POST /hostels/:slug/view` (no auth) increments today's counter in `hostel_views`. The owner dashboard shows 30-day views, visit requests, occupancy (1 − free beds / total beds), active residents, open issues and rating.

## 9. Website map

| Path | Persona |
|---|---|
| `/`, `/search`, `/hostels/[slug]`, `/hostels-in/[area]`, `/login`, `sitemap.xml`, `robots.txt` | Seeker |
| `/pay/[invoiceId]` | Tenant + owner |
| `/account` (my stay), `/account/bills`, `/account/menu`, `/account/move`, `/account/visits`, `/account/profile`, `/subscribe/[slug]` | Tenant |
| `/community`, `/community/[hostelId]` (board), `/community/[hostelId]/issues`, `/community/[hostelId]/issues/[issueId]`, `/community/[hostelId]/residents`, `/community/[hostelId]/review`, `/community/join` (claim residency) | Resident |
| `/for-hostels` (pitch + pricing), `/owner/**` | Owner |
| `/admin/**` | Admin |
