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

## PRP-01: auth modes, demo isolation, zero-cost login

| Req | Requirement | Implementation | Test | Status |
|---|---|---|---|---|
| AUTH-PW | Phone + password sign-up and login, no SMS needed, in production | | `auth-modes.test.ts › password sign-up and login work in production without SMS` | planned |
| AUTH-GENERIC | Generic errors (unknown phone, wrong password, blocked demo) | | `› login errors are generic` | planned |
| AUTH-THROTTLE | 5 failures per phone → 15-minute lock, unknown phones too | | `› throttles per phone` | planned |
| AUTH-POLICY | 15–128 characters, blocklist, no phone in password | | `› password policy` | planned |
| AUTH-DEMO | Demo login only for `is_demo`, never in production standard | | `› demo login isolation` | planned |
| AUTH-DEMO-MODE | Demo instance: no OTP, password or sign-up; simulated payments only | | `› demo mode instance` | planned |
| AUTH-ISOLATION-ALL | Isolation enforced on every session path, including handoff and existing sessions | | `› isolation applies to every session path` | planned |
| AUTH-INVITE | Invites link only for verified phones | | `› invites need a verified phone` | planned |
| AUTH-ADMIN | `ADMIN_PHONES` needs a verified phone; `admin:grant` script | | `› admin needs verified phone or the server script` | planned |
| AUTH-CHANGE | Set or change password; other sessions revoked | | `› password change` | planned |
| AUTH-SEED-GUARD | `db:reset` refuses in production standard | | `› seed reset guard` | planned |
| AUTH-WEB | Web password sign-up and login, demo buttons | | `e2e/auth.spec.ts` | planned |
| AUTH-MOBILE | Mobile password and demo login | | typecheck + web bundle only | planned (will be unverified on native) |

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
