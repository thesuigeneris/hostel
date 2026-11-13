# Completion map: evidence-based

**Inspected:** branch `claude/hostels-best-of-both` at commit `09d279d` (clean working tree), 2026-10-24.
**Method:** read the code and specs, and ran the gates below in this session. "Verified" means a test or command run
**in this session** exercised it; anything else is classed lower.

## Gates run in this session

| Command | Result |
|---|---|
| `(cd packages/shared && bun test)` | 23 pass, 0 fail |
| `(cd apps/api && TEST_DATABASE_URL=…/hostels_bob_test bun test)` | 85 pass, 0 fail, 8 files (after restarting Postgres; the first run failed with 72 connection errors because the container restart had stopped Postgres) |
| `bun run typecheck` | shared, api, web, mobile: exit 0 |
| `bunx biome lint .` | no findings |
| `(cd apps/web && bun run e2e:fresh)` | 7/7 pass (earlier in this session, same commit) |
| `(cd apps/mobile && bunx expo export --platform web)` | exit 0; every route bundles for web. **Not** a native runtime check. |

## 1. Existing and verified (a test or command exercised it here)

| Area | Evidence |
|---|---|
| OTP login, hashed OTP with pepper, attempts and send limits, hashed sessions, `ADMIN_PHONES` | `services/auth.ts`; `test/auth.test.ts`, `test/routes.test.ts` |
| Listing lifecycle (draft → pending → live), partner verification | `services/listings.ts`; `test/listings.test.ts`; e2e personas flow 1 |
| Search: filters, distance, rating sort | `services/search.ts`; `test/listings.test.ts`, `test/routes.test.ts` |
| Subscribe with an atomic bed reservation (no overbooking among concurrent subscribers) | `reserveBed` in `services/billing.ts`; `test/subscriptions.test.ts` |
| Bills, simulated payment, Razorpay signature checks | `services/payments.ts`, `lib/razorpay.ts`; `test/billing.test.ts` |
| Menus, meal skips with IST cut-offs, headcount, moves, cancel | `services/food.ts`, `services/moves.ts`; `test/food-moves.test.ts`; e2e flow 6 |
| Residencies, verified reviews (14-day rule), issues with transparency stats, community board, owner plans and bills, rent tracker | `services/residents.ts`, `services/community.ts`, `services/plans.ts`; `test/personas.test.ts`; e2e flows 4–5 |
| Board likes, page views, owner insights, admin escalations, revenue | `services/insights.ts`; `test/best-of-both.test.ts` |
| Upload type sniffing (JPEG/PNG/WebP), 5 MB limit | `routes/uploads.ts`; `test/personas.test.ts` (uploads) |
| Web golden paths for owner, admin, seeker, tenant and resident | `apps/web/e2e/*.spec.ts` (7 tests) |

## 2. Existing but unverified

| Area | Why it's unverified |
|---|---|
| Mobile app on Android/iOS | No emulator or device in the sandbox. Only typecheck and the web bundle pass; one unit test (`apps/mobile/test/search.test.ts`). |
| Mobile → website handoff for payment | API part is tested (`/auth/handoff`); the app opening the browser was never run. |
| Website accessibility | No automated accessibility checks exist; some `aria-*` attributes are present. |
| Responsive layout | Only spot-checked: the hostel page at 390 px, fixed this session. Other pages are unchecked. |
| CSP and security headers in a production build | Configured in `apps/web/next.config.ts`; no test asserts them. |
| Payouts arithmetic over real months | Tested at unit level; never reconciled against a month of real data. |

## 3. Mocked or stubbed

| Area | Behaviour | Where |
|---|---|---|
| SMS OTP | No MSG91 key: code is always `123456` for **any** phone outside production; production returns 503 | `lib/msg91.ts`, `services/auth.ts` |
| Payments | No Razorpay keys: "Simulate payment" marks the bill paid, with a `pay_stub_` id | `services/payments.ts` |
| Photo storage | Local disk (`apps/api/uploads`) | `lib/storage.ts` |
| Demo photos | Hot-linked Unsplash URLs in the seed | `db/seed-data.ts` |

## 4. Missing or defective (found in code; each is assigned a PRP)

| # | Gap | Evidence | PRP |
|---|---|---|---|
| M1 | **No login without paid SMS in production.** OTP is the only method, and production without MSG91 returns 503. | `requestOtp` in `services/auth.ts` | 01 |
| M2 | **Demo login isn't isolated.** Outside production, every phone signs in with `123456`. Demo accounts carry no marker. `.env.example` puts demo phone `9000000001` in `ADMIN_PHONES`. | `lib/msg91.ts`, `apps/api/.env.example`, `db/seed.ts` | 01 |
| M3 | **Invite takeover risk once any non-SMS login exists.** Invites link by phone number on every listing (`myResidencies` calls `linkInvitedResidencies`), with no check that the phone was verified. | `services/residents.ts:23` | 01 |
| M4 | **No login throttling** beyond OTP sends; no general rate limiting. | `docs/security-review.md` "Still open" | 01 (login), 11 (general) |
| M5 | **Overbooking via a lost update.** `updateRoomType` writes back the stale `bedsAvailable` even when only the rent was edited. | `services/listings.ts:129` | 03 |
| M6 | **External call inside the booking transaction.** The Razorpay order is created while the room row is locked. | `subscribe` in `services/billing.ts` | 03 |
| M7 | **Stub and live payments are mixed.** No payment-mode column; simulated payments count in payouts and revenue. | `invoices` schema, `services/payouts.ts`, `services/insights.ts` | 04 |
| M8 | **Private attachments are public.** Issue and post photos are served to anyone with the URL, cached for a year as `public`. | `routes/uploads.ts` | 06 |
| M9 | **Photo URLs are absolute and frozen** at upload time (`API_PUBLIC_URL`), which breaks them on domain or LAN changes and on mobile devices. | `lib/storage.ts` `put()` | 06 |
| M10 | **Photo metadata, such as GPS from phone cameras, isn't stripped.** | `routes/uploads.ts` | 06 |
| M11 | **No accessibility checks** in tests. | `apps/web/e2e` | 07 |
| M12 | **No deployment configuration:** no app Dockerfiles or production compose. | repo root, `docker/` has only a test-DB init | 09 |
| M13 | **No backup or restore tooling or runbook.** | grep found nothing | 10 |
| M14 | **CSP allows `'unsafe-inline'` scripts.** | `docs/security-review.md` | 11 |

## 5. Blocked by credentials or approval

| Item | Blocker | Cost facts (only what is known; to confirm at approval time) |
|---|---|---|
| Live SMS OTP (MSG91) | Account, DLT registration and paid credits | Paid per SMS, so it can't be the mandatory login. PRP-01 removes the dependency. |
| Razorpay test-mode run | A Razorpay account (test mode) | Test mode moves no money; account creation needs your approval. |
| Razorpay live payments | Live account and activation; real money | Needs approval; out of the ₹0 target. |
| Public deployment | Hosting account(s), domain choice | PRP-09 researches free tiers and their terms; nothing gets deployed without approval. |
| Native mobile runtime check | Your phone with Expo Go, or a machine with an emulator | ₹0. Needs you to run it, or a CI runner with an emulator. |
| Photo object storage (R2 or S3) | Account | Local disk works for one instance; deferred until deployment is approved. |

## 6. Out of scope per the approved spec (not counted as gaps)

From base spec §3 "Out of scope (v1)":
- In-app chat, roommate matching, referrals/loyalty.
- Aadhaar KYC.
- UPI autopay mandates.
- Push notifications.
- Live delivery integration with partner brands.
- Owner mobile app, multi-language.
- (Deployment was listed there too, but you've now asked for a zero-cost deployment *configuration*: PRP-09.)

The spec doesn't mention **organizations or staff accounts** for owners: one owner per hostel (`hostels.ownerId`). Recorded as
an open question in PRP-02 rather than invented.
