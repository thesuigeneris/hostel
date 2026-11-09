#!/usr/bin/env bash
# Backs up the production database and uploaded photos, checks the dump can be read, and prunes old backups.
#   deploy/backup.sh                 # writes deploy/backups/<UTC time>/{db.dump,uploads.tgz,SHA256SUMS}
# Settings (environment): BACKUP_DIR (default deploy/backups), KEEP_DAYS (default 14), ENV_FILE (deploy/.env.prod).
# Schedule it with cron and copy BACKUP_DIR off the machine; see docs/DEPLOY.md.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${ENV_FILE:-$here/.env.prod}"
BACKUP_DIR="${BACKUP_DIR:-$here/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
compose=(docker compose -f "$here/compose.prod.yml" --env-file "$ENV_FILE")

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$BACKUP_DIR/$stamp"
partial="$target.partial"
mkdir -p "$partial"
trap 'rm -rf "$partial"' EXIT

# Custom format: compressed, and restorable table by table. Taken inside the running database container.
"${compose[@]}" exec -T postgres pg_dump -U hostels -d hostels --format=custom --no-owner >"$partial/db.dump"
# A dump that pg_restore can't list is not a backup.
"${compose[@]}" exec -T postgres pg_restore --list <"$partial/db.dump" >/dev/null

# Photos (listing photos and private attachments) from the API's volume.
"${compose[@]}" exec -T api tar -C /data/uploads -czf - . >"$partial/uploads.tgz"
tar -tzf "$partial/uploads.tgz" >/dev/null

(cd "$partial" && sha256sum db.dump uploads.tgz >SHA256SUMS)
mv "$partial" "$target"
trap - EXIT

# Keep KEEP_DAYS days of backups; never delete the one just made.
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '20*Z' -mtime "+$KEEP_DAYS" ! -path "$target" -exec rm -rf {} +

echo "backup ok: $target ($(du -sh "$target" | cut -f1))"
