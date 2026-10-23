# Hostels — Foundation Design Doc

**Project:** Hostels app (working name TBD)
**Date:** 2026-04-26
**Stage:** Pre-product. Idea stage. Founder has lived the user pain for 2 years.
**Output of:** `/office-hours` session
**Founder:** mudgala.chinni@gmail.com (Hyderabad, India)

---

## Executive summary

Asset-light, food-led subscription brand for hostel/PG living in Indian metros. ~₹20,000/month flat, food + bed bundled, **no advance**, **portable** between partner properties. Third-party food partnerships (California Burrito, EatSure, regional tiffin services) replace in-house kitchen ops. Demand-pull supply: build subscriber base first, then onboard hostel owners as branded partners, then own/lease properties McDonald's-style.

**Not** a marketplace. **Not** "OYO for hostels." A subscription brand where the app is one customer touchpoint, not the business itself.

---

## The problem (from founder's lived experience)

Founder lived this in Hyderabad for the last 2 years:

- Took **5 months walking streets near his office** to find one good hostel.
- Existing platforms (NoBroker, MagicBricks, Facebook groups, social media) full of fake photos.
- **Brokerage required** just to view a room.
- **Advance lock-in** (~₹40k typical) prevents leaving bad hostels even when conditions decline.
- Friends in same situation, can't move when their current hostel goes downhill.
- **No subscription option** that bundles "food + bed" as one SKU with portability across properties.

Founder's own words (verbatim):
> "Can't I pay once and make sure to live in different places like a subscription fee every month — a fixed one — where that money will take care of my food and place to live? Some 20000 INR every month with customized food."

That sentence is the entire product thesis.

---

## Product thesis

### The wedge: food-led subscription, asset-light, demand-pull supply

1. **Food first because it's high-frequency.** A hostel app is low-frequency (downloaded in panic moments). Food is daily. 3x/day customer touchpoint = retention = defensibility.
2. **Asset-light to avoid the Oxfordcaps trap.** Stanza Living, Zolo, Oxfordcaps all started capex-heavy (lease properties, build kitchens, scale with capital). Oxfordcaps went bust. Stanza is unprofitable after $200M+ raised. Capital efficiency is a differentiator, not a constraint.
3. **Brand partnerships replace in-house kitchens.** California Burrito, EatSure, FreshMenu, regional tiffin aggregators want recurring orders. You give them a captive subscriber base. They give you bulk pricing + brand cred.
4. **Demand-pull supply.** Don't go door-to-door asking owners to list. Build the subscriber base first. Once you have 50-100 paying customers, hostel owners come to you for the tenant pipeline.
5. **No advance.** This is the customer lock-in flipped. Nobody else offers it. Owners get paid by the brand on a monthly basis; brand collects from subscribers; subscribers face zero switching cost.
6. **Portability between partner hostels.** Subscriber moves without losing money. Kills the industry's biggest pain.

### Why it's defensible (real moats)

- **Hostel exclusives.** Sign owners to "list only with us, our brand on your wall." OYO did this in 2014 with 200 hotels — owners got sticky.
- **Full-stack living ops.** Food is one touchpoint. You also handle rent collection, maintenance complaints, roommate disputes, deposit refunds, inter-property moves. You're a life brand, not a food bundle. Airbnb didn't get killed by Booking.com adding short-term rentals — different brand meanings survive.
- **No-advance portability.** Customer-facing differentiator no incumbent can match without re-architecting.
- **Local ops moat.** Running a city's food + housing partnership network requires local language, local brokers, local delivery timing. Zomato has food delivery ops, not housing ops.

### Why Zomato/Swiggy can't kill this in a day

- They lack the **housing-side ops** (B2B hostel onboarding, rent pass-through, tenant complaints).
- Public-company **margin discipline** prevents launching margin-dilutive housing adjacencies.
- **Brand mismatch:** trust to deliver dinner ≠ trust to decide where you live.
- If they enter seriously, they acquire you. That's a good outcome.

The real competitors are Stanza Living, Zolo, Colive — not the food apps.

---

## Competitive landscape

| Player | Model | Beds (India) | Status | Where you win |
|---|---|---|---|---|
| Stanza Living | Asset-heavy, in-house kitchen | ~45,000 | Unprofitable, $200M+ raised | Capex burn; advance required |
| Zolo Stays | Asset-heavy | ~30,000 | Closer to break-even | Advance required; rigid food |
| Colive | Mix of leased/managed | ~15,000 | Profitable | Limited food, no portability |
| Oxfordcaps | Asset-heavy student housing | 0 (defunct) | Dead | Capex killed them — be the negative-example study |
| OYO Life | Aggregator + brand | Pivoted away | Dead in segment | OYO chose hotels |
| Zomato/Swiggy | Food delivery only | N/A | Not a housing competitor | Won't expand into housing ops |
| 99Acres / NoBroker / MagicBricks | Listings | Millions | Profitable | You don't compete on listings — you bypass them |

---

## 90-day pre-app plan

### Days 1-7: Demand validation (cost: ~₹0)
- Founder names 10 specific people in Gachibowli / Madhapur / HiTech City. Friends, ex-colleagues, college contacts.
- WhatsApp pitch: "Hey, I'm building [2-sentence pitch]. Would you pay ₹3,000/month starting next month for [2 meals/day, mix of CalBurrito + tiffin]? Reply yes/no/maybe."
- **Green light:** 3+ yeses out of 10.
- **Red light:** 0-1 yeses. Thesis is wrong. Kill it. You saved 6 months.

### Days 8-30: First pilot (cost: ~₹50k float)
- Pick ONE hostel in Gachibowli. Ideally one where founder knows the owner or can negotiate access.
- Sell food subscription only (not bundled housing yet) to existing tenants there. ₹3,000/month for 2 meals/day.
- Target: 10 paying customers.
- Ops: WhatsApp group, Google Sheet, manual delivery via Swiggy/personal pickup.
- Sign one food partner at small scale (start with local tiffin aggregator — easier to sign than CalBurrito at 10 customers).

### Days 30-60: Unit economics
- Track: food cost per subscriber, delivery cost, founder labor, hostel partnership terms, churn.
- **Target gross margin: 25-35% on food.** Below 15% = pivot or kill.
- Sign hostel partner #2 with a "list with us, our brand on your wall" deal.

### Days 60-90: Bundled offer + app v0
- Launch the full **food + bed bundle** at ₹20k/month. Rent passes through to hostel partner; food margin + booking margin = your revenue.
- Build app v0 in this window (see tech section).
- Target: 30 paying subscribers across 2 hostels = seed-stage traction.

---

## When the app starts: tech stack

**Don't build any of this until day 60.** This section is the plan for when you do.

### Stack (optimized for solo founder + AI-assisted dev)
- **Mobile:** React Native via Expo. Single codebase iOS + Android. EAS for builds.
- **Backend:** Bun + Hono + Postgres (Neon or Supabase) + Drizzle ORM. Or Convex if you want zero backend ops.
- **Auth:** Clerk (phone OTP for India) or Supabase Auth.
- **Payments:** Razorpay — subscription billing, UPI autopay via mandate.
- **Maps:** Google Maps SDK (free tier sufficient at small scale).
- **Image storage:** Cloudflare R2.
- **Push notifications:** Expo Push.
- **Tenant comms:** WhatsApp Business API (huge in India for ops messaging).
- **Hostel owner panel:** Next.js + same Postgres, role-based.
- **Admin panel:** Same Next.js app, internal role.

### MVP scope (v0 — only ship these)
1. **Tenant:** signup with phone OTP, KYC (Aadhaar), browse partner hostels, subscribe, pay via Razorpay autopay, see meal schedule, raise complaint via WhatsApp deep-link.
2. **Owner:** signup, KYC, see subscribed tenants, see monthly payout statement, mark room available.
3. **Admin:** onboard hostels, manage food partners, override subscriptions, payout reconciliation.

### Out of scope for v0 (kill the temptation)
- Reviews and ratings → v1
- Roommate matching → v2
- Multi-city → Hyderabad-only for v0
- In-app chat → use WhatsApp
- Loyalty / referrals → v1
- Maintenance ticketing → WhatsApp + sheet for v0
- Web app → mobile only

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Can't name 10 customers | Medium | Kills thesis | This week's task; if blocked, that's the answer |
| Food partner won't deal at small scale | Medium | Slows pilot | Start with local tiffin, not CalBurrito |
| Hostel owner won't partner | Medium | Slows pilot | Use existing relationship; offer tenant pipeline + zero capex |
| Unit economics don't work at small scale | High | Forces pivot | Test in days 30-60 before scaling |
| Stanza/Zolo notice and copy "no advance" | Low | High | Their lock-in moat works the other way; speed + hostel exclusives |
| Zomato/Swiggy enter | Very low | High | Build full-stack living ops moat (food alone is not enough) |
| Founder runs out of capital | Medium | Kills it | Asset-light = low burn; bootstrap from food margin |
| Legal: subscription living without lease | Medium | Operational risk | Lawyer on retainer at day 60 |

---

## Distribution

App store launch happens at ~day 90. Pre-launch acquisition:

- **Instagram reels.** Founder said it himself: "I'd download the app when I'm motivated by a reel." Build content that triggers that. Day-in-the-life content from the pilot hostel.
- **WhatsApp organic.** First 30 customers come via founder's network. Each one refers 2.
- **Hostel-front signage.** At partner properties: "Subscribe to [brand] — food + bed + no advance."
- **College campus tabling.** Target: B-schools, engineering colleges in Hyderabad with on-campus housing waitlists.

---

## Brand positioning

Working name: TBD. Suggestion — avoid "OYO-like" naming. The product is a life brand, not an aggregator.

Tagline draft: *"Live anywhere. Eat well. No advance."*

Visual energy: clean, residential, food-forward. Reference: Hello World + EatSure + Sleep Co. Anti-reference: OYO + MagicBricks.

---

## Open questions (must resolve)

1. **First 10 customers** — founder needs to name 3 actual humans this week. Without this, everything is theoretical.
2. **First hostel partner** — does founder know an owner, or does he need to cold-walk into one?
3. **Pricing** — is ₹20k/month right for Hyderabad? Triangulate against current rents (₹8-12k base + ₹6-8k food = ₹14-20k existing spend).
4. **Food partner choice** — local tiffin aggregator (cheaper, easier to sign) or branded chain like CalBurrito (more marketing pop, harder)?
5. **Legal** — subscription living without lease agreements has compliance complexity. Lawyer at day 60.
6. **Co-founder** — does this need a CTO partner, or is solo + AI-assisted dev enough through v0?

---

## What to do next (in order, no shortcuts)

1. **This week:** name 3 real customers. WhatsApp them today. Get yes/no/maybe in writing.
2. **If 2/3 yes:** walk into 1 Gachibowli hostel and propose the partnership.
3. **If hostel says yes:** run the food pilot for 30 days (no app, WhatsApp + Sheet).
4. **At day 30:** come back to `/office-hours` for the next stage review, or `/plan-eng-review` if it's time to architect the app.

**Do not start coding the app yet.** It's the most expensive form of procrastination at this stage.

---

## Decision log (this session)

- **Reframed product** from "OYO for hostels marketplace" to "subscription living brand, food-led, asset-light." Founder agreed via lived-experience evidence.
- **Identified the wedge** as food subscription bundled with one hostel partnership, not full marketplace.
- **Identified real competitors** as Stanza/Zolo/Colive, not Zomato.
- **Flagged "marketplace first, subscription later"** as cope. Hybrid version is acceptable only if marketplace is the funnel, not the business.
- **Corrected McDonald's analogy:** McDonald's owned units before franchising. Operating playbook precedes franchise model.
- **Founder requested "complete the app."** Held the line: design doc only at this stage. Validation is cheaper, faster, smarter than premature implementation.

---

## Eureka candidate (unconfirmed)

> Conventional wisdom for Indian co-living: own properties, build in-house kitchens, scale with capex (Stanza, Zolo, Oxfordcaps).
>
> First-principles inversion: food-led, asset-light, demand-pull supply, third-party food partnerships, no advance, portability.
>
> Conventional approach has produced 1 bankruptcy (Oxfordcaps), 1 unprofitable scale-up (Stanza), and 1 marginally profitable mid-tier (Colive). The inversion is unproven but not obviously wrong. Worth testing at small scale.

Validation pending: pilot in days 8-30.

---

*Generated via `/office-hours` (gstack). Next stage: `/plan-eng-review` for architecture, `/codex review` for second opinion, or re-run `/office-hours` after first 30 days of pilot.*
