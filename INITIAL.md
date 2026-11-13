## FEATURE:

Complete the existing Hostels core product end to end, on branch `claude/hostels-best-of-both`. Not a pilot and not a
restart: finish and harden what the approved specs describe, for every persona (seeker, tenant/resident, owner,
admin), across the database, API, website and Expo app.

Priorities, in order:
1. Demo authentication isolated from real users.
2. Secure authentication that doesn't depend on paid SMS.
3. Authorization across organization, property and resident.
4. Bed allocation that is correct under concurrency and over dates.
5. Accurate financial records, with stub and live payments kept apart.
6. Complete booking, stay, complaint and review workflows.
7. Reliable uploads, with private attachments not publicly readable.
8. Responsive, accessible web UI.
9. Mobile runtime verification.
10. Legitimate zero-cost deployment configuration.
11. Backup and recovery.
12. Remaining approved product requirements.

## EXAMPLES:

The template's `examples/` folder is not used: this repo already holds the patterns to mirror (see `CLAUDE.md`).
- API route → service → access helper: `apps/api/src/routes/resident.ts`, `apps/api/src/services/community.ts`,
  `apps/api/src/services/access.ts`.
- Atomic state change: `reserveBed` in `apps/api/src/services/billing.ts`; OTP send window in `apps/api/src/services/auth.ts`.
- API test style: `apps/api/test/personas.test.ts`, `apps/api/test/fixtures.ts`.
- Web server action: `apps/web/app/stay/actions.ts`, `apps/web/lib/actions.ts`.
- Mobile screen: `apps/mobile/app/home/[hostelId].tsx`.
- Browser test: `apps/web/e2e/personas.spec.ts`.

## DOCUMENTATION:

- Specs: `docs/superpowers/specs/2026-10-12-hostels-platform-design.md`, `docs/superpowers/specs/2026-10-24-personas-addendum.md`, `DESIGN.md`.
- Existing hardening notes: `docs/security-review.md`, `docs/RUN.md`.
- Per-PRP external docs are cited inside each PRP, with mirrors when a host is blocked in the sandbox.

## OTHER CONSIDERATIONS:

- **Budget:** at most ₹100 of external spend in total, target ₹0. No paid services, live transactions, public deployment or paid distribution without approval.
- **Safety:** no merge, pull request or deploy without approval. Fresh-database tests run only on disposable databases. Preserve uncommitted work. No secrets in git.
- **Honesty:** don't treat existing tests as proof that a requirement is complete; the ledger decides. Never claim device or runtime checks that weren't run.
- **Commits:** the base spec says no AI attribution in commits.
