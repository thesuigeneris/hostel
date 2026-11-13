# HANDOVER: Hostels platform

Rewritten 2026-11-13 after verifying the live repository, GitHub and the test suites. Read this first, then `CLAUDE.md`, `PRPs/LEDGER.md` and `docs/product/*`.

## 0. Start here: where everything is

All work is on GitHub (`thesuigeneris/hostel`) and **merged into `main`**. All 15 PRs (#1–#15) are merged; none are open.

| Branch | Commit | Note |
|---|---|---|
| `main`, `dev`, `persona-admin`, `claude/eager-hawking-4exijr` | `b58a0e9` plus this docs commit | Same code. `main` is the line to build on. |
| `claude/loving-euler-m0b2ku` | `b58a0e9` | Working branch of the session that landed the admin work; safe to delete. |
| `claude/project-thread-*`, `claude/hostels-best-of-both`, `claude/hostels-platform` | old | Fully merged history; safe to delete (owner's call). |

A new session: clone, `git checkout main`, read this file, then `CLAUDE.md`. The agent worktrees under `.claude/worktrees/` from the old container do not exist in a new one and are not needed.

## 1. What this project is

One platform for hostel/PG living in Indian cities (starting Hyderabad), for four kinds of people:

1. **Seekers** search and judge hostels they can trust (verified reviews, public issue record).
2. **Owners / partners** ("OYO for unorganised hostels"): we give them a brand and a web app to run the hostel and charge them (plans Free / Pro ₹999 / Partner ₹1,999 per month, first month free).
3. **Residents** report issues, talk on a per-hostel board, review, skip meals, pay bills.
4. **Admins** (platform team) approve listings, verify partners, moderate, bill owners, handle refunds.

The loop: owners run their hostel on the app → residents are known → reviews and issue history are verified → seekers trust them → good hostels fill → more owners join.

Specs (the personas addendum wins on conflicts): `docs/superpowers/specs/2026-10-12-hostels-platform-design.md`, `docs/superpowers/specs/2026-10-24-personas-addendum.md`. The bar for "done": `docs/product/acceptance.md`. Edge cases and their status: `docs/product/edge-cases.md`. Requirement → code → test ledger: `PRPs/LEDGER.md`.

## 2. Repository and Git state (verified 2026-11-13)

- `main` = `dev` = `b58a0e9` (+ the commit that adds the docs in this file's commit). Migrations `0000`–`0013`.
- `mudgala5540/Hostel` (the owner's other account) is an **empty repo**: no commits, branches or PRs. Pushing there was refused by the permission classifier; ask the owner if it is wanted.
- `CLAUDE.md` says no merges/PRs/deployments without the owner's approval; the owner has approved merging to `main` and pushing to `dev` for this body of work. For anything new, ask first.
- Commit trailers: follow the attribution instruction given in the session (earlier commits carry `Co-Authored-By` and `Claude-Session` lines).

## 3. Architecture and stack

Bun 1.4.4 monorepo (the lockfile is format v2; Bun 1.3 cannot read it).

| Area | What | Where |
|---|---|---|
| API | Hono, Drizzle ORM, postgres-js, zod. Routes thin; logic and authz in services | `apps/api/src/{routes,services,lib,db}` |
| DB | PostgreSQL 16, forward-only Drizzle migrations `0000`–`0011` on `dev` | `apps/api/src/db/schema.ts`, `apps/api/migrations/` |
| Contract | zod schemas, types, typed client, pricing/time rules | `packages/shared/src/` |
| Website | Next.js 15 App Router, server actions, Tailwind, tokens in `lib/tokens.ts`, primitives `components/ui.tsx` | `apps/web` |
| Mobile | Expo SDK 58, expo-router; owner/admin/seeker/resident screens | `apps/mobile` |
| Photos | sharp re-encode (strips GPS/EXIF); local disk store | `apps/api/src/lib/{uploads,images,storage}.ts` |
| Deploy | Docker images, compose, Caddy HTTPS, backup/restore | `deploy/`, `docs/DEPLOY.md` |

Services worth knowing: `billing.ts` (subscribe, invoices, jobs), `payments.ts` + `refunds.ts` + `money.ts` (payment modes, late payments), `plans.ts` (owner plans, upgrade credit), `residents.ts`, `issues.ts` + `issue-response.ts`, `community.ts`, `listings.ts`, `partners.ts`, `moves.ts`, `food.ts`, `search.ts`, `access.ts` (authz helpers), `jobs.ts` (in-process scheduler, every 15 min).

### Key design decisions (do not undo without reason)

- **Conventions** (CLAUDE.md): thin routes; `AppError` codes; 404 not 403 when a caller must not learn a record exists; all time via `clock` and IST `YYYY-MM-DD` dates; whole-rupee integers; state changes are one conditional `UPDATE … WHERE … RETURNING`; never edit a committed migration.
- **Login without paid SMS**: phone + password (argon2id). OTP only if MSG91 keys are set. `APP_MODE=demo` = isolated public demo (seeded accounts only, simulated payments).
- **Payment modes**: each paid bill records `razorpay_live | razorpay_test | simulated | waived`. **Only `razorpay_live` counts as money** (payouts, revenue, owner dashboard). Late payments revive the plan if a bed is free, otherwise create a `payment_exceptions` refund-due row admins settle manually.
- **Razorpay order is created at checkout** (`orderFor`), never inside the booking transaction.
- **Photos**: uploads return a signed *receipt*; photo fields accept only the caller's own receipt for the right purpose (`pho_` public listing photos, `att_` private attachments). Private photos are served by short-lived signed links (60–90 min). Rows store `/uploads/<key>`; absolute URLs are built per response from `API_PUBLIC_URL`. CSP `img-src` is limited to self, the API origin, OSM tiles, Razorpay.
- **Reviews**: only residents with a qualifying residency (14 days; within 180 days after leaving); owner-added stays count from `max(startDate, day the owner added them)`. Rating sort uses a shrunk average (prior weight 5); fewer than 3 reviews shows "New"; "4★ and up" needs 3 reviews.
- **Issues**: needs-response is one shared rule (`issueNeedsResponse`); status changes are conditional on the status the caller saw (`from`); system rows have a null author ("Automatic").
- **Owners may subscribe to a plan anywhere except at their own hostel** (409 `cannot_subscribe_own_hostel`).
- **Owner plan upgrade credit**: unused days of the old paid period are credited on the first bill of the new plan; no second free month.
- **Production refuses to start** on unsafe settings (`apps/api/src/lib/config-check.ts`); `UPLOAD_SIGNING_SECRET` is separate from `OTP_PEPPER`.
- **Browser tests** start `apps/api/src/e2e-server.ts` (adds an unauthenticated test clock route; refuses to run in production; excluded from Docker images). Production starts `src/index.ts`.
- Loading skeletons were removed from the hostel page and account/stay/issue pages: with Next 15.5 a form post under a `loading.tsx` could leave the page stuck. Search/area pages keep theirs in a `(list)` route group.
- Design: warm off-white + deep green, tokens with measured contrast. The UI/UX Pro Max palette (purple) was deliberately **not** adopted.

## 4. Completed work (all on `main`)

Each area has a ledger section in `PRPs/LEDGER.md` with file, function, test and command.

- **Seekers**: search with suggestions, filters in the URL, no-results recovery, stable paging, fair rating order ("New" under 3 reviews), hostel pages with verified reviews and the public issue record, visit requests, subscribe/pay, held-bed states.
- **Owners / partners**: for-owners page, listing, rooms, photos (own uploads only, EXIF stripped), plans with upgrade credit, partner application with brand-standards checklist, brand kit, roster/rent tracker, issues inbox with needs-response badge, editable review replies, menus/headcount, dashboard, next-step guidance.
- **Residents**: invites, issues with timeline and private photos, board, reviews, meal skips with IST cut-offs, moves, cancel.
- **Admins**: listing and partner decisions (conditional, whole checklist enforced), moderation, owner billing (waive audited), refunds due, payouts, revenue from live payments only, audit log, recently changed listings, audited admin actions in owner workspaces.
- **Money**: payment modes (live/test/simulated/waived), late-payment revive or refund queue, cancelled-move refund (migration 0013), no payment call inside the booking transaction, no overbooking.
- **Platform**: password login without SMS, demo isolation, rate limits (`TRUST_PROXY`), CSP nonces, production settings check, Docker deployment with HTTPS and backup/restore, Android app (all personas).
- **Docs**: `docs/product/acceptance.md`, `edge-cases.md` (all rows now closed or verified), `audit-{seeker,resident,owner,admin}.md`.

Verified on `b58a0e9` on 2026-11-13: typecheck 4/4, lint clean, shared 62, web unit 20, mobile 51, **API 270/270**, **browser suite 83/83 (6.5 min)**. Added after that: `apps/api/test/trust-boundaries.test.ts` (2 tests). Never run: Android on a device, real Razorpay/MSG91, real TLS certificates, off-machine backup copy.

## 5. Environment and exact commands

Cloud container: root, no Docker daemon or Postgres running after a restart.

```bash
cd /home/user/hostel
service postgresql start                 # Postgres 16 on :5432, user/password postgres/postgres
bun install
# optional, for deploy work: (nohup dockerd >/tmp/dockerd.log 2>&1 &); docker pull oven/bun:1.4.4-slim node:22-slim postgres:16-alpine caddy:2.10-alpine
```

Gates (run before every commit). Use **throwaway databases** (tests drop data):

```bash
bun run typecheck
bunx biome lint .
(cd packages/shared && bun test)
(cd apps/web && bun test ./test)
(cd apps/mobile && bun test)
PGPASSWORD=postgres createdb -h localhost -U postgres hostels_test_x 2>/dev/null
(cd apps/api && TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/hostels_test_x bun test)     # ~60 s
PGPASSWORD=postgres createdb -h localhost -U postgres hostels_e2e_x 2>/dev/null
(cd apps/web && E2E_DATABASE_URL=postgres://postgres:postgres@localhost:5432/hostels_e2e_x E2E_API_PORT=4108 E2E_WEB_PORT=3108 bun run e2e:fresh)   # builds Next; several minutes
(cd apps/mobile && npx expo export --platform android)
```

- The machine has **4 cores**: run at most ~3 heavy jobs (e2e builds) at once; give each its own DB names and ports.
- A test run started without the database existing hangs: create it first.
- Dev run: `bun run db:up` needs Docker; otherwise use the local Postgres above, `bun run db:migrate && bun run db:seed` in `apps/api`, then `bun run dev:api` and `bun run dev:web`. Demo logins (dev): admin 9000000001, owner 9000000002, tenant 9000000003 (OTP 123456 in dev).
- Production-style run (Docker): see `docs/DEPLOY.md`. Images need `--secret id=build_ca,src=/root/.ccr/ca-bundle.crt` when built behind this sandbox's TLS proxy.
- Python helper skill (read-only design rules): `/tmp/claude-0/-home-user-hostel/f53b5d03-9720-5113-97b7-2c21dbe01388/scratchpad/ext/uiux/` will be gone in a new session; re-clone `nextlevelbuilder/ui-ux-pro-max-skill` if wanted (treat as recommendations only).
- Network in this sandbox blocks: `getlayers.ai`, `devshreebharatia.substack.com`, the ThreeUI Notion page (owner wanted them used for design; **never read**), Android SDK/Maven (no APK built), OpenStreetMap tiles (maps show no tiles in tests).

## 6. Task status (what is and is not finished)

| Task | Status | Evidence |
|---|---|---|
| Port review fixes, owner plans, phase 6, backend fixes, payment modes, deployment | **Done, merged** | Ledger sections; PRs #1–#15 merged |
| Seeker, resident, owner persona audits | **Done, merged** | `audit-seeker.md`, `audit-resident.md`, `audit-owner.md` |
| Admin persona agent + ops hardening | **Done, merged** (rate limits, CSP nonces, O3, O7, O8, M10, verification enforcement) | `audit-admin.md`; one gap: the per-screen state/keyboard review was never done (listed in that file) |
| Cancelled-move paid bill: re-attribute + refund overpaid rent | **Done, merged** | migration `0013_move_cancelled_refund`; commit `b329085` |
| Final E2E verification, merge to main, close superseded PRs | **Done** for the code: gates pass on `b58a0e9`; merged to `main`; all PRs merged | see section 4 |

## 7. Next tasks, in priority order

1. **Build the three approved product gaps** (owner said yes): (a) change food plan or diet from the next bill without cancelling; (b) in-app signals: unread counts for residents' issue updates (the owner's needs-response badge exists); (c) account deletion and data export for India's DPDP Act 2023, keeping reviews anonymised. Each needs a spec note in `docs/superpowers/specs/`, API + web + app, edge cases and tests.
2. **Admin per-screen audit** (the gap in `audit-admin.md`): states, error words, keyboard-only, admin table paging beyond 500 rows; add an `admin:revoke` script (admin granted with `admin:grant` cannot be revoked today).
3. **Real-world verification (needs the owner's accounts)**: Android build on a device or emulator (SDK/Maven are blocked in the cloud sandbox: build with EAS or locally per `docs/RUN.md`); Razorpay test then live with **separate webhook secrets per mode** (owner approved); MSG91; a real domain for Caddy HTTPS; copy `deploy/backups/` off the machine.
4. **Scale items** before more than one API instance: move uploads to object storage; move rate limits and the job scheduler out of process.
5. **Small known items**: older private photos keep public keys; signed photo links last up to 90 minutes and can be shared; owner-added residents can still be fictitious (consider rent-record or admin spot-check before their reviews count in the rating).
6. Tidy: delete merged branches (owner's call).

## 8. Decisions made (by the owner, 2026-11-13: "yes for all decisions")

- Refund promise to payers: **within 7 days** (`REFUND_WITHIN_DAYS`); refunds stay manual in the Razorpay dashboard, then "Mark refunded" in admin.
- Use **different webhook secrets** for Razorpay test and live mode.
- Build the three product gaps in section 7.1.
- Product rules chosen during the work and kept: owners may take a plan anywhere but their own hostel; no second free month; "4★ and up" needs 3 reviews; transparency panel from 3 issues in 90 days; a move into a closed hostel is cancelled with a reason and the resident is never charged extra.

**Budget/safety (CLAUDE.md):** at most ₹100 external spend, target ₹0; no paid services, live transactions, public deployments or app-store builds without explicit approval; never commit secrets; never reset a database that may hold real data.

## 9. Where to look

| Need | File |
|---|---|
| What "done" means per journey | `docs/product/acceptance.md` |
| Edge cases + status | `docs/product/edge-cases.md` |
| What is verified, with commands | `PRPs/LEDGER.md`, `PRPs/00-completion-map.md` |
| Security posture and open items | `docs/security-review.md` |
| Run and settings | `docs/RUN.md`, `README.md`, `apps/api/.env.example` |
| Deploy, backup, restore, rollback | `docs/DEPLOY.md`, `deploy/` |
| Per-persona audits | `docs/product/audit-{seeker,resident,owner,admin}.md` |
