# Acceptance: every persona, end to end

This is the bar a feature has to clear before it counts as done. It turns the two specs
(`docs/superpowers/specs/2026-10-12-hostels-platform-design.md` and the personas addendum, which wins on conflicts)
into journeys, each with the checks a reviewer runs. `PRPs/LEDGER.md` stays the record of what is verified; this file
says what "verified" has to cover.

## The product in one loop

Owners run their hostel on our app → residents are known to the app → their reviews and issue record are verified →
seekers trust what they read → good hostels fill faster → more owners join and pay us.

Every journey below feeds one link of that loop. If a screen does not help a link, it should be simple and get out of
the way. If a link breaks, the trust story breaks with it, so those paths get the strictest checks.

## What "done" means for one screen

Each screen (web and Android) and each action on it must pass all of these:

1. **Traced end to end.** UI control → server action or mobile handler → shared client → API route → zod schema →
   service → SQL. Input is validated at the API, not only in the form. Authorization lives in the service (`access.ts`
   helpers); records the caller must not know about return 404.
2. **Every state designed.** Loading, empty (with the next useful step), error (plain words plus a retry or a way out),
   success (what happened, and what happens next). No blank screens and no dead ends.
3. **Edge cases tested.** Double submit, a stale page, concurrent users, the boundary values in the spec (cut-offs,
   14/180-day review window, 7-day reopen, 15-day overdue downgrade, 3-issue transparency threshold).
4. **Accessible.** WCAG 2.2 AA via axe with no serious or critical findings; every control labelled; visible focus;
   keyboard-only completion; target size ≥ 24 px (44 px on touch); reduced motion respected; text contrast ≥ 4.5:1.
5. **Responsive.** No horizontal scroll at 360, 390, 768, 1024 and 1440 px; primary action reachable without zooming.
6. **Honest copy.** No claims the data can't back. Numbers come from the API or `@hostels/shared` constants.
7. **Tested.** An API test for every rule, a Playwright test for every journey (run against the production build),
   and a test that fails when the fix is reverted for every bug found.

## 1. Seeker: "find a place I can trust, without visiting ten"

| # | Journey | Acceptance |
|---|---|---|
| S1 | Land on the homepage and start a search | Search by area or hostel name with suggestions while typing (debounced, keyboard navigable, works without JS as a plain form). Popular areas shown from real data. |
| S2 | Narrow results | Filters: rent range, sharing, gender, food, verified only, 4★ and up; sort by rating, price, distance. Filters live in the URL (shareable, back button works). Chips remove one filter each. No-results suggests what to relax. Filtered pages are `noindex`. |
| S3 | Judge a hostel | Gallery, map pin, rooms with rent, advance and beds free (with when beds were last updated), amenities, rules, this week's menu for partners. Reviews: average, count, sub-ratings, "Lived here Mar–Sep 2026", owner reply, paged. Transparency panel only at ≥ 3 issues in 90 days, otherwise says why it's hidden. "Verified partner" explains what we checked. |
| S4 | Act | Free listing: request a visit (date ≥ today, one open request per hostel), WhatsApp and call. Partner: Subscribe → room → food plan and diet → summary with first bill → pay. No advance. Bed held 30 minutes. |
| S5 | Follow up | `/account` shows visit status with next step, withdraw a visit, the subscription and bills. |
| S6 | Be found | Hostel and area pages server-rendered with metadata, Open Graph, `LodgingBusiness` JSON-LD, sitemap. Area pages survive the API being down. |

**Trust checks (the core of the product):** only residents with a qualifying residency can review; one review per
person per hostel; hidden reviews drop out of averages; a seeker can flag a review with a reason; the review card says
how the stay was verified (platform subscriber vs owner-added resident).

## 2. Owner / partner: "run my hostel, look professional, fill beds"

| # | Journey | Acceptance |
|---|---|---|
| O1 | Decide to join | `/for-owners`: what each plan gives, prices from `pricing.ts`, first month free, what "Verified partner" requires. Clear sign-up CTA. |
| O2 | List a hostel | Details, address and map pin, photos (type and size checked, metadata stripped), rooms, amenities, rules. Onboarding progress shows what's missing. Submit → pending → approved or rejected with a reason they can act on. |
| O3 | Pick a plan | Free / Pro / Partner per hostel. Partner goes to admin review and needs a live listing. Owner bills monthly with a 5-day lead, paid on `/pay`. Overdue after 7 days; at 15 days overdue the hostel drops to Free features with data kept and restored on payment. Cancel takes effect at month end. |
| O4 | Run the hostel (Pro+) | Resident roster (add by phone, end stay), rent tracker (who's unpaid this month, in rupees), issues (move status forward, reply, see reporter), community (announce, hide), review replies (one each, public). |
| O5 | Run food and subscriptions (Partner) | Weekly menu editor with copy-last-week, headcount per meal after skips split veg / non-veg, subscribers, payout statements. |
| O6 | See how it's going | Dashboard: occupancy, revenue, issues by age and category, "needs response" (no acknowledgement within 24 h), visit inbox. |
| O7 | Use the brand | Brand standards checklist and progress, brand kit downloads (signboard and print files with the hostel name). |
| O8 | Live somewhere too | An owner can subscribe to a plan at a hostel they don't own; never at their own. |

## 3. Resident: "a voice that's heard, and people to live with"

| # | Journey | Acceptance |
|---|---|---|
| R1 | Become a resident | Via an active subscription, or by accepting an owner's invite (verified phone only). Decline is possible. "I've moved out" ends it. |
| R2 | Report an issue | Category, title, description, optional photo (private to the hostel's residents, owner and admins, never public). Timeline of every status change. Confirm or reopen within 7 days of resolution; auto-close after. Others can add "me too" once and comment; reporter name hidden from other residents. |
| R3 | Community | Board for current residents and the owner only. Post kinds, owner announcements pinned, photos private, report and delete own, opt-in directory (name and room type, never phone). Likes. |
| R4 | Review | Allowed after 14 days or within 180 days of leaving. Sub-ratings, food skipped when there's no food, edit re-stamps the date. Prompted after day 14. |
| R5 | Daily life (subscribers) | This week's menu, skip and unskip before cut-offs (IST), credits on the next bill capped at the food price, pay bills, move hostel, cancel. |

## 4. Admin: "keep the marketplace honest"

| # | Journey | Acceptance |
|---|---|---|
| A1 | Approve listings | Queue with search; approve or reject with a reason; public pages update at once. |
| A2 | Verify partners | Checklist with saved progress; set the platform fee %. |
| A3 | Moderate | Review flags and content reports; hide with a reason; unhide. |
| A4 | Money | Owner plans and pauses, owner bills (filter, waive with a reason), tenant overdue bills, payouts (generate, mark paid), revenue. Simulated payments are never counted as real money. |
| A5 | Operate | Escalated issues, run background jobs now, food partner directory, audit log of every admin action. |

## Cross-cutting

- **Security:** no open redirects; session cookie httpOnly; rate limits on login and writes; private uploads served
  only to members; CSP without `unsafe-inline` scripts where the framework allows.
- **Money correctness:** whole rupees; no overbooking under concurrency; no external payment call inside a DB
  transaction; webhooks idempotent and signature-checked; stub and live payments kept apart.
- **Performance:** search and hostel pages server-rendered; 3D only on `/`, lazy, with fallbacks; images sized.
- **Out of scope (v1, per spec):** live chat, push notifications, roommate matching, KYC, autopay, multi-language.
