# Master completion index

The source of the plan is `INITIAL.md`. Evidence is in `00-completion-map.md`; status is tracked in `LEDGER.md`.
Each PRP is bounded: one workflow, its own migration if needed, its own tests, and a commit.
Execute in this order. A PRP starts only after the ones it depends on are `done` in the ledger.

| # | PRP | Covers (map ids) | Depends on | Status |
|---|---|---|---|---|
| 01 | [Auth modes: demo isolation and zero-cost secure login](01-auth-demo-isolation-and-password-login.md) | M1, M2, M3, M4 (login) | none | done (mobile runtime unverified) |
| 02 | Authorization: property, resident and invite access audit; invite links that don't depend on phone ownership | access helpers, invites, staff/org question | 01 | planned |
| 03 | Bed allocation and dates: atomic room edits, order call outside the transaction, IST and month-end period tests | M5, M6 | 01 | planned |
| 04 | Financial records: payment mode (simulated/test/live), payouts and revenue excluding simulated, reconciliation view | M7 | 03 | planned |
| 05 | Workflow completeness: booking, stay, complaint and review flows checked line by line against the spec, gaps filled | spec §3–6, addendum §2–6 | 02, 03, 04 | planned |
| 06 | Uploads: relative keys, private attachments behind auth, metadata stripping, fallback images, local demo photos | M8, M9, M10, photo loading | 02 | planned |
| 07 | Responsive and accessible web: automated accessibility checks in Playwright, mobile-width checks per page, fixes | M11 | 05, 06 | planned |
| 08 | Mobile runtime verification: Expo web build driven in Chromium against the API, smoke flows; native device checklist | mobile unverified items | 01, 06 | planned |
| 09 | Zero-cost deployment configuration: Dockerfiles, production compose with TLS proxy, env hardening, free-tier research (no deploy) | M12 | 06 | planned |
| 10 | Backup and recovery: `pg_dump` and upload backup scripts, restore drill on a disposable DB, runbook | M13 | 09 | planned |
| 11 | Remaining hardening and spec items: general rate limiting, nonce-based CSP, review weighting for owner-added residents (open question) | M4 (general), M14 | 01–10 | planned |
| 12 | [Frontend design system and visual upgrade](12-frontend-design-system-and-visual-upgrade.md): tokens, primitives, homepage with lazy 3D hero, search, property, owner onboarding, workspaces (requested separately; runs alongside 02–11 because it changes no API contracts) | UI, part of M11 | 01 | batch 1 done; batches 2–5 planned |

## Blocked items (owner approval or credentials)

- **Live SMS (MSG91):** paid. PRP-01 makes it optional.
- **Razorpay test and live:** needs an account; PRP-04 makes the mode explicit so records stay correct when keys arrive.
- **Public deployment:** needs hosting approval; PRP-09 delivers configuration only.
- **Native mobile run:** needs your device, or an emulator runner; PRP-08 delivers a checklist and a web runtime check.

## Rules
- Generate each PRP with `.claude/commands/generate-prp.md`, review it with that file's checklist, then execute it with
  `.claude/commands/execute-prp.md`.
- Ledger first: a PRP is `done` only when every one of its ledger rows is `verified`, or explicitly `unverified` with a reason.
