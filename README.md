# Hostels

Subscription living for hostels and PGs in India. Food + bed bundled. No advance. Portable between properties.

This is **v0**, the foundation scaffold from `/office-hours`. Read [DESIGN.md](./DESIGN.md) for the product thesis, 90-day plan, and architecture decisions.

## Status

The build follows [the platform design](docs/superpowers/specs/2026-10-12-hostels-platform-design.md) and its [personas addendum](docs/superpowers/specs/2026-10-24-personas-addendum.md), phase by phase.

- **Phase 1, foundation (done):** Postgres via Docker, full schema and migration, seed data, shared package (types, zod schemas, pricing, IST time helpers, ids, API client), API split into route modules, hardened phone-OTP login.
- **Phase 2, API features (done):** listings, rooms, photos and uploads, search (filters, near me, rating), visit requests, partner flow, subscriptions with bed reservation, bills, Razorpay checkout and webhook, weekly menus, meal skips with IST cut-offs, headcount, moves, cancel, payouts, background jobs; plus the addendum: residencies, verified reviews, issue reporting with public transparency stats, community board, owner plans and platform bills, and a rent tracker.
- **Phase 3, website (done):** Next.js app in `apps/web` for all three personas. Seekers get search with map and filters, area pages, hostel pages with verified reviews and the public issue record, visit requests, subscribe and pay. Residents get their plan, bills, meal skips, moves, issue reporting, the community board, the neighbour list and reviews. Owners get listing setup with a map pin and photo upload, rooms, residents, rent tracker, issues and community moderation, review replies, menus, kitchen headcount, subscribers, visit requests, payouts, and plans with billing. Admins get listing and partner review, fees, subscriptions and bills, payouts, moderation, food partners and a run-jobs button.
- **Phase 4, mobile (done):** Expo SDK 58 app on the shared API client. Explore with filters, near me and a map; hostel pages with menus, ratings and verified reviews; phone login; subscribe; My Stay with the plan, bills, meal skips, move and cancel; hostel life with issues, the community board, neighbours and reviews; profile. Bills are paid on the website's checkout page: the app opens it with a one-time sign-in code, so the person never logs in twice.
- Phase 5 (hardening: end-to-end tests, security review, run guide) is next.

External services run in stub mode until keys are set in `apps/api/.env`: OTP is always `123456` without MSG91, and payments are simulated without Razorpay.

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

## Checks

```bash
bun run typecheck
bun run lint
bun run test         # API tests run against the hostels_test database
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
   - Wire real Razorpay subscription billing with autopay mandate
   - Wire real OTP via MSG91
   - Replace in-memory store with Postgres + Drizzle
   - Build the hostel owner panel (Next.js)
   - Add KYC flow
   - Add image upload to Cloudflare R2
   - Add WhatsApp Business API tenant comms
   - Add maps + location pins
   - Add push notifications

This v0 is the shape. Ship the validation first.
