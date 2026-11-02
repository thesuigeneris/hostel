# Seeker audit: every screen, action and state

Owner: the Seeker persona (find, judge, act, follow up, be found). Bar: `docs/product/acceptance.md` › "What done means
for one screen" and section 1 (S1–S6, trust checks), plus `docs/product/edge-cases.md` section 4 (S1–S8) and T2.

Branch `persona-seeker` (from `claude/eager-hawking-4exijr`). Tests named below are the evidence; `[x]` means the named
test ran and passed in this session, `[~]` means implemented with only part of it testable here (the gap is stated),
`[ ]` means not done. Commands:

- API: `cd apps/api && TEST_DATABASE_URL=…/hostels_test_s bun test` (`test/seeker.test.ts` is this audit's file)
- Shared: `cd packages/shared && bun test` (`test/seeker.test.ts`)
- Web unit: `cd apps/web && bun test ./test` (`test/seeker.test.ts`, `test/paths.test.ts`)
- Mobile unit: `cd apps/mobile && bun test` (`test/seeker.test.ts`)
- Web e2e: `cd apps/web && E2E_DATABASE_URL=…/hostels_e2e_s E2E_API_PORT=4105 E2E_WEB_PORT=3105 bun run e2e:fresh`
  (`e2e/seeker-journeys.spec.ts` is this audit's file; production build)

"Mutation-checked" means the fix was reverted on its own and the named test failed, then the fix was restored.

## 1. Trace of every seeker action (UI → handler → client → route → zod → service → SQL)

| Action | Web / mobile entry | Shared client | API route → schema | Service → SQL | Authz | Evidence |
|---|---|---|---|---|---|---|
| Type in the search box | `SearchSuggest` → `GET /api/suggest` (route handler) · Explore `suggest` effect | `hostels.suggest` | `GET /suggest` → `suggestSchema` (2–80 chars, limit 1–10) | `search.ts` `suggest`: live hostels only, `ILIKE` with escaped wildcards | public | API › suggestions while typing (2 tests) |
| Search / filter / sort / page | GET form `/hostels`, `/hostels-in/[area]` · Explore filters | `hostels.search` | `GET /hostels` → `searchSchema` | `searchHostels`: one query for the page, one count | public | API › paging, search text, sort by rating; e2e S2, S5, S6 |
| Open a hostel | `/hostels/[slug]` · `hostel/[slug]` | `hostels.get`, `reviews`, `menu` (slug encoded) | `GET /hostels/:slug`, `/reviews?page`, `/menu` | `publicHostelBySlug` (live only, else 404), `hostelReviews` (hidden excluded), `partnerCheckFor` | public | API › verified partner explainer; shared › client paths |
| Request a visit | form → `requestVisitAction` → `run()` · `requestVisit` | `hostels.requestVisit` | `POST /hostels/:id/visits` → `visitRequestSchemaOn(clock)` (date today…+90) | `visits.ts` `requestVisit`: live, not own, date, one open (partial unique index) | signed in; own hostel refused | API › visit requests (4 tests); e2e S4 |
| Withdraw a visit | `/account` `cancelVisitAction` · Profile `withdraw` | `me.cancelVisit` | `DELETE /me/visits/:id` | `cancelVisit`: conditional `UPDATE … WHERE status='new'`; other people's → 404 | owner of the request | API `seeker-resident.test.ts` › withdraw (2); e2e `seeker-resident.spec.ts` › withdraws |
| Report a review | `ReviewCard` form → `flagReviewAction` · hostel screen reason chips | `hostels.flagReview` | `POST /reviews/:id/flag` → `reasonSchema` (3–300) | `flagReview`: hidden → 404; one flag per person (unique) | signed in | e2e `seeker-resident.spec.ts` › report with a reason; API `personas.test.ts` › flag → admin queue |
| Subscribe | `/subscribe/[slug]` → `subscribeAction` · subscribe screen `go` | `hostels.subscribe` | `POST /hostels/:id/subscribe` → `subscribeSchema` | billing (owned by the billing agent) | signed in, not own | e2e S4+S8; `personas.spec.ts` 2 |
| Release a held bed | subscribe / pay / account → `releaseHoldAction` · subscribe screen `onRelease` | `me.subscription` then `me.cancelSubscription` | `POST /me/subscription/cancel` | `cancelSubscription` (pending → cancelled, bed released) | own plan | e2e S4+S8, S8 (edge) |
| Pay (stub) | `/pay/[id]` → `simulatePaymentAction` · `openPayment` (web hand-off) | `payments.simulate` | `POST /payments/:id/simulate` | payments (owned by the payments agent) | own bill | e2e S4+S8 |
| Log in / sign up | `/login` actions · `login.tsx` | `auth.*` | `/auth/*` | auth (unchanged) | public | e2e `auth.spec.ts`, S7 |

## 2. Screens and states

### Web

- **`/` homepage**
  - [x] Search by area or hostel name with suggestions while typing: debounced, arrow keys, Enter, Escape, Tab;
    `aria-activedescendant`; a live region announces the count. e2e S1.
  - [x] Works without JavaScript as a plain GET form (no combobox role until the script runs). e2e S1 (no-JS context).
  - [x] Area picker and "Popular areas" come from live listings (busiest first). Web unit › areas come from live
    listings; e2e S1.
  - [x] Accessible with the suggestion list open (axe, WCAG 2.2 AA, no serious or critical). e2e S1.
  - [x] Responsive (360–1440) and axe on the closed page: `design.spec.ts` overflow ×5 and axe.
  - [x] Popup not clipped: the hero clips sideways only (`overflow-x-clip`).
- **`/hostels` search and `/hostels-in/[area]`**
  - [x] Filters in the URL; chips remove one filter each; the back button restores them. e2e S2, `search.spec.ts`.
  - [x] Results load as a complete page (no streaming skeleton that needs JavaScript); the Search button says
    "Searching…" while the next page loads. e2e S1 (no-JS results; failed before the fix).
  - [x] No results: each single relaxed filter is offered with how many hostels it finds; on an area page, "Look in
    every area"; inverted rent explained. e2e S2, `search.spec.ts` › no results.
  - [x] Past the last page: the real total and "Go to the last page". API › a page past the end; e2e S5.
  - [x] Odd characters (`%`, `_`, quotes, emoji) match literally; text over 80 characters is cut, never an error.
    API › search text; web unit › search params; e2e S6.
  - [x] Out-of-range `page`/`limit` in a hand-edited URL is brought into range. Web unit › search params.
  - [x] Sort by rating is fair: shrunk average (prior weight 5 in `@hostels/shared`), true average shown; "4★ and up"
    counts only shown ratings; every order ends with `id`. API › sort by rating, paging (mutation-checked).
  - [x] Cards: "New · 1 review" below 3 reviews, else stars with the count. e2e S3 (page), unit › ratingView.
  - [x] Filtered pages `noindex`. `seeker-resident.spec.ts` › only the plain search and area pages are indexable.
  - [x] Map view has a text list; pagination windowed. `search.spec.ts`.
  - [x] Error state: plain words and a way out (Flash). `search.spec.ts` › no results; S6 asserts no error for long text.
  - [~] API down on an area page: says so instead of a 404 (code review; no test stops the API).
- **`/hostels/[slug]` hostel page**
  - [x] Gallery, rooms with rent, advance, beds free and when beds were last updated. `search.spec.ts` › property page,
    gallery.
  - [x] "Verified partner" explains what our team checked, from the inspection record (kitchen only with food), what
    else the label means, and what it doesn't cover. API › verified partner explainer; e2e S3.
  - [x] Issue record hidden below 3 issues in 90 days, with the reason in plain words (both readings: few problems or
    few reporters). e2e S3; shown at ≥ 3: `personas.spec.ts` 4.
  - [x] Reviews: "New" below 3 reviews; JSON-LD `aggregateRating` only when shown. e2e S3.
  - [x] Report a review with a reason (signed in); signed-out readers get "Log in to report it". e2e S3,
    `seeker-resident.spec.ts`.
  - [x] Visit request: date today…+90 days; a waiting request replaces the form; signed-out readers get a log-in link
    (nothing typed is lost); the hostel's owner sees their inbox link instead. e2e S4; API › visit requests.
  - [x] JSON-LD photo URLs absolute. Web unit › absoluteUrl.
  - [x] axe and overflow. e2e S3 (axe), `search.spec.ts` › axe on property; e2e S4 (overflow on a free listing).
- **`/subscribe/[slug]`**
  - [x] Room → food plan and diet → first bill (live, `aria-live`) → Continue. No advance shown as ₹0. e2e S4+S8.
  - [x] Visible keyboard focus on the room and food cards (was missing). e2e S4+S8 (mutation-checked).
  - [x] A held bed or a running plan shows its next step (pay / release and re-pick / move) instead of the
    "already subscribed" dead end. e2e S4+S8.
  - [x] Hold time from `PENDING_SUBSCRIPTION_TTL_MINUTES`. e2e S4+S8.
  - [x] All beds taken: links to verified hostels in the same area. (Code review; the seed always has beds.)
  - [x] axe and overflow. e2e S4+S8.
- **`/pay/[invoiceId]` (seeker view)**
  - [x] Held bed: "We're holding your bed … until 6:42 pm", and "Release the bed and choose again". e2e S4+S8.
  - [x] Paid: "Paid on …", no payment button after back, reload or reopening. e2e S4+S8 (S8).
  - [x] Cancelled or replaced bill: honest copy and a way to the plan. e2e S8 (edge).
  - [x] axe with a held bed. e2e S4+S8.
- **`/login`**
  - [x] An ended session says so and returns to the same step. e2e S7.
  - [x] Unreachable API reads as a connection problem (was a crash page). Web unit › form errors.
  - [x] Phone prefix aligned with the 44 px input. (Visual; covered by the axe/overflow sweep in `design.spec.ts`.)
- **`/account` (visits, plan, bills)**
  - [x] Visit status with the next step, including a requested date that has passed. Shared › visit dates; e2e S4.
  - [x] Withdraw. `seeker-resident.spec.ts` › withdraws.
  - [x] Plan and bills; a held bed can be released here. e2e S4+S8 (plan, paid bill).
- **SEO**: [x] sitemap and robots (`/api/` disallowed), metadata, Open Graph, `LodgingBusiness` JSON-LD:
  `seeker-resident.spec.ts` › indexable, e2e S3 (JSON-LD).

### Android app (Expo)

- [~] **Explore**: suggestions while typing (debounced; newest answer wins), area pick sets the filter, hostel pick
  opens it; "Show more" can't append to a newer search; no results offers relaxed filters with counts, the
  inverted-rent hint and Clear all. Mobile unit › explore suggestions, no results. Screen wiring unverified: no React
  Native renderer or device in this environment.
- [~] **Hostel**: report with a reason, partner check, hidden issue record note, "New" rating, bed freshness, waiting
  visit instead of a second form, no form for the owner. Typecheck and `expo export`; logic in shared helpers (tested).
- [~] **Profile**: visit status in plain words, next step, Withdraw. Mobile unit › visits; screen unverified on a device.
- [~] **Subscribe**: held bed / running plan states with pay, release, move; honest log-in copy. Mobile unit › bed hold.
- [~] **Login**: retry when the server can't be reached. Typecheck only.
- [~] **Accessibility**: fields carry their label for screen readers; chips reach a 46 px touch area; muted text
  `#646D68` (was 3.66:1) and amber text `foodInk` meet AA; amber buttons carry dark text. Values measured on the web
  (`docs/design/system.md`); not run through a device screen reader.

## 3. Defects found and fixed (each with a test that fails without the fix)

| # | Defect | Fix | Test (mutation-checked unless noted) |
|---|---|---|---|
| 1 | Search text `%` or `_` acted as wildcards (`%` matched every hostel) | `escapeLike` in `search.ts` | API › wildcards, quotes and emoji; › suggestions wildcards |
| 2 | Sort by rating used the raw average: one 5★ review outranked many at 4.8 (T2) | shrunk average, `RATING_PRIOR_WEIGHT` | API › a single 5★ review does not outrank many good ones |
| 3 | "4★ and up" let a single-review hostel in | needs `RATING_MIN_REVIEWS` reviews | same test |
| 4 | Equal rows had no total order; paging could repeat or skip hostels (S5) | `h.id` last in every order | API › equal rows keep one order |
| 5 | Past the last page the total read 0 ("0 hostels") (S5) | separate count; UI links to the last page | API › a page past the end; e2e S5 |
| 6 | Double-submitted visit form made two waiting requests (S1) | partial unique index `visit_requests_one_open` (migration **0009**) | API › a form sent twice at once (6 parallel; 6 rows without the index) |
| 7 | An owner could request a visit at their own hostel (S2) | refused in `requestVisit`; inbox link on the page | API › an owner cannot…; e2e S4 |
| 8 | Visit dates had no upper bound (S3) | `VISIT_MAX_DAYS_AHEAD` (90) in the schema and the service | API › dates run from today to 90 days; shared › visit dates |
| 9 | Without JavaScript the search and area pages showed only the loading skeleton (route `loading.tsx` streamed the results behind a Suspense boundary) | removed both `loading.tsx`; "Searching…" button state | e2e S1 (no-JS part failed before the fix) |
| 10 | Search text over 80 characters failed the whole search | cut to the limit; `maxlength` on the box | e2e S6; web unit › search params |
| 11 | Back from the pay page and "Continue" again → "You already have a plan" dead end for 30 minutes | subscribe page shows the held bed (pay / release) | e2e S4+S8 |
| 12 | Room and food cards had no visible keyboard focus | `peer-focus-visible` ring | e2e S4+S8 |
| 13 | A voided first bill said "replaced by a newer one" even when the hold expired or was released | honest copy, link to the plan | e2e S8 (edge) |
| 14 | An ended session sent people to log in with no reason given | `expired=1` notice; returns to the step | e2e S7 |
| 15 | Area picker listed a fixed list; an area in the URL outside it was dropped on resubmit | live areas plus the current one | web unit › areas |
| 16 | Form errors read "Some fields are invalid: preferredDate …"; an unreachable API crashed login | `errorText`: "Preferred date: …"; connection message | web unit › form errors |
| 17 | Transparency note hard-coded 90 days, ignored the 3-issue rule, and read as praise | `TRANSPARENCY_HIDDEN_NOTE` from shared constants | e2e S3 |
| 18 | Verified explainer claimed checks ("the kitchen is safe") for hostels without food, from no record | the inspection record (`partnerCheck`) | API › verified partner explainer; e2e S3 |
| 19 | JSON-LD claimed an average from 1–2 reviews; image URLs could be relative | `ratingView`; `absoluteUrl` | e2e S3; web unit › absoluteUrl |
| 20 | A signed-out visitor typed a date and note, then lost them at log-in | log-in link first | e2e S4 |
| 21 | Shared client put slugs and ids into paths unencoded (`../me` reached `/me`) | `seg()` per path segment | shared › client paths |
| 22 | Mobile: "Show more" for an old filter appended to a newer search | `latestOnly` guard | mobile unit › only the newest request (helper only; screen unverified) |
| 23 | Mobile: review report sent a fixed reason; no way to choose | reason chips (shared `REVIEW_FLAG_REASONS`) | typecheck; device unverified |
| 24 | Mobile: "We'll text you a code" when OTP may be off; "two weeks", "30 minutes" hard-coded | shared constants, honest copy | typecheck |
| 25 | Mobile: muted text 3.66:1, amber text and white-on-amber buttons below AA | theme `muted`, `foodInk`, dark text on amber | values measured on the web; device unverified |

## 4. Gaps built

- Search suggestions (API endpoint, zod schema, client method, web combobox, app list).
- No-results recovery with counts (web and app); last-page recovery.
- "New" ratings below 3 reviews (cards, page, JSON-LD, app).
- Verified-partner explainer from the inspection record; "too little issue history" explanation (web and app).
- Held-bed states with release and re-pick (web and app); first bill summary on the web subscribe page.
- Visit next steps (passed dates), withdraw on the app.

## 5. Found outside this persona's scope (not changed here)

- **Admin / partners**: `decidePartner` verifies without a checklist when none is sent (`closeApplication` only checks a
  sent checklist), so "verify only when every standard is ticked" isn't enforced by the API; the test fixtures verify
  this way. The seeker page now says when no item-by-item record exists.
- **Billing**: `cancelSubscription` has no "only if still pending" form, so releasing a hold races a payment landing at
  the same moment. The web action and the app re-read the plan first; a small window remains.
- **Payments**: a first bill can still be paid after the 30-minute hold until the expiry job runs (edge case M1).
- **Owner insights**: `POST /hostels/:slug/view` counts every page load, unauthenticated and without de-duplication.
- **Owner visits**: any status to any status (edge case S4, owner agent).
- **Reviews**: a person who flagged a review that was later un-hidden can't flag it again (`onConflictDoNothing` on
  `review_flags_review_user`); flags on reviews of hostels that are no longer live are accepted.

## 6. Not done or unverified

- Android screens were not run on a device or emulator (no Android SDK here); `npx expo export --platform android`
  builds the bundle. Screen behaviour is covered by unit tests of the shared and app helpers only.
- API-down states (area page, suggestions) are code-reviewed, not tested: no test stops the API.
- Migration number: **0009** (`0009_visit_one_open`). It was generated as 0008 after merging `12c866c`; the payments work took 0008 first, so it was regenerated as 0009 when merging `53c7628`.
