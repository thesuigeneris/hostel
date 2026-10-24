# Hostels

Find, live in, and run hostels and PGs in India, starting with Hyderabad. Food and bed come as one monthly bill, with no advance, honest reviews from verified residents, and a public record of how each hostel handles complaints.

One platform, four personas:

| Persona | Where | What |
|---|---|---|
| **Seeker** | `/`, `/search`, `/hostels/[slug]` | Search with map and filters; photos, rooms and live beds; this week's menu; verified-resident reviews; issue-handling record; request a visit; subscribe with no advance |
| **Resident** | `/account/**`, `/community/**` | My stay, bills, weekly menu with meal skips (credit on next bill), move between hostels, cancel; hostel community board, residents directory, report and track issues, reviews |
| **Owner** | `/for-hostels`, `/owner/**` | Free listing, the Verified partner brand, Hostels Pro software (₹999/hostel/month): resident register, rent ledger, issue desk, announcements, insights, menu editor, headcount, payouts |
| **Admin** | `/admin/**` | Listing and partner review, moderation, escalated issues, subscriptions, payouts, owner billing |

Specs: [base design](docs/superpowers/specs/2026-10-12-hostels-platform-design.md) · [personas addendum](docs/superpowers/specs/2026-10-24-personas-addendum.md) · [product thesis](DESIGN.md)

## Stack

```
apps/api      Bun + Hono + Drizzle + Postgres   (http://localhost:4000)
apps/web      Next.js App Router + Tailwind v4  (http://localhost:3000)
apps/mobile   Expo app (v0; outside the workspace until its SDK upgrade)
packages/shared  zod schemas, types, pricing + time rules, typed API client (the API contract)
```

External services run in **stub mode** until you add keys:
- OTP is always `123456`.
- Payments show a "Simulate successful payment" button.
- Uploads go to local disk.

The API health endpoint and a banner on the website show which mode you're in.

## Run locally

Prerequisites: [Bun](https://bun.sh) 1.3+ and Postgres 16. Either use `docker compose up -d`, which creates the `hostels` and `hostels_test` databases, or a local Postgres with user `postgres` / password `postgres`.

```bash
bun install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
bun run db:reset          # drop, migrate, seed demo data

bun run dev:api           # terminal 1 → http://localhost:4000
bun run dev:web           # terminal 2 → http://localhost:3000
```

Demo logins (OTP `123456`):

| Role | Phone |
|---|---|
| Admin | 9000000001 |
| Owner (all verified hostels) | 9000000002 |
| Tenant / resident | 9000000003 |

## Test

```bash
bun run test        # shared unit tests + API integration tests (uses hostels_test)
bun run typecheck   # shared, api, web
```

## Going live

Add the keys from `apps/api/.env.example`. Each service switches from stub to live on its own:

- **MSG91** for OTP
- **Razorpay** for payments and the webhook
- **R2** for photo storage

Deployment and app-store builds are a separate project.
