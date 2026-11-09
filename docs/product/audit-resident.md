# Resident audit: every screen and action, checked against "done"

Scope: the **Resident** persona (R1–R5 in `acceptance.md`) on the website and in the Android app, and the API behind
it. Each screen is checked against the seven points in "What done means for one screen": traced, every state,
edge cases, accessible, responsive, honest copy, tested. Evidence names a test that ran and passed on branch
`persona-resident`; anything a test can't reach is marked **unverified** with the reason.

Legend: ✅ checked with evidence · ⚠️ checked by code reading only (reason given) · ❌ open (owner named).

Commits: `7c3a1b5` (API and shared), `80260c1` (website and app), `531c7cf` (merge of the integration branch; the
resident migration is `0009_resident_fixes`: `issue_updates.author_id` nullable, `move_requests.cancel_reason`).
Gates and ledger rows: `PRPs/LEDGER.md` › Resident persona.

Test files referred to below:

- API: `apps/api/test/resident-trust.test.ts` (T1, T3, T4, T7, T9, T11), `resident-issues.test.ts` (I2–I7),
  `resident-life.test.ts` (I9, I10, M4–M7, M13), `e2e-server.test.ts`, plus the older `personas.test.ts`,
  `seeker-resident.test.ts`, `food-moves.test.ts`, `billing.test.ts`, `uploads.test.ts`, `best-of-both.test.ts`.
- Shared: `packages/shared/test/resident.test.ts` (names, text length, review edits, reopen window, IST labels, M5 sweep).
- Web (Playwright, production build, `e2e:fresh`): `e2e/resident-journey.spec.ts` (R1–R4),
  `e2e/resident-daily.spec.ts` (R5, S7, S8), `e2e/workspaces.spec.ts` › resident workspace (axe + 5 widths),
  `golden-path.spec.ts`, `personas.spec.ts` 2, 4–6, `seeker-resident.spec.ts`. Every journey step that changes the
  page runs axe (WCAG 2.2 AA, serious/critical) and the 360/390/768/1024/1440 overflow check on the state it reaches
  (`e2e/a11y.ts` › `pageProblems`).
- Mobile: `apps/mobile/test/stay.test.ts` (screen logic). Screens themselves: **unverified on a device** (no
  emulator or device in this environment); typecheck and `expo export --platform android` only.

## Traces (UI → handler → client → route → schema → service → SQL)

| Action | Web | Mobile | Client | Route | Schema | Service → SQL guard |
|---|---|---|---|---|---|---|
| Accept / decline invite | `stay/actions.ts` `respondInviteAction` | `stay.tsx`, `home/[hostelId].tsx` | `me.acceptResidency` / `declineResidency` | `POST /me/residencies/:id/accept|decline` | none (no body) | `residents.ts` `respondToInvite`: 404 unless mine; `UPDATE … WHERE id, user_id, status='invited'`; loser 409 |
| I've moved out | `moveOutAction` | `stay.tsx` | `me.moveOut` | `POST /me/residencies/:id/move-out` | none | `moveOut`: `UPDATE … WHERE status='active' AND source='owner'`; loser 409; subscribers told to cancel or move |
| Neighbour list on/off | `directoryAction` | `home/[hostelId].tsx` | `me.setDirectory` | `PATCH /me/residencies/:id` | `directorySchema` | `setDirectoryOptIn` (own residency only, 404 otherwise) |
| Neighbour list | server component | same | `resident.directory` | `GET /hostels/:id/directory` | — | `requireMember`; `residentDirectory` returns first name + initial and room type, never phones |
| Write / edit review | `reviewAction` | `home/[hostelId].tsx` `sendReview` (`buildReview` runs the same schema first) | `hostels.review` | `PUT /hostels/:id/review` | `reviewInputSchema` (20–2,000 characters counted as people count) | `upsertReview`: eligibility (`reviewClockStart`), one row per hostel+user (`ON CONFLICT`), never touches `hidden`; dates from the clock |
| Report issue (+ private photo) | `reportIssueAction` → `uploadPhoto(…'attachment')` | `components/Community.tsx` `IssueForm` | `request('/uploads')`, `resident.reportIssue` | `POST /uploads`, `POST /hostels/:id/issues` | upload receipt + `issueInputSchema` | `issues.ts` `reportIssue`: `requireMember` + active residency; `claimUpload` (own, `attachment` purpose) |
| Comment / confirm / reopen | `updateIssueAction` (sends `from`) | `issue/[id].tsx` (sends `from`) | `resident.updateIssue` | `POST /issues/:id/updates` | `issueUpdateSchema` (status, message, `from`) | `updateIssue`: `from` must match; repeat of the current status refused; `UPDATE … WHERE id AND status=<seen>` in the same transaction as the timeline row; loser 409 |
| Me too | `upvoteAction` | `issue/[id].tsx` | `resident.upvote` | `PUT/DELETE /issues/:id/upvote` | — | `toggleUpvote`: residents only, not own, not closed; `ON CONFLICT DO NOTHING` |
| Issue list / detail / mine | server components | `home/[hostelId].tsx`, `issue/[id].tsx` | `resident.issues`, `issue`, `myIssues` | `GET /hostels/:id/issues`, `/issues/:id`, `/me/issues` | query enum | `hostelIssues` (members), `issueDetail` (members, or the reporter read-only after moving out; others 404), `myIssues` |
| Board: post, like, reply, delete, report | `postAction`, `likeAction`, `commentAction`, `deletePostAction`, `reportContentAction` | `components/Community.tsx` `Feed` | `resident.post/like/comment/deletePost/deleteComment/report` | `/hostels/:id/community`, `/posts/:id/*`, `/comments/:id/*` | `postInputSchema`, `commentInputSchema`, `reasonSchema` | `community.ts`: `requireBoard` (members + Pro plan; residents told "paused, nothing deleted" or "not turned on"); post-level routes 404 for non-members |
| Skip / undo a meal | `account/actions.ts` `skipMealAction` | `stay.tsx` | `me.skip` / `me.unskip` | `POST /me/skips`, `DELETE /me/skips/:date/:meal` | `skipSchema` | `food.ts` `skipMeal`/`unskipMeal`: active plan, meal in plan, inside the plan, before the IST cut-off; credit 0 when no bill will carry it (`noCreditFrom`, using `creditWindow`) |
| Menu | server component | `stay.tsx` | `me.menu` | `GET /me/menu?days` | `days` 1–14 | `myMenu`: dishes, cut-off instant, `canChange`, credit, `noCreditFrom` |
| Move: schedule / cancel | `scheduleMoveAction`, `cancelMoveAction` | `move.tsx`, `stay.tsx` | `me.move`, `me.cancelMove` | `POST /me/moves`, `DELETE /me/moves/:id` | `moveSchema` | `moves.ts` `scheduleMove` (bookable destination, bed reserved atomically), `cancelMove` (conditional); job `completeDueMoves` cancels moves into hostels that stopped taking residents |
| Cancel plan | `cancelSubscriptionAction` | `stay.tsx` | `me.cancelSubscription` | `POST /me/subscription/cancel` | — | `billing.ts` `cancelSubscription` (unchanged; conditional for pending) |
| My plan, bills | server component | `stay.tsx` | `me.subscription`, `me.invoices` | `GET /me/subscription`, `/me/invoices` | — | `mySubscription` (now with move views and the cancelled-move notice), `myInvoices` |
| Pay a bill | `/pay/[invoiceId]` (payments agent's page; resident view checked) | `lib/pay.ts` → website via hand-off code | `payments.*` | `/payments/:id/*` | — | `payments.ts` (not edited here) |

## Screens

### Website

#### `/stay` — my hostel (`apps/web/app/stay/page.tsx`)
- [x] ✅ Traced: accept, decline, move out, links to tabs (table above).
- [x] ✅ States: invites (heading per hostel, what accepting means), current stays, past stays, empty state with two next steps (subscribe, or ask the owner), success and error flashes; route errors go to `app/error.tsx`. Loading: server-rendered (route-level loading boundaries were dropped for form pages, see LEDGER P6-LOADING).
- [x] ✅ Edge cases: accept/decline twice at once → one answer, 409 for the rest (`resident-trust` › T9 accepting and declining together); a declined invite can't be accepted later (`resident-journey` 1, API 409); move-out twice → once (`resident-trust` › moving out twice at once).
- [x] ✅ Confirmation before decline and before "I've moved out" (irreversible for the resident).
- [x] ✅ Accessible: buttons named with their hostel and starting with their visible label ("Accept: join Sri Sai PG", "Not me: decline the invite from …", "Your issues at …"); axe clean on the two-invite state (`resident-journey` 1) and in the sweep (`workspaces` › resident).
- [x] ✅ Responsive: no overflow at 360–1440 (`resident-journey` 1, `workspaces`).
- [x] ✅ Honest copy: review timing comes from the API reason (T1 says when the clock started); "I've moved out" says what changes.
- [x] ✅ Past stays link to the issues the person reported (I5).

#### `/stay/[hostelId]` — hostel life (`apps/web/app/stay/[hostelId]/page.tsx`)
- [x] ✅ Tabs are a labelled nav ("Hostel life") with `aria-current="page"` and 44 px targets (was: no current-page state). After moving out only **Issues** (read-only) and **Review** show (`resident-journey` 5).
- [x] ✅ Community: post kinds filter, post, like, reply, delete (confirmation), report with a reason; photo private (`uploads.test.ts` › community posts work the same way). Board off → the API's explanation: "paused, nothing deleted" or "not turned on yet", never the owner's bills (`resident-life` › I9). ⚠️ The web rendering of the paused message isn't reached by e2e (the seed has no paused Pro hostel with residents); the text shown is the API message tested there.
- [x] ✅ Issues: report form (category, title, details, optional private photo with a note who can see it), filters with counts, empty states per filter; past stays list their own issues read-only (`resident-journey` 5).
- [x] ✅ Neighbours: copy now matches the data (first name, last initial, room type, never the phone) (`resident-journey` 2, `resident-trust` › T11).
- [x] ✅ Review: refused with the API's reason until eligible (T1, T7); form pre-filled for edits; hidden-review notice; owner reply with its date and the T3 note; ratings in a fieldset with a legend (`resident-journey` 4, `seeker-resident` › edits in place).
- [x] ✅ Accessible and responsive: `resident-journey` 2 (community, neighbours), 4 (review), 5 (past issues); `workspaces` › resident (community, issues, neighbours, review).

#### `/issues/[id]` — issue (`apps/web/app/issues/[id]/page.tsx`)
- [x] ✅ Traced (comment, confirm, reopen, me too). The form sends the status the page showed (`from`).
- [x] ✅ States: timeline of steps with dates, updates list (incl. "Automatic" when it closed on its own), closed state says "report it again", read-only banner for a reporter who moved out, 404 page for others.
- [x] ✅ Edge cases: double click on "Confirm fixed" makes one "Closed" entry (`resident-journey` 3; API `resident-issues` › I2); reopen window (shared `canReopen`, `resident-issues` › I4); me-too rules (I6); anonymity (I7); outsiders get 404 (`resident-issues` › anyone else outside the hostel gets 404).
- [x] ✅ Private photo: signed, expiring link that loads; the bare file is 404 (`resident-journey` 3, `golden-path`).
- [x] ✅ Accessible and responsive: `resident-journey` 3 (new issue) and 5 (read-only), `workspaces` › resident (every seeded issue at the demo hostel).

#### `/account` — resident parts: plan, meals, bills (`apps/web/app/account/page.tsx`)
- [x] ✅ Meals: each changeable meal says until when, in IST ("until 10:00 pm IST the night before"); locked meals say since when; buttons are 24 px targets, disabled while pending, and named with the meal and day ("Skip (save ₹80): lunch on Tue 10 Nov 2026"); skip and undo (`resident-daily` 1, `personas` 6).
- [x] ✅ M4: after cancelling, "No credit — your plan ends before the next bill. Skipping still tells the kitchen to cook less." and buttons say "Skip (no credit)" (`resident-daily` 3; API `resident-life` › M4).
- [x] ✅ Moves: "Moving to <hostel> (<room>) on <date>", warning when that hostel isn't taking residents now, cancel with confirmation (`resident-daily` 2); a move we cancelled shows "cancelled — <reason>" with what it means. ⚠️ The cancelled-move notice isn't reached by e2e (no admin action can un-verify a partner in the browser); its data is tested in `resident-life` › M13.
- [x] ✅ Cancel plan: confirmation; "Your plan ends on <date>. No more bills after that." (`resident-daily` 3).
- [x] ✅ Bills: a paid bill says when and has no pay link; due bills link to `/pay` with a full name (`resident-daily` 3, `seeker-resident` › issue pages… paid dates).
- [x] ✅ Accessible and responsive on each state: skipped meal, after cancelling (`resident-daily` 1, 3), and the sweep.

#### `/account/move` (`apps/web/app/account/move/page.tsx`)
- [x] ✅ Destination list, rooms with free beds, date from tomorrow, pending state, what happens if the destination stops taking residents (`resident-daily` 2; axe and widths there and in `workspaces`).

#### `/pay/[invoiceId]` — resident view (S8)
- [x] ✅ A paid bill shows "Done" and no pay button, also after Back and Forward (`resident-daily` 3). The page itself belongs to the payments work; not edited here.

#### Session ends mid-flow (S7, resident side)
- [x] ✅ A form posted with an ended session lands on `/login?next=<the same page>` and returns there after logging in (`resident-daily` 4). No code change was needed: the page's `requireUser` sends the person to log in when the action's call comes back 401.

#### Public review card (`components/Reviews.tsx`, T3)
- [x] ✅ "Edited after the owner replied." under a reply the review was edited after (`resident-journey` 4; shared `reviewEdits` tests; API `resident-trust` › T3).

### Android app (`apps/mobile`)

All screens: ⚠️ **unverified on a device** — no emulator or device here. Checked: typecheck, unit tests of the screen
logic (`test/stay.test.ts`), `npx expo export --platform android`.

- **My Stay** (`app/(tabs)/stay.tsx`)
  - [x] Invites: accept / "Not me" with confirmation, both disabled while one is pending, labelled with the hostel.
  - [x] Plan: move details (where to, room, date, "not taking residents now" warning), cancel move with confirmation, cancelled-move notice with the reason, "Ends <date> · no more bills".
  - [x] Meals: IST cut-off per meal, "Skip (save ₹50)" / "Skip (no credit)" with a full screen-reader name, the M4 note (`stay.test.ts` › meal skips).
  - [x] Hostel life: review reason shown (T1); "I've moved out" with what it changes; past stays: "Your issues" and review.
  - [x] Bills: paid shows when; due has a labelled Pay (opens the website's pay page).
  - [x] Errors reload the screen so it shows what is true now (an invite answered elsewhere, a cut-off passed).
- **Hostel life** (`app/home/[hostelId].tsx`)
  - [x] Tabs for current stays; Issues (read-only) and Review after moving out (`stay.test.ts` › tabs).
  - [x] Board off: the API's explanation (paused / not on), not a generic line.
  - [x] Review: the API's reason when not allowed (was a generic "after two weeks", wrong for T1 and for ended stays); form starts from the existing review (was: defaults, so an edit could silently change ratings) (`stay.test.ts` › review form); hidden notice; owner reply with the T3 note; character counter as people count.
  - [x] Neighbours copy matches the data.
- **Issue** (`app/issue/[id].tsx`)
  - [x] Every action button disabled while one is in flight, guarded by a ref so two taps in one frame send once; status changes send `from`; a 409 reloads the issue (I2).
  - [x] Reopen only inside 7 days, with the date; after that, "report it again" (`stay.test.ts` › reopening ends 7 days after the fix).
  - [x] Read-only for a reporter who moved out; "Automatic" closing entry; closed state explains what to do.
- **Board and issue form** (`components/Community.tsx`)
  - [x] Same text rules as the API (counts an emoji as one, refuses blank text) with a counter (`stay.test.ts` › text limits); confirmation before deleting a reply; private-photo note.
- **Move** (`app/move.tsx`): what happens if the destination stops taking residents; no double submit.
- **Touch targets**: small buttons and chips reach 44 pt (`hitSlop`), buttons expose disabled/busy state and a label.
- **Public hostel page** (`app/hostel/[slug].tsx`): "Edited after the owner replied." on the review card (T3).

## Defects found and fixed (each with a test that failed without the fix)

Mutation check: each fix was reverted on its own and the named test failed, then restored (22 checks, re-run after
merging the integration branch; list in the ledger).

| ID | Defect | Fix | Test |
|---|---|---|---|
| T1 | Backdated owner-added stays could review on day one | `residents.ts` `reviewClockStart`; reason names the day | `resident-trust` › T1 (2 tests); `resident-journey` 1, 4 |
| T9 | Invite answer and move-out were read-then-write | conditional `UPDATE … WHERE status` | `resident-trust` › T9 (2 tests) |
| I2 | Issue status changes were read-then-write; a double tap wrote two timeline rows | `from` + conditional update in the timeline transaction; repeat refused | `resident-issues` › I2 (2 tests); `resident-journey` 3 |
| I3 | Closing on its own left no timeline entry | job writes an author-less row ("Automatic"); `issue_updates.author_id` nullable (migration `0009_resident_fixes`) | `resident-issues` › I3 |
| I5 | A reporter who moved out lost their own issue (403) | read-only access for the reporter, `GET /me/issues`, past-stay issues tab | `resident-issues` › I5; `resident-journey` 5 |
| — | Outsiders got 403 for issue and post ids (confirming they exist) | 404 for non-members on issue and post routes | `resident-issues` › anyone else outside the hostel gets 404 |
| I6 | Me-too allowed on closed issues | refused with a plain message | `resident-issues` › I6 |
| I9 | Residents on a lapsed board saw "hasn't turned on" (or the owner's billing message) | resident wording, paused vs never on | `resident-life` › I9 (2 tests) |
| I10 | Lengths counted UTF-16 units (an emoji was 2); blank or invisible-only text accepted | `textLength`, `hasVisibleText` in all resident text fields | `resident-life` › I10; shared › text lengths |
| M4 | Skips after cancelling stored credit no bill would carry | credit 0 from `noCreditFrom`; menu and screens say why | `resident-life` › M4 (2 tests); `resident-daily` 3 |
| M13 | A due move completed into a delisted/unverified/paused hostel | cancelled with a stored reason (`move_requests.cancel_reason`, migration `0009_resident_fixes`); bed and unpaid bills go back | `resident-life` › M13 (3 tests + 1 control) |
| T11 | A phone typed as a name was shown; initials split emoji and accents | `firstNameAndInitial` (graphemes, phone-like names → "Resident") | `resident-trust` › T11; shared › names |
| — | Review `createdAt`, residency `createdAt` (owner add) and move `createdAt` came from the database clock, not `clock` | set from `clock.now()` | `resident-trust` › T3 (created date) |
| — | Instants were labelled with their UTC date (a day early 00:00–05:30 IST) | `dateLabel` converts instants to IST | shared › an instant is labelled with its IST date |
| — | Directory showed full names while the screen said "first name" | first name + initial, copy updated | `resident-trust` › T11, `personas` › community board |
| — | App review form started from defaults when editing | starts from the existing review | `stay.test.ts` › review form |
| — | App showed "reopen" after the 7-day window | shared `canReopen` | `stay.test.ts` › reopening ends 7 days after the fix |

## Verified without a code change

| ID | Behaviour | Test |
|---|---|---|
| T3 | Edit after the owner replied is labelled (needed the card label and created-date fix above) | `resident-trust` › T3, `resident-journey` 4 |
| T4 | Editing a hidden review keeps it hidden | `resident-trust` › a hidden review stays hidden |
| T7 | Day 13 refused with days to go, day 14 allowed; 13-day stay never; day 180 yes, 181 no | `resident-trust` › T7 (2 tests) |
| I4 | Reopen at 6 d 23 h allowed; 7 d 1 min refused ("report it again") | `resident-issues` › I3 and I4 |
| I7 | Reporter never shown to other residents; resident comments show as "Resident" | `resident-issues` › I7 |
| M5 | 29th/30th/31st and leap-February starts: continuous periods, bills 5 days ahead | `resident-life` › M5; shared › M5 sweep |
| M6 | Cut-offs at 21:59/22:00, 08:59/09:00, 14:59/15:00 IST with the server in UTC; UI shows IST | `resident-life` › M6; shared › IST; `resident-daily` 1 |
| M7 | Credits capped at the food price (₹6,510 of skips → ₹6,000) | `resident-life` › M7 |
| S7 | Session ends mid-flow → login → same page | `resident-daily` 4 |
| S8 | Paid bill: "Paid <date>", no pay link or button, Back/Forward safe | `resident-daily` 3 |

## Found outside this scope (reported, not fixed)

- **I1 (owner)**: `needsResponse` still uses `status === 'open'`, so after an owner answers with a comment only, residents keep seeing "Waiting on the hostel" (`services/issues.ts` `toIssue`, `insights.ts`).
- **T10 (owner)**: `endResident` ends a stay at once even with a future end date (`residents.ts`).
- **T8 (owner)**: no unique index for invited/active stays per phone and hostel; two quick adds can create two invites.
- **M13 follow-up (payments)**: if the bill for the move period was already **paid** at the destination's rent before the move was cancelled, it stays as paid with the destination's `hostelId` (payout and rent difference). Unpaid bills are regenerated; paid ones need an admin adjustment or refund flow.
- **Comments (all)**: two identical comments sent at once both save (status changes are guarded; plain comments are not deduplicated). The buttons are disabled while pending on web and in the app.
- **Owner UI (owner)**: owner issue pages share the resident form, so they now send `from` too; owner-specific states (needs-response list, owner moves) were not audited here.
