# Deploying Hostels

How to run the platform for real users on one Linux server with Docker, keep it backed up, upgrade it and roll back.
Everything here was run end to end on 2026-11-02 (see "What was tested"); the parts that need a real domain or paid
accounts are marked.

## What runs

```
             Internet (80/443)
                   │
              ┌────▼────┐   profile "tls": Let's Encrypt certificates, renewed automatically
              │  caddy  │
              └─┬─────┬─┘
     example.in │     │ api.example.in
          ┌─────▼─┐ ┌─▼──────┐   uploads volume ──► photos (listing photos public, attachments signed links)
          │  web  │►│  api   │   background jobs run inside the API (bills, moves, expiries, auto-close)
          └───────┘ └─┬──────┘
                      │  (compose network only; no published port)
                 ┌────▼─────┐   pgdata volume
                 │ postgres │
                 └──────────┘
   migrate: runs once before each API start and exits (forward-only Drizzle migrations)
```

- `deploy/compose.prod.yml`: the stack. `deploy/api.Dockerfile` and `deploy/web.Dockerfile`: the images.
- Run **one** API container: the job scheduler and the photo store are inside it. Before running more, move photos to
  object storage and the jobs to a single runner (see `docs/security-review.md`).
- The website calls the API over the compose network (`http://api:4000`); browsers load photos from `API_PUBLIC_URL`.

## First deploy

1. **A server** with Docker Engine and the compose plugin (2 vCPU, 4 GB RAM is plenty to start), ports 80 and 443 open,
   and two DNS records pointing at it: the site (`example.in`) and the API (`api.example.in`).
2. **Settings.** `cp deploy/.env.prod.example deploy/.env.prod`, then fill it in:
   - `POSTGRES_PASSWORD`, `OTP_PEPPER`, `UPLOAD_SIGNING_SECRET`: three different values from `openssl rand -hex 32`.
   - `SITE_DOMAIN`, `API_DOMAIN`, `ACME_EMAIL`, and the matching `WEB_URL`, `API_PUBLIC_URL`, `CORS_ORIGINS` (https).
   - Leave MSG91 empty to use phone + password login only. Razorpay: see step 5.
   The file stays on the server (`.gitignore` covers it). The API checks these at start and refuses to run, listing
   every problem, if a secret is missing or a development value, a public link isn't https, or a key pair is half set.
3. **Start it:**
   ```bash
   docker compose -f deploy/compose.prod.yml --env-file deploy/.env.prod --profile tls up -d --build
   ```
   The database starts, `migrate` applies migrations and exits, then the API (it must pass its health check), then the
   website, then Caddy. Check with `docker compose -f deploy/compose.prod.yml --env-file deploy/.env.prod ps`:
   every service `healthy`, `migrate` exited 0. `curl https://api.example.in/` should report `"db":"up"`.
4. **First admin.** Sign up on the website with your phone and a password, then on the server:
   ```bash
   docker compose -f deploy/compose.prod.yml --env-file deploy/.env.prod exec api bun run src/scripts/grant-admin.ts <phone>
   ```
5. **Payments (when the Razorpay account is approved).** Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and
   `RAZORPAY_WEBHOOK_SECRET`, and point the Razorpay webhook (`payment.captured`, `order.paid`) at
   `https://api.example.in/webhooks/razorpay`. Use different webhook secrets for test and live mode. Restart the API.
   Without keys a standard instance takes no payments at all (simulation is refused in production).

A **public demo** instead: `APP_MODE=demo` on its own server or database, then seed it once with
`docker compose … exec api bun run src/db/seed.ts`. Only the seeded demo accounts can sign in and payments are simulated.

## Backups

`deploy/backup.sh` writes `deploy/backups/<UTC time>/` with `db.dump` (pg_dump custom format), `uploads.tgz` (all
photos) and `SHA256SUMS`. It checks that the dump can be read before keeping it, never leaves a half-written backup,
and deletes backups older than `KEEP_DAYS` (14).

```bash
# crontab -e on the server: every night at 02:30 IST (21:00 UTC), then copy off the machine
0 21 * * * cd /srv/hostels && deploy/backup.sh >>/var/log/hostels-backup.log 2>&1
```

A backup on the same disk doesn't survive losing the server. Copy `deploy/backups/` elsewhere after each run (for
example `rclone sync` to object storage, or `rsync` to another machine).

**Restore drill (monthly, and after any change to the scripts):**

```bash
deploy/restore.sh --check deploy/backups/<time>
```

It verifies the checksums, restores into a scratch database, prints row counts, and drops it. It changes nothing.

**Restore for real** (replaces the live database and photos):

```bash
deploy/restore.sh deploy/backups/<time>      # asks you to type "hostels"; RESTORE_CONFIRM=hostels skips the prompt
```

It stops the website and API, recreates the database from the dump, replaces the photos, and starts everything again;
`migrate` brings an older dump up to the current schema. Bills that came due while the server was down are generated
by the API's jobs on start.

## Upgrades and rollback

```bash
deploy/backup.sh                                   # always, before an upgrade
git pull
TAG=$(git rev-parse --short HEAD) docker compose -f deploy/compose.prod.yml --env-file deploy/.env.prod --profile tls up -d --build
```

Tagging images with the commit keeps the previous images on the server. **Rollback:** run the same `up -d` with the
previous `TAG` (no `--build`). Migrations only move forward: if the new version applied a migration the old code
can't run on, restore the backup taken just before the upgrade instead.

## Operating it

- **Health:** `https://api.example.in/` (`db`, payment and OTP modes); the containers have health checks and restart
  on failure.
- **Logs:** `docker compose … logs -f api` (jobs log what they changed, e.g. `[jobs] tenantInvoices=2`).
- **Refunds:** payments that arrived after their bill closed are listed under Payments to refund on the admin billing
  page; refund them in the Razorpay dashboard, then mark them refunded.
- **Disk:** watch the `pgdata` and `uploads` volumes and `deploy/backups/`.

## What was tested (2026-11-02, this repository's container)

- Both images built from a clean context (`docker build`), using Bun 1.4.4 (the lockfile format needs it) and Node 22.
- Without settings, the production API image exits listing six problems; with valid settings it starts.
- The full stack came up in order (database healthy → migrate exit 0 → API healthy → website healthy) as a demo
  instance on localhost, seeded inside the API container.
- A browser test against the containers: home, search (12 hostels, 12 photos loaded from the API under the Content
  Security Policy), a hostel page, demo sign-in with an httpOnly session cookie, the signed-in account page, and no
  console errors.
- Backups: `backup.sh` produced a checked dump and photo archive; `restore.sh --check` loaded it into a scratch
  database; a corrupted backup, a non-backup folder and an unconfirmed restore were each refused without touching
  data; after deleting every review and a photo, `restore.sh` brought them back and the browser test passed again.

**Not tested here:** real certificates (Caddy needs public DNS), Razorpay and MSG91 with real accounts, and copying
backups off the machine. OpenStreetMap map tiles are blocked by this sandbox's network, so maps showed no tiles in
the test; they load normally on a real server.
