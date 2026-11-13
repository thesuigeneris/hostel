# TODO: what is left, checked against the code

Written 2026-11-13 after checking `HANDOVER.md` (dev `0cba06b`) against the repository, GitHub and the test suites.
Tick an item only when its test passed and `PRPs/LEDGER.md` has the row (CLAUDE.md, "Definition of done").

## Checked: the handover is right about these

- [x] All 15 PRs (#1–#15) merged, none open; every branch on GitHub is contained in `dev`. `mudgala5540/Hostel` is empty.
- [x] `main` = `b58a0e9` (production). `dev` = `main` + 2 docs/test commits (`b1fbeb5`, `0cba06b`).
- [x] API tests on `dev`: **272/272** (270 + `trust-boundaries.test.ts` 2). Typecheck 4/4, lint clean.
- [x] Browser suite 83/83, shared 62, web unit 20, mobile 51, Android export: run on `1acd083`, which has the same app code
      as `dev` (only docs and one API test changed since).
- [x] `docs/product/audit-admin.md` exists. It says itself that the per-screen review was never done (see below).
- [x] Edge cases T5, T6, O3, O7 closed with named tests.
- [x] Migration `0013_move_cancelled_refund` (cancelled move after a paid bill) on `main`.

## Checked: the handover was wrong or out of date here (fixed in HANDOVER.md, 2026-11-13)

- [x] §3 says migrations `0000`–`0011`: there are `0000`–`0013`.
- [x] §4 says `edge-cases.md` rows are "all closed or verified": the cross-cutting rules **X1–X8** have no status at all
      (paging limits, double-submit guards, phone normalisation, error wording, mobile network loss, keyboard-only).
- [x] §0 and §2 said `dev` = `main` and that `persona-admin`/`claude/eager-hawking-4exijr` include the docs commit: `main`, `persona-admin` and `claude/eager-hawking-4exijr` are at `b58a0e9`; only `dev` has the docs commits.
- [x] The Docker production test run on the integrated code (old task 3) is missing from §7 (now pointed to this file). The last
      Docker run was before the CSP nonce middleware and migrations 0012–0013.
- [x] Known small bugs from the previous handover were dropped from §7 without being fixed (now listed in section 2 below).

## 1. Product gaps the owner approved ("yes for all decisions")

Each needs: a spec note in `docs/superpowers/specs/`, API + web + app, edge cases, tests, ledger rows.

- [x] **1a. Change food plan or diet from the next bill**, without cancelling. Built 2026-11-13: spec
      `docs/superpowers/specs/2026-11-13-food-plan-change.md`, migration 0014, API/web/app, ledger rows FOOD-CHANGE-*.
      App screen not run on a device.
- [x] **1b. In-app signals for residents**: unread counts for updates on their issues. Built 2026-11-13: spec
      `docs/superpowers/specs/2026-11-13-resident-signals.md`, migration 0015, API/web/app, ledger rows SIGNALS-*.
      App screens not run on a device.
- [x] **1c. Account deletion and data export (DPDP Act 2023)**: built 2026-11-13: spec
      `docs/superpowers/specs/2026-11-13-account-deletion-and-export.md`, migration 0016, API/web/app, ledger DATA-*.
      **Owner questions in the spec**: how long bills are kept, a waiting period, owner self-deletion.

## 2. Bugs and gaps found in the code (each needs a test that fails without the fix)

- [x] **Completed move after an early-paid bill**: fixed with the safe default (b), a move date inside a month
      already paid at the current room is refused with the date it can be (ledger MOVE-PAID-AHEAD). Option (a), moving
      the paid month with a top-up or refund, stays open for the owner. Original note:
      (confirmed 2026-11-13 with a throwaway test): the next period's bill
      paid at the old room's rent before the move was scheduled is left alone by `regenerateUnpaidFrom` (it only redoes
      unpaid bills). After the move completes, that period stays attributed to the old hostel at the old rent, so the
      new hostel is never paid for it. The mirror of the 0013 fix. **Owner decision needed (money):** (a) move the bill
      to the new hostel and bill the rent difference as a top-up (refund it if the new room is cheaper), or (b) refuse
      move dates inside a period already paid. Safest default if no answer: (b).
- [x] **`cancelSubscription` racing a payment**: it was a real deadlock (cancel locked the plan then the bill, a
      payment the bill then the plan; one request failed with a 500). Cancel now locks the bills first. Ledger
      CANCEL-PAY-RACE; `cancel-payment-race.test.ts` (both orders; fails without the fix).
- [x] **First bill payable after the 30-minute hold**: until the job runs the bed is still held, so paying confirms
      the plan, and the pay page says the hold has run out and to pay now; once the job has run the bill is void.
      Tests: `cancel-payment-race.test.ts` › paying a first bill after the hold; shared `seeker.test.ts` › bed hold.
- [ ] **Owner-added residents can be fictitious**: their reviews count. Consider rent records or an admin spot-check
      before they count in the rating.
- [ ] **Signed private-photo links** can be shared for up to 90 minutes, including by someone who has just left.
- [ ] **Older private photos keep public `pho_` keys** (no real users; resetting dev databases is enough).
- [ ] **One-off axe failure** on `/stay` after a Like (`resident-journey` e2e): watch for flakiness.

## 3. Admin per-screen audit (the gap in `audit-admin.md`)

- [x] Loading, empty, error and success states of every admin page; error codes in plain words (`audit-admin.md`).
- [x] Keyboard-only completion of moderation and the partner checklist (e2e).
- [x] Admin tables page beyond their caps on the web (listings, partners, subscriptions, moves). App: first page only.
- [x] `admin:revoke` script.
- [x] Cross-cutting rules X1–X8 in `edge-cases.md`: each has a status and evidence (2026-11-13). Open within them:
      paging for the community feed, my issues and the moderation queues (capped, not paged); keyboard-only runs of
      every journey; a real screen reader; network loss tested on a phone.

## 4. Docker production test run

- [x] Docker production run on `dev` (2026-11-13): images built, stack healthy in order, 17 migrations, browser check
      (search, photos, sign-in, new pages, no console errors / 5xx / CSP violations), backup → check → real restore,
      Caddy HTTPS with local certificates (`docs/DEPLOY.md`, "What was tested"). Real certificates need real DNS.

## 5. Before running more than one API instance

- [ ] Uploads to object storage (R2/S3); CSP `img-src` then needs the storage origin.
- [ ] Rate limits and the job scheduler out of process (both are in memory per instance today).

## 6. Needs the owner's accounts or approval (cannot be done in this sandbox)

- [ ] Android build on a device or emulator (SDK/Maven blocked here; EAS or local build per `docs/RUN.md`).
- [ ] Razorpay test, then live, with **separate webhook secrets** per mode (approved). MSG91 SMS.
- [ ] A real domain for Caddy HTTPS; copying `deploy/backups/` off the machine.
- [ ] Print shops rendering Devanagari in the brand kit.

## 7. Branches

- [x] **Owner decision (2026-11-13): keep every branch.** Do not delete any branch, merged or not.

## 8. Phase 2 and later

- Ideas (food add-ons, coupons, rewards, referrals, UPI AutoPay, staff accounts and more) with verdicts and owner
  questions: `docs/product/future-enhancements.md`. Nothing there is approved yet.
