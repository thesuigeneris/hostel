# CLAUDE.md

Project rules for AI coding assistants working in this repository.

Adapted from the Context Engineering / PRP workflow in
[coleam00/context-engineering-intro](https://github.com/coleam00/context-engineering-intro) (read at commit `a2d84b0`).
That template's Python rules (venv, pytest, pydantic, black, FastAPI) do not apply here; its workflow does:
`INITIAL.md` → `/generate-prp` → `PRPs/<name>.md` → `/execute-prp`, with executable validation gates.

## Read first, every session

1. `PRPs/00-master-index.md`: the order of work and what each PRP covers.
2. `PRPs/LEDGER.md`: requirement → implementation → test status. It is the source of truth for "done".
3. The PRP you are executing, then the specs it cites:
   `docs/superpowers/specs/2026-10-12-hostels-platform-design.md` (base) and
   `docs/superpowers/specs/2026-10-24-personas-addendum.md` (wins on conflicts).
4. `docs/security-review.md` and `docs/RUN.md` before touching auth, payments, uploads or deployment.

## Stack (verified in the code, keep it)

| Area | What is used | Where |
|---|---|---|
| Runtime / package manager | Bun 1.3+, workspaces | `package.json` |
| API | Hono, Drizzle ORM, postgres-js, zod | `apps/api/src/{routes,services,lib,db}` |
| Database | PostgreSQL 16, Drizzle migrations | `apps/api/src/db/schema.ts`, `apps/api/migrations/` |
| Contract | zod schemas, types, typed client | `packages/shared/src/{schemas,types,client}.ts` |
| Website | Next.js App Router, server actions, Tailwind | `apps/web/app`, `apps/web/components` |
| Mobile | Expo SDK 58, expo-router | `apps/mobile/app`, `apps/mobile/lib` |
| Lint | Biome | `biome.json` |

## Conventions

- **Routes stay thin.** Routes parse input with the shared zod schemas (`parseBody`, `parseQuery` in `apps/api/src/lib/validate.ts`) and call a service. Logic and authorization live in `apps/api/src/services/*`.
- **Errors.** Throw `AppError(code, message, status)` from `apps/api/src/lib/errors.ts`. Codes are snake_case and listed in the shared types.
- **Authorization.** Use the helpers in `apps/api/src/services/access.ts` (`ownedHostel`, `requireMember`, `requirePlan`). Return 404, not 403, when a caller must not learn that a record exists.
- **Time.** Read time only through `clock` (`apps/api/src/lib/clock.ts`). Calendar dates are IST `YYYY-MM-DD` strings. Tests pin time with `setClock`.
- **Money.** Whole rupees, as integers. Price rules live in `packages/shared/src/pricing.ts`.
- **Concurrency.** Change counters and state with one conditional `UPDATE … WHERE … RETURNING`, never read-modify-write. Check unique violations with `isUniqueViolation` (`apps/api/src/lib/db-errors.ts`).
- **Website.** Mutations are server actions using `run()` from `apps/web/lib/actions.ts`. The session token stays in the httpOnly cookie; browser JavaScript never sees it.
- **Mobile.** Uses the shared client from `apps/mobile/lib/api.ts`. Tokens go in `expo-secure-store`.
- **Schema changes.** Edit `schema.ts`, then run `bun run db:generate` in `apps/api`. Commit the SQL and the `meta/` files. Never edit a migration that has already been committed.
- **File size.** Keep new files under about 500 lines; split by responsibility. (Some existing files are larger; don't grow them further without reason.)
- **Comments.** Explain why, not what. Match the surrounding density.

## Validation gates (run before every commit)

```bash
bun run typecheck                      # shared, api, web, mobile
bunx biome lint .                      # lint
(cd packages/shared && bun test)       # unit tests
(cd apps/api && TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/hostels_test bun test)
(cd apps/web && bun run e2e:fresh)     # browser golden paths on a disposable DB (hostels_e2e)
```

The API tests and `e2e:fresh` **drop and recreate data**. Point them only at disposable databases: `hostels_test`, `hostels_e2e`, or another throwaway one. Never point them at a database with real data.

## Definition of done

A requirement is done only when **all** of these hold:

1. The ledger row names the implementation (file and function) **and** a test that exercises it.
2. That test was run and passed in this session, and the ledger records the command and the commit.
3. Web or mobile behaviour that the tests can't reach is marked `unverified` with the reason. "The code exists" is never enough.

## Safety and budget

- **Budget:** at most ₹100 of external spend in total, and the target is ₹0. No purchases, paid services, live transactions, public deployments or paid distribution without the owner's explicit approval.
- **Approval first:** no merges, pull requests or deployments.
- **Secrets:** never committed or printed. `.env*` files stay local; only `.env.example` files are committed.
- **Databases:** never reset a database that may hold real data. Fresh-database tests run only on disposable databases.
- **Uncommitted work:** preserve it. Don't run `git reset --hard`, `git checkout -- .` or a bare `git stash` over someone else's changes.
- **No invention:** no commercial terms, partnerships, prices or claims that the specs don't state. Never claim a test or device check that wasn't run.

## AI behaviour

- Confirm a file, function or package exists before referencing it.
- Prefer the existing patterns listed above over new ones.
- If a requirement is ambiguous and the answer changes the data model or money, write the question into the PRP's open questions and choose the safest reversible default.
