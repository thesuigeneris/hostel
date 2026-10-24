# Create PRP

## Feature file: $ARGUMENTS

Adapted from `coleam00/context-engineering-intro` `.claude/commands/generate-prp.md` (commit `a2d84b0`) for this
Bun / TypeScript monorepo. Read `CLAUDE.md` first.

Generate a complete PRP for one **bounded** workflow, with research thorough enough that an agent with only the
PRP, the codebase and its training data can implement it in one pass and validate itself. Read the feature file
(normally `INITIAL.md` plus the relevant row of `PRPs/00-master-index.md`) first.

## Research process

1. **Codebase analysis** (mandatory, cite exact paths)
   - Find the existing implementation: routes, services, schema, shared schemas and client, web pages and actions,
     mobile screens, and tests.
   - Record the conventions in use (see `CLAUDE.md`), and which tests already cover the area.
   - Check `PRPs/LEDGER.md` for requirements in this area that aren't yet verified.
2. **Specification check**
   - Quote the requirement lines from `docs/superpowers/specs/*.md` that this PRP satisfies.
   - Requirements the specs don't state go under **Open questions**, never under Goals.
3. **External research**
   - Official documentation for any library or service used, with URLs and the exact section.
   - If a host is unreachable from the sandbox, say so and use a reachable mirror (the project's GitHub repo docs, or the package README in `node_modules`). Don't paraphrase from memory as if you had read it.
4. **Cost check**
   - Every external service: free tier limits, whether an account or card is needed, and what it costs past the limit.
     Anything that isn't free, or needs an account, is **blocked pending approval**.

## PRP generation

Use `PRPs/templates/prp_base.md`. Every section is required; write "None" with a reason rather than deleting one.

*** After researching, think hard about the approach, the order of tasks and the failure modes, then write the PRP. ***

## Review before saving (mandatory)

Re-read the PRP against this checklist and fix gaps before saving:
- [ ] Every goal maps to an acceptance criterion and a named test.
- [ ] Loading, empty, error, success and permission states listed for every screen touched.
- [ ] Authorization stated for every endpoint (who, and what a non-owner sees: 401, 403 or 404).
- [ ] Concurrency, retries and idempotency stated for every state change.
- [ ] Migration is additive and reversible, or the irreversibility is justified.
- [ ] Validation commands are real commands that exist in this repo.
- [ ] Cost and credential dependencies listed; nothing paid assumed.

## Output

Save as `PRPs/NN-short-name.md`, add or update its row in `PRPs/00-master-index.md`, and add its requirements to
`PRPs/LEDGER.md` with status `planned`.

Score the PRP 1–10 for one-pass implementation confidence, and say what would raise the score.
