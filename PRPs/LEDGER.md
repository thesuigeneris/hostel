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
| AUTH-DEMO-MODE | Demo instance: no OTP, password or sign-up; simulated payments; webhooks ignored | `env.appMode`, `otpMode`, `isRazorpayConfigured`, `verifyWebhookSignature` | `› demo mode instance…`; runtime: `APP_MODE=demo` web `/login` shows only demo buttons | verified @dd0faec (webhook refusal: code only, no test, **unverified**) |
| AUTH-ISOLATION-ALL | One guard on every session path | `loginAllowed` in `createSession` + `getSessionUser` | `› isolation applies to every session path` | verified @dd0faec |
| AUTH-INVITE | Invites only for verified phones | `linkInvitedResidencies` guard | `› invites need a verified phone` | verified @dd0faec |
| AUTH-ADMIN | `ADMIN_PHONES` needs a verified phone; `admin:grant` script | `resolveRole`, `grantAdmin`, `src/scripts/grant-admin.ts` | `› admin needs a verified phone…`, `› ADMIN_PHONES applies after OTP…` | verified @dd0faec (script CLI wrapper itself not run; `grantAdmin` is) |
| AUTH-CHANGE | Set or change password; other sessions revoked | `changePassword`, `/me/password`; web `/account` card | `› password change…`; `e2e/auth.spec.ts` (change, then log in with the new password) | verified @d774465 |
| AUTH-SEED-GUARD | `db:reset` refuses in production standard | `assertResetAllowed` | `› seed reset guard`; runtime: `NODE_ENV=production bun run db:reset` refused, data intact | verified @dd0faec |
| AUTH-TRUNCATE | Test resets cover every table (found during execution) | `ALL_TABLES` derived from the schema | repeated API runs (3×) stable | verified @dd0faec |
| AUTH-WEB | Web password sign-up/log-in, demo buttons | `apps/web/app/login/*`, `apps/web/app/account/*` | `e2e/auth.spec.ts` (2 tests) | verified @d774465 |
| AUTH-MOBILE | Mobile password, sign-up and demo login | `apps/mobile/app/login.tsx` | typecheck + `expo export --platform web` exit 0 | **unverified**: no native or web runtime run of the screen |

## Later PRPs (rows filled when each PRP is generated)

| PRP | Area | Status |
|---|---|---|
| 02 | Authorization and invite links | planned |
| 03 | Bed allocation and dates (lost update M5, transaction call M6) | planned |
| 04 | Payment mode separation (M7) | planned |
| 05 | Workflow completeness against the spec | planned |
| 06 | Uploads: private attachments, relative URLs, metadata stripping, photo loading (M8–M10) | planned |
| 07 | Responsive and accessible web (M11) | planned |
| 08 | Mobile runtime verification | planned |
| 09 | Zero-cost deployment configuration (M12) | planned |
| 10 | Backup and recovery (M13) | planned |
| 11 | General rate limiting, CSP nonces, review weighting (M4, M14) | planned |
| EXT-SMS | Live MSG91 | blocked: paid, needs approval |
| EXT-RZP | Razorpay test and live | blocked: account needs approval |
| EXT-DEPLOY | Public deployment | blocked: needs approval |
| EXT-DEVICE | Native device run | blocked: needs your device or an emulator runner |
