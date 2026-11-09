# Requirement → implementation → test ledger

Status values:
- `verified`: the named test ran and passed at the named commit.
- `unverified`: the code exists, but the test can't reach it yet; the reason is given.
- `planned`: no implementation yet.
- `blocked`: needs credentials or approval.

A row is never `verified` just because the code exists.

## Baseline (inherited, verified this session at 09d279d)

| Req | Requirement | Implementation | Test | Status |
|---|---|---|---|---|
| BASE-OTP | OTP login with limits, hashed OTP and sessions | `services/auth.ts` | `test/auth.test.ts` (19) | verified @09d279d |
| BASE-LIST | Listing lifecycle and partner verification | `services/listings.ts` | `test/listings.test.ts`, e2e personas 1 | verified @09d279d |
| BASE-SUB | Subscribe with atomic bed reservation | `services/billing.ts` `reserveBed` | `test/subscriptions.test.ts` (concurrent subscribe) | verified @09d279d |
| BASE-PAY | Bills, signature checks, simulated payment | `services/payments.ts` | `test/billing.test.ts` | verified @09d279d (stub only) |
| BASE-FOOD | Menus, skips, headcount, moves, cancel | `services/food.ts`, `services/moves.ts` | `test/food-moves.test.ts`, e2e 6 | verified @09d279d |
| BASE-RES | Residencies, reviews, issues, board, plans, rent | `services/residents.ts`, `community.ts`, `plans.ts` | `test/personas.test.ts`, e2e 4–5 | verified @09d279d |
| BASE-BOB | Likes, views, insights, escalations, revenue | `services/insights.ts` | `test/best-of-both.test.ts` | verified @09d279d |
| BASE-MOB | Mobile app builds | `apps/mobile` | typecheck; `expo export --platform web` exit 0 | unverified: no native runtime check |

## PRP-01: auth modes, demo isolation, zero-cost login (done)

Gates run at `d774465`:
- `bun run typecheck` (4/4 exit 0) and `bunx biome lint .` (clean).
- Shared tests: 28 pass. API tests: 98 pass, run 3 times to check isolation. Mobile tests: 3 pass.
- `e2e:fresh`: 9/9 browser tests pass. `expo export --platform web`: exit 0.
- Mutation check: disabling the demo guard, the invite guard or the lock condition each made tests fail (4, 3 and 2 failures).

| Req | Requirement | Implementation | Test | Status |
|---|---|---|---|---|
| AUTH-PW | Phone + password sign-up and login, no SMS, in production | `services/auth.ts` `register`, `loginWithPassword`; routes `/auth/register`, `/auth/login` | `test/auth-modes.test.ts › password sign-up and login work in production without SMS`; production runtime check (API `NODE_ENV=production`, `/auth/methods` → otp off, password on) | verified @dd0faec |
| AUTH-GENERIC | Generic errors | `badCredentials()`, dummy-hash verify | `› login errors are generic` | verified @dd0faec |
| AUTH-THROTTLE | 5 tries per phone → 15-minute lock, unknown phones too, parallel-safe | `takeLoginAttempt` (atomic upsert with `setWhere`) | `› throttles per phone…`, `› throttle holds under parallel guesses` | verified @dd0faec |
| AUTH-POLICY | 15–128 characters, blocklist, sequences, phone | `packages/shared/src/passwords.ts`, `registerSchema` | `packages/shared/test/passwords.test.ts` (5), `› password policy` | verified @dd0faec |
| AUTH-DEMO | Demo login only for `is_demo`, never in production standard | `demoLogin`, `env.demoLoginEnabled` | `› demo login isolation`; runtime: production API `/auth/demo` → 403 | verified @dd0faec |
| AUTH-DEMO-MODE | Demo instance: no OTP, password or sign-up; simulated payments; webhooks ignored | `env.appMode`, `otpMode`, `isRazorpayConfigured`, `verifyWebhookSignature` | `› demo mode instance…`; runtime: `APP_MODE=demo` web `/login` shows only demo buttons | verified @dd0faec; webhook refusal verified by `auth-modes.test.ts` › a demo instance ignores correctly signed payment webhooks (mutation-checked; a standard instance accepts the same event) |
| AUTH-ISOLATION-ALL | One guard on every session path | `loginAllowed` in `createSession` + `getSessionUser` | `› isolation applies to every session path` | verified @dd0faec |
| AUTH-INVITE | Invites only for verified phones | `linkInvitedResidencies` guard | `› invites need a verified phone` | verified @dd0faec |
| AUTH-ADMIN | `ADMIN_PHONES` needs a verified phone; `admin:grant` script | `resolveRole`, `grantAdmin`, `src/scripts/grant-admin.ts` | `› admin needs a verified phone…`, `› ADMIN_PHONES applies after OTP…` | verified @dd0faec (script CLI wrapper itself not run; `grantAdmin` is) |
| AUTH-CHANGE | Set or change password; other sessions revoked | `changePassword`, `/me/password`; web `/account` card | `› password change…`; `e2e/auth.spec.ts` (change, then log in with the new password) | verified @d774465 |
| AUTH-SEED-GUARD | `db:reset` refuses in production standard | `assertResetAllowed` | `› seed reset guard`; runtime: `NODE_ENV=production bun run db:reset` refused, data intact | verified @dd0faec |
| AUTH-TRUNCATE | Test resets cover every table (found during execution) | `ALL_TABLES` derived from the schema | repeated API runs (3×) stable | verified @dd0faec |
| AUTH-WEB | Web password sign-up/log-in, demo buttons | `apps/web/app/login/*`, `apps/web/app/account/*` | `e2e/auth.spec.ts` (2 tests) | verified @d774465 |
| AUTH-MOBILE | Mobile password, sign-up and demo login | `apps/mobile/app/login.tsx` | `apps/mobile/scripts/web-login-smoke.mjs` against the Expo web export and a live dev API: OTP login, password sign-up then login, demo button, wrong password refused (4/4) | verified in the web build; **native unverified** (secure storage, keyboards: needs a device) |

## PRP-12 Frontend design system and visual upgrade

| ID | Requirement | Implementation | Test / evidence | Status |
|---|---|---|---|---|
| UI-TOKENS | One token system, AA contrast for text | `apps/web/lib/tokens.ts` → `tailwind.config.ts` | contrast measured (`docs/design/system.md`); axe clean on `/`, `/hostels`, `/login`, `/for-owners` | verified (batch 1) |
| UI-PRIMITIVES | Reusable primitives, no parallel system | `components/ui.tsx`, `Photo`, `NavLinks` | typecheck; all existing pages render (45-check sweep) | verified (batch 1) |
| UI-SHELL | Skip link, focus, current page, mobile menu | `app/layout.tsx`, `SiteHeader.tsx`, `NavLinks.tsx` | `design.spec.ts` › skip link, › mobile menu | verified (batch 1) |
| UI-HOME | Homepage sections from real data only | `app/page.tsx` | `design.spec.ts` › search works without 3D; code review: every number from the API or `@hostels/shared` constants | verified (batch 1) |
| UI-3D | Lazy 3D hero with fallbacks | `components/hero/*` | `design.spec.ts` › 3D renders / reduced motion one frame / no WebGL static / three only on `/` | verified (batch 1), including › lost context falls back to the illustration (`WEBGL_lose_context`) |
| UI-MOTION | Reduced-motion policy, no global animation cost | `components/motion.tsx`, `MotionProvider.tsx`, `globals.css` | reduced-motion test; bundle 106 → 108 kB on `/` | verified (batch 1) |
| UI-RESPONSIVE | No overflow at 360–1440 | layout fixes on `/account`, `/hostels/[slug]` | `design.spec.ts` overflow ×5 widths; `baseline.mjs` 45/45 | verified for the swept routes; remaining workspace routes in batch 4 |
| UI-SEARCH | Filter drawer, chips, pagination, no-results recovery | `SearchFilters`, `FilterDrawer` (native modal dialog), `SearchResults`, `SearchViewToggle`, `Pagination` | `e2e/search.spec.ts` › phone filter sheet, › desktop inline + clear all, › no results, › pagination, › map text list | verified (batch 2) |
| UI-PROPERTY | Gallery, price breakdown, availability freshness, axe fixes | `PhotoGallery`, `app/hostels/[slug]/page.tsx`; API `room_types.beds_updated_at` (migration 0005) | `listings.test.ts` › bed count freshness (mutation-checked); `search.spec.ts` › property page, › gallery, › sticky bar, › axe on property/area/map | verified (batch 2) |
| UI-STATUS | Plain-language status labels per record type | `StatusBadge kind` in all 20 call sites; visit next-step text on `/account` | typecheck; workspace sweep renders every status page; persona flows assert issue states | verified (batch 4) |
| UI-CACHE | Public pages reflect approvals and edits immediately (found during execution) | `publicApi` tag + `revalidateTag` in `run()` | `personas.spec.ts` › 2, `golden-path.spec.ts` (failed on stale cache before the fix) | verified (batch 2) |
| UI-OWNERS | `/for-owners` and onboarding stepper | `app/for-owners/page.tsx` (steps, owner FAQ from shared constants, unbacked "thousands of students" and "live bed counts" claims removed); `ListingProgress`; `OwnerTabs` (`aria-current`, labelled lock); owner rooms show bed freshness | `e2e/owners.spec.ts` (2 tests, incl. axe on `/for-owners`); full suite 32/32 | verified (batch 3) |
| UI-WORKSPACES | Owner, resident, admin workspaces | labels on unlabeled controls (community post, photo upload, weekly menu grid, admin fee and reason); white-on-amber Pay button fixed; display font for page headers | `e2e/workspaces.spec.ts`: 26 signed-in routes × axe (WCAG 2.2 AA serious/critical) × overflow at 360/390/768/1024/1440, plus role-aware nav and server-side role redirects; full suite 36/36 | verified (batch 4) for the demo-data states; states the seed doesn't produce (e.g. a rejected listing, an overdue resident) are not swept |
| UI-ROLES | Navigation matches the role; hidden links are not the guard | `SiteHeader` links per role; `requireUser` in owner and admin layouts | `workspaces.spec.ts` › navigation matches the role (tenant → /admin and /owner redirected to login; owner → /admin redirected) | verified (batch 4) |

## Review fixes ported from PRs #1–#5, and owner subscriptions

The phase 1–5 branches got review fixes (`ba33254`, `517f837`, `e0309ec`, `4a01924`, `4787a49`, and the security review in `de5719a`) after this branch copied them. None were already fixed here; all are ported below. `ba33254` had to be adapted: this branch also grants admin with `admin:grant`, so server-granted admins are recorded (`users.admin_granted_at`) and keep the role.

Gates run at `a1f9d34` on disposable databases (`hostels_test_a`, `hostels_e2e_a`; e2e on ports 4101/3101):
- `bun run typecheck` (4/4 exit 0) and `bunx biome lint .` (clean).
- Shared tests 28 pass; web unit tests 2 pass (`apps/web/test`); mobile tests 3 pass; API tests 110 pass.
- `e2e:fresh`: 41/41.
- Each fix was reverted on its own and its test failed, then restored.

| Req | Requirement | Implementation | Test | Status |
|---|---|---|---|---|
| REV-ADMIN | Removing a phone from `ADMIN_PHONES` takes admin away from live and new sessions (drops to owner); server-granted and seeded admins keep it | `services/auth.ts` `resolveRole`, `withLiveRole`, `grantAdmin`; `users.admin_granted_at` (migration 0006); `db/seed.ts`; `PATCH /me` keeps the session role | `auth.test.ts` › removing a phone from ADMIN_PHONES…, › an admin granted on the server keeps admin…, › the seeded demo admin keeps admin… | verified @ef97189 |
| REV-CANCEL | Cancelling after paying the next bill early keeps the plan to the end of that period | `billing.ts` `cancelSubscription` | `billing.test.ts` › cancelling after paying the next bill early… | verified @676a9ea |
| REV-PLAN | A plan change voids only bills for periods not yet started and doesn't lift a suspension | `plans.ts` `switchPlan` | `personas.test.ts` › a plan change never voids the bill for a month already used (incl. upgrade while overdue stays suspended) | verified @676a9ea |
| REV-ROOM | A room type in a move request can't be deleted (was a foreign-key 500) | `listings.ts` `deleteRoomType` | `food-moves.test.ts` › a room a tenant is moving into cannot be deleted | verified @676a9ea |
| REV-MANAGE | Any role can read and manage the plan it holds: plan, bills, food, moves | `routes/tenant.ts` (`signedIn`) | `billing.test.ts` › a subscriber who later signs in as an owner still manages their plan; `routes.test.ts` › tenant routes; `subscriptions.test.ts` › needs a signed-in user with a plan | verified @676a9ea |
| REV-REDIRECT | `next` and `_back` can't leave the site (`/\host`, tab tricks) | `apps/web/lib/paths.ts` `safePath` | `apps/web/test/paths.test.ts` (2); `e2e/handoff.spec.ts` › app hand-off…, › login form… | verified @1539dec |
| REV-WEB-PLAN | `/account` and `/account/move` show a plan whatever the role | `app/account/page.tsx`, `app/account/move/page.tsx` | `e2e/plans-any-role.spec.ts` › a subscriber who later signs in as an owner… | verified @f30d72b |
| REV-MOBILE-PLAN | My Stay shows a plan whatever the role | `apps/mobile/app/(tabs)/stay.tsx` | typecheck only | unverified: no mobile runtime test reaches My Stay |
| SUB-ANY-ROLE | Any signed-in user may start a plan (product decision) | `routes/tenant.ts` subscribe uses `signedIn` | `subscriptions.test.ts` › an owner can take a plan at someone else's hostel… (201, pays, active) | verified @a1f9d34 |
| SUB-NOT-OWN | Never at a hostel you own: 409 `cannot_subscribe_own_hostel`; moves follow the same rule | `billing.ts` `subscribe`, `moves.ts` `scheduleMove`; code in `packages/shared/src/types.ts` | `subscriptions.test.ts` › …never at their own, › an owner with a plan elsewhere cannot move it into their own hostel; `billing.test.ts` › free listings, the hostel's own owner… | verified @a1f9d34 |
| SUB-ADMIN | Admins subscribe like anyone, except at a hostel they own | same | `subscriptions.test.ts` › admins may take a plan like anyone… | verified @a1f9d34 |
| SUB-WEB | Subscribe offered to owners on others' hostels; explained (with Manage link) on their own; My plan link for owners and admins | `app/hostels/[slug]/page.tsx`, `app/subscribe/[slug]/page.tsx`, `components/SiteHeader.tsx` | `e2e/plans-any-role.spec.ts` › an owner subscribes at someone else's hostel…, › an owner is not offered a plan at their own hostel | verified @a1f9d34 |
| SUB-MOBILE | Same in the app: notice instead of Subscribe on your own hostel; subscribe screen explains | `apps/mobile/app/hostel/[slug].tsx`, `apps/mobile/app/subscribe/[slug].tsx` | typecheck only | unverified: no mobile runtime test |

## Phase 6 ported from PR #8 (owner and admin gaps, seeker and resident gaps, Android app)

Source: `git diff origin/claude/project-thread-mkzfg6-phase5 origin/claude/project-thread-mkzfg6-phase6` (the review fixes it merged are the section above). Web pages were rebuilt on this branch's design system, not copied. Where this branch already had the feature (owner insights, admin revenue and escalations, cache refresh on public pages), the two were merged rather than duplicated. The phase 6 migration `0003_owner_admin.sql` was not copied: `schema.ts` was edited and `0007_owner_admin` generated, with the backfill added by hand.

Gates run at `ba33a75` (on top of the review-fix merge `d452d23`) on disposable databases `hostels_test_b` and `hostels_e2e_b` (e2e on ports 4102/3102):
- `bun run typecheck` (4/4 exit 0) and `bunx biome lint .` (clean).
- Shared tests 28 pass; web unit tests 2 pass; mobile tests 39 pass (3 before); API tests 119 pass (110 before).
- `e2e:fresh`: 48/48 (41 before).
- `npx expo export --platform android`: exit 0 (Hermes bundle). Mobile login smoke (`scripts/web-login-smoke.mjs` against the web export and a dev API): 4/4.
- Migration backfill: run twice inside a rolled-back transaction on `hostels_test_b` with a verified hostel with food, one without, an applied one and a non-partner: 10, 9 and 0 standards, no duplicate rows, nothing for the non-partner.

| Req | Requirement | Implementation | Test | Status |
|---|---|---|---|---|
| P6-PARTNER | Partner applications with the in-person brand standards checklist; progress saved; verify only when every applicable standard is ticked (kitchen only with food); decision kept | `services/partners.ts`; `listings.ts` `applyForPartner`, `decidePartner`; tables `partner_applications`, migration 0007 + backfill; web `app/admin/partners`; mobile `app/admin/partners.tsx` | `owner-admin.test.ts` › the inspection checklist must be complete…, › hostels without food skip the kitchen check…; `e2e/personas.spec.ts` 1, `golden-path.spec.ts` (tick standards, verify) | verified @df59ab9 / @623fc0c; mobile checklist screen typecheck only (unverified: no mobile runtime test) |
| P6-BRAND | Brand kit for verified partners (signboard, poster, door sticker as SVG; download) and standards on the Plan page | `partners.ts` `brandKit`, `ownerPartnerInfo`; `lib/brand-kit.ts`; `app/owner/hostels/[id]/brand/*`, `plan/page.tsx` | `owner-admin.test.ts` › the brand kit is for verified partners only; `e2e/owner-admin.spec.ts` › owner sees the dashboard… (SVG content type, attachment, hostel name; 403 for a free listing) | verified @623fc0c |
| P6-INSIGHTS | One insights endpoint: this branch's summary (views, visit requests, occupancy, locked on Free) plus the phase 6 dashboard (issue ages, categories, response times, occupancy by room, the month's money on paid plans) | `services/insights.ts` `ownerInsights`; `OwnerInsights` in `types.ts`; `app/owner/hostels/[id]/dashboard` | `best-of-both.test.ts` › page views and owner insights; `owner-admin.test.ts` › Free hostels get issue health only…; `e2e/owner-admin.spec.ts` | verified @df59ab9 |
| P6-BILLING | Admin owner plans with dues and pauses; owner bill filters; waiving a bill lifts the pause; overview counts | `plans.ts` `adminOwnerPlans`, `adminOwnerInvoices`, `voidOwnerInvoice`; `app/admin/billing`, `app/admin/page.tsx` | `owner-admin.test.ts` › owner plans show dues and pauses; waiving…; `e2e/owner-admin.spec.ts` › admin filters owner bills, waives one… | verified @623fc0c |
| P6-AUDIT | Audit log of admin actions (approvals, partner decisions and checklist, fees, food partners, payouts, moderation, waived bills, jobs) | `services/audit.ts`; `routes/admin.ts`; `app/admin/audit` | `owner-admin.test.ts` (waive audited); `e2e/owner-admin.spec.ts` (filter by action, jobs row) | verified @623fc0c |
| P6-SEARCH | Admin listing and partner search; paused partners ranked like free listings | `routes/admin.ts` `q`; `search.ts` recommended order | `owner-admin.test.ts` › admin tables search…; `e2e/owner-admin.spec.ts` (listing search) | verified @df59ab9 (ranking: code review only, no test pauses a partner and searches) |
| P6-RENT | Rent page "still unpaid" in rupees (was a resident count shown as money); WhatsApp reminders | `app/owner/hostels/[id]/rent/page.tsx` | workspace sweep renders `/rent` | unverified: no test asserts the amount |
| P6-REVIEWS | Review cards: confirmation source, stay span, sub-ratings, written/edited dates, dated reply; report with a reason; review pages | `components/Reviews.tsx`; `app/hostels/[slug]/page.tsx` | `e2e/seeker-resident.spec.ts` › review cards show the stay…; `personas.spec.ts` 5 | verified @0f52e26 |
| P6-EDIT-REVIEW | Residents edit their own review in place; food rating only where food is served; why a stay can't be reviewed | `residents.ts` `myResidencies`; `app/stay/[hostelId]/page.tsx` | `seeker-resident.test.ts` › say why a stay cannot be reviewed yet…; `e2e/seeker-resident.spec.ts` › a resident edits their own review in place | verified @0f52e26 (no-food form: API only) |
| P6-VISIT | `DELETE /me/visits/:id` withdraws an unanswered request (conditional update); account Withdraw; hostel page shows the pending request | `visits.ts` `cancelVisit`; `app/account/page.tsx`; hostel page | `seeker-resident.test.ts` › a seeker can withdraw…, › withdrawing more than once at the same time closes the request once; `e2e/seeker-resident.spec.ts` › a seeker withdraws a visit request | verified @df59ab9 (the parallel test did not fail when the update was made unconditional, so it is a behaviour check, not a race proof) |
| P6-ISSUE | Issue status timeline with response and fix times; reopen offered only inside 7 days (API already enforces it) | `app/issues/[id]/page.tsx` | `e2e/seeker-resident.spec.ts` › issue pages show where the issue is… | verified @0f52e26 |
| P6-PUBLIC | "Too few issues" note; hostel page with no rooms; area pages say so when the API is down; filtered search and area pages noindex; bill paid dates | hostel, area and search pages; `app/account/page.tsx` | `e2e/seeker-resident.spec.ts` › only the plain search and area pages are indexable; › issue pages… (paid date) | verified @0f52e26 for noindex and paid dates; unverified: API-down area page and no-rooms page (no test stops the API or empties rooms) |
| P6-LOADING | Loading skeletons | `app/hostels/(list)/loading.tsx`, `app/hostels-in/[area]/loading.tsx` | e2e suite | partly ported: skeletons on routes that forms post back to (hostel, account, stay, issue) were dropped, because a loading boundary above the target made server-action redirects hang (reproduced in Chromium, Next 15.5) |
| P6-CACHE | Admin listing, partner and review decisions show on public pages at once | `app/admin/actions.ts` `publicChange` plus `run()`'s public data tag | `personas.spec.ts` 2 (verified badge right after verifying) | verified @623fc0c |
| P6-ANDROID | Android build: icon, adaptive icon, splash, versionCode, per-build URLs, cleartext only in dev/preview, EAS profiles, scripts, RUN.md section | `apps/mobile/app.config.ts`, `app.json`, `eas.json`, `assets/`, `package.json` | `npx expo export --platform android` exit 0 | unverified: no Gradle or EAS build run (needs the Android SDK or an Expo account) |
| P6-MOBILE | Seeker and resident parity screens; owner and admin screens | `apps/mobile/app/**`, `lib/owner.ts`, `lib/stay.ts` | `apps/mobile/test/owner.test.ts`, `stay.test.ts`, `search.test.ts` (39); login smoke 4/4 | screen logic verified @ba33a75; screens unverified on a device |

## Backend fixes: overbooking, the booking transaction, uploads (M5, M6, M8–M10)

Branch `backend-fixes`. Commits: `8289685` (M5), `5dab7b6` (M6), `f469d7d` (M8, M9), `8edb050` (M10), `09d7907` (photos must be the caller's own uploads; image CSP; seed photos), and merges `f09fcf2` and `916b681` of `claude/eager-hawking-4exijr`. No migration.

How private photos work: an upload's key prefix records its visibility (`pho_` public listing photo, `att_` private attachment) and the upload returns a receipt bound to the uploader. Rows store `/uploads/<key>`; links are built per response. Private links are signed, expire within 60–90 minutes, and are only built in responses that passed `requireMember`. Signed links were chosen over a session check on each image request because the website shows photos with plain `<img>` (its session cookie isn't sent to the API) and the app's `<Image>` would need the bearer token on every request; one signed link works in both.

Gates run at `916b681` on disposable databases (`hostels_test_c`, `hostels_e2e_c`; e2e on ports 4103/3103):
- `bun run typecheck` (4/4 exit 0) and `bunx biome lint .` (clean).
- Shared tests 28 pass; web unit tests 2 pass; mobile tests 39 pass; API tests 134 pass (119 before).
- `e2e:fresh`: 49/49 (48 before; new `photos.spec.ts`, and the golden path now attaches a private photo to an issue).
- Each fix was reverted on its own and its new tests failed, then restored: M5 (3 tests), M6 (2), M8 and M9 with the route and services reverted (6), M10 (4), receipt signature check removed (2), purpose check removed (2), the old `img-src` (`photos.spec.ts`).

| Req | Requirement | Implementation | Test | Status |
|---|---|---|---|---|
| BF-M5 | An owner's room edit never gives back a bed booked meanwhile; beds held by pending or active plans and scheduled move-ins can't be freed or removed; the refusal says how many are held | `listings.ts` `updateRoomType` (difference from `totalBedsWas`/`bedsAvailableWas`, row lock, one conditional UPDATE), `heldBeds`, `bedChangeRefused`; `roomTypeUpdateSchema`; web rooms form and mobile `RoomCard` send the counts they showed | `listings.test.ts` › saving a form opened before a booking never gives the booked bed back, › rent edits racing bookings keep every booked bed taken, › beds held by plans cannot be removed or marked free… | verified @916b681; the web and app forms: typecheck and the e2e owner flows only (no test saves the form while a booking lands) |
| BF-M6 | No payment-gateway call inside the booking transaction: the order is made at checkout; a failure is a 503 the tenant can retry; an unpaid plan still frees its bed after 30 minutes; Razorpay calls time out after 15 s | `billing.ts` `subscribe`; `payments.ts` `orderFor`; `lib/razorpay.ts`; web `createOrderAction`, `RazorpayButton` show the error | `subscriptions.test.ts` › while the payment service is slow, the room stays open…, › if the payment service fails, the tenant can retry…; tests that need an order open checkout first (`fixtures.ts` `checkoutOrderId`) | verified @916b681; the pay page's error message: unverified (stub orders never fail in e2e) |
| BF-M8 | Issue and post photos are private: served only through signed, expiring links handed to residents, the owner and admins; 404 otherwise; `Cache-Control: private` | `lib/uploads.ts` `photoUrl`, `signedLinkSecondsLeft`; `routes/uploads.ts`; `community.ts` | `uploads.test.ts` › only residents, the owner and admins get a working link…, › community posts work the same way; `e2e/golden-path.spec.ts` (the resident's and the owner's pages load the photo; the bare file is a 404) | verified @916b681; app `<Image>` with signed links: typecheck only (unverified: no device run) |
| BF-M9 | Photos stored as `/uploads/<key>`, links built from the current `API_PUBLIC_URL` per response; older absolute links rewritten on read | `lib/uploads.ts` `uploadKeyOf`, `photoUrl`; `mappers.ts` `toPhoto`; `search.ts`; `storage.put` no longer builds links | `uploads.test.ts` › a listing photo is public, stored as a path, and follows the API address, › older rows that stored an absolute link get the current address | verified @916b681 |
| BF-M10 | Photo metadata removed: JPEG, PNG and WebP re-encoded with sharp (EXIF incl. GPS, XMP, ICC, text chunks, trailing bytes dropped), orientation applied first; over 60 MP or undecodable refused | `lib/images.ts` `stripMetadata`; `routes/uploads.ts`; `sharp` in `apps/api/package.json` | `uploads.test.ts` › jpeg / png / webp: EXIF and GPS are gone and the photo keeps its upright orientation, › png text chunks and bytes hidden after a jpeg go too… | verified @916b681 |
| BF-OWN | Photos are the caller's own uploads, for the right purpose: attached by receipt; outside links, bare paths, other people's uploads and the wrong purpose refused | `lib/uploads.ts` `uploadReceipt`, `claimUpload`; `photo` in `photoInputSchema`, `issueInputSchema`, `postInputSchema`; `listings.ts` `addPhoto`; `community.ts`; web `lib/upload.ts`; app `lib/upload.ts`, `lib/ownerUpload.ts` | `uploads.test.ts` › an owner can only add listing photos they uploaded, › a resident can only attach their own private uploads…; `packages/shared/test/schemas.test.ts` › photos are upload receipts, never links | verified @916b681; app upload screens: typecheck only (unverified: no device run) |
| BF-CSP | The website loads images only from itself, the API origin, OpenStreetMap tiles and Razorpay | `apps/web/next.config.ts` | `e2e/photos.spec.ts` (no `https:` in `img-src`; a seeded photo loads; an outside image raises an `img-src` violation) | verified @916b681; Razorpay Checkout's own images not exercised (stub mode) |
| BF-SEED | Demo listing photos are drawn and stored as uploads, not stock-photo links | `db/seed-photos.ts`; `seed.ts` | `e2e/photos.spec.ts` (seeded cover photo comes from the API and loads); `routes.test.ts`, `auth.test.ts` run the seed | verified @916b681 |

## PRP-04: payment modes (M7) and late payments (edge case M1)

Branch `payment-mode`, from `claude/eager-hawking-4exijr` at `12c866c`. `schema.ts` was edited and `0008_payment_mode` generated; the backfill was added by hand before the check constraints it has to satisfy.

Decisions:
- `payment_mode` enum on tenant and owner bills: `razorpay_live`, `razorpay_test`, `simulated`, `waived`. Null while due, and on bills the system voided (plan change, cancelled or expired plan). Check constraints: a paid bill always has a paid mode, only a paid bill has one, and `waived` only on a void owner bill.
- Real money is `razorpay_live` only (`REAL_MONEY_MODES`). Test-mode Razorpay moves no money, so it is never paid out either. The mode comes from the key id prefix; any key that isn't `rzp_live_` counts as test, so a misconfiguration can only under-count. An order the stub made (`order_stub_`) is simulated whatever keys are set later.
- Admin revenue is now money received in the IST month (fees on tenant bills and owner plan bills paid with real money), replacing the run-rate of plans and subscriptions in force: that run-rate counted plans paid by simulation and waived bills as revenue. The admin billing page's "Monthly plan revenue" (list prices of plans in force) became "Plan bills paid" for the same reason.
- Backfill: paid with no payment id, or stub/seed ids: simulated; any other Razorpay id: test mode (no live account was ever connected); void owner bills the audit log shows waived: waived; pending payouts dropped (none has real money behind it after the backfill; paid payouts stay).
- Late payments: revive only the first bill of an expired plan, inside its period, at a still-bookable hostel, for a payer with no other open plan, and only if a bed can be taken; otherwise a refund due. A second payment for a paid bill, and payments for void or waived owner bills, are refunds due. Refunds are made by hand in Razorpay and recorded by an admin.

Gates run on disposable databases `hostels_test_d` and `hostels_e2e_d` (e2e on ports 4104/3104):
- Before merging the backend fixes, at `3e553bf`: API tests 136 pass (119 before); `e2e:fresh` 50/50 (48 before).
- After merging them (`c17d630`, which also adapts the payment-mode tests to orders now being created at checkout): `bun run typecheck` (4/4 exit 0) and `bunx biome lint .` (clean); shared tests 30 pass (28 before); web unit tests 2 pass; mobile tests 39 pass; API tests 151 pass (134 on the merged base + 17 new); `e2e:fresh` 51/51 (49 on the merged base + 2 new).
- Mutation checks, each reverted on its own and restored (the first, the late-payment one and the order one repeated after the merge, with the same failures): counting every paid bill again (4 tests fail), dropping the `waived` mark (2), ignoring the stub-order rule (1), removing the simulate guard (1), keeping stale pending payouts (1), mis-classifying the backfill (1), the old log-and-throw late-payment path (7), the old order overwrite (1, once the race test was made deterministic with a latch in the mocked Razorpay order call), and removing the bill row lock (1).

| Req | Requirement | Implementation | Test | Status |
|---|---|---|---|---|
| PAY-MODE | Every bill records how it was paid, on every path: checkout callback and webhook (from the key prefix), simulate, stub-signed checkout, admin waiver | `schema.ts` `paymentModeEnum`, `invoices.paymentMode`, `ownerInvoices.paymentMode`, checks; migration 0008; `lib/razorpay.ts` `razorpayKeyMode`, `paymentModeFor`, `instancePaymentMode`; `services/payments.ts` `markOrderPaid`, `verifyCheckout`, `simulatePayment`; `routes/payments.ts` webhook; `plans.ts` `voidOwnerInvoice` | `payment-modes.test.ts` › every payment path records how the bill was paid, › owner bills: paid bills record the mode; a waived bill is void and marked waived…, › replayed webhooks never change how a paid bill was paid | verified @fd7f6e5 |
| PAY-LIVE | A live instance (production standard with keys) refuses the simulate endpoint and stub signatures | `simulatePayment` guard and `verifyPaymentSignature` (both already in place; test added) | `payment-modes.test.ts` › a live instance refuses simulated payments and stub signatures | verified @fd7f6e5 |
| PAY-PAYOUTS | Payouts pay out real money only; regenerating drops a pending payout no real money is behind | `services/money.ts` `realTenantMoney`; `payouts.ts` `generatePayouts` | `food-moves.test.ts` › payouts (a simulated subscriber is left out); `payment-modes.test.ts` › payouts pay out real money only… | verified @fd7f6e5 |
| PAY-REVENUE | Platform revenue is real money received in the month; what was left out is reported; waived bills are never revenue | `money.ts` `platformRevenue`, `adminRevenue`; `/admin/stats`, `GET /admin/revenue` | `best-of-both.test.ts` › admin revenue; `payment-modes.test.ts` › platform revenue… | verified @fd7f6e5 |
| PAY-OWNER | The owner's payouts this month and dashboard money count real money only, with the rest named | `payouts.ts` `ownerPayouts`; `insights.ts` `ownerInsights` | `payment-modes.test.ts` › the owner's payouts and insights…; `owner-admin.test.ts` › owner insights | verified @fd7f6e5 |
| PAY-BACKFILL | Migration 0008 backfills old bills, waived bills and pending payouts | `migrations/0008_payment_mode.sql` | `payment-modes.test.ts` › migration 0008 (runs the file's own backfill and check statements on legacy-shaped rows in a rolled-back transaction) | verified @fd7f6e5 |
| PAY-WEB | Admin home "Money received" with the not-counted line and refunds due; admin payouts and owner payouts notes; owner dashboard note; billing page "Plan bills paid", Waived vs Cancelled, mode under paid bills; dev banner names Razorpay test mode | `app/admin/page.tsx`, `app/admin/payouts`, `app/admin/billing`, `app/owner/payouts`, owner dashboard, `app/layout.tsx`, `components/ui.tsx` | `e2e/payments.spec.ts` › simulated payments are shown apart…; `e2e/owner-admin.spec.ts` › admin filters owner bills, waives one… (Waived filter and label); `workspaces.spec.ts` sweep (axe, overflow) | verified @3e553bf for the admin pages; owner payouts and dashboard notes render in the sweep but no test asserts their text (unverified text) |
| LATE-REVIVE | A payment landing after the bed hold expired revives the plan when a bed is free: bed, plan, bill (with its mode) and residency in one savepoint | `payments.ts` `settleLatePayment`, `reviveExpiredPlan`; `billing.ts` `activateIfPending(…, 'expired')` | `late-payments.test.ts` › revives the plan when a bed is still free…, › deliveries of the same late payment arriving together… | verified @fd7f6e5 |
| LATE-REFUND | Otherwise a durable refund-due record (order, payment, amount, bill, reason); the payer is told on `/pay`; an admin marks it refunded (audited); owner bills waived or dropped before the payment arrived, and second payments, too | table `payment_exceptions`; `services/refunds.ts`; `routes/admin.ts` `/admin/payment-exceptions`; `app/pay/[invoiceId]`, `app/admin/billing` (Payments to refund) | `late-payments.test.ts` › when the bed went meanwhile…, › a payer who started another plan…, › a plan the payer cancelled…, › a second payment…, › owner bills…; `e2e/payments.spec.ts` › a payment that lands after its bill closed is refunded… | verified (API @fd7f6e5, web @3e553bf) |
| LATE-ONCE | Webhooks stay 200 and idempotent: one row per payment id, concurrent deliveries settle once, unknown orders acknowledged | unique `razorpay_payment_id`; bill row `FOR UPDATE` | `late-payments.test.ts` (repeated and concurrent deliveries), › an order nobody knows is acknowledged… | verified @fd7f6e5 |
| PAY-TWO-TABS | Two tabs opening checkout pay the one order the bill points at (it was overwritten, so one tab paid an order no bill pointed at) | `payments.ts` `orderFor` (conditional on no order yet) | `late-payments.test.ts` › two tabs opening checkout… | verified @fd7f6e5 |
| PAY-MOBILE | App: Refunds tab with mark refunded, Waived/Cancelled owner bills, not-counted notes on payouts, refunds due on the admin home | `apps/mobile/app/admin/billing.tsx`, `admin/payouts.tsx`, `owner/payouts.tsx`, `admin/index.tsx` | typecheck only | unverified: no mobile runtime test reaches these screens |
| PAY-REFUND-DAYS | The payer is promised a refund within 7 days | `REFUND_WITHIN_DAYS` in `packages/shared/src/pricing.ts`; `refundMessage` | `packages/shared/test/format.test.ts` | open question: not in the specs; confirm the number (`00-completion-map.md`) |

## Production settings check and separate upload signing secret

| ID | Requirement | Implementation | Test / evidence | Status |
|---|---|---|---|---|
| CFG-PROD | Production refuses to start on unsafe settings (missing, short or dev secrets; non-https public links; half-set key pairs; real Razorpay without a webhook secret; invalid admin phones), listing every problem | `productionConfigProblems`, `assertProductionConfig` in `apps/api/src/lib/config-check.ts`; called first in `src/index.ts` | `test/config-check.test.ts` (10); runtime: `NODE_ENV=production bun run src/index.ts` with no settings exits 1 listing 6 problems, with valid settings starts and `/` answers | verified (this session) |
| CFG-SIGN | Upload receipts and private photo links use `UPLOAD_SIGNING_SECRET`, independent of `OTP_PEPPER` | `env.uploadSigningSecret`; `receiptKey`, `linkKey` in `lib/uploads.ts` | `uploads.test.ts` › receipts are signed with their own secret (fails with the old shared secret, checked by reverting) | verified (this session) |
| CFG-HEALTH | Health reports OTP as `off` in production without SMS, so the website shows no "OTP is 123456" banner to real users | `routes/public.ts` uses `otpMode()`; `Health.msg91` gains `off` | `routes.test.ts` (dev still `stub`); full API suite 162/162 | verified (this session) |

## Resident persona (R1–R5): audit, fixes and journeys

Branch `persona-resident`. Commits: `7c3a1b5` (API and shared), `80260c1` (website and app), `531c7cf` (merge of
`claude/eager-hawking-4exijr` at `f8bdfa8`; the resident migration is `0009_resident_fixes`), and the commit that
records this section. Screen-by-screen checklist with evidence: `docs/product/audit-resident.md`.

Decisions made here (reversible, no money or commercial terms):
- **T1.** The 14-day review clock of an owner-added stay starts on the later of the start date the owner typed and the
  IST day the owner added the person. The review still shows the stay as claimed; the refusal names the day.
- **I3.** A change the platform makes has no author (`issue_updates.author_id` null), shown as "Automatic"; no stand-in user.
- **I5.** The reporter keeps read-only access to their own issue after moving out (`GET /me/issues`, past-stay Issues
  tab). Everyone else outside the hostel gets 404 for issue and post ids (was 403, which confirmed they exist).
- **I6.** No me-too on a closed issue (plain message: report it again).
- **I9.** When the plan lapses the board is hidden from residents with the reason: paused with nothing deleted, or never
  turned on. Never the owner's billing. Data comes back with the plan.
- **I10.** Resident text is counted in code points (an emoji is one character on every engine); invisible-only text is refused.
- **M4.** A skip no bill will carry (cancelled plan, after the last bill's credit window) stores credit 0; the menu
  returns `noCreditFrom` and the screens say "No credit — your plan ends before the next bill". Skips stored before a
  cancel keep their amount (no bill reads them) and are shown as 0.
- **M13.** On the move date, a move into a hostel that is delisted, no longer verified or paused is cancelled with a
  reason the tenant can read (never the owner's unpaid bill): the bed held there is released, unpaid bills go back
  to the current room, and My plan shows "cancelled — <reason>" for 30 days.
- **Names.** Names shown to other people never show a phone number typed as a name; initials keep whole characters;
  the neighbour list shows first name and last initial (the screen already said "first name").
- **Browser-test time.** `e2e:fresh` starts `apps/api/src/e2e-server.ts`: the same app plus `PUT /__e2e/clock` to run the
  clock ahead (used for "review 14 days later"). The production entry `src/index.ts` has no such route, and the e2e
  entry refuses to start with `NODE_ENV=production`.

Gates run at `@@HASH@@` on disposable databases `hostels_test_r` and `hostels_e2e_r` (e2e on ports 4106/3106), after
merging `claude/eager-hawking-4exijr` at `f8bdfa8`:
- `bun run typecheck` (4/4 exit 0) and `bunx biome lint .` (clean).
- Shared tests 38 pass (30 on the merged base + 8 new); web unit tests 2 pass; mobile tests 44 pass (39 + 5 new);
  API tests 195 pass (162 on the merged base + 33 new).
- `e2e:fresh`: @@E2E@@.
- `npx expo export --platform android`: @@EXPO@@.
- Mutation checks, each reverted on its own, its test run, then restored (re-run after the merge, same results): T1
  review clock (2 tests fail), T9 invite answer unconditional (1), T9 move-out unconditional (1), review dates from the
  database clock (1), I2 status change unconditional (1), I2 `from` ignored (1), I3 no timeline row (1), I5 reporter
  loses access (2), 403 instead of 404 for outsiders (1), I6 me-too on closed (1), I9 owner-billing message (2), I10
  UTF-16 length (1), I10 invisible-only text (1), M4 full credit (2), M13 move completes anyway (3), T11 phone shown as
  a name (1), `dateLabel` UTC date (1), T3 not detected (1), app reopen after 7 days (1), app review form from
  defaults (1), app community tabs for past stays (1).

| ID | Requirement | Implementation | Test | Status |
|---|---|---|---|---|
| RES-T1 | Owner-added stays count toward a review from the day the hostel added the person | `residents.ts` `reviewClockStart`, `reviewEligibility`; `addResident` dates the invite from `clock` | `resident-trust.test.ts` › T1 (3); `e2e/resident-journey.spec.ts` 1, 4 | verified @@@HASH@@ |
| RES-T9 | Answering an invite or moving out twice at once: one wins, the rest get 409 | `residents.ts` `respondToInvite`, `moveOut` (conditional `UPDATE … WHERE status`) | `resident-trust.test.ts` › T9 (3); `resident-journey.spec.ts` 1 (re-accepting a declined invite is 409) | verified @@@HASH@@ |
| RES-I2 | One transition per status change; no duplicate timeline rows; buttons disabled while pending | `issues.ts` `updateIssue` (`from`, repeat refused, conditional update in the timeline transaction); `issueUpdateSchema.from`; web `updateIssueAction`; app `issue/[id].tsx` (ref guard) | `resident-issues.test.ts` › I2 (3); `resident-journey.spec.ts` 3 (double click → one "Closed") | verified @@@HASH@@; app guard: typecheck only (no device) |
| RES-I3 | The timeline says when an issue closed on its own | `issues.ts` `autoCloseResolvedIssues`; migration `0009_resident_fixes` | `resident-issues.test.ts` › the timeline says the issue closed automatically, once | verified @@@HASH@@ |
| RES-I5 | A reporter who moved out still reads their issue, read-only; others get 404 | `issues.ts` `loadIssue`, `myIssues`; `GET /me/issues`; web past-stay Issues tab and banner; app past-stay tabs | `resident-issues.test.ts` › I5 (2); `resident-journey.spec.ts` 5 | verified @@@HASH@@ |
| RES-I6 | No me-too on a closed issue; own refused; twice counts once | `issues.ts` `toggleUpvote` | `resident-issues.test.ts` › I6 | verified @@@HASH@@ |
| RES-I7 | Other residents never learn who reported | `issues.ts` `toIssue`, `issueDetail` | `resident-issues.test.ts` › I7 | verified @@@HASH@@ |
| RES-I9 | Lapsed board: hidden with the residents' reason, data kept | `community.ts` `requireBoard`, `requirePostBoard`; web and app show the API's reason | `resident-life.test.ts` › I9 (2) | verified @@@HASH@@ (the screens' rendering of it: code review only; the seed has no lapsed board with residents) |
| RES-I10 | Text limits in characters as people count them; blank and invisible-only refused | `resident.ts` `textLength`, `hasVisibleText`; `schemas.ts` `residentText` | `resident-life.test.ts` › I10; shared `resident.test.ts` › text lengths; app `stay.test.ts` › text limits | verified @@@HASH@@ |
| RES-M4 | Skips no bill will carry earn 0 and the screens say why | `food.ts` `noCreditFrom`, `skipCredit`; `MyMenu.noCreditFrom`; web `/account`, app My Stay | `resident-life.test.ts` › M4 (2); `resident-daily.spec.ts` 3; app `stay.test.ts` › meal skips | verified @@@HASH@@ |
| RES-M13 | A due move into a hostel that stopped taking residents is cancelled with a reason; bed and bills go back | `moves.ts` `completeDueMoves`, `closedReason`; `billing.ts` `mySubscription` (`scheduledMove`, `cancelledMove`); `jobs.ts` `cancelledMoves`; migration `0009_resident_fixes` | `resident-life.test.ts` › M13 (3 + control) | verified @@@HASH@@ (web and app notice: code review only, no browser action can un-verify a partner) |
| RES-NAMES | Names never show a phone; whole-character initials; directory first name + initial | `resident.ts` `firstNameAndInitial`, `publicFirstName`; `residents.ts`, `community.ts`, `issues.ts` | `resident-trust.test.ts` › T11; shared `resident.test.ts` › names; `resident-journey.spec.ts` 2 | verified @@@HASH@@ |
| RES-VERIFY | T3, T4, T7, I4, M5, M6, M7 behave as the catalogue says | as listed in `edge-cases.md` | `resident-trust.test.ts` › T3, T4, T7; `resident-issues.test.ts` › I4; `resident-life.test.ts` › M5, M6, M7; shared `resident.test.ts`; `resident-journey.spec.ts` 4 (T3 label) | verified @@@HASH@@ |
| RES-IST | Instants show their IST date; skip cut-offs show in IST; review, invite and move dates come from `clock` | `format.ts` `dateLabel`; `resident.ts` `istTime`, `skipCutoffText`; `upsertReview`, `addResident`, `scheduleMove` | shared `resident.test.ts` › IST; `resident-trust.test.ts` › T3 (created date); `resident-daily.spec.ts` 1 | verified @@@HASH@@ |
| RES-S7-S8 | Resident side: session ends mid-flow → login → same page; paid bill shows paid, no second pay button | no change needed (`requireUser` after a 401) | `resident-daily.spec.ts` 3, 4 | verified @@@HASH@@ |
| RES-WEB | Resident screens: every state, axe WCAG 2.2 AA (no serious/critical), 360–1440 without overflow, labelled controls | `app/stay/*`, `app/issues/[id]`, `app/account/*` (resident parts), `components/Community.tsx`, `components/Reviews.tsx` | `resident-journey.spec.ts` (5), `resident-daily.spec.ts` (4), `workspaces.spec.ts` › resident workspace | verified @@@HASH@@ |
| RES-MOBILE | App parity for the resident screens | `app/(tabs)/stay.tsx`, `app/home/[hostelId].tsx`, `app/issue/[id].tsx`, `app/move.tsx`, `components/Community.tsx`, `lib/stay.ts` | `apps/mobile/test/stay.test.ts` (screen logic); typecheck; `expo export --platform android` | unverified: no device or emulator (screen logic verified) |
| RES-E2E-CLOCK | Browser tests can run the API clock ahead; production can't | `apps/api/src/e2e-server.ts`, `lib/clock.ts` `setClockOffset`; `playwright.config.ts` | `e2e-server.test.ts`; `resident-journey.spec.ts` 4 | verified @@@HASH@@ |

## Later PRPs (rows filled when each PRP is generated)

| PRP | Area | Status |
|---|---|---|
| 02 | Authorization and invite links | planned |
| 03 | Bed allocation and dates (lost update M5, transaction call M6) | M5 and M6 verified (Backend fixes above); dates planned |
| 04 | Payment mode separation (M7), late payments (edge case M1) | done: see the PRP-04 section above (mobile screens unverified) |
| 05 | Workflow completeness against the spec | planned |
| 06 | Uploads: private attachments, relative URLs, metadata stripping, photo loading (M8–M10) | M8–M10 verified (Backend fixes above); object storage still open |
| 07 | Responsive and accessible web (M11) | partly covered by PRP-12 (axe + overflow tests added) |
| 08 | Mobile runtime verification | planned |
| 09 | Zero-cost deployment configuration (M12) | planned |
| 10 | Backup and recovery (M13) | planned |
| 11 | General rate limiting, CSP nonces, review weighting (M4, M14) | planned |
| EXT-SMS | Live MSG91 | blocked: paid, needs approval |
| EXT-RZP | Razorpay test and live | blocked: account needs approval |
| EXT-DEPLOY | Public deployment | blocked: needs approval |
| EXT-DEVICE | Native device run | blocked: needs your device or an emulator runner |
