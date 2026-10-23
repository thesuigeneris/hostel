# Hostels Platform — End-to-End Design

**Date:** 2026-10-12
**Status:** Approved direction (brainstorming), ready for implementation planning
**Builds on:** [DESIGN.md](../../../DESIGN.md) (product thesis), existing scaffold in `apps/api`, `apps/mobile`, `packages/shared`

## 1. Goal

One platform for hostel/PG living in Indian cities, starting with Hyderabad:

- **Find a hostel from your seat.** Any hostel can list for free with photos, exact location, room types, rent, advance and live bed availability.
- **Subscribe to a verified partner hostel.** One monthly bill for bed + food, **no advance**, move between partner hostels anytime, skip meals for credit.
- **Food that rotates.** Partner hostels cook in-house from a weekly themed menu ("South Indian week", "Chinese day"), with optional partner-brand meals (California Burrito, EatSure, …).

"Done" for this build = everything runs fully on a laptop against real Postgres, with every external service stubbed behind an env-var switch. Deployment is a later project.

## 2. Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Website scope | Public site + owner dashboard + admin console, one Next.js app |
| Listings model | Two tiers: free listings (any hostel, own terms incl. advance) and verified partners (subscription, no advance) |
| Food model | Hostel weekly menu with themes + optional partner-brand meals; skip before cut-off → credit on next bill |
| Done means | Fully working locally; real services switch on by adding keys |
| Architecture | Keep Bun + Hono API as the single backend; upgrade Expo app; add Next.js `apps/web`; shared types in `packages/shared` |
| Version control | Local git only, one commit per tested task, no AI attribution |

## 3. Users and surfaces

### Tenant — mobile app + public website
- **Search** by area or near me; list and map views. Filters: rent range, sharing (private / 2 / 3 / 4), gender (boys / girls / co-living), food available, verified only.
- **Hostel page:** photo gallery, map pin, room types (sharing, rent, advance, beds free), amenities, house rules, this week's menu (partners only).
- **Free listing:** "Request a visit" (date + note) and WhatsApp / call buttons.
- **Verified partner:** **Subscribe** → room type → food plan + diet → summary → pay first bill (no advance).
- **Daily features — app only:** My Stay (plan, this week's menu, skip meals, bills), Move hostel, Cancel.
- **Website tenant area:** login, subscribe, pay bills, see plan. Daily food features link to the app.

### Owner — website only (v1)
- List a hostel: details, address + map pin, photo upload, room types, amenities, rules, contact numbers. Edit beds-free anytime.
- Visit-request inbox (new → contacted → closed).
- Apply for verified partner.
- Partners also get: weekly menu editor (theme, per-meal dishes, veg / non-veg, optional partner-brand meal, copy last week), **daily headcount per meal after skips, split veg / non-veg**, subscriber list, monthly payout statements.

### Admin — website only
- Review queue: approve / reject listings; verify / reject partner applications; set partner platform fee %.
- Food partner directory (add / edit / deactivate).
- Subscriptions, moves, overdue bills overview.
- Generate monthly payouts per hostel; mark paid.

### Out of scope (v1)
Reviews and ratings, in-app chat, roommate matching, referrals / loyalty, Aadhaar KYC, UPI autopay mandates, push notifications, live delivery integration with Zomato / partner brands, owner mobile app, multi-language, deployment and app-store builds.

## 4. Money rules

All amounts are whole rupees (integers). Prices live in `packages/shared/src/pricing.ts` so app, site and API agree.

- **Monthly bill = room rent + food plan price − skip credits from the previous period.** Subscribers never pay an advance.
- **Room rent:** set by the owner per room type (per bed, per month).
- **Food plans (platform-wide):**

  | Plan | Meals | Price / month |
  |---|---|---|
  | `full` | breakfast, lunch, dinner | ₹6,000 |
  | `two-meals` | breakfast, dinner | ₹4,500 |
  | `none` | — | ₹0 |

- **Diet preference** on the subscription: `veg` / `non-veg`. Drives headcount split; menu items carry a veg dish and an optional non-veg dish.
- **Skip credits:** breakfast ₹50, lunch ₹80, dinner ₹80. Only meals in the tenant's plan can be skipped. Total credit for one period is capped at that period's food price.
- **Skip cut-offs (IST):** breakfast — 22:00 the night before; lunch — 09:00 same day; dinner — 15:00 same day. A skip can be undone before the same cut-off.
- **Billing cycle:** anchored on the subscription start date. Period *n* runs from `start + n months` to the day before `start + (n+1) months`. Bill for period *n+1* is generated 5 days before period *n+1* starts and is due on its first day. A bill carries the credits for skipped meals dated from the previous bill's generation day (or the start date, for the first monthly bill) up to the day before its own generation day; later skips go on the following bill. Credits from the final period of a cancelled plan are not refunded in v1.
- **First bill** is created at subscribe time for period 0; the subscription is `pending` until it is paid. Unpaid pending subscriptions expire after 30 minutes and release the bed.
- **Overdue:** a bill still unpaid more than 7 days after its due date is shown as overdue (worked out when read, not stored). No automatic eviction in v1.
- **Cancel:** effective at the end of the current paid period; no further bills are generated.
- **Move:** new room's rent applies from the next bill. No fee, no proration. A bill uses the room the tenant will be in on its `periodStart` (counting scheduled moves). If a move is scheduled after that bill was generated and the bill is still unpaid, it is voided and regenerated; `invoices.hostelId` is that period's hostel, which is what payouts use.
- **Payouts:** for each partner hostel and calendar month, gross = sum of paid bill amounts (rent + food − credits) for stays at that hostel with `paidAt` in that month; platform fee = gross × hostel fee % (default 10); net = gross − fee. Partner-brand meal costs are settled by the platform offline in v1.

## 5. Data model (Postgres via Drizzle)

All IDs are text with a type prefix (`usr_`, `hst_`, …) generated by a shared `newId(prefix)`. Timestamps are stored UTC; calendar dates (`YYYY-MM-DD`) are IST dates.

| Table | Key fields |
|---|---|
| `users` | id, phone (unique), name, email, role (`tenant` / `owner` / `admin`), createdAt |
| `otp_codes` | phone (pk), codeHash, expiresAt, attempts |
| `sessions` | token (pk, random 32 bytes), userId, createdAt, expiresAt (30 days) |
| `hostels` | id, ownerId, slug (unique), name, description, city, area, address, lat, lng, genderType (`boys` / `girls` / `coliving`), amenities (jsonb string[]), rules (jsonb string[]), contactPhone, whatsappPhone, foodAvailable, status (`draft` / `pending` / `live` / `rejected`), partnerStatus (`none` / `applied` / `verified` / `rejected`), platformFeePct (default 10), createdAt |
| `hostel_photos` | id, hostelId, url, sortOrder |
| `room_types` | id, hostelId, sharing (`private` / `2-sharing` / `3-sharing` / `4-sharing`), monthlyRent, advanceAmount, totalBeds, bedsAvailable (check 0 ≤ free ≤ total) |
| `visit_requests` | id, hostelId, userId, preferredDate, message, status (`new` / `contacted` / `closed`), createdAt |
| `food_partners` | id, name, cuisine, logoUrl, active |
| `menu_weeks` | id, hostelId, weekStart (Monday), theme; unique(hostelId, weekStart) |
| `menu_items` | id, menuWeekId, date, meal (`breakfast` / `lunch` / `dinner`), vegDish, nonVegDish (nullable), foodPartnerId (nullable); unique(menuWeekId, date, meal) |
| `subscriptions` | id, userId, hostelId, roomTypeId, mealPlan, diet, status (`pending` / `active` / `cancelled` / `ended` / `expired`), startDate, cancelAt (nullable), createdAt |
| `invoices` | id, subscriptionId, userId, hostelId, periodStart, periodEnd, rentAmount, foodAmount, creditAmount, totalAmount, status (`due` / `paid` / `void`), dueDate, razorpayOrderId, razorpayPaymentId, paidAt; unique(subscriptionId, periodStart) |
| `meal_skips` | id, subscriptionId, date, meal, creditAmount, createdAt; unique(subscriptionId, date, meal) |
| `move_requests` | id, subscriptionId, fromHostelId, fromRoomTypeId, toHostelId, toRoomTypeId, moveDate, status (`scheduled` / `completed` / `cancelled`), createdAt |
| `payouts` | id, ownerId, hostelId, periodMonth (`YYYY-MM`), grossAmount, platformFee, netAmount, status (`pending` / `paid`), paidAt; unique(hostelId, periodMonth) |

A tenant has at most one subscription in `pending` or `active` (partial unique index).

## 6. Key flows

**Auth (all roles).** Phone → OTP → session token. OTP is stored hashed, expires in 5 minutes, max 5 wrong attempts, max 5 sends per phone per hour. Dev mode (no MSG91 key): OTP is always `123456` and returned in the response. Signup role can only be `tenant` or `owner`; `admin` is granted only to phones in `ADMIN_PHONES`. Mobile keeps the token in `expo-secure-store`; the website keeps it in an httpOnly cookie set by a Next.js route handler and forwards it to the API server-side.

**Listing.** Owner creates a hostel (`draft`) → adds rooms + photos → submits (`pending`) → admin approves (`live`, visible publicly) or rejects with a reason. Editing a live listing keeps it live.

**Partner.** Owner of a live hostel applies → admin verifies (sets fee %) → hostel shows "Verified" badge and Subscribe button; owner unlocks menu, headcount, subscribers, payouts.

**Subscribe.** In one transaction: check hostel is verified and tenant has no open subscription → reserve bed with `UPDATE room_types SET beds_available = beds_available - 1 WHERE id = ? AND beds_available > 0 RETURNING` (no overbooking) → create `pending` subscription + period-0 invoice → create Razorpay order. Paying activates the subscription. Expiry job releases the bed after 30 minutes unpaid.

**Pay a bill.** Both app and site use the website page `/pay/[invoiceId]`, which opens Razorpay Checkout (test mode with keys; a "Simulate successful payment" button in stub mode). The API verifies the signature, marks the invoice paid, and activates a pending subscription. The Razorpay webhook does the same idempotently. The app opens this page with `expo-web-browser` and refreshes on return.

**Skip a meal.** App shows the next 7 days of the tenant's menu. Toggling a meal calls `POST /me/skips` or `DELETE /me/skips/:date/:meal`; the API checks the meal is in the plan and the IST cut-off has not passed.

**Headcount.** For a date, per meal: active subscribers at that hostel whose plan includes the meal, minus skips, split veg / non-veg.

**Move.** Tenant picks a verified hostel + room type + move date (≥ tomorrow). API reserves a bed at the destination immediately and schedules the move; the job completes it on the move date (switch hostel/room on the subscription, release the old bed). Tenant can cancel a scheduled move before its date (destination bed released).

**Cancel.** Sets `cancelAt` = end of current paid period; job ends the subscription then and releases the bed.

**Background jobs.** In-process scheduler in the API runs on startup and every 15 minutes; each job is idempotent (unique constraints + status guards): expire unpaid pending subscriptions, generate upcoming invoices, complete due moves, end cancelled subscriptions. Payout generation is an admin action, idempotent per hostel-month.

## 7. Architecture

```
hostels/
├── apps/
│   ├── api/       Bun + Hono + Drizzle + Postgres
│   │   └── src/ routes/ (auth, public, tenant, owner, admin, uploads, webhooks)
│   │            services/ (billing, skips, moves, payouts, search, jobs — pure logic + DB calls)
│   │            db/ (schema, migrations, seed)   lib/ (razorpay, msg91, storage, ids, time)
│   ├── web/       Next.js App Router + Tailwind + shadcn/ui
│   │   └── app/ (public)/  /login  /pay/[invoiceId]  /account  /owner/**  /admin/**
│   └── mobile/    Expo (current SDK) + Expo Router
│       └── app/ welcome, (tabs)/explore|stay|profile, hostel/[slug], subscribe, move
├── packages/shared/  types, zod schemas, pricing + cut-off config, API client
└── docker-compose.yml  Postgres for dev + test databases
```

- **One API contract.** Request/response shapes are zod schemas in `packages/shared`; the API validates with them and both clients use a shared typed `createApiClient(baseUrl, getToken)`.
- **Postgres only.** The in-memory store is removed; dev and tests run on Docker Postgres (`hostels` and `hostels_test` databases).
- **Photos.** `POST /uploads` (multipart, jpeg/png/webp, ≤ 5 MB, type checked by file signature) → `Storage` interface; local disk implementation serves files at `/uploads/*`; an R2 implementation can be added behind env vars later.
- **Maps.** Keyless: Leaflet + OpenStreetMap tiles on the website (search map, owner pin picker). Mobile uses react-native-maps, which needs no key inside Expo Go (a Google Maps key is only needed later for store builds). Near-me sort uses a haversine expression in SQL; no PostGIS.
- **SEO.** Hostel pages at `/hostels/[slug]` and area pages at `/hostels-in/[area]` are server-rendered with metadata, Open Graph tags and `LodgingBusiness` JSON-LD; `sitemap.xml` and `robots.txt` generated.
- **Visual direction.** Clean, residential, food-forward (DESIGN.md). Warm off-white background, one deep green brand colour, one warm accent for food; large real photos; Inter-style sans. Tagline: *"Live anywhere. Eat well. No advance."* Shared design tokens are defined once per app (Tailwind theme on web, `theme.ts` on mobile) with the same values.
- **Config.** `.env.example` per app. Missing Razorpay / MSG91 keys → stub mode, shown in the API health response and as a small "dev mode" banner on web.

## 8. Error handling

- API returns `{ error: code, message, issues? }`. Codes: `validation`, `unauthorized`, `forbidden`, `not_found`, plus domain codes (`no_beds_available`, `already_subscribed`, `not_verified`, `cutoff_passed`, `meal_not_in_plan`, `otp_invalid`, `otp_rate_limited`, `invoice_already_paid`, `signature_invalid`, `move_not_allowed`).
- Unexpected errors → 500 with a generic message; full error logged server-side.
- Role guards on every non-public route; owners can only touch their own hostels; tenants only their own subscription.
- Payment and webhook handlers are idempotent; signatures compared in constant time with a length check first.
- Web: route-level `error.tsx` and `not-found.tsx`; form errors shown inline. Mobile: every data screen has loading, empty, error-with-retry states.

## 9. Testing

- **API:** `bun test` against `hostels_test`. Unit tests for pure logic (bill amounts, credit cap, IST cut-offs, billing periods, payout maths, haversine). Integration tests per route group, including role guards, bed reservation under concurrent subscribes, skip cut-offs, moves, job idempotency, webhook idempotency.
- **Website:** Playwright golden path — owner lists hostel → admin approves + verifies → tenant subscribes and pays (stub) → tenant skips a meal (API) → owner headcount reflects it. Plus gstack `/qa` exploratory pass.
- **Mobile:** typecheck + unit tests for client-side logic; smoke run via Expo web in a browser.
- **All workspaces:** typecheck and lint must pass before every commit.

## 10. Build phases

Each phase ends with tests, typecheck and lint green, then a commit.

1. **Foundation** — git, Docker Postgres, deps, shared package (types, zod, pricing, ids, IST time helpers, API client), new schema + migrations + seed, API restructure into route modules, auth hardening.
2. **API features** — listings, rooms, photos, search, visits, partner flow, subscriptions + invoices + payments + webhook, menus, skips, headcount, moves, payouts, admin endpoints, jobs.
3. **Website** — public site + SEO, login, subscribe + pay, tenant account; owner dashboard; admin console.
4. **Mobile** — SDK upgrade, explore + map, hostel page, subscribe + pay, My Stay (menu, skips, bills), move, profile.
5. **Hardening** — Playwright golden path, security review, QA pass, README + run guide.

**Seed data (dev):** Hyderabad areas (Gachibowli, Madhapur, Kondapur, HiTech City, Financial District, Ameerpet); 6 verified partner hostels with this and next week's themed menus; 6 free listings; food partners (California Burrito, EatSure, FreshMenu, a local tiffin service); demo logins — admin `9000000001`, owner `9000000002`, tenant `9000000003`, OTP `123456`.
