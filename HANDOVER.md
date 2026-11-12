# HANDOVER: Hostels platform

Written 2026-11-12 from the live repository state. Read this first, then `CLAUDE.md`, `PRPs/LEDGER.md` and `docs/product/*`.

## 0. Start here: where the unmerged work lives

Everything is now on GitHub (`thesuigeneris/hostel`). Nothing is container-only any more.

| Branch | Commit | What it is |
|---|---|---|
| `dev` and `claude/eager-hawking-4exijr` | the commit that adds this file on top of `3e7b22a` | The integrated, tested line of work. Always push to **both**. |
| **`persona-admin`** | `7782bdf` | The admin/ops agent's work, **unmerged**. Its last commit is a WIP commit of previously uncommitted files (CSP nonces, "Recently changed" screens), **not yet run through any gate**. See section 6. |

A new session should clone the repo, `git fetch origin dev persona-admin`, and work from there. The old agent worktrees under `.claude/worktrees/` are local to the old container and are not needed.

## 1. What this project is

One platform for hostel/PG living in Indian cities (starting Hyderabad), for four kinds of people:

1. **Seekers** search and judge hostels they can trust (verified reviews, public issue record).
2. **Owners / partners** ("OYO for unorganised hostels"): we give them a brand and a web app to run the hostel and charge them (plans Free / Pro ₹999 / Partner ₹1,999 per month, first month free).
3. **Residents** report issues, talk on a per-hostel board, review, skip meals, pay bills.
4. **Admins** (platform team) approve listings, verify partners, moderate, bill owners, handle refunds.

The loop: owners run their hostel on the app → residents are known → reviews and issue history are verified → seekers trust them → good hostels fill → more owners join.

Specs (the personas addendum wins on conflicts): `docs/superpowers/specs/2026-10-12-hostels-platform-design.md`, `docs/superpowers/specs/2026-10-24-personas-addendum.md`. The bar for "done": `docs/product/acceptance.md`. Edge cases and their status: `docs/product/edge-cases.md`. Requirement → code → test ledger: `PRPs/LEDGER.md`.

## 2. Repository and Git state (verified 2026-11-12)

- Remote: `thesuigeneris/hostel` (public). `main` is still the initial commit `bd774a8`.
- **`dev` = `claude/eager-hawking-4exijr` = `3e7b22a`**. This is the integrated, tested line of work. Always push to **both**.
- Main checkout `/home/user/hostel` is on `claude/eager-hawking-4exijr`, clean apart from this file.
- **PRs #1–#9 are all still open** (all from the same account, nothing new since 24 Oct):
  - #9 (`claude/hostels-best-of-both`) is the base `dev` was built on; `dev` contains all its commits.
  - #1–#5 (phases 1–5) and #8 (phase 6): every valid change is ported into `dev` with tests. #6 (README env keys) and #7 (API edge tests) were already in #9. **All superseded; none closed yet.**
  - `claude/hostels-platform` (no PR): a third from-scratch build; nothing left in it that `dev` lacks (its two bug fixes were already handled differently).
- `mudgala5540/Hostel` (the other account) is an **empty repo**: no commits, branches or PRs. An `add_repo` with push access was refused by the permission classifier; read access works.
- Local branches in worktrees (all merged into `dev` except `persona-admin`): `port-review-fixes`, `port-phase6`, `backend-fixes`, `payment-mode`, `persona-seeker`, `persona-resident`, `persona-owner`.
- `CLAUDE.md` says no merges/PRs/deployments without the owner's approval. The owner did ask for merging/pushing to `dev`; **ask before merging into `main` or closing PRs** unless told again.
- Commit trailers: follow the attribution instruction given in the new session (earlier commits here carry `Co-Authored-By: Claude Opus 5.5` and `Claude-Session: …`).

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

## 4. Completed work (all on `dev`)

Each area has a ledger section in `PRPs/LEDGER.md` with file, function, test and command:

- Combined build (#9): password login, demo isolation, frontend redesign, board likes, page views, insights.
- Review fixes from #1–#5: open redirect, billing edges, admin-removal, plan visibility.
- Phase 6 (#8): Android parity for all personas, owner/admin screens, brand-standards checklist, brand kit, audit log, owner billing oversight.
- Backend fixes M5 (overbooking), M6 (payment call out of transaction), M8/M9/M10 (private photos, relative URLs, EXIF stripping), photo receipts, CSP images.
- PRP-04: payment modes (M7), late payments and refund queue (M1), order-overwrite race (M2).
- Persona audits with checklists: `docs/product/audit-seeker.md`, `audit-resident.md`, `audit-owner.md`. ~80 defects fixed, each with a test that fails when the fix is reverted.
- Deployment (M12, M13): `deploy/` + `docs/DEPLOY.md`; built and run end to end, backup/restore drill tested.
- Production settings check; separate upload signing secret; health reports OTP `off` in production without SMS.
- Last three fixes (`3e7b22a`): an owner-added resident who subscribes is counted once; paused-partner subscribe message; photo reorder must list every photo once.

Test baselines on `dev`: **API 241/241** (verified at `3e7b22a`), shared 59, web unit 18, mobile 51, **web e2e 78/78** (last full run was at the owner merge, before `3e7b22a`; re-run), `expo export --platform android` exit 0.

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

## 6. The unfinished admin/ops work (in the `persona-admin` worktree)

Branch `persona-admin` (pushed, `7782bdf`) is based on `dev`'s predecessor merge (includes owner work, migration 0011).

**Committed there (8 commits, `10d98de`…`80e77f2`):**
- Partner verification requires every brand standard on every path; admin decisions are conditional updates.
- Review flags can be re-raised after un-hide; flags on non-live hostels refused; moderation queues.
- Recently-changed listings feed (O3) with partner re-check; audited admin actions through owner routes (O7).
- Waive-vs-pay and day-16 pause proven (O8, M10).
- Rate limits (M4) with `TRUST_PROXY` handling; page views de-duplicated.
- Duplicate comment/post sent twice saved once.
- An admin's comment/status move is not the hostel's "response".
- Migration **`0012_admin_oversight`**.

**In the final WIP commit `7782bdf` (14 files, unverified):** `apps/web/middleware.ts`, `apps/web/lib/csp.ts`, `apps/web/e2e/csp.spec.ts`, `apps/web/test/csp.test.ts` (CSP nonces, M14, **state and test results unknown**), `apps/web/next.config.ts`, admin "Recently changed" web page (`apps/web/app/admin/changes/`) and mobile screen (`apps/mobile/app/admin/changes.tsx`), edits to admin moderation/partners/index screens and `actions.ts`, `packages/shared/src/owner-admin.ts`, `packages/shared/test/admin.test.ts`.

**Not done / unknown:** final gates (API/e2e/mobile) on this branch; `docs/product/audit-admin.md`; ledger/edge-case/security-review updates for admin rows; the agent's final report (it was stopped by a usage limit mid-way through the "Recently changed" page). Verify that CSP nonces don't break pages, Razorpay Checkout or the e2e suite; if they do, keep `'unsafe-inline'` and document the trade-off in `docs/security-review.md`.

To resume: `git checkout persona-admin`, merge `dev` into it (expect conflicts only in docs/ledger), regenerate nothing unless the schema changed (its migration is 0012, so it must stay 0012 and land **before** the cancelled-move migration), run all gates, then fast-forward `dev` and `claude/eager-hawking-4exijr`.

## 7. Next tasks, in priority order

1. **Land the admin/ops work** (section 6): merge `dev` into `persona-admin`, run every gate, fix failures, push to `dev` and `claude/eager-hawking-4exijr`.
2. **Cancelled-move paid-bill fix** (new migration `0013`, after admin's 0012). In `completeDueMoves` (cancel path, `apps/api/src/services/moves.ts`): a bill already **paid** for a period on/after the move date at the destination's rent stays attributed to the destination hostel. Move it back to the origin hostel (payout attribution) and turn any rent paid above the origin room's rent into a `refund_due` row with a **new** reason `move_cancelled` (enum value in `packages/shared/src/types.ts` + `format.ts` text + migration `ALTER TYPE … ADD VALUE`). `recordPaymentException` (`services/refunds.ts`) always refunds the full bill, so add an optional partial amount. Never charge extra if the origin costs more. Tests: overpaid, underpaid, job rerun idempotent, payout attribution.
3. **Full end-to-end verification on the integrated branch**: every gate in section 5, plus a Docker production-stack smoke (see `docs/DEPLOY.md`, "What was tested"). Update `PRPs/LEDGER.md`.
4. **Close out the PRs** (ask the owner first): open `dev` → `main` PR (or fast-forward #9's branch), merge, close #1–#8 with a comment pointing at it. Keep or delete old branches per the owner.
5. **Remaining small defects** (below).
6. **Owner decisions** needed (section 8), then product gaps: change food plan from the next bill; in-app signals; account deletion/export (DPDP Act 2023).
7. **Verification that needs outside resources**: real device/emulator run of the Android app; real Razorpay (test then live) and MSG91; real HTTPS certificates; backups copied off-machine; print shops rendering Devanagari in the brand kit.

## 8. Known bugs, risks and open questions

Small defects reported by agents and **not yet fixed** (each needs a test that fails without the fix):
- `cancelSubscription` can't be limited to plans still pending: releasing a held bed re-reads the plan first, but a small race with a payment remains (`billing.ts`).
- Review flags: flags on hostels that stopped being live were accepted (the admin branch fixes this; confirm after merge).
- Two payments paths: a first bill can still be paid after the 30-min hold until the expiry job runs (late-payment revive covers the money, check the UX).
- Photos from before the photo fixes keep public `pho_` keys; outside links in old rows still show in the app (no real users; resetting dev DBs is enough).
- Signed private-photo links can be shared for up to 90 minutes, including by someone who just left the hostel.
- A transient axe failure ("Document does not have a non-empty title" on `/stay` after a Like) appeared once in `resident-journey` e2e and did not recur; watch for flakiness.
- Mobile seed photos load on a phone only if `API_PUBLIC_URL` is the computer's LAN address.
- Owner-added residents: an owner could still add people who never lived there (consider rent-record or admin spot-check before their reviews count).

**Questions for the owner (safest default chosen in code):**
- Refund promise: payers are told refunds come within **7 days** (`REFUND_WITHIN_DAYS`); not in the specs. Refunds are manual (Razorpay dashboard → "Mark refunded" in admin).
- Use **different webhook secrets** for Razorpay test and live mode (documented in `docs/RUN.md`).
- Upload signing/OTP secrets must be set in production or the API will not start.

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
| Per-persona audits | `docs/product/audit-{seeker,resident,owner}.md` (admin's does not exist yet) |
