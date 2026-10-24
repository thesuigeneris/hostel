name: "PRP-01: Auth modes, demo isolation and zero-cost secure login"
status: done (see LEDGER.md; mobile runtime unverified)
confidence: 8/10. The API rules are fully specified and testable. Web and mobile login UI adds risk to the existing browser-test sign-in, which is mitigated by keeping the OTP form's labels unchanged.

## Goal
1. Real users can sign up and log in **without paid SMS**: phone + password, hashed with argon2id, throttled per phone.
2. **Demo accounts are isolated from real users:**
   - Demo accounts are flagged.
   - A production "standard" instance never lets a demo account in.
   - A "demo" instance lets **only** demo accounts in: no sign-ups, no SMS, no live payments.
   - The fixed dev code can't reach production.
3. **Phone ownership is verified before it grants anything.** Invites link, and `ADMIN_PHONES` promotes, only for phones verified by OTP. A server-side script grants admin when SMS isn't available.
4. `db:reset` can no longer wipe a production database.

## Non-goals
- **Live MSG91 delivery:** still optional, and blocked on credentials and cost.
- **Passkeys/WebAuthn and email login:** possible later. Passkeys need HTTPS plus native modules for Expo; email needs a provider account.
- **Password reset by SMS or email:** there's no free delivery channel. An admin-assisted reset path is defined here (the script); a self-service reset waits for SMS or email approval.
- **General API rate limiting** (search, posts and so on): PRP-11. This PRP throttles password login only.
- **Invite links that don't need phone ownership:** PRP-02.

## Why
- Production without MSG91 returns 503 on `/auth/otp` (`apps/api/src/services/auth.ts` `requestOtp`), so the product **cannot be used at ₹0**. (Map M1.)
- Outside production, any phone gets code `123456` (`apps/api/src/lib/msg91.ts`). `apps/api/.env.example` sets `ADMIN_PHONES=9000000001`, which is also the demo admin's phone. A public demo or a misconfigured server would mix demo and real users, or hand out admin. (Map M2.)
- The moment any login method doesn't prove phone ownership, `linkInvitedResidencies` (`apps/api/src/services/residents.ts:23`) lets anyone claim another person's hostel invites. (Map M3.)
- Spec: base §6 "Auth (all roles). Phone → OTP → session token … admin is granted only to phones in `ADMIN_PHONES`". This PRP keeps that, and adds a password method that is allowed to work at ₹0.

## What (behaviour)
| Instance | Config | OTP | Password | Demo login | Sign-up |
|---|---|---|---|---|---|
| Local dev / tests | `NODE_ENV` ≠ production, `APP_MODE=standard` | stub (`123456`, any phone) | yes | yes (demo accounts only) | yes |
| Production, real users | `NODE_ENV=production`, `APP_MODE=standard` | live if MSG91 keys, else off | yes | **never** | yes |
| Public demo | `APP_MODE=demo` (any `NODE_ENV`) | **off** | **off** | yes (demo accounts only) | **no** |

- **Demo accounts:**
  - Demo accounts are `users.is_demo = true`, set by the seed for every seeded person.
  - In a production standard instance they are rejected by every login method, with the same generic error as a wrong password.
  - In demo mode, payments are always simulated: Razorpay keys are ignored, and simulation is allowed even under `NODE_ENV=production`.
- **Phone verification:**
  - `users.phone_verified_at` is set when an OTP verifies (live or stub).
  - A password sign-up leaves it null.
  - Invites and `ADMIN_PHONES` apply only once it is set.
- **Passwords:**
  - Length: 15–128 characters. No composition rules. Common passwords and passwords containing the phone number are rejected.
  - Hashing: argon2id (`Bun.password` defaults).
- **Throttling:** after 5 wrong password attempts for a phone, that phone is locked for 15 minutes. This applies whether or not the phone has an account, so lockouts reveal nothing.
- **Signed-in users** can set a password (first time) or change it (needs the current one). Changing it signs out every other session.
- **Admin script:** `bun run admin:grant <phone>` (server shell) makes an existing account admin. It is the admin bootstrap when SMS is off.

### Success criteria
- [ ] Register, then log in with a password, with no MSG91 keys and `NODE_ENV=production` → `auth-modes.test.ts › password sign-up and login work in production without SMS`
- [ ] Wrong password, unknown phone and demo account (in production) all return the identical status and body → `› login errors are generic`
- [ ] 6th attempt locked for a known and an unknown phone; unlocks after 15 min; success resets → `› throttles per phone`
- [ ] Weak, common and phone-containing passwords rejected; 15+ chars accepted; >128 rejected → `› password policy`
- [ ] Demo login works only for `is_demo` accounts, only when enabled; never in production standard → `› demo login isolation`
- [ ] Demo mode: OTP, password and register refused; simulated payment allowed under production → `› demo mode instance`
- [ ] An unverified password account with an invited phone doesn't see or link the invite; after OTP verification it does → `› invites need a verified phone`
- [ ] `ADMIN_PHONES` doesn't promote an unverified account; `grantAdmin()` does → `› admin needs verified phone or the server script`
- [ ] Password change requires the current password and revokes other sessions → `› password change`
- [ ] A handoff code or an existing session for a demo user stops working under production standard → `› isolation applies to every session path`
- [ ] `db:reset` refuses under `NODE_ENV=production` unless `APP_MODE=demo` → `› seed reset guard`
- [ ] Web: password sign-up/log-in and demo buttons work in the browser → `e2e/auth.spec.ts`
- [ ] Existing 85 API tests and 7 browser tests still pass.

## All needed context

### Documentation and references
```yaml
- doc: Bun.password (mirror read from github.com/oven-sh/bun docs/runtime/hashing.mdx @179664e; bun.sh is blocked in the sandbox)
  critical: default argon2id; example hash shows m=65536,t=2,p=1; Bun.password.hash/verify are async; verify detects the algorithm from the hash.
- doc: OWASP Password Storage Cheat Sheet (mirror read from github.com/OWASP/CheatSheetSeries cheatsheets/Password_Storage_Cheat_Sheet.md @e75f6f3)
  critical: "Use Argon2id with a minimum configuration of 19 MiB of memory, an iteration count of 2, and 1 degree of parallelism." Bun's default (64 MiB, t=2) exceeds it.
- doc: OWASP Authentication Cheat Sheet (same mirror, Authentication_Cheat_Sheet.md)
  critical:
    - "If MFA is not enabled passwords shorter than 15 characters are considered to be weak (NIST SP800-63B)"
    - "Maximum password length should be at least 64 characters"; "Do not silently truncate"
    - "There should be no password composition rules"; "Block common and previously breached passwords"
    - generic error messages regardless of whether the user id or password was wrong; same HTTP status
    - "The counter of failed logins should be associated with the account itself, rather than the source IP address"
- file: apps/api/src/services/auth.ts
  why: OTP send window uses one atomic upsert with setWhere; mirror that for the throttle table. createSession/getSessionUser are reused.
- file: apps/api/src/lib/env.ts
  why: lazy env getters, so tests can flip NODE_ENV/APP_MODE per test.
- file: apps/api/src/services/residents.ts:23 (linkInvitedResidencies) and :33 (myResidencies calls it)
- file: apps/api/src/services/payments.ts:122 simulatePayment, lib/razorpay.ts isRazorpayConfigured
- file: apps/api/src/db/seed.ts:401 (reset path, no production guard today)
- file: apps/web/app/login/{page,actions}.tsx, apps/web/app/account/actions.ts, apps/mobile/app/login.tsx, apps/mobile/app/(tabs)/profile.tsx
- file: apps/web/e2e/helpers.ts signIn(): uses labels 'I own or run a hostel', 'Send code', 'Verify and continue'. Keep those on the OTP form.
```

### Existing implementation (verified this session)
- OTP: hashed with a pepper, 5 attempts, 5 sends per hour, single-use; tested in `test/auth.test.ts` (19 tests).
- Sessions: SHA-256 token hash, 30-day expiry. Handoff codes: single use, 2-minute expiry.

### Known gotchas
- `env.isProduction` reads `NODE_ENV` lazily. Tests that set `process.env.NODE_ENV='production'` must restore it in `finally`.
- `Bun.password.hash` costs about 64 MiB per call. Check the length (≤128) **before** hashing, and keep test counts modest.
- Unknown-phone logins must still run one `Bun.password.verify` against a fixed dummy hash, so the response time doesn't reveal which phones exist.
- Drizzle wraps Postgres errors (`isUniqueViolation` walks `.cause`).
- The seed inserts users directly, so it must set `isDemo: true` and `phoneVerifiedAt` itself.

## Database and migrations
Migration `0004_auth_modes.sql`, additive only:
- `users.is_demo boolean not null default false`
- `users.phone_verified_at timestamptz null`. Backfill: `update users set phone_verified_at = created_at`, because every existing account was created by a successful OTP verify (the only method before this PRP).
- `users.password_hash text null`
- New table `login_throttle (phone text pk, failures int not null default 0, window_start timestamptz not null, locked_until timestamptz null)`.

To reverse: drop the three columns and the table. No other table changes.

## Domain rules and state transitions
- **Throttle** (per phone):
  - A failed login increments `failures`; the window resets 15 minutes after `window_start`.
  - On the 5th failure in the window, `locked_until = now + 15 min`.
  - While locked, every attempt (correct or not) gets `429 login_locked`, and the lock is not extended.
  - Success deletes the row.
- **Phone verification:** OTP verify sets `phone_verified_at` (if null). Nothing clears it.
- **Role resolution:**
  - Becoming admin through `ADMIN_PHONES` requires `phone_verified_at` (OTP).
  - `grantAdmin(phone)` (script) works regardless of verification.
  - Roles are never downgraded by login.
- **Demo isolation invariants**, enforced in **one** function, `assertLoginAllowed(user)`:
  - It is called by `createSession`, which every login path (OTP, password, demo, app-to-web handoff) goes through.
  - It is also called by `getSessionUser`, so sessions issued before a mode change stop working.
  - No session is ever created or accepted for an `is_demo` user when `NODE_ENV=production && APP_MODE=standard`.
  - No session is ever created or accepted for a non-demo user when `APP_MODE=demo`.
  - The demo instance never sends SMS and never calls Razorpay.

## API contract
| Method and path | Body | 2xx | Errors |
|---|---|---|---|
| `GET /auth/methods` | none | `{ mode: 'standard'\|'demo', otp: 'live'\|'stub'\|'off', password: boolean, signup: boolean, demo: { enabled: boolean, accounts: { phone, name, role }[] } }` | none |
| `POST /auth/register` | `{ phone, password, name, role? }` | 201 `AuthSession` | 400 `validation` (password policy, with field issues); 409 `signup_failed` (generic, phone taken); 403 `method_disabled` |
| `POST /auth/login` | `{ phone, password }` | 200 `AuthSession` | 401 `invalid_credentials` (generic); 429 `login_locked`; 403 `method_disabled` |
| `POST /auth/demo` | `{ phone }` | 200 `AuthSession` | 403 `method_disabled`; 401 `invalid_credentials` for a non-demo or unknown phone |
| `POST /me/password` | `{ currentPassword?, newPassword }` | 200 `{ ok: true }` | 400 `validation`; 401 `invalid_credentials` (wrong current password); 403 `method_disabled` (demo mode) |
| `POST /auth/otp`, `POST /auth/verify` | unchanged | unchanged | plus 403 `method_disabled` in demo mode; plus 401 `invalid_credentials` for a demo user in production standard (on verify) |

`User` (shared type) gains `phoneVerified: boolean`, `hasPassword: boolean` and `isDemo: boolean`. It never includes the hash.

## Authorization
- `/auth/*` is public.
- `/me/password` requires a session; it acts only on the caller's own account.
- `admin:grant` is a server-side script with no HTTP route.

## UI (web) and mobile behaviour
- **Web `/login`:** server-rendered, reading `GET /auth/methods`.
  - **Password section** (always, unless demo mode): "Log in" form (Mobile number, Password) and a "Create an account" link to `/login?view=signup` (Name, Mobile number, Password, "I own or run a hostel").
  - **OTP section** (when `otp` ≠ off): "Text me a code instead" link to `/login?view=otp`. The existing OTP form keeps its labels and buttons ("Send code", "One-time code", "Verify and continue").
  - **Default view:** `view=otp` when OTP is live or stub (this keeps the existing browser-test helper working), otherwise the password view.
  - **Demo section** (when `demo.enabled`): "Try a demo account" buttons, one per seeded role.
  - **Demo mode:** demo buttons only, plus the text "This is a demo. Data resets."
- **Web `/account`:** a "Password" card (set or change); shows "Phone not verified" when `phoneVerified` is false.
- **Mobile `login.tsx`:** the same three methods from `GET /auth/methods`: password log-in and sign-up, code, demo buttons.
- **Password fields** use `autoComplete="current-password"` (log-in) or `"new-password"` (sign-up and change), so password managers and assistive tech work. The minimum length is stated next to the field.
- **Mobile `profile.tsx`:** shows phone-verified status. Mobile password change is **not** in this PRP; the website handles it, and this is recorded in the ledger.

### States
| Screen | Loading | Empty | Error | Success | No permission |
|---|---|---|---|---|---|
| Web /login | server-rendered (none) | n/a | Flash with the API message; field issues inline | redirect to role home or `next` | demo mode hides forms; disabled methods are hidden |
| Web /account password card | submit button pending text | "No password yet: set one to log in without a code" | Flash error | Flash "Password saved. Other devices were signed out." | redirects to /login if signed out |
| Mobile login | button busy | n/a | ErrorText | `signIn` then navigate | hidden methods |

## Edge cases
- A phone with spaces or a +91 prefix: normalised by `phoneSchema`.
- A password of exactly 15 or exactly 128 characters is accepted; 129 is rejected before hashing.
- Unicode and spaces are allowed; the password isn't trimmed.
- Register while signed in: allowed. It creates a new account; the web replaces the cookie.
- An OTP user setting a first password: no current password needed. If one already exists, it's required.
- The lock expires exactly at `locked_until` (the clock is pinned in tests).
- Demo login for a seeded demo user whose role is admin works only in dev or demo mode.

## Concurrency, retries and idempotency
- **Throttle:** one atomic upsert per failure (`ON CONFLICT … DO UPDATE … RETURNING`), so parallel wrong guesses can't exceed 5 un-locked attempts.
- **Register:** a race on the same phone is resolved by the `users.phone` unique constraint, and the loser gets the generic `signup_failed`.
- **Password change:** a single UPDATE; other sessions are deleted in the same transaction.

## Security considerations
| Threat | Mitigation |
|---|---|
| Account enumeration | Generic `invalid_credentials` with status 401 for unknown phone, wrong password and blocked demo user; dummy hash verify; lockout applies to unknown phones too. Register reveals that a phone is taken (`signup_failed`); accepted and documented, and general rate limiting follows in PRP-11. |
| Brute force | 5 attempts per 15 minutes per phone; 15-character minimum; common-password blocklist. |
| Taking over invites or admin with an unverified phone | Invites and `ADMIN_PHONES` require `phone_verified_at`. |
| Setting a password on someone else's OTP-only account | Register refuses existing phones. A password can be set only by a signed-in owner of the account. |
| Demo leaking into production | `is_demo` is rejected in production standard; demo mode blocks real users and live services; the seed reset is guarded. |
| Long-password DoS | Rejected above 128 characters before hashing. |
| Logs | Passwords and hashes are never logged. |

## Implementation blueprint (ordered tasks)
```yaml
Task 1 schema + migration: apps/api/src/db/schema.ts (users columns, loginThrottle); bun run db:generate --name auth_modes; hand-add the backfill UPDATE to the generated SQL.
Task 2 env: apps/api/src/lib/env.ts add appMode, demoLoginEnabled, signupEnabled; lib/msg91.ts otpMode(); lib/razorpay.ts treat demo mode as unconfigured.
Task 3 shared: packages/shared/src/schemas.ts passwordSchema, registerSchema, loginSchema, demoLoginSchema, changePasswordSchema; types User fields + AuthMethods; client auth.methods/register/login/demo, me.setPassword; COMMON_PASSWORDS list in packages/shared/src/passwords.ts.
Task 4 service: apps/api/src/services/auth.ts register, loginWithPassword, demoLogin, changePassword, authMethods, grantAdmin; throttle helpers; demo/production guards in verifyOtp/requestOtp/createSession path; phone_verified_at on OTP verify; resolveRole requires verification for ADMIN_PHONES.
Task 5 residents: linkInvitedResidencies no-op unless phoneVerified.
Task 6 payments: simulatePayment allowed when appMode=demo.
Task 7 mappers: toUser adds phoneVerified/hasPassword/isDemo.
Task 8 routes: auth.ts new endpoints; /me/password.
Task 9 seed: isDemo + phoneVerifiedAt for seeded users; production reset guard; .env.example (APP_MODE, DEMO_LOGIN; ADMIN_PHONES comment).
Task 10 script: apps/api/src/scripts/grant-admin.ts + package.json "admin:grant".
Task 11 tests: apps/api/test/auth-modes.test.ts.
Task 12 web: login page views (otp default when available | password | signup | demo), actions; account password card.
Task 13 mobile: login.tsx methods; profile verified badge.
Task 14 e2e: apps/web/e2e/auth.spec.ts password sign-up → logout → login; demo button login.
Task 15 docs: README auth section, docs/RUN.md modes, security-review update; ledger.
```

## Validation loop
```bash
bun run typecheck && bunx biome lint .
(cd packages/shared && bun test)
(cd apps/api && TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/hostels_bob_test bun test)
(cd apps/web && bun run e2e:fresh)            # disposable hostels_e2e
(cd apps/mobile && bunx expo export --platform web --output-dir <scratch>)   # bundles; not a native check
```

## Acceptance criteria
All success criteria above are ticked with the named tests passing, plus the validation loop green, and the ledger rows `AUTH-*` updated.

## External dependencies and cost
| Dependency | Needed for | Free? | Account or card? | Status |
|---|---|---|---|---|
| `Bun.password` (built in) | hashing | yes | no | used |
| Common-password list | blocklist | yes (a short list written in the repo) | no | used |
| MSG91 | optional live OTP | no (paid per SMS) | yes | optional, blocked |
| Pwned Passwords API | breached-password check | free | no account | **not used**: the host is unreachable from the sandbox, so it can't be tested. Candidate for PRP-11. |

Total external cost: ₹0.

## Open questions
1. **Minimum password length.** 15 characters follows NIST for a single factor. Some users may find that long; lowering it is a one-line change to `PASSWORD_MIN_LENGTH`. Default: 15.
2. **Self-service password reset** needs SMS or email delivery, which costs money or needs an account. Default: an admin-assisted reset through the `admin:grant` style script (a `password:reset` script lands in PRP-11, or sooner if you approve).
3. **Should a password-only (unverified) account be allowed to become an owner and list a hostel?** Default: yes. Admin review of every listing already gates going live.

## Anti-patterns to avoid
- A different error status or message for an unknown phone.
- Read-then-write on the throttle counter.
- Letting any demo flag be decided on the client.

## Review (before execution)
Checked against `.claude/commands/generate-prp.md`. Gaps found and fixed in this document:
1. Isolation was per endpoint. It is now one guard in `createSession` and `getSessionUser`, which also covers the handoff path and stale sessions; a test was added.
2. Autocomplete and length hints for password fields were added to the UI section.
3. Sign-up spam (many accounts from one client) isn't covered by the per-phone throttle; it's recorded under PRP-11 general rate limiting.

## Execution notes
- **Found and fixed:** `truncateAll` used a hand-kept table list, so new tables (`login_throttle`) leaked between test runs. The list is now derived from the schema.
- **Found and fixed:** demo-mode simulated payments under `NODE_ENV=production` also needed `verifyPaymentSignature` to accept stub signatures on demo instances. Demo instances also refuse Razorpay webhooks.
- **Found and fixed:** the demo buttons' hidden `phone` inputs collided with the OTP form's `phone` field; renamed to `demoPhone`.
- **Found (setup):** the API doesn't migrate on start. `docs/RUN.md` now says to run `db:migrate` before starting a new version (input for PRP-09).
- **Changed from plan:** `POST /auth/otp` in production without SMS now returns 403 `method_disabled` (was 503 `internal`), to match the other disabled methods.
- **Not done here:** mobile password change (the website covers it); a `password:reset` script (PRP-11).
