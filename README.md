# Hostels

Subscription living for hostels and PGs in India. Food + bed bundled. No advance. Portable between properties.

This is **v0**, the foundation scaffold from `/office-hours`. Read [DESIGN.md](./DESIGN.md) for the product thesis, 90-day plan, and architecture decisions.

## Status: scaffolded, runs locally, lots stubbed

What works:
- Backend API with `/hostels`, `/auth/otp`, `/auth/verify`, `/me`, `/me/subscription`, `/subscribe`, `/subscriptions/:id/cancel`
- Mobile app (iOS + Android via Expo) with phone OTP login, hostel browse, hostel detail, subscribe flow with meal-plan picker, my plan with cancel, profile editing
- 5 seeded hostels in Hyderabad (Gachibowli, Madhapur, Kondapur, HiTech City, Financial District)
- Token-based auth (stored via AsyncStorage on device)

What's stubbed (intentionally — see DESIGN.md):
- Real OTP delivery (MSG91 / Twilio). Dev OTP is always `123456` and is logged + shown on screen.
- Real Razorpay subscription billing with autopay mandate.
- Postgres persistence — using an in-memory store. **Data resets when the API restarts.**
- KYC / Aadhaar verification.
- Image upload (using Unsplash placeholder URLs).
- Maps / location pins.
- Hostel owner panel (Next.js — next iteration).
- Admin panel.
- WhatsApp Business API tenant comms.
- Push notifications.

## Prerequisites

- [Bun](https://bun.sh) 1.3+
- For Android dev: Android Studio + emulator OR a physical Android phone with [Expo Go](https://expo.dev/go)
- For iOS dev: macOS + Xcode (does not work on Windows directly — use Expo Go on a physical iPhone instead)

## Setup

```bash
bun install
```

## Run

Two terminals.

```bash
# Terminal 1 — API
bun run dev:api
# → http://localhost:4000
```

```bash
# Terminal 2 — Mobile
bun run dev:mobile
# → opens Expo CLI; press 'a' for Android emulator, or scan QR with Expo Go on your phone
```

If running the mobile app on a physical device on the same WiFi as your laptop, the device needs to reach the API. Set the API URL via env var:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.10:4000 bun run dev:mobile
```

Replace `192.168.1.10` with your laptop's LAN IP (Windows: `ipconfig` → IPv4 Address).

## Test the flow

1. Start API and mobile.
2. On the welcome screen, enter any 10-digit number, hit Send OTP.
3. The dev OTP `123456` is shown on-screen (also logged by the API in terminal 1).
4. Verify → land on Browse with 5 hostels.
5. Tap a hostel → see detail → Subscribe → pick meal plan → Pay (mocked, ~1s delay) → land on My Plan.
6. Profile tab → set your name → Save.
7. My Plan → Cancel subscription → goes back to "no active plan."
8. API restart wipes everything (in-memory store). That's expected for v0.

## Project structure

```
hostels/
├── apps/
│   ├── api/                Bun + Hono backend (in-memory v0)
│   │   └── src/
│   │       ├── index.ts    Routes
│   │       └── data.ts     Seed data + in-memory stores
│   └── mobile/             Expo + React Native (iOS + Android)
│       └── app/            Expo Router file-based routes
│           ├── _layout.tsx
│           ├── index.tsx   Welcome / phone OTP
│           ├── (tabs)/     Tabs: Browse, My Plan, Profile
│           ├── hostel/[id].tsx
│           └── subscribe.tsx
├── packages/
│   └── shared/             Shared TypeScript types
├── DESIGN.md               Product thesis, 90-day plan, decisions
└── README.md
```

## Next steps (in order)

Per [DESIGN.md](./DESIGN.md), this code is the v0 shape. The next thing to do is **not more code**. It is:

1. **This week** — name 3 customers in Gachibowli. WhatsApp them the food-subscription pitch. If 0 say yes, the thesis is wrong and you saved 6 months.
2. **Days 8-30** — run the food pilot at one hostel. WhatsApp + Google Sheet. No app yet.
3. **Days 30-60** — validate unit economics.
4. **Days 60-90** — iterate this v0 toward production:
   - Wire real Razorpay subscription billing with autopay mandate
   - Wire real OTP via MSG91
   - Replace in-memory store with Postgres + Drizzle
   - Build the hostel owner panel (Next.js)
   - Add KYC flow
   - Add image upload to Cloudflare R2
   - Add WhatsApp Business API tenant comms
   - Add maps + location pins
   - Add push notifications

This v0 is the shape. Ship the validation first.
