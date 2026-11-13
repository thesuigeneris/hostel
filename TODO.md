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
- [ ] **1b. In-app signals for residents**: unread counts for updates on their issues (the owner's badge exists).
      Not in the code.
- [ ] **1c. Account deletion and data export (DPDP Act 2023)**: reviews kept but anonymised. Not in the code.

## 2. Bugs and gaps found in the code (each needs a test that fails without the fix)

- [ ] **Completed move after an early-paid bill** (confirmed 2026-11-13 with a throwaway test): the next period's bill
      paid at the old room's rent before the move was scheduled is left alone by `regenerateUnpaidFrom` (it only redoes
      unpaid bills). After the move completes, that period stays attributed to the old hostel at the old rent, so the
      new hostel is never paid for it. The mirror of the 0013 fix. **Owner decision needed (money):** (a) move the bill
      to the new hostel and bill the rent difference as a top-up (refund it if the new room is cheaper), or (b) refuse
      move dates inside a period already paid. Safest default if no answer: (b).
- [ ] **`cancelSubscription` racing a payment** (`billing.ts`): releasing a held bed re-reads the plan, but a small window
      remains.
- [ ] **First bill payable after the 30-minute hold** until the expiry job runs: money is covered by the late-payment
      revive; check what the payer sees.
- [ ] **Owner-added residents can be fictitious**: their reviews count. Consider rent records or an admin spot-check
      before they count in the rating.
- [ ] **Signed private-photo links** can be shared for up to 90 minutes, including by someone who has just left.
- [ ] **Older private photos keep public `pho_` keys** (no real users; resetting dev databases is enough).
- [ ] **One-off axe failure** on `/stay` after a Like (`resident-journey` e2e): watch for flakiness.

## 3. Admin per-screen audit (the gap in `audit-admin.md`)

- [ ] Loading, empty, error and success states of every admin page; error codes in plain words.
- [ ] Keyboard-only completion of moderation and the partner checklist.
- [ ] Admin tables are capped (e.g. 500 rows) with no paging UI.
- [ ] `admin:revoke` script: `admin:grant` exists (`apps/api/package.json`), revoking does not.
- [ ] Cross-cutting rules X1–X8 in `edge-cases.md`: give each a status and evidence.

## 4. Docker production test run

- [ ] Build the images, run the stack with Caddy HTTPS, check login, search, pay (simulated), uploads and the CSP nonce
      behind the proxy; repeat the backup/restore drill (`docs/DEPLOY.md`, "What was tested").

## 5. Before running more than one API instance

- [ ] Uploads to object storage (R2/S3); CSP `img-src` then needs the storage origin.
- [ ] Rate limits and the job scheduler out of process (both are in memory per instance today).

## 6. Needs the owner's accounts or approval (cannot be done in this sandbox)

- [ ] Android build on a device or emulator (SDK/Maven blocked here; EAS or local build per `docs/RUN.md`).
- [ ] Razorpay test, then live, with **separate webhook secrets** per mode (approved). MSG91 SMS.
- [ ] A real domain for Caddy HTTPS; copying `deploy/backups/` off the machine.
- [ ] Print shops rendering Devanagari in the brand kit.

## 7. Tidy (owner's call)

- [ ] Delete merged branches: `claude/project-thread-*`, `claude/hostels-best-of-both`, `claude/hostels-platform`,
      `claude/loving-euler-m0b2ku`.
