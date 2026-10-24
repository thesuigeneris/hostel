# Hostels

Subscription living for hostels and PGs in India. Food + bed bundled. No advance. Portable between properties.

This is **v0**, the foundation scaffold from `/office-hours`. Read [DESIGN.md](./DESIGN.md) for the product thesis, 90-day plan, and architecture decisions.

## Status

The build follows [the platform design](docs/superpowers/specs/2026-10-12-hostels-platform-design.md) and its [personas addendum](docs/superpowers/specs/2026-10-24-personas-addendum.md), phase by phase.

- **Phase 1, foundation (done):** Postgres via Docker, full schema and migration, seed data, shared package (types, zod schemas, pricing, IST time helpers, ids, API client), API split into route modules, hardened phone-OTP login.
- **Phase 2, API features (done):** listings, rooms, photos and uploads, search (filters, near me, rating), visit requests, partner flow, subscriptions with bed reservation, bills, Razorpay checkout and webhook, weekly menus, meal skips with IST cut-offs, headcount, moves, cancel, payouts, background jobs; plus the addendum: residencies, verified reviews, issue reporting with public transparency stats, community board, owner plans and platform bills, and a rent tracker.
- **Phase 3, website (done):** Next.js app in `apps/web` for all three personas. Seekers get search with map and filters, area pages, hostel pages with verified reviews and the public issue record, visit requests, subscribe and pay. Residents get their plan, bills, meal skips, moves, issue reporting, the community board, the neighbour list and reviews. Owners get listing setup with a map pin and photo upload, rooms, residents, rent tracker, issues and community moderation, review replies, menus, kitchen headcount, subscribers, visit requests, payouts, and plans with billing. Admins get listing and partner review, fees, subscriptions and bills, payouts, moderation, food partners and a run-jobs button.
- **Phase 4, mobile (done):** Expo SDK 58 app on the shared API client. Explore with filters, near me and a map; hostel pages with menus, ratings and verified reviews; phone login; subscribe; My Stay with the plan, bills, meal skips, move and cancel; hostel life with issues, the community board, neighbours and reviews; profile. Bills are paid on the website's checkout page: the app opens it with a one-time sign-in code, so the person never logs in twice.
- **Phase 5, hardening (done):** a Playwright golden path across all three personas, a security review with fixes ([docs/security-review.md](docs/security-review.md)), and a step-by-step [run guide](docs/RUN.md).

- **Best of both (branch `claude/hostels-best-of-both`):** this build plus the extras from the parallel `claude/hostels-platform` build: likes on the community board (web and app), hostel page views with a per-hostel owner insights row (views need Pro or Partner), an admin escalated-issues queue (open and unacknowledged for 48 hours, or unresolved after 7 days), and monthly recurring revenue on the admin overview (platform fees, paying owner plans, subscription gross, hostels in trial).

Postgres (via Drizzle), MSG91 and Razorpay are wired in. Postgres is required. MSG91 and Razorpay run in stub mode until their keys are set in `apps/api/.env`: OTP is always `123456` without MSG91, and payments are simulated without Razorpay. See [Configuration](#configuration) for every key and how to get it.

## Prerequisites

- [Bun](https://bun.sh) 1.3+
- Docker (for Postgres), or any Postgres 16 with `hostels` and `hostels_test` databases
- For the mobile app: Expo Go on a phone, or an Android/iOS simulator

## Setup

```bash
bun install
cp apps/api/.env.example apps/api/.env
bun run db:up        # Postgres 16 on localhost:5432 (creates hostels + hostels_test)
bun run db:seed      # migrates, then seeds Hyderabad demo data
```

`bun run db:reset` wipes and reseeds.

Demo logins (OTP `123456`): admin `9000000001`, owner `9000000002` (six partner hostels), tenant `9000000003` (three weeks into a plan, with issues and posts at Sunrise Residency). More tenants: `9000000100` to `9000000113`.

Background jobs (expire unpaid plans, generate bills, complete moves, end cancelled plans, owner bills, plan changes, auto-close issues) run inside the API on startup and every 15 minutes. Set `JOBS=off` to disable them; admins can also trigger them with `POST /admin/jobs/run`. Uploaded photos are stored under `apps/api/uploads` (override with `UPLOAD_DIR`).

## Run

```bash
bun run dev:api      # http://localhost:4000 (GET / shows db and stub status)
bun run dev:web      # http://localhost:3000
bun run dev:mobile   # Expo
```

The website reads `API_URL` (default `http://localhost:4000`) and `NEXT_PUBLIC_SITE_URL` (default `http://localhost:3000`); see `apps/web/.env.example`. It keeps the session token in an httpOnly cookie and talks to the API only from the server, so the API needs no CORS entry for it. Log in with a demo phone above; each role lands on its own home (`/account`, `/owner`, `/admin`).

On a physical phone with Expo Go, point the app at your laptop's LAN address for both the API and the website (the website handles bill payment): `EXPO_PUBLIC_API_URL=http://192.168.1.10:4000 EXPO_PUBLIC_WEB_URL=http://192.168.1.10:3000 bun run dev:mobile`. Expo Go must be on SDK 58. Maps use react-native-maps, which needs no key in Expo Go. The web preview (`bun --filter @hostels/mobile web`) is for quick checks only; it shows a link instead of the map.

## Configuration

This section is the reference for every setting. For the step-by-step run and the checklist before real users, see [docs/RUN.md](docs/RUN.md).

To see what is live, check the API's startup lines or `GET /`:

```json
{ "db": "up", "razorpay": "stub", "msg91": "stub", "devMode": true }
```

### Environment variables

**API:** `apps/api/.env`, copied from `apps/api/.env.example`. Bun loads it when you run the root `bun run` scripts.

| Variable | Default if unset | What it does |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/hostels` | Postgres for the API, `db:migrate` and `db:seed`. Tests ignore it and use `TEST_DATABASE_URL`, or `hostels_test` on localhost. |
| `PORT` | `4000` | API port. |
| `NODE_ENV` | unset | `production` refuses stub OTP logins and simulated payments. |
| `ADMIN_PHONES` | none (`.env.example` sets `9000000001`) | Comma-separated 10-digit phones that become admin when they log in. This is the only way to get the admin role. |
| `OTP_PEPPER` | `dev-otp-pepper` | Secret mixed into stored OTP hashes. Set a long random value anywhere but your laptop. |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:8081` | Browser origins allowed to call the API directly, such as the Expo web preview. The website calls the API from its server, so it needs no entry. |
| `API_PUBLIC_URL` | `http://localhost:<PORT>` | Public base URL of the API. Used in links to uploaded photos. |
| `WEB_URL` | `http://localhost:3000` | Website URL. Not read by the API yet. |
| `JOBS` | on | `off` stops the background jobs inside the API. |
| `UPLOAD_DIR` | `apps/api/uploads` | Where uploaded photos are stored. |
| `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID` | empty | Set both to send real OTP texts. See [MSG91](#msg91-otp-texts). |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | empty | Set both for real Razorpay orders and Checkout. See [Razorpay](#razorpay-payments). |
| `RAZORPAY_WEBHOOK_SECRET` | empty | Verifies `POST /webhooks/razorpay`. Without it every webhook is rejected. |

**Website:** `apps/web/.env.local`, copied from `apps/web/.env.example`.

| Variable | Default if unset | What it does |
| --- | --- | --- |
| `API_URL` | `http://localhost:4000` | Where the Next.js server calls the API. Server side only. |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | Public site URL, used for canonical links, the sitemap and Open Graph. |
| `API_PUBLIC_URL` | same as `API_URL` | Where browsers load uploaded photos from, if that differs from `API_URL`. |

**Mobile:** set these in your shell when you start Expo (see [Run](#run)).

| Variable | Default if unset | What it does |
| --- | --- | --- |
| `EXPO_PUBLIC_API_URL` | `http://localhost:4000` | API the app calls. |
| `EXPO_PUBLIC_WEB_URL` | `http://localhost:3000` | Website the app opens to pay bills. |

### Postgres + Drizzle

Postgres is required. The v0 in-memory store is gone. The schema is in `apps/api/src/db/schema.ts` and the generated migrations are in `apps/api/migrations/`. `bun run db:seed` and `bun run db:reset` run the migrations before seeding, and `bun run db:migrate` runs them on their own.

No Docker? Any local Postgres 16 works. Create the two databases, point `DATABASE_URL` at the first one, then seed:

```bash
createdb hostels
createdb hostels_test
bun run db:seed
```

After you change the schema, generate a migration and apply it:

```bash
cd apps/api
bun run db:generate   # writes a new SQL file to migrations/
bun run db:migrate
bun run db:studio     # optional: browse the data in Drizzle Studio
```

### MSG91 (OTP texts)

`apps/api/src/lib/msg91.ts` sends the OTP through MSG91's OTP API once `MSG91_AUTH_KEY` and `MSG91_TEMPLATE_ID` are both set. Until then it runs in stub mode: the OTP is always `123456`, the API prints `[otp:stub] <phone> -> 123456`, and `POST /auth/otp` returns the code as `devOtp`.

1. In your MSG91 account, copy your **auth key**.
2. Create an **OTP template** that contains the `##OTP##` variable and copy its **template ID**. For Indian numbers the template and its sender ID must be DLT-approved. The API does not send a sender ID, so MSG91 uses the one on the template.
3. Set `MSG91_AUTH_KEY` and `MSG91_TEMPLATE_ID` in `apps/api/.env` and restart the API. It should print `msg91: live`.

When MSG91 is live, OTPs are random 6-digit codes and are not returned in the response. In both modes, codes are stored hashed, expire after 5 minutes, allow 5 tries, and a phone can request 5 codes an hour. The API takes 10-digit Indian numbers (a `+91`, `91` or `0` prefix is stripped) and sends them to MSG91 as `91XXXXXXXXXX`.

Stub mode lets anyone log in as any phone with `123456`, so with `NODE_ENV=production` and no MSG91 keys, `POST /auth/otp` returns 503 instead.

### Razorpay (payments)

`apps/api/src/lib/razorpay.ts` creates orders through Razorpay's Orders API and checks payment and webhook signatures (HMAC-SHA256, compared in constant time). Tenant bills and owner plan bills are paid on the website's `/pay/[invoiceId]` page, which the mobile app opens too.

1. In the Razorpay Dashboard, switch to **Test Mode** and generate API keys (Account & Settings → API Keys).
2. Set `RAZORPAY_KEY_ID` (`rzp_test_…`) and `RAZORPAY_KEY_SECRET` in `apps/api/.env` and restart the API. It should print `razorpay: live`, and the pay page switches to Razorpay Checkout.
3. Add a webhook in the Dashboard pointing at `https://<api-host>/webhooks/razorpay` with the `payment.captured` or `order.paid` event, choose a secret, and put that secret in `RAZORPAY_WEBHOOK_SECRET`. Razorpay can't reach `localhost`, so local testing needs a tunnel such as ngrok or cloudflared.

How a payment goes through:

1. `POST /payments/:id/order` creates the Razorpay order for the bill, or reuses the one it already has.
2. The pay page opens Razorpay Checkout with the returned `keyId` and `orderId`.
3. `POST /payments/:id/verify` checks the signature, marks the bill paid, and activates a pending subscription.
4. The webhook does the same. Both paths are idempotent, so whichever arrives second changes nothing.

In stub mode (no keys), orders get `order_stub_…` ids and the key id `rzp_test_stub`, and the pay page shows a "Pay ₹… (simulated)" button that calls `POST /payments/:id/simulate`. Simulated payments are refused once Razorpay keys are set or `NODE_ENV=production`.

## Checks

```bash
bun run typecheck
bun run lint
bun run test         # API tests run against the hostels_test database
bun --filter @hostels/web e2e   # Playwright golden path (see docs/RUN.md)
```

## Project structure

```
hostels/
├── apps/
│   ├── api/                Bun + Hono + Drizzle + Postgres
│   │   ├── src/routes/     public, auth, tenant, resident, owner, admin, payments, uploads
│   │   ├── src/services/   business logic
│   │   ├── src/db/         schema, migrate, seed
│   │   ├── src/lib/        env, errors, crypto, msg91, razorpay
│   │   ├── migrations/     generated SQL (drizzle-kit)
│   │   └── test/           bun test against hostels_test
│   ├── web/                Next.js 15 (App Router): public site, resident area, owner dashboard, admin console
│   └── mobile/             Expo SDK 58 + Expo Router: explore, hostel, subscribe, My Stay, hostel life, profile
├── packages/shared/        types, zod schemas, pricing, IST time, ids, API client
├── docker-compose.yml      Postgres for dev and tests
└── docs/superpowers/specs/ platform design + personas addendum
```

## Next steps (in order)

Per [DESIGN.md](./DESIGN.md), this code is the v0 shape. The next thing to do is **not more code**. It is:

1. **This week** — name 3 customers in Gachibowli. WhatsApp them the food-subscription pitch. If 0 say yes, the thesis is wrong and you saved 6 months.
2. **Days 8-30** — run the food pilot at one hostel. WhatsApp + Google Sheet. No app yet.
3. **Days 30-60** — validate unit economics.
4. **Days 60-90** — iterate this v0 toward production:
   - Razorpay: Checkout and webhook for monthly bills are wired. Next: an autopay mandate so bills charge automatically
   - ~~Wire real OTP via MSG91~~ Done: switches on with MSG91 keys
   - ~~Replace in-memory store with Postgres + Drizzle~~ Done in Phase 1
   - Build the hostel owner panel (Next.js)
   - Add KYC flow
   - Add image upload to Cloudflare R2
   - Add WhatsApp Business API tenant comms
   - Add maps + location pins
   - Add push notifications

This v0 is the shape. Ship the validation first.
