# Account deletion and data export (product gap 1c, DPDP Act 2023)

Approved by the owner on 2026-11-13 ("yes for all decisions", with reviews kept anonymised). India's Digital Personal
Data Protection Act 2023 gives people the right to a summary of their data and to have it erased once it is no longer
needed, except where another law requires it to be kept.

## A copy of my data

`GET /me/export` (web: "Download my data" on `/account`, a JSON file; app: Profile → "Download my data", through the
phone's share sheet). It holds the account, plans, bills, meal skips, moves, food plan changes, stays, reviews, issues
reported with comments and me-toos, board posts, replies and likes, visit requests, refunds, review flags and content
reports. Left out: the password hash and internal payment order references. Private photos come as links that work for
about an hour.

## Deleting my account

### When it can't be done yet (the person is told why, in these words)

| Situation | Message |
|---|---|
| A plan is pending or active | You have a plan running. Cancel it, and delete your account once it has ended. |
| A bill is due | You have a bill to pay first. |
| A refund is owed to them | We still owe you a refund. You can delete your account once it has reached you. |
| They own a hostel | You own a hostel on Hostels. Write to us to close or hand over your listing first. |
| Admin / demo account | Admins are removed by the platform team, not here. / Demo accounts can't be deleted. |

### What it does (one transaction; immediate; cannot be undone)

Confirmation: type `DELETE`; accounts with a password must also enter it (wrong guesses count toward the login lockout).

| Data | What happens |
|---|---|
| Name, email, password | Erased |
| Phone | Replaced by `deleted:<id>`, which no real number matches; the same number can sign up again as a new, empty account |
| Sessions, app hand-off codes, login codes and throttles for the phone | Deleted: signed out everywhere |
| Board posts (and replies to them, as when a post is deleted), their replies, likes | Deleted |
| Visit requests, issue read markers | Deleted |
| Issue photos and board post photos | Removed from the issue and deleted from storage |
| Stays | An invite is declined and an open stay ends today, so the hostel's roster no longer lists them; name and phone on every stay are erased; the dates stay, as the proof behind their reviews |
| Reviews | **Kept**, shown as "Resident" (the owner's decision: residents and seekers rely on them) |
| Issues reported, issue comments | **Kept** on the hostel's record, with no name (the public issue record and response-time stats depend on them) |
| Plans, bills, payments, refunds, meal skips, moves, food plan changes | **Kept**, linked to the nameless account: financial records the law requires (see open question 1) |
| Review flags, content reports, audit events | Kept, linked to the nameless account |

### Open questions for the owner (safest default chosen)

1. **How long bills are kept**: the default keeps them indefinitely (nameless). Indian tax law asks for about 8 years; a
   job that deletes older ones could follow once the period is confirmed.
2. **A waiting period** (e.g. 7 days to change one's mind) is not built; deletion is immediate after the typed
   confirmation and password.
3. **Owners** delete through the platform team for now; a self-service flow needs a decision on what happens to the
   listing, its residents and reviews.

## Where

| Part | Where |
|---|---|
| Data | `users.deleted_at` (migration `0016_account_deletion`) |
| API | `GET /me/export`, `GET /me/deletion`, `POST /me/delete`; `services/privacy.ts`; `lib/storage.ts` `remove` |
| Web | "Your data" on `/account`; `/account/export` (file), `/account/delete`, `/account/deleted` |
| App | Profile → "Your data"; `app/delete-account.tsx`; `lib/privacy.ts` |
| Tests | `apps/api/test/account-deletion.test.ts`, `apps/web/e2e/account-data.spec.ts`, `apps/mobile/test/stay.test.ts` › data rights |
