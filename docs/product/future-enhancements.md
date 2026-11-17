# Future enhancements (Phase 2 and later)

Started 2026-11-13 at the owner's request: food-app style features (coupons, rewards, referrals) and other ideas worth
considering once v1 is live. **Nothing here is approved or built.** Each idea says why it fits this product, the rough
shape, what it needs first, the risks, and a verdict. Numbers (discounts, points, caps) are left for the owner: CLAUDE.md
forbids inventing prices or commercial terms, and no partner is named.

Several of these were listed as "Out of scope (v1)" in the base spec (`docs/superpowers/specs/2026-10-12-hostels-platform-design.md`
§3): referrals and loyalty, roommate matching, UPI autopay, push notifications, delivery integration, multiple languages,
Aadhaar KYC, in-app chat. They are picked up here.

**Verdicts:** **Phase 2** (fits now, high value) · **Later** (needs scale, money or a partner first) · **Maybe** (try small,
measure) · **No** (doesn't fit, or a legal or trust risk).

---

## 0. Foundations Phase 2 needs first

Most money ideas below change what a bill holds. Today a tenant bill is fixed columns: rent, food, skip credit, total
(`invoices` in `apps/api/src/db/schema.ts`). Before coupons, rewards, referrals or add-ons:

| Foundation | Why | Size |
|---|---|---|
| **Bill line items** (`invoice_lines`: kind, label, amount, source id) with the current columns kept as a summary | Discounts, referral credit, add-on meals and wallet use each need their own line, shown on the bill and in exports | M |
| **Who funds a discount** (`platform` or `owner`) on every line | Payouts are gross minus our fee (`services/money.ts`, `computePayout`); a platform-funded coupon must not cut the owner's payout, an owner-funded one must | S, with the above |
| **A wallet / credit ledger** (append-only, per person, never edited) | Rewards, referral credit, skip credit choices and refunds-as-credit all need one place; balances come from summing it | M |
| **Push notifications** (Expo push, free) | Rewards, offers and the 1b signals are worth more when they reach the phone; v1 has in-app signals only | S–M |
| **Feature flags per city and per hostel** | Try ideas in one area or with a few partners first | S |

Rules carried over from v1: only `razorpay_live` money counts (`REAL_MONEY_MODES`); whole rupees; every state change is a
conditional update; nothing is charged twice; the API, website and app use the same shared rules (`packages/shared`).

---

## 1. Food (on a par with food apps)

The food side is our edge over listing sites: one bill for bed and food, skips with credit, a weekly menu, a kitchen
headcount. Food apps set residents' expectations for choice, feedback and offers.

| Idea | Shape | Needs | Risks | Verdict |
|---|---|---|---|---|
| **Add-on orders** (extra roti, egg, curd, snacks, tea) from the hostel kitchen | Owner lists add-ons with prices and cut-offs like skips; resident orders in the app; charged as a line on the next bill or paid now | Line items (§0); kitchen view of orders next to the headcount | Owner workload; unpaid add-ons if a plan ends (charge now when the plan ends before the next bill) | **Phase 2** |
| **Guest meals** | Book a meal for a visitor, paid at once; shows in the headcount | Add-ons | Gate and visitor rules differ per hostel (owner switch) | **Phase 2** |
| **Rate today's meal** (one tap per meal, optional comment) | Dish ratings feed a monthly food score on the hostel page and a "what to change" list for the owner | Nothing new (menus exist) | Brigading: only residents eating that day, one rating per meal | **Phase 2** |
| **Menu poll** | Owner offers 2–3 options for a day; residents vote; the winner goes on the menu | Menus | Low | **Maybe** |
| **More diets**: Jain, eggetarian, no onion and garlic, allergies | Diet becomes a tag set, not veg/non-veg; the headcount splits by tag | Change to `diet` (migration) and headcount | The kitchen must actually serve them: owner chooses which tags they support | **Phase 2** |
| **Packed meal instead of a skip** ("pack my lunch") | On days out (exams, office), choose a packed meal instead of skipping; the kitchen sees a packing count | Headcount split | None beyond the kitchen saying yes | **Phase 2** |
| **Late plate** | Keep dinner aside for late arrival; kitchen sees names and count | Headcount | Low | **Maybe** |
| **Partner kitchens and delivery** (food partners exist in admin today) | Menus already credit a food partner per item; later, order from partner kitchens with delivery to the hostel | Partner agreements (owner); delivery integration | Partners, pricing, food safety liability: owner decisions | **Later** |
| **Skip credit choices**: credit on the bill (today), into the wallet, or **donate the meal** (the kitchen cooks less; the saving goes to a food charity the owner picks) | Choose once in settings | Wallet (§0); a charity partner | Proving donations happened; charity selection is the owner's call | **Maybe** (a strong story, see §8) |
| **Kitchen hygiene and licence on the hostel page** (FSSAI registration number, last hygiene check photo) | Part of the partner checklist and listing | Partner checklist exists | Verifying the number (manual at first) | **Phase 2** |

---

## 2. Coupons and offers

| Idea | Shape | Needs | Risks | Verdict |
|---|---|---|---|---|
| **Coupon codes** (first month, area launches, campus drives) | `coupons` (code, who funds it, percent or amount, cap, valid dates, total and per-person limits, which hostels or areas) and `coupon_redemptions`; applied at subscribe or on a bill as a line | Line items, funding source (§0) | Stacking (one coupon per bill), abuse (per verified phone; per device later), refunds of discounted bills (refund what was paid) | **Phase 2** |
| **Owner-run offers** to fill empty beds ("₹X off the first month", "food free for the first week") | Owner creates an offer on a room type, funded by the owner; shows on search and the hostel page with an end date | Coupons | Fake "was/now" prices: show only what the owner actually takes off | **Phase 2** |
| **Long-stay prepay** (pay 3 or 6 months ahead for a discount) | Several period bills paid at once with a discount line; cancelling refunds unused months at the undiscounted price, as stated up front | Line items; refund rules (owner) | Refund disputes; locking residents in (keep the cancel-anytime promise) | **Maybe** |
| **Group move-in** (friends taking beds together) | A booking for 2–4 people at one hostel with a group discount, each paying their own bill | Coupons | Partial groups (one drops out) | **Later** |
| **Campus and company codes** | A code for an institution, valid in nearby areas | Coupons; an institution relationship (owner) | Commercial terms are the owner's | **Later** |
| **Last-minute bed deals** (a bed free for weeks) | Owner opt-in, automatic suggestion when a bed sits empty | Occupancy history (exists in insights) | Cheapening the brand: owner sets a floor | **Maybe** |

---

## 3. Rewards and loyalty

Reward what makes hostels run better, never what bends the trust signals (ratings, issue counts).

| Idea | What earns it | Verdict |
|---|---|---|
| **On-time payment streaks** | Each bill paid before its due date; a small credit or a badge at milestones | **Phase 2** |
| **Early skips** (the kitchen's favourite) | Marking a skip a day or more ahead, which helps the headcount and cuts waste | **Phase 2** (cheap, aligned, see §8) |
| **Tenure badges** ("1 year at …") | Shown on the resident's reviews and neighbour card: makes reviews more trustworthy | **Phase 2** (no money involved) |
| **Writing a review** | Credit for writing one, **whatever the rating**, disclosed on the review; never for editing a rating upward | **Maybe**: check Indian rules on incentivised online reviews (BIS IS 19000:2022) before launch |
| **Reporting issues** | No points: it would reward made-up issues and distort the public issue record | **No** |
| **Redeeming** | Points or credit go to the wallet, then to add-ons or a bill line; they expire after a stated time | **Phase 2**, with the wallet |

Rewards are owner-decided in amount; the ledger keeps every grant and use so the export (1c) and support can explain a
balance.

---

## 4. Referrals

| Idea | Shape | Fraud guard | Verdict |
|---|---|---|---|
| **Resident refers a friend** | Share link or code; both get credit once the friend's **first monthly bill after the first** is paid with real money (`razorpay_live`) | Verified phones; not the same person (phone, later device); cap per referrer per month; credit only after the qualifying payment; reversed if that bill is refunded | **Phase 2** |
| **Owner refers an owner** | The referring owner gets plan credit when the new hostel becomes a paying Pro or Partner | Same hostel can't be listed twice (address and pin check, admin review) | **Phase 2** |
| **Seeker shares a hostel** | A share link that remembers who shared it; if the friend subscribes, the sharer can be credited | Attribution window; one credit per new subscriber | **Maybe** |
| **Leaderboards** | Top referrers per campus | Privacy: first names only, opt-in | **No** for now |

---

## 5. Money and payments

| Idea | Shape | Verdict |
|---|---|---|
| **UPI AutoPay** (recurring mandate through Razorpay) | Bills pay themselves on the due date; fewer overdue plans | **Phase 2** (needs Razorpay live first) |
| **Parent or guardian pays** | A pay link for a bill that works without logging in; optionally a read-only guardian view of bills | **Phase 2** |
| **Rent receipts** (PDF per paid bill, for income tax HRA claims) | From paid bills; owner details on the receipt need the owner's PAN for large rents: owner adds it | **Phase 2** |
| **Proof of residence letter** | A letter from the verified stay (dates, address) for banks, jobs or SIM cards | **Maybe**: needs a signed format the owner agrees to |
| **Split a shared room's extras** (electricity sub-meter, Wi-Fi upgrade) | Owner adds a shared charge; split per bed onto bills | **Later** |
| **Wallet top-up** | Pay into the wallet for add-ons | **Later** (RBI rules on stored value: keep it as non-withdrawable credit only, or avoid) |

---

## 6. Community and daily life

| Idea | Shape | Verdict |
|---|---|---|
| **Roommate matching** (v1 out of scope) | Preferences (sleep time, food, language, smoking, study or work); suggestions within a hostel or for group move-ins | **Phase 2** for partners with shared rooms |
| **Services marketplace**: laundry, room cleaning, ironing, bike rental | Owner or local partner lists services; booked and charged like add-ons | **Later** |
| **Buy and sell board** (mattress, cooler, books when moving out) | A post kind on the existing board, with photos | **Maybe** (cheap: a new post kind) |
| **Visitor passes and gate log** | Resident pre-registers a visitor; staff see the list | **Maybe** (owner demand varies) |
| **Safety check-in** for women's hostels: night attendance, SOS that alerts the warden and a guardian | Opt-in; owner staff app | **Later** (needs staff accounts, push) |
| **Lost and found, events, quiet hours** | Post kinds and pinned notices on the board | **Maybe** |
| **In-app chat** with the hostel (v1 out of scope) | Issues and the board cover most needs; chat adds moderation load | **Later** |

---

## 7. Owners and partners

| Idea | Shape | Verdict |
|---|---|---|
| **Staff accounts** (manager, cook, warden) with limited roles | Cooks see the headcount and add-ons; managers handle issues and rent | **Phase 2** |
| **Kitchen planning from the headcount** | Next week's expected eaters from plans, skips and history; a grocery estimate per meal | **Phase 2** (uses data we already have) |
| **Food waste tracker** | Cooked vs eaten (owner enters leftovers); pairs with early-skip rewards | **Maybe** |
| **Pricing suggestions** | Compare rent with similar rooms nearby and occupancy; suggest, never set | **Later** (needs enough listings) |
| **Tenant police verification** (required by many city police departments) | Generate the city's form from the stay details; owner submits it | **Phase 2**: check each city's form first |
| **WhatsApp messages** (bill due, issue updates) | Business API messages cost money per message | **Later** (budget rule: no paid services without approval) |
| **Multi-hostel dashboard** | Owners with several hostels see them side by side | **Phase 2** (small) |

---

## 8. Ideas that only this platform can do (creative)

1. **"Eat less waste" loop.** Early skips earn a small reward → the kitchen cooks to a better headcount → the owner wastes
   less → optionally the saved meal is donated (§1). One feature that helps the resident, the owner and the brand story.
2. **Trust score on hostel pages,** built only from facts we already hold: issue response and fix times (exists), verified
   tenure of reviewers, food rating consistency, how long beds stay free, partner checklist. Explain every part; never sell
   placement inside it.
3. **"Move with us."** Residents moving city (jobs, internships) get a held bed at a partner hostel in the new city on the
   same plan, with their reviews and payment history carried over: the move feature (v1) across cities.
4. **Verified stay passport.** A resident's verified stays, on-time payments and tenure as a shareable profile that the
   next hostel can trust (with consent), so good residents get faster approval and maybe better offers.
5. **Exam and festival modes.** Hostels near colleges switch on quiet hours, early breakfast and packed meals for exam
   weeks; festivals bring special menus and offers. Mostly configuration of features above.
6. **Neighbourhood guide from residents.** Residents rate nearby essentials (mess, gym, clinic, bus stop) on area pages:
   useful content for seekers and SEO.
7. **Seeker alerts.** "Tell me when a bed under ₹X with food opens in Madhapur": saved searches with alerts (push or
   email), from the bed counts we already keep fresh.
8. **Virtual tour and video walkthrough** in the listing, recorded by the owner on the app; the partner checklist can
   require one.

---

## 9. Platform

| Idea | Verdict |
|---|---|
| **Telugu and Hindi** (v1 out of scope), starting with the resident app and bills | **Phase 2** |
| **iOS app** (same Expo code) | **Phase 2**, needs an Apple developer account (paid: owner approval) |
| **More cities** (Bengaluru, Pune, Chennai) | **Later**: area data, local rules (police verification forms) |
| **Offline-first menus and bills in the app** | **Maybe** |
| **Aadhaar-based KYC** (v1 out of scope) | **Later**: legal review and a licensed provider needed; until then, phone verification plus owner checks |

---

## Suggested Phase 2 order

1. Foundations: bill line items with funding source, credit ledger (wallet), push notifications (§0).
2. Food: add-ons and guest meals, meal ratings, diet tags, packed meals, FSSAI on listings (§1).
3. Referrals (resident and owner) and coupon codes, with fraud guards (§2, §4).
4. Rewards that help operations: on-time streaks, early skips, tenure badges (§3, §8.1).
5. Money: UPI AutoPay, guardian pay links, rent receipts (§5).
6. Owners: staff accounts, kitchen planning, police verification forms (§7).
7. Telugu and Hindi; iOS.

## Questions for the owner before Phase 2 starts

- Who funds launch coupons and referral credit: the platform, the owner, or split? (Changes payouts.)
- The amounts: referral credit, reward points and their value, coupon caps, expiry.
- Whether review credit is wanted at all, given the trust promise on reviews.
- Which charity, if meal donation is wanted.
- Whether paid services are allowed for Phase 2 (WhatsApp messages, Apple developer account, KYC provider).
