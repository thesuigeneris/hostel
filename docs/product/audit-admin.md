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

## Per-screen review (2026-11-13)

Done after the first version of this file, by reading every admin page and adding browser checks where it mattered.

| Item | Finding | Fix / evidence |
|---|---|---|
| Admin menu | No accessible name, no "current page" mark, and "Recently changed" (`/admin/changes`) was missing from it | `components/AdminNav.tsx`: `nav aria-label="Admin"`, `aria-current`, all ten sections; `/admin/changes` added to the axe and overflow sweep (`e2e/workspaces.spec.ts`) |
| Empty states | Every list page says when there is nothing, except Food partners | "No food partners yet" added (`app/admin/food/page.tsx`) |
| Errors in plain words | Every page with actions shows `Flash` from `run()`, which maps API errors to their message | read; pages without actions (audit, changes, issues) have none to show |
| Keyboard only: partner checklist | Each box takes focus, Space ticks it, Enter on Verify sends it | `e2e/personas.spec.ts` › 1 (now keyboard-only) |
| Keyboard only: moderation | Note typed, Tab to "Keep it", Enter: kept, with the message | `e2e/owner-admin.spec.ts` › moderation: keep with the keyboard only… |
| **Bug found: moderation buttons** | **"Keep it" hid the review, and "Show again" did nothing.** The pressed button's `name`/`value` (`action=keep`) never reached the server action, so the action fell through to "hide" (with a note) or failed validation (without one). Earlier tests drove the API, not this form | The choice now travels in a hidden `decision` field, and "Keep it" sends the form to its own action (`formAction`, the pattern the partner page already uses); an unknown decision is refused, never guessed. e2e: keep (keyboard), then hide with a rule, then show again, checking the public page after each |
| Paging beyond the caps | Listings, verified partners, subscriptions and moves page with Previous / Next (one extra row fetched to know if there is more), filters kept, stable order | API `admin-paging.test.ts`; e2e `owner-admin.spec.ts` › admin tables page; `components/ui.tsx` `PrevNext` |
| Revoking an admin | Missing | `bun run admin:revoke <phone>` (`src/scripts/revoke-admin.ts`, `auth.ts` `revokeAdmin`); `auth.test.ts` › admin:revoke |
| Deleted accounts in tables | Would show "+91 deleted:usr_…" | `phoneLabel` shows "Deleted account" (admin billing, owner roster and rent; web and app) |

## Still not audited

- **Android admin screens** (including "Recently changed"): typecheck, logic tests and the Android export only, never on a
  device. The app's admin lists show the first page (100 rows); paging there is not built.
- Owner plans, owner bills and the audit log are filtered lists without paging; they grow per hostel and per month, so
  they stay small for now. Add `PrevNext` the same way when they pass a few hundred rows.
