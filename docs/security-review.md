# Security review (Phase 5)

A pass over the API, website and app before the first real users. Each item lists what protects it and where.

## Checked and in place

- **Login.** OTPs are stored as HMACs with a server pepper, expire in 5 minutes, allow 5 wrong tries, and at most 5 texts per phone per hour. Sessions are random tokens stored as SHA-256 hashes and last 30 days. Nobody can make themselves admin; only phones in `ADMIN_PHONES` are admins, and removing a phone takes admin away from its next request, including live sessions. Stub OTP is refused in production. (`apps/api/src/services/auth.ts`)
- **Who can do what.** Every non-public route has a role guard. Owner actions load the hostel, room, residency, review or visit through its owner, so one owner can't touch another's data. Residents can only see issues, posts and the neighbour list of a hostel they live in. Covered by the API tests. (`apps/api/src/services/access.ts`)
- **Payments.** Razorpay payment and webhook signatures are checked in constant time after a length check. Marking a bill paid is idempotent, so a webhook and the checkout callback can both arrive safely. Simulated payments are refused in production. (`apps/api/src/services/payments.ts`)
- **Uploads.** At most 5 MB. The file type comes from the file's first bytes, not its name or declared type, and only JPEG, PNG and WebP are kept. Files are served with the type of their stored extension and `nosniff`. (`apps/api/src/routes/uploads.ts`)
- **Website session.** The token lives in an httpOnly, SameSite=Lax cookie (Secure in production) and never reaches browser JavaScript. Forms are Next.js server actions, which check the request origin. Return paths are checked so they can't redirect to another site. (`apps/web/lib/api.ts`, `apps/web/lib/actions.ts`)
- **App to website sign-in.** The code the app uses to open the payment page is random, stored hashed, single use, and expires after 2 minutes; redeeming it is one atomic update. (`apps/api/src/services/auth.ts`)
- **Input.** Every request body and query is validated with the shared zod schemas.

## Fixed in this phase

- Photo links (listing photos, issue and post photos, food partner logos) now accept only `http` and `https` URLs, so a `javascript:` or `data:` link can't be stored.
- The website sends a Content Security Policy: scripts only from itself and Razorpay Checkout, frames only from Razorpay, no plugins, no framing of the site.
- The API sends standard security headers (`hono/secure-headers`), with cross-origin loading allowed only so photos can show on the website and in the app.
- Return paths (`next` on login and the app hand-off, and every form's `_back`) are parsed as URLs, so `/\evil.example` or a tab after the slash can no longer send someone to another site.
- Public reviews now say how the reviewer's stay was confirmed: "Verified stay · paid through Hostels" for subscribers, "Resident · added by the hostel" for people an owner added. An owner can't quietly add friends to boost ratings without readers seeing it.

## Still open before production

- **General rate limiting.** Only OTP sending is rate-limited. Put the API behind a proxy or add a limiter for login, search, issue and post creation.
- **Inline scripts in the CSP.** Next.js needs `'unsafe-inline'` for scripts without nonces. Moving to nonce-based CSP via middleware would tighten it.
- **Photo storage.** Uploads sit on the API's local disk. Move them to object storage (R2 or S3) before running more than one API instance.
- **Owner-added residents.** They are labelled on reviews, but an owner could still add people who never lived there. An owner can also backdate a resident's start date, which makes them eligible to review at once. Consider requiring a few months of rent records, or an admin spot-check, before their reviews count in the rating.
- **Secrets and HTTPS.** Real MSG91 and Razorpay keys, a long `OTP_PEPPER`, HTTPS everywhere, and database backups. See the run guide.
