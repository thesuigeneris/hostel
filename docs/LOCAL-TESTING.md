# Run and test it on your laptop

A step-by-step guide to pull the latest work, run it locally and try every part by hand. Checked on 2026-11-13 from a
fresh clone of `dev`. For settings and deployment details see `docs/RUN.md` and `docs/DEPLOY.md`.

**Branches:** `dev` has everything (build here); `main` is production and only gets work you say is final.

## 1. What you need

| Tool | Version | Why |
|---|---|---|
| [Bun](https://bun.sh) | **1.4.4** (`bun upgrade`; check with `bun --version`) | Runs everything. Bun 1.3 can't read the lockfile |
| Docker Desktop (or Docker Engine) | any recent | Postgres 16 for development. Or install Postgres 16 yourself (see §2) |
| Git | any | |
| Node.js | 22 | Only for the mobile app (Expo) and the Android export |
| Expo Go on a phone | SDK 58 | Only to try the app on a phone |

Free ports: **5432** (Postgres), **4000** (API), **3000** (website), 8081 (Expo).

## 2. First time

```bash
git clone https://github.com/thesuigeneris/hostel.git
cd hostel
git checkout dev
bun install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
bun run db:up        # Postgres 16 in Docker, with the hostels and hostels_test databases
bun run db:reset     # creates all tables (17 migrations) and loads the Hyderabad demo data
```

The example settings are ready for local use: OTP texts and payments are simulated (no SMS, no money), and the demo
logins are on.

**Without Docker:** install Postgres 16 with user `postgres` / password `postgres` on port 5432, then
`createdb hostels` and `createdb hostels_test`, and skip `bun run db:up`.

## 3. Start it

Two terminals (a third for the app):

```bash
bun run dev:api      # http://localhost:4000  should show {"ok":true,...,"db":"up",...}
bun run dev:web      # http://localhost:3000
bun run dev:mobile   # optional: scan the QR code with Expo Go
```

For the app on a phone, use your laptop's LAN address (find it with `ipconfig getifaddr en0` on a Mac):

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.10:4000 EXPO_PUBLIC_WEB_URL=http://192.168.1.10:3000 bun run dev:mobile
```

## 4. Log in

On `http://localhost:3000/login`, use a demo button, or type a phone number and the code **`123456`**.

| Who | Phone | Lands on |
|---|---|---|
| Admin | `9000000001` | `/admin` |
| Owner of six partner hostels | `9000000002` | `/owner` |
| Resident, three weeks into a plan | `9000000003` | `/account` |
| More residents | `9000000100` to `9000000113` | `/account` |
| A new person | any 10-digit number starting 6–9 | sign-up |

To start over at any time: stop the API, run `bun run db:reset`, start it again.

## 5. What to try (by area)

Tick these off as you go. Each line says where, what to do, and what you should see.

### Seeker (logged out, or any new number)

- [ ] `/hostels`: filter by area, budget, "Verified, no advance"; suggestions appear as you type; paging keeps filters.
- [ ] A hostel page: photos, verified reviews ("New" under 3 reviews), the issue record, the food menu.
- [ ] Request a visit; then from `/account` withdraw it.
- [ ] Subscribe to a verified hostel → pay (simulated) → the plan is active on `/account`.

### Resident (`9000000003`)

- [ ] `/account`: skip a meal before its cut-off and undo it; bills show the credit.
- [ ] **New: change food plan.** `/account` → "Change food plan" → pick Breakfast + dinner and Non-veg → Save.
      You should see "It starts with your bill from …" and a notice with "Keep my current plan". Saving the plan you
      already have says so. "Keep my current plan" cancels it.
- [ ] Move: "Move hostel or room" → schedule → cancel. If next month is already paid, a move date inside it is refused
      with the first date that works.
- [ ] `/stay` → open the hostel: post on the board, like, join the neighbour list, report an issue (with a photo).
- [ ] **New: unread updates.** Log in as the owner in another browser (or a private window), answer that issue. Back as
      the resident: the menu shows "My hostel" with a count, `/stay` shows "N new", the issue list shows "1 new update",
      and the issue page marks the owner's update "New". After opening it, the count is gone on the next page.
- [ ] Write a review (residents need 14 days; `9000000003` already qualifies).
- [ ] **New: your data.** Seeded accounts are demo accounts, which don't offer this, so sign up with a **new number**
      (any 10-digit number starting 6–9, code `123456`). `/account` → "Your data" → "Download my data" saves
      `hostels-my-data.json`. Subscribe to a hostel and "Delete my account" says to cancel the plan first. With no plan,
      type DELETE and confirm: you land on "Your account is deleted" and are signed out; signing up with the same number
      again gives a new, empty account.

### Owner (`9000000002`)

- [ ] `/owner`: dashboard, next steps; a hostel's listing, rooms, photos, beds free.
- [ ] Residents: add a resident by phone; record rent; end a stay.
- [ ] Issues: answer one (the resident's unread count goes up); reply to a review and edit the reply.
- [ ] Menu and kitchen headcount (a resident's food plan change shows from its first day).
- [ ] Plan page: change plan; partner application; brand kit downloads.

### Admin (`9000000001`)

- [ ] `/admin`: the menu marks the page you're on and includes "Recently changed".
- [ ] Listings: approve or reject a pending listing (create one as a new owner first). Paging: Previous / Next.
- [ ] Partners: tick every brand standard and verify (works with the keyboard: Tab, Space, Enter).
- [ ] **Fixed: moderation.** Flag a review as a resident ("Report this review" under a review on a hostel page), then on `/admin/moderation`:
      "Keep it" keeps it (still on the hostel page), "Hide review" with a rule hides it, "Show again" brings it back.
- [ ] Subscriptions & bills: refunds due, owner bills (waive one, see it in the audit log), subscriptions and moves
      with paging.
- [ ] Payouts: generate for last month; mark paid.
- [ ] Admin home → "Run jobs now" (bills, plan changes, holds, moves, auto-close).
- [ ] Remove an admin from the command line (the opposite of `admin:grant`):
      `cd apps/api && bun run admin:revoke <phone>`.

### The app (Expo Go)

- [ ] Explore, a hostel, subscribe; My Stay: meals, bills, **Change food plan**, the **My Stay tab badge** for issue
      updates, Profile → **Your data** (share sheet) and **Delete my account**.
- [ ] Owner and admin screens from Profile.

## 6. Run the automatic checks

```bash
bun run typecheck
bun run lint
(cd packages/shared && bun test)
(cd apps/web && bun test ./test)
(cd apps/mobile && bun test)
(cd apps/api && TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/hostels_test bun test)   # about a minute
```

Browser tests (about 5 minutes; they build the website and use their own database and ports, so your data is safe):

```bash
bunx playwright install chromium                                   # once
docker compose exec postgres createdb -U postgres hostels_e2e     # once (or: createdb hostels_e2e)
(cd apps/web && bun run e2e:fresh)
```

Expected on `dev` today: API 294 pass, shared 63, web unit 20, mobile 56, browser 87 pass, typecheck and lint clean.
The API and browser tests **wipe** the database they point at: never point them at one with data you want.

## 7. Optional: the production setup on your laptop

The same Docker images and stack as a real server, as a demo on localhost (see `docs/DEPLOY.md` for a real server):

```bash
cat > deploy/.env.prod <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 24)
WEB_URL=http://localhost:3300
API_PUBLIC_URL=http://localhost:4300
CORS_ORIGINS=http://localhost:3300
OTP_PEPPER=$(openssl rand -hex 32)
UPLOAD_SIGNING_SECRET=$(openssl rand -hex 32)
APP_MODE=demo
API_HOST_PORT=4300
WEB_HOST_PORT=3300
EOF
docker compose -f deploy/compose.prod.yml --env-file deploy/.env.prod up -d --build
docker compose -f deploy/compose.prod.yml --env-file deploy/.env.prod exec api bun run src/db/seed.ts
# open http://localhost:3300 ; backups: deploy/backup.sh then deploy/restore.sh --check deploy/backups/<time>
docker compose -f deploy/compose.prod.yml --env-file deploy/.env.prod down -v   # remove it all
```

`deploy/.env.prod` and `deploy/backups/` stay on your machine (git ignores them).

## 8. If something goes wrong

| Problem | Fix |
|---|---|
| `bun install` complains about the lockfile | Upgrade to Bun 1.4.4 (`bun upgrade`) |
| `db:up` fails / port 5432 in use | Another Postgres is running: stop it, or use it (§2 "Without Docker") |
| API says `"db":"down"` | Postgres isn't running: `bun run db:up` |
| Tests hang at the start | The test database doesn't exist: create `hostels_test` (or `hostels_e2e` for browser tests) |
| Login code not accepted | In local mode the code is always `123456`; too many wrong tries locks the number for a while: `bun run db:reset` |
| Maps show no tiles | They load from OpenStreetMap; check your internet connection |
| The app can't reach the API on a phone | Use the LAN address (§3), same Wi-Fi; allow ports 4000/3000 through the laptop's firewall |
| Ports 3000/4000 in use | Stop the other process, or set `PORT` in `apps/api/.env` and `API_URL` in `apps/web/.env.local` to match |
| Want a clean slate | `bun run db:reset` (all demo data back); `docker compose down -v` removes the database entirely |
