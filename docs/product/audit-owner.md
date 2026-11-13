# Owner audit: every screen, action and state

Owner: the Owner / Partner persona (decide to join, list, pick a plan, run the hostel, food and subscriptions, see how
it's going, use the brand, live somewhere too). Bar: `docs/product/acceptance.md` › "What done means for one screen" and
section 2 (O1–O8), plus the owner rows of `docs/product/edge-cases.md` (I1, M8–M10, O1, O2, O4–O6, O8, S4, T8, T10).

Branch `persona-owner` (from `claude/eager-hawking-4exijr`, merged up to `2f2a17f`). Migration: `0011_owner_fixes`.

Gates at `49effd3`: typecheck 4/4, lint clean, shared 59, web unit 18, mobile 51, API 237 (at `592bdf2`), `e2e:fresh`
78/78, `expo export --platform android` exit 0.

`[x]` means the named test ran and passed in this session,
`[~]` means implemented with only part of it testable here (the gap is stated), `[ ]` means not done. Commands:

- API: `cd apps/api && TEST_DATABASE_URL=…/hostels_test_o bun test` (this audit's files: `test/owner-replies.test.ts`,
  `test/owner-operations.test.ts`, `test/owner-billing.test.ts`)
- Shared: `cd packages/shared && bun test` (`test/owner.test.ts`)
- Web unit: `cd apps/web && bun test ./test` (`test/brand-kit.test.ts`)
- Mobile unit: `cd apps/mobile && bun test` (`test/owner.test.ts`)
- Web e2e: `cd apps/web && E2E_DATABASE_URL=…/hostels_e2e_o E2E_API_PORT=4107 E2E_WEB_PORT=3107 bun run e2e:fresh`
  (`e2e/owner-journeys.spec.ts` is this audit's file; production build)

"Revert-checked" means the fix was reverted on its own and the named test failed, then the fix was restored. Every API
fix (15 separate reverts), the T8 index (dropped on the test database) and the brand kit layout were revert-checked, one
at a time; the results are in `PRPs/LEDGER.md` › Owner persona.

## 1. Trace of every owner action (UI → handler → client → route → zod → service → SQL)

Authz for every row: `requireAuth('owner')` on `/owner/*` (admins pass), then the service loads the hostel through
`ownedHostel` (another owner's hostel, room, review, visit or resident is a 404). Plan gates use `requirePlan`
(effective plan) or `requirePlanTier` (the plan paid for, kept while paused). Owner client path segments are encoded.

| Action | Web / mobile entry | Shared client | API route → schema | Service → SQL | Evidence |
|---|---|---|---|---|---|
| Sign up as owner | `/for-owners` CTA → `/login?role=owner` · `owner/join` | `auth.*` | `/auth/*` | `auth.ts` (unchanged) | e2e `owners.spec.ts` › new listing; `owner-journeys` › O6 |
| Create listing | `HostelForm` → `createHostelAction` · `owner/hostels/new` | `owner.create` | `POST /owner/hostels` → `hostelInputSchema` | `createHostel`: draft + Free plan row, unique slug retry | e2e `owners.spec.ts`, `personas.spec.ts` 1 |
| Edit details, map pin | `HostelForm` (Leaflet pin) → `updateHostelAction` · `listing.tsx` (`PinPicker`) | `owner.update` | `PATCH /owner/hostels/:id` → `hostelUpdateSchema` | `updateHostel`: rejected → draft | e2e `personas.spec.ts` 1 (pin moved) |
| Photos: add, cover, remove | listing page forms · `listing.tsx` | `owner.addPhoto`, `reorderPhotos`, `deletePhoto` | `POST/PUT/DELETE /owner/hostels/:id/photos…` → `photoInputSchema` (upload receipt) | `addPhoto` (`claimUpload`), `deletePhoto`: hostel row locked, a live or in-review listing keeps one photo | API › listing photos (O4, 2 tests, revert-checked) |
| Rooms: add, edit beds, remove | rooms page · `rooms.tsx` | `owner.addRoom`, `updateRoom`, `deleteRoom` | `/owner/hostels/:id/rooms`, `/owner/rooms/:id` | `updateRoomType` (difference, conditional; M5 work) | API `listings.test.ts` (M5) |
| Submit for review | listing page · hostel screen | `owner.submit` | `POST /owner/hostels/:id/submit` | `submitHostel`: needs a room and a photo | e2e `owner-journeys` › O6 |
| Change plan / apply for Partner | plan page · `plan.tsx` | `owner.changePlan` | `POST /owner/hostels/:id/plan` → `ownerPlanChangeSchema` | `changePlan`, `switchPlan` (credits, trial anchor), `applyForPartner` | API › M8 (7), M9 (2), downgrades (2); e2e › M8, `personas.spec.ts` 3 |
| Pay a plan bill | plan page → `/pay/[id]` · `openPayment` | `payments.*` | `/payments/:id/*` | `payments.ts` (payments agent) | API › M10, O8; e2e `personas.spec.ts` 3 |
| Roster: add by phone | residents page · `residents.tsx` | `owner.addResident` | `POST /owner/hostels/:id/residents` → `residentInputSchema` | `addResident`: Pro; unique index `residencies_one_open_owner_stay` → "already on your roster" | API › T8 (revert-checked); e2e › O4 |
| Roster: move-out date, withdraw invite | residents page · `ResidentCard` | `owner.endResident` | `POST …/residents/:rid/end` → `endResidencySchema` | `endResident`: future date keeps the stay active; conditional on status; job `endDueResidencies` | API › T10 (2); e2e › O4/T10 |
| Rent tracker | rent page · `rent.tsx` | `owner.rent`, `recordRent` | `/owner/hostels/:id/rent…` → `rentRecordSchema` | `rentSheet`, `recordRent` (upsert per month) | e2e › O4 (still-unpaid ₹ amount) |
| Issues: answer, move forward | `/issues/[id]` · `owner/issue/[id]` | `resident.updateIssue` | `POST /issues/:id/updates` | `updateIssue` (resident agent's, conditional) | e2e › I1, `personas.spec.ts` 4 |
| Issues list and badge | `/owner/issues`, tab badge · `owner/issues`, badges | `owner.issues`, `owner.issueSummary` | `GET /owner/issues`, `/owner/issues/summary` | `responseStates` (`issue-response.ts`) → `issueNeedsResponse` | API › I1 (3, revert-checked); e2e › I1 |
| Community: announce, hide | owner community page · `OwnerFeed` | `resident.post`, `moderatePost` | `/hostels/:id/community`, `/posts/:id` | `community.ts` (Pro) | API `personas.test.ts` › community board |
| Reviews: reply, edit reply | reviews page · `reviews.tsx` | `owner.reply`, `owner.editReply`, `owner.reviews(id, page)` | `POST/PUT /owner/reviews/:id/reply` → `ownerReplySchema`; `GET …/reviews?page` | `replyToReview` (conditional on no reply), `editReviewReply`, `ownerReviews` (unreplied first, paged); Pro | API › O1, O2, edit, Pro gate (revert-checked); e2e › reply edit, `personas.spec.ts` 5 |
| Visits inbox | `/owner/visits` · `owner/visits` | `owner.visits`, `owner.setVisit` | `PATCH /owner/visits/:id` → `visitStatusSchema` | `setVisitStatus`: `VISIT_NEXT`, conditional on status | API › S4 (3, revert-checked); e2e › S4 |
| Menu editor, copy last week | menu page · `menu.tsx` | `owner.menu`, `saveMenu`, `copyLastWeek` | `/owner/hostels/:id/menus/:week…` → `menuWeekInputSchema` | `saveMenu`: `requirePlanTier('partner')` | API › M10 (paused menu, revert-checked); e2e › O5 |
| Headcount, subscribers | kitchen page · `kitchen.tsx` | `owner.headcount`, `subscribers` | `GET …/headcount?date`, `…/subscribers` | `headcount`: SQL filtered by hostel incl. moves | API › O5 (revert-checked); e2e `personas.spec.ts` 6 |
| Payouts | `/owner/payouts` · `owner/payouts` | `owner.payouts` | `GET /owner/payouts` | `ownerPayouts`: real money only, rest named | API `payment-modes.test.ts` |
| Dashboard / insights | dashboard tab · `dashboard.tsx` (new) | `owner.insights` | `GET …/insights?month` → `monthSchema` | `ownerInsights` (+ `planBill`, shared needs-response) | API › M10 (planBill), I1 (count); e2e `owner-admin.spec.ts` |
| Brand standards, brand kit | plan page, brand tab, `brand/[file].svg` | `owner.partnerInfo`, `owner.brandKit` | `GET …/partner`, `…/brand-kit` | `ownerPartnerInfo`, `brandKit` (verified Partner, not paused) | web unit `brand-kit.test.ts` (7, revert-checked); e2e › O7 |
| Live somewhere else (O8) | hostel page Subscribe | `hostels.subscribe` | `POST /hostels/:id/subscribe` | `subscribe` refuses own hostel | API `subscriptions.test.ts`; e2e `plans-any-role.spec.ts` |

## 2. Screens and states

Each web route below is in `e2e/workspaces.spec.ts` (axe WCAG 2.2 AA with no serious or critical findings, and no
horizontal overflow at 360, 390, 768, 1024 and 1440 px) for the demo owner, and `owner-journeys.spec.ts` adds axe on
the owner home (empty and with a rejected listing), the listing page, plan, residents, rent, visits, brand and
`/for-owners`. Money is printed with `rupees()` (₹, Indian grouping).

### Web

- [x] `/for-owners`: plan features, prices and price lines from `OWNER_PLAN_FEATURES`/`pricing.ts`; "How billing works"
  (free month once per hostel, 5-day lead, overdue at 7, pause at 15, upgrade credit, downgrade at month end); "What
  Verified partner requires" (the 10 standards); CTA. e2e › O1, `owners.spec.ts`.
- [x] `/owner` home: empty state with CTA; per hostel a next step (draft rooms/photos/review, in review, rejected with
  reason, issues waiting, unpaid or overdue bill with pause date, paused, partner application, live); needs-response
  count on Open issues and the All issues link. e2e › O6, I1; shared › next steps (every state).
- [x] Hostel layout: tabs with a needs-response badge (text for screen readers), menu and kitchen locked by plan tier,
  paused badge links to Pay. e2e › I1.
- [x] Listing: submit card states; photos with no Remove that would be refused; upload note says metadata is stripped.
- [x] Rooms (unchanged; M5 work).
- [x] Residents: "Leaving on <date>", set/change move-out, withdraw invite, past residents (the API now returns them),
  Upsell on Free. e2e › O4/T10.
- [x] Rent: still unpaid in rupees, reminders. e2e › O4 (amount asserted; closes P6-RENT's gap).
- [x] Issues & community, `/owner/issues`: "Reply to these first" ordered by how long each waited (from a reopen when
  there was one). e2e › I1.
- [x] Reviews: unreplied first, paging past 20, reply once, edit (shown as edited with the date), Pro upsell. e2e ›
  reply edit; `personas.spec.ts` 5.
- [x] Menu, Kitchen: open for a paused Partner with a notice. e2e › O5; `personas.spec.ts` 6.
- [x] Brand kit: names wrap at spaces, Devanagari fonts and `xml:lang`, UTF-8 download name. e2e › O7.
- [x] Plan & billing: paused card, bill with pause date, credits and notes on bills, payment mode for non-live paid bills,
  "Keep this plan" only for a scheduled downgrade. e2e › M8, `personas.spec.ts` 3.
- [x] Dashboard: what the owner owes us on every plan (pause date), money net of fee (real money only, rest named),
  occupancy, issue health with needs-reply link. e2e `owner-admin.spec.ts` (headings), sweep.
- [x] Visits: only allowed moves, outcome message, closed requests have no actions or call links. e2e › S4.
- [x] Payouts (unchanged; PRP-04).

### Mobile (Android; logic unit-tested, screens typecheck and export for Android, no device run)

- [~] Owner home: next step per hostel, All issues badge. Logic: shared › next steps. No device run.
- [~] Hostel screen: Issues badge, plan-tier locks, new Dashboard row. mobile › sections lock (paused Partner). No device run.
- [~] Dashboard (new), Plan, Reviews, Residents, Visits, Listing photos, Menu, Kitchen: same rules as the web pages.
  mobile `owner.test.ts` (plan choices, sections, `canRemovePhoto`); no device run.

## 3. Edge cases (owner rows)

| ID | Outcome | Evidence |
|---|---|---|
| I1 | Fixed: one rule (`issueNeedsResponse`), used by issue lists, insights and the tab badge; comment answers; reopen re-times | API › needs response (3), shared (3), e2e › I1; revert-checked (list and dashboard separately) |
| O1 | Fixed: reply returns the replied review; owner list pages past 20, unreplied first | API › older than the newest 20; revert-checked |
| O2 | Fixed: conditional first reply; edit endpoint; "edited <date>" | API › double tap, edit; e2e › reply edit; revert-checked |
| O4 | Fixed: refused for live and in-review listings, serialized on the hostel row | API › listing photos (2); revert-checked |
| O5 | Fixed: SQL filtered by hostel incl. moves in and out | API › headcount (queries bound to the hostel); revert-checked |
| O6 | Fixed: every state has a next step (drafts, review and paused had none) | shared › next steps (4), e2e › O6 |
| O8 | Verified: simultaneous pay and waive end in one outcome | API › paying at the moment an admin waives (4 rounds) |
| S4 | Fixed: one-way states, conditional update, withdraw race consistent | API › visit inbox (3); e2e › S4; revert-checked (2) |
| T8 | Fixed: partial unique index on open owner-added stays | API › two taps; revert-checked by dropping the index |
| T10 | Fixed (decision: allow future dates) | API › move-out ahead / today / before start; e2e › O4/T10; revert-checked |
| M8 | Fixed: credits, used-days bill, early-paid month, live money, trial | API › 7 tests (day 1, middle, last day…); e2e › M8; revert-checked |
| M9 | Fixed (failed when verified): switching down and up in the free month extended it | API › 2 tests; revert-checked |
| M10 | Verified, plus a fix: paused Partner keeps menu, kitchen and subscribers | API › 2 tests; revert-checked (menu) |

## 4. Not done, or not verifiable here

- [ ] Mobile screens on a device or emulator (no Android runtime here): only logic tests, typecheck and the Android export.
- [~] The paused state on the web owner home renders from the same rule that is unit-tested, but no browser test reaches
  it: the e2e API runs on the real clock and the seed has no paused plan.
- [~] Brand kit fonts: the SVG names Devanagari-capable fonts and the script; how a print shop's software renders them
  was not checked.
- [ ] `reorderPhotos` with a partial id list can leave two photos with the same position (minor; not fixed).
- [ ] O3 (recently changed listings feed) belongs to the admin agent.
