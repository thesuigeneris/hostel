# Edge cases: the catalogue every change is checked against

`docs/product/acceptance.md` says what each journey must do. This file lists the cases where it is easiest to get
wrong: boundaries, races, money, trust, and states nobody designed. Each row says what must happen. A row is closed
only when a test proves it (and, for a bug, fails without the fix).

**Found** rows are defects confirmed by reading the code on 2026-11-01 (file references are to that read).
**Verify** rows are behaviours to prove with a test; fix them if the test fails.

## 1. Trust (reviews, residencies, transparency): the product's core

| ID | Case | Must happen | Status |
|---|---|---|---|
| T1 | Owner adds a resident with a start date months in the past; the resident accepts and reviews the same day. | The 14-day clock for owner-added stays starts at the later of the claimed start date and the day the invite was created. The stay span on the review still shows the claimed dates. | **Fixed**: `reviewClockStart` (`services/residents.ts`); the reason names the day. `resident-trust.test.ts` › T1 (2 tests); `resident-journey.spec.ts` 1, 4 |
| T2 | One 5★ review outranks a hostel with 50 reviews averaging 4.8 in "sort by rating". | Sort by a shrunk average with the prior in `@hostels/shared`; show the true average with its count. Fewer than 3 reviews shows "New" with the count. | **Found**: `search.ts` orders by raw `avg` |
| T3 | A resident edits a review after the owner replied. | The card says "Edited after the owner replied" (both dates are known), so the reply isn't read out of context. | **Verified** after two fixes (card label, review dates from `clock`): `resident-trust.test.ts` › T3; shared `resident.test.ts` › T3; `resident-journey.spec.ts` 4 |
| T4 | A hidden review is edited by its author. | Stays hidden; moderation is not undone by editing. | **Verified**: `resident-trust.test.ts` › a hidden review stays hidden when its author edits it |
| T5 | Owner flags every negative review. | Flags go to the admin queue only; nothing is hidden until an admin acts. | Verify |
| T6 | Transparency with exactly 2, 3 and 4 issues in 90 days; issue 91 days old. | Panel hidden at 2 with the reason shown; shown at 3; the 91-day issue is not counted. | Verify |
| T7 | Review eligibility boundaries: day 13 and day 14 of an active stay; stay of 13 vs 14 days; day 180 and 181 after move-out. | 13 refused with "N to go", 14 allowed; a 13-day stay can never review; 180 allowed, 181 refused. | **Verified**: `resident-trust.test.ts` › T7 (day 13/14 at IST midnight; 13- vs 14-day stays; days 180/181) |
| T8 | Two concurrent "add resident" calls for the same phone. | One invite. Needs a partial unique index on (hostel, phone) for invited/active stays. | **Found**: no unique index (`db/schema.ts`) |
| T9 | Invite accepted or declined twice at once (double tap). | One answer wins; the other gets "already answered". Conditional update. | **Fixed**: one conditional update each in `respondToInvite`, `moveOut`; 409 for the loser. `resident-trust.test.ts` › T9 (2 tests) |
| T10 | Owner ends a resident's stay with a date in the future. | Either refuse future dates, or keep the stay active until that date. Access must not end early. | **Found**: `endResident` sets `ended` immediately |
| T11 | Reviewer's name is in Devanagari, a single word, or empty. | `firstNameAndInitial` renders sensibly; never shows a phone number. | **Fixed** (phone typed as a name, initials of emoji/accents): shared `firstNameAndInitial`; `resident-trust.test.ts` › T11; shared `resident.test.ts` › names |

## 2. Issues and community

| ID | Case | Must happen | Status |
|---|---|---|---|
| I1 | Owner answers an open issue with a comment only (no status change). | It no longer counts as "needs response" (owner list and dashboard). A reopened issue needs a response again, timed from the reopen. | **Found**: `needsResponse` uses `status === 'open'` (`community.ts`, `insights.ts`) |
| I2 | Owner double-taps "Resolved"; reporter reopens while the auto-close job runs. | One transition; the loser gets "this issue changed, refresh". Conditional `UPDATE … WHERE status = <seen>`. No duplicate timeline entries. | **Fixed**: `updateIssue` applies a status change only from the status the caller saw (`from`), in the same transaction as the timeline row; web and app buttons disabled while pending. `resident-issues.test.ts` › I2 (3 tests); `resident-journey.spec.ts` 3 |
| I3 | A resolved issue closes on its own after 7 days. | The timeline shows "Closed automatically after 7 days". | **Fixed** (migration `0009_resident_fixes`: `issue_updates.author_id` nullable, null = the platform): `resident-issues.test.ts` › the timeline says the issue closed automatically, once |
| I4 | Reopen at 6 days 23 hours vs 7 days 1 minute after resolution. | Allowed, then refused with "report it again". | **Verified**: `resident-issues.test.ts` › reopen at 6 days 23 hours…; shared `canReopen` used by web and app (`stay.test.ts`) |
| I5 | Reporter moves out before the issue is resolved. | The issue stays on the hostel's record; the former resident can still see their own issue (read-only) or is told why not. | **Fixed**: the reporter keeps read-only access to their own issue; `GET /me/issues`; past stays list them. Others get 404. `resident-issues.test.ts` › I5 (2 tests); `resident-journey.spec.ts` 5 |
| I6 | "Me too" on your own issue; on a closed issue; twice. | Refused; refused; idempotent. | **Fixed** (closed: refused, product decision): `resident-issues.test.ts` › I6 |
| I7 | Other residents read an issue. | Never see the reporter's name; comment authors other than the owner show as "Resident". | **Verified**: `resident-issues.test.ts` › I7 (admin updates show as "Hostels team") |
| I8 | Resident attaches a photo URL from another site to an issue or post. | Refused: attachments must be the user's own uploads, served privately. | **Fixed**: photos are upload receipts checked against the uploader and purpose (`claimUpload`); `uploads.test.ts` › a resident can only attach their own private uploads… |
| I9 | Board access when the hostel drops to Free or is suspended. | Board is read-only or hidden with an explanation; data kept and back when the plan returns. | **Fixed** (hidden with an explanation; data kept and back on payment): `resident-life.test.ts` › I9 (2 tests) |
| I10 | Post exactly 1,000 characters; 1,001; only whitespace; emoji and Devanagari. | Accepted, refused, refused, accepted with the right count. | **Fixed** (counted in characters as people count them; blank or invisible-only refused): `resident-life.test.ts` › I10; shared `resident.test.ts` › text lengths |

## 3. Money (tenant bills, owner bills, payments)

| ID | Case | Must happen | Status |
|---|---|---|---|
| M1 | Seeker pays at minute 29; the webhook lands at minute 31, after the pending plan expired and the bill was voided. | Money is never lost silently: if the bed is still free, revive the plan and mark the bill paid; otherwise record a refund-needed entry an admin sees and can mark refunded. | **Fixed** (PRP-04): `markOrderPaid` revives the plan or records a `payment_exceptions` row; `test/late-payments.test.ts`, `e2e/payments.spec.ts` |
| M2 | Pay the same bill from two tabs, or callback and webhook together. | Paid once; the second sees "already paid". | **Verified** (PRP-04): two tabs now get the same order (before, the second tab overwrote it, so the first paid an order no bill pointed at); a second payment for a paid bill is recorded as a refund due. `late-payments.test.ts` › two tabs…, › a second payment…; `billing.test.ts` › checkout callback and webhook… |
| M3 | Simulated or waived payments. | Never counted as revenue, payouts or owner earnings. | **Fixed** (PRP-04): `payment_mode`; only `razorpay_live` counts. `test/payment-modes.test.ts`, `e2e/payments.spec.ts` |
| M4 | Skip meals in the last period of a cancelled plan. | No bill will ever carry that credit, so the skip still counts for headcount, earns ₹0, and the screen says why. | **Fixed**: `noCreditFrom` (`services/food.ts`, using `creditWindow`); credit 0, menu and screens say why. `resident-life.test.ts` › M4 (2 tests); `resident-daily.spec.ts` 3 |
| M5 | Plan starting on the 29th, 30th or 31st; February in a leap year. | Periods are continuous with no gaps or overlaps (e.g. start 31 Jan → 31 Jan–27 Feb, 28 Feb–30 Mar). Bills appear 5 days ahead. | **Verified**: `resident-life.test.ts` › M5 (29th, 30th, 31st, leap February through the job); shared `resident.test.ts` › M5 sweep |
| M6 | Skip cut-offs at 21:59 / 22:00 IST the night before (breakfast), 08:59 / 09:00 (lunch), 14:59 / 15:00 (dinner), with the server clock in UTC. | Exactly at the cut-off is too late. The UI shows the cut-off in IST. | **Verified**: `resident-life.test.ts` › M6; shared `resident.test.ts` › IST; UI shows "until 9:00 am IST" (`resident-daily.spec.ts` 1) |
| M7 | Skip credits above the food price in one period. | Capped at the food price. | **Verified**: `resident-life.test.ts` › M7 (₹6,510 of skips → ₹6,000) |
| M8 | Owner upgrades Pro → Partner mid-period after paying for Pro. | No double charge for the overlapping days: the unused part of the paid Pro period is credited on the first Partner bill. | **Found**: `switchPlan` re-anchors and bills the full Partner month |
| M9 | Owner downgrades during the free month; upgrades again. | No second free month for the same hostel. | Verify |
| M10 | Owner bill 15 vs 16 days past due; paid on day 16. | Paused on day 16; restored at once on payment. | Verify |
| M11 | Last bed: two seekers subscribe at the same moment; owner edits rent at the same time. | One gets the bed, the other "no beds left"; the rent edit never restores a bed. | **Fixed** (M5): `listings.test.ts` › rent edits racing bookings keep every booked bed taken, › saving a form opened before a booking never gives the booked bed back; last-bed race: `billing.test.ts` › concurrent subscribes never overbook the last bed |
| M12 | Razorpay order creation fails or is slow. | No DB transaction held open; the bed is released by the 30-minute expiry; the seeker can retry from `/pay`. | **Fixed** (M6): `subscriptions.test.ts` › while the payment service is slow…, › if the payment service fails, the tenant can retry… |
| M13 | Move scheduled into a hostel that is delisted or loses verification before the move date. | The move is cancelled, the bed released, and the resident told; they stay where they are. | **Fixed** (migration `0009_resident_fixes`: `move_requests.cancel_reason`): `completeDueMoves`; `resident-life.test.ts` › M13 (3 cases + control). Paid bills for the cancelled period: see `audit-resident.md` |

## 4. Seeker journeys

| ID | Case | Must happen | Status |
|---|---|---|---|
| S1 | Same visit request submitted twice at once. | One request. Partial unique index on (hostel, user) where status is `new`. | **Found**: no unique index |
| S2 | Owner requests a visit at their own hostel. | Refused with a plain message. | **Found**: no check (`visits.ts`) |
| S3 | Visit date years ahead. | Capped (e.g. 90 days ahead) with a clear message. | **Found**: no upper bound |
| S4 | Owner moves a withdrawn (closed) visit back to "contacted". | Not allowed: `new → contacted → closed`, closed is final. | **Found**: any status to any status |
| S5 | Search page past the last page; equal-rank results across pages. | Real total shown, link to the last page; stable order with `id` as the final tie-break. | **Found** |
| S6 | Search with no results, odd characters (`%`, `_`, quotes, emoji), a 500-character query. | Recovery suggestions; `ILIKE` wildcards escaped; long input refused or trimmed. | Verify |
| S7 | Session expires between "Subscribe" and paying. | Sent to login and back to the same step (safe `next` path only), with the bed hold explained. | Verify; Resident side **verified**: a form posted after the session ended goes to log in and back (`resident-daily.spec.ts` 4) |
| S8 | Back button after paying; reopening `/pay` for a paid bill. | Shows "paid", never a second payment button. | Verify; Resident side **verified**: `resident-daily.spec.ts` 3 (paid bill, `/pay`, Back/Forward) |

## 5. Owner and admin operations

| ID | Case | Must happen | Status |
|---|---|---|---|
| O1 | Owner replies to a review older than the newest 20. | The reply saves and the response includes the review. | **Found**: `replyToReview` searches page 1 only |
| O2 | Owner double-taps "Reply". | One reply; the second gets "already replied". Conditional update. | **Found**: read-then-write |
| O3 | Owner changes a live listing's name, address or map pin. | Stays live (per spec), but appears in an admin "recently changed listings" feed; for a verified partner, an address or pin change also flags the partner check for re-review. | **Found**: no trail of material edits |
| O4 | Owner deletes the last photo of a live listing. | Refused: a live listing keeps at least one photo. | **Found**: allowed |
| O5 | Headcount at a hostel on a platform with thousands of subscribers. | Filtered in SQL by hostel (including moves in), not by loading every active subscription. | **Found**: loads all active subscriptions (`food.ts`) |
| O6 | Owner with zero hostels, one draft, a rejected listing, a suspended plan. | Each dashboard state has a next step; nothing blank. | Verify |
| O7 | Admin acts on an owner's hostel through the owner routes. | Allowed, and written to the audit log with the admin as the actor. | Verify |
| O8 | Admin waives a bill that the owner pays at the same moment. | One outcome; never "paid" and "waived" together. | **Verified** for waive-then-pay (PRP-04): the bill stays waived and the payment becomes a refund due (`late-payments.test.ts` › owner bills…); a check constraint forbids a paid bill marked waived |

## 6. Cross-cutting

| ID | Case | Must happen |
|---|---|---|
| X1 | Every list endpoint | Paged, with a hard limit; stable sort. |
| X2 | Every write | Validated by the shared zod schema at the API; idempotent or guarded against double submit. |
| X3 | Every state change | Conditional `UPDATE … WHERE <expected state>`; the loser gets 409 and a "refresh" message, never a 500. |
| X4 | Every date | IST calendar dates; tests pin the clock at boundaries (midnight IST, 18:30 UTC). |
| X5 | Phones | `+91`, spaces and leading 0 normalised the same way at sign-up, invite and admin list. |
| X6 | Errors | API codes map to plain words on web and mobile; unknown errors show a retry and are logged. |
| X7 | Network loss (mobile) | Every data screen shows an error with retry; writes don't silently drop. |
| X8 | Accessibility | Keyboard-only completion of every journey; screen-reader names on every control. |

## 7. Product gaps noted (not in the specs; decide before building)

- **Change food plan or diet** without cancelling: likely needed by residents. Proposal: takes effect from the next bill.
- **Edit an owner reply:** a typo is permanent today. Proposal: editable, marked "edited".
- **In-app signals** (not push): a count on the owner's Issues tab for "needs response", and on a resident's issue when it changes.
- **Account deletion and data export:** India's DPDP Act 2023 gives people rights over their data. Proposal: a deletion request flow that keeps reviews anonymised.
