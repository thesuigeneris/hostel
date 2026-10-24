# Execute PRP

Implement a feature using the PRP file.

## PRP file: $ARGUMENTS

Adapted from `coleam00/context-engineering-intro` `.claude/commands/execute-prp.md` (commit `a2d84b0`). Read
`CLAUDE.md` first.

## Execution process

1. **Load the PRP**
   - Read it fully, including the files and documentation it cites.
   - Check `git status`. Preserve uncommitted work; if any exists, stop and ask.
   - Extend the research if something is missing, and record what you added in the PRP's "Execution notes".

2. **Plan** (think hard)
   - Break the work into tasks with the task tool, in the PRP's order: schema → shared contract → service → route →
     tests → web → mobile → docs.
   - Identify the existing patterns to mirror.

3. **Execute**
   - Implement real changes across the database, API, shared package, web and mobile, as the PRP requires.
   - Run the API tests after each service change, not only at the end.

4. **Validate** (every gate in the PRP's validation section)
   - Run each command; fix failures at the root cause. Never weaken a test to make it pass.
   - Fresh-database runs only on disposable databases (`hostels_test`, `hostels_e2e`).

5. **Complete**
   - Re-read the PRP; tick each acceptance criterion only with the command that proved it.
   - Update `PRPs/LEDGER.md`: implementation path, test name, command, commit, and `verified` or `unverified`
     with the reason.
   - Commit on the working branch and push. Never merge, open a pull request or deploy without approval.
   - Report what passed, what wasn't verified and why, and anything blocked by credentials or approval.

If validation fails, use the PRP's gotchas and error patterns, fix, and retry.
