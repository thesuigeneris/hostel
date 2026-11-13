# In-app signals for residents (product gap 1b)

Approved by the owner on 2026-11-13 ("yes for all decisions"). Owners already had a "needs response" badge on their
Issues tab; residents had nothing telling them the hostel had answered. No push messages, SMS or e-mail: the signal shows
when the person next opens the website or the app.

## Rule

- An **update** on an issue **you reported** (a comment, a status change, or the issue closing on its own) made by
  **anyone but you** is **unread** until you next open that issue.
- Opening the issue reads everything on it; so does writing on it (the reply shows the issue). The timeline marks what
  was new on that visit only.
- Only the reporter gets the signal. Other residents, the owner and admins opening the issue change nothing for them.
- Issues you reported at a hostel you've moved out of keep counting: you can still read them.

## Where it shows

| Place | Web | App |
|---|---|---|
| Menu / tab | "My hostel" link with a count (screen readers: "N issues have new updates"); shown to owners and admins only when they have something new | "My Stay" tab badge, refreshed on start, on returning to the app and each minute |
| My hostel | "N new: Updates on your issues" per hostel, to the hostel's issues filtered to Mine | "N new on your issues" per current stay; "Your issues (N new)" for past stays |
| Issue list | "N new updates" badge on each issue | same |
| Issue page | "New" on each update not seen before | same |

Known limit: on the web, the menu is drawn in parallel with the page, so on the page that opens the issue the menu
still shows the old count; it clears on the next page.

## Where

| Part | Where |
|---|---|
| Data | `issue_reads` (migration `0015_issue_reads`): issue, user, seen at; only moves forward |
| API | `GET /me/signals`; `unreadUpdates` on every issue view; `isNew` on issue updates; opening `GET /issues/:id` marks it read for the reporter |
| Logic | `services/issue-reads.ts` (`unreadCounts`, `markSeen`, `mySignals`), used by `services/issues.ts` |
| Web | `components/NavLinks.tsx`, `SiteHeader.tsx`, `app/layout.tsx`, `app/stay/page.tsx`, `components/Community.tsx` `IssueList`, `app/issues/[id]/page.tsx` |
| App | `app/(tabs)/_layout.tsx`, `(tabs)/stay.tsx`, `components/Community.tsx`, `app/issue/[id].tsx`, `lib/signals.ts` |
| Tests | `apps/api/test/resident-signals.test.ts`, `apps/web/e2e/resident-journey.spec.ts` › 3, `apps/mobile/test/stay.test.ts` › in-app signals |
