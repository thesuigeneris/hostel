name: "PRP template for the Hostels monorepo"
description: |
  Adapted from coleam00/context-engineering-intro `PRPs/templates/prp_base.md` (v2, commit a2d84b0).
  Kept: goal/why/what, all-needed-context, known gotchas, implementation blueprint with ordered tasks,
  integration points, validation loop, final checklist, anti-patterns.
  Added for this project: non-goals, domain rules, authorization, UI/mobile states, concurrency,
  security, cost and credential dependencies, open questions, execution notes.

## Core principles
1. **Context is king.** Cite exact files, functions and spec lines.
2. **Validation loops.** Every acceptance criterion names a command that proves it.
3. **Follow `CLAUDE.md`** conventions and safety rules.
4. **Code is not proof.** A requirement is done only with a passing test, recorded in `PRPs/LEDGER.md`.

---

## Goal
[Exact end state.]

## Non-goals
[What this PRP deliberately does not do, and where that work goes.]

## Why
- [User and business value; which persona.]
- [Spec lines satisfied: quote `docs/superpowers/specs/...` lines.]

## What (user-visible behaviour)
[Behaviour per persona and surface: API, web, mobile.]

### Success criteria
- [ ] [Measurable outcome] → proven by `[test name / command]`

## All needed context

### Documentation and references
```yaml
- file: path/to/file.ts
  why: pattern to mirror / code to change
- url: https://… (or mirror path if the host is blocked in the sandbox)
  section: …
  critical: …
```

### Existing implementation (verified)
[What already exists, with paths, and what the tests already cover.]

### Known gotchas
[Library quirks, sandbox limits, repo conventions that bite.]

## Database and migrations
[Tables and columns, constraints, indexes, backfill for existing rows, reversibility.]

## Domain rules and state transitions
[Rules, states and allowed transitions; invariants that must always hold.]

## API contract
[Method, path, request and response shapes (shared zod and types), error codes, status codes.]

## Authorization
[For each endpoint: who may call it, and what others get (401, 403 or 404 to avoid leaking existence).]

## UI (web) and mobile behaviour
[Screens and components changed; copy; navigation.]

### States
| Screen | Loading | Empty | Error | Success | No permission |
|---|---|---|---|---|---|

## Edge cases
[Boundaries, time zones, duplicates, retries, deleted or ended records, very long input.]

## Concurrency, retries and idempotency
[What happens with parallel requests, double submits and retried webhooks; the atomic statement that guarantees it.]

## Security considerations
[Threats such as enumeration, brute force, privilege escalation, IDOR and leaking secrets, with a mitigation for each.]

## Implementation blueprint (ordered tasks)
```yaml
Task 1:
  MODIFY/CREATE path:
    - what, mirroring path:function
```

## Validation loop
```bash
# Level 1: types and lint
bun run typecheck && bunx biome lint .
# Level 2: unit and integration (disposable DB only)
(cd packages/shared && bun test)
(cd apps/api && TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/hostels_test bun test)
# Level 3: browser golden paths (disposable DB)
(cd apps/web && bun run e2e:fresh)
# Level 4: manual or runtime checks that tests can't reach (say exactly what was run)
```

## Acceptance criteria
- [ ] … (command that proves it)

## External dependencies and cost
| Dependency | Needed for | Free? | Account or card? | Status |
|---|---|---|---|---|

## Open questions
[Decisions only the owner can make; the default chosen meanwhile, and why it is reversible.]

## Anti-patterns to avoid
- Read-modify-write on counters or state (use a conditional UPDATE).
- Trusting client-sent ids for ownership (load the record through its owner).
- Building new patterns when an existing one works.
- Weakening or skipping a failing test.
- Hard-coding config that belongs in env.

## Execution notes
[Filled in by /execute-prp: what changed versus the plan, and why.]
