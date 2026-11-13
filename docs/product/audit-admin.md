# Admin audit (acceptance.md section 4, A1–A5)

Written 2026-11-13 from the code and tests on `main` (`b58a0e9`) plus the tests added this day. Unlike the seeker, resident
and owner audits, this one was **not** produced by a per-screen agent pass: the admin agent was interrupted by usage
limits before it wrote its checklist. So each row below says what is **covered by a named test** and what is **only
checked by the generic workspace sweep** (axe + overflow at five widths on every admin page, `e2e/workspaces.spec.ts`).
Anything marked "not audited" has had no dedicated state, error or keyboard review: do that first if you extend admin.

## Journeys

| # | Journey | Where | Evidence | Status |
|---|---|---|---|---|
| A1 | Approve or reject listings, with a reason; public pages update at once | `/admin/listings`, `services/listings.ts` `reviewListing` | `listings.test.ts`; golden path e2e (`golden-path.spec.ts`); cache refresh in `run()` | verified |
| A2 | Verify partners: every brand standard ticked on **every** path, fee %, saved progress | `/admin/partners`, `services/partners.ts` | `owner-admin.test.ts` › inspection checklist must be complete; `admin-decisions.test.ts` (2 tests: saved checklist judged when none is sent; a sent checklist counts) | verified |
| A3 | Moderate: review flags (re-flag after an admin acted; no flags on non-public hostels), content reports, hide with a reason | `/admin/moderation` | `admin-oversight.test.ts` › review flags, content reports; `trust-boundaries.test.ts` (flags alone hide nothing) | verified |
| A4 | Money: owner plans/pauses, owner bills (waive is audited, lifts the pause), refunds due, payouts, revenue counted only from live payments | `/admin/billing`, `/admin/payouts`, `services/money.ts`, `refunds.ts` | `owner-admin.test.ts`, `admin-money.test.ts`, `payment-modes.test.ts`, `late-payments.test.ts`, `e2e/payments.spec.ts`, `owner-admin.spec.ts` | verified |
| A5 | Operate: escalated issues, run jobs now, food partners, audit log, recently changed listings | `/admin/issues`, `/admin` (jobs), `/admin/food`, `/admin/audit`, `/admin/changes` | `owner-admin.test.ts` (audit log), `admin-oversight.test.ts` (recently changed, O3) | verified for the API; screens only swept |

## Edge cases owned here

| Case | Evidence |
|---|---|
| O3 recently changed listings; verified partner that moves is flagged for re-check, badge stays | `admin-oversight.test.ts` (3 tests) |
| O7 admin acting in an owner's workspace is audited with the admin as actor, the hostel as target; reads and failures are not | `admin-oversight.test.ts` |
| O8 waive vs pay at once gives exactly one outcome, both orders | `admin-money.test.ts` (2 tests), `late-payments.test.ts` |
| M10 hostel paused on day 16 (not 15), restored on payment | `admin-money.test.ts` |
| Two admins deciding one partner application, or approving and rejecting one listing at the same moment: one decision, the other told to refresh | `admin-decisions.test.ts` (2 tests) |
| An admin's comment or status move is not "the hostel responding" | `admin-oversight.test.ts` › admin actions on issues |
| Rate limits (sign-up, login, writes, search; spoofed `X-Forwarded-For` gains nothing; IPv6 per /64; production refuses unsafe overrides) | `rate-limits.test.ts` (6 tests) |
| Page views counted once per visitor per half hour, owner's own views excluded | `rate-limits.test.ts` |
| CSP scripts carry a per-request nonce (M14) | `e2e/csp.spec.ts`, `web/test/csp.test.ts` |
| Owners and tenants cannot reach `/admin` (redirect) or admin API (403/404) | `e2e/workspaces.spec.ts`, `owner-admin.test.ts` |

## Not audited (do these when working on admin)

- **Per-screen states**: loading, empty, error and success states of each admin page, and plain-words error mapping, were
  not reviewed one by one. The sweep only proves no serious axe findings and no horizontal overflow.
- **Keyboard-only completion** of the moderation and partner-checklist flows was not tested.
- **Android admin screens** (including the new "Recently changed" screen) are checked by typecheck, unit tests of their
  logic and the Android export only, never on a device.
- **Admin search and pagination at scale** (several thousand rows): tables are capped (e.g. 500 rows) with no paging UI.
- **No way to revoke an admin granted with `admin:grant`** (a revoke script is missing).
