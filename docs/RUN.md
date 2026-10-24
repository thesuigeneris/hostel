# Run guide

Everything runs on one laptop: Postgres in Docker, the API on port 4000, the website on 3000, and the app in Expo Go. Payments and OTP texts are simulated until you add keys.

## 1. One-time setup

```bash
bun install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
bun run db:up        # Postgres 16 with the hostels and hostels_test databases
bun run db:reset     # migrate and load the Hyderabad demo data
```

## 2. Start it

In three terminals:

```bash
bun run dev:api      # http://localhost:4000  (GET / shows database and stub status)
bun run dev:web      # http://localhost:3000
bun run dev:mobile   # scan the QR code with Expo Go (SDK 58)
```

On a phone, the app must reach your laptop. Use its LAN address:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.10:4000 EXPO_PUBLIC_WEB_URL=http://192.168.1.10:3000 bun run dev:mobile
```

and add `http://192.168.1.10:8081` to `CORS_ORIGINS` in `apps/api/.env` if you also use the app's web preview.

## 3. Try each persona

All logins use OTP `123456` in dev mode.

| Who | Phone | Where | Try this |
|---|---|---|---|
| Seeker | any new number | website `/hostels`, or the app's Explore tab | Filter by area, budget and "Verified, no advance"; open a hostel; read verified reviews and the issue record; request a visit or subscribe and pay (simulated) |
| Resident | `9000000003` | website `/account` and `/stay`, or the app's My Stay tab | Skip a meal, see bills, report an issue, post on the community board, write a review |
| Owner | `9000000002` | website `/owner` | Edit a listing, upload photos, update free beds, add a resident, record rent, answer an issue, reply to a review, edit the menu, see the kitchen headcount, change plan |
| New owner | any new number, tick "I own or run a hostel" | website `/for-owners` | List a hostel from scratch, submit it, then apply for Partner once it is live |
| Admin | `9000000001` | website `/admin` | Approve listings, verify partners, set fees, generate payouts, moderate flagged reviews, run the background jobs |

## 4. Checks

```bash
bun run typecheck
bun run lint
bun run test                     # API tests use the hostels_test database
bun --filter @hostels/web e2e    # Playwright golden path against the dev database
```

The golden path starts the API and website if they are not running. It needs Chromium: run `bunx playwright install chromium` once. It creates a new owner, hostel and tenant on every run, so it can be repeated without a reset.

## 5. Going live

Before real users, set these in `apps/api/.env` (the API refuses stub OTP and stub payments when `NODE_ENV=production`):

- `MSG91_AUTH_KEY` and `MSG91_TEMPLATE_ID` for OTP texts
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET`, with the webhook pointed at `https://<api-host>/webhooks/razorpay`
- `OTP_PEPPER` to a long random value, `ADMIN_PHONES` to your team's numbers
- `API_PUBLIC_URL`, `WEB_URL` and `CORS_ORIGINS` to the real hostnames, all on HTTPS

See [security-review.md](security-review.md) for what was checked and what is still open.
