# Hostels

Subscription living for hostels and PGs in India. Food + bed bundled. No advance. Portable between properties.

This is **v0**, the foundation scaffold from `/office-hours`. Read [DESIGN.md](./DESIGN.md) for the product thesis, 90-day plan, and architecture decisions.

## Status

The build follows [the platform design](docs/superpowers/specs/2026-10-12-hostels-platform-design.md) and its [personas addendum](docs/superpowers/specs/2026-10-24-personas-addendum.md), phase by phase.

- **Phase 1, foundation (done):** Postgres via Docker, full schema and migration, seed data, shared package (types, zod schemas, pricing, IST time helpers, ids, API client), API split into route modules, hardened phone-OTP login.
- **Phase 2, API features (done):** listings, rooms, photos and uploads, search (filters, near me, rating), visit requests, partner flow, subscriptions with bed reservation, bills, Razorpay checkout and webhook, weekly menus, meal skips with IST cut-offs, headcount, moves, cancel, payouts, background jobs; plus the addendum: residencies, verified reviews, issue reporting with public transparency stats, community board, owner plans and platform bills, and a rent tracker.
- Phase 3 (website), Phase 4 (mobile) and Phase 5 (hardening) are next. The Expo app still talks to the v0 API shape until Phase 4.

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
bun run dev:mobile   # Expo
```

On a physical phone, point the app at your laptop: `EXPO_PUBLIC_API_URL=http://192.168.1.10:4000 bun run dev:mobile`.

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
│   └── mobile/             Expo + React Native (Expo Router)
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
