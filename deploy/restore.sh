#!/usr/bin/env bash
# Restores a backup made by deploy/backup.sh.
#   deploy/restore.sh --check <backup-dir>   # restore drill: loads the dump into a scratch database, prints row
#                                            # counts, drops it. Changes nothing. Run it after every backup change.
#   deploy/restore.sh <backup-dir>           # REPLACES the live database and photos. Asks for confirmation.
# Settings (environment): ENV_FILE (default deploy/.env.prod), RESTORE_CONFIRM=hostels to skip the prompt.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${ENV_FILE:-$here/.env.prod}"
compose=(docker compose -f "$here/compose.prod.yml" --env-file "$ENV_FILE")
psql_as=("${compose[@]}" exec -T postgres psql -v ON_ERROR_STOP=1 -U hostels)

check=false
if [[ "${1:-}" == "--check" ]]; then
  check=true
  shift
fi
dir="${1:?usage: restore.sh [--check] <backup-dir>}"
[[ -f "$dir/db.dump" && -f "$dir/uploads.tgz" && -f "$dir/SHA256SUMS" ]] || { echo "not a backup directory: $dir" >&2; exit 1; }
(cd "$dir" && sha256sum --check --quiet SHA256SUMS) || { echo "checksum mismatch in $dir; refusing to restore" >&2; exit 1; }

counts() {
  "${psql_as[@]}" -d "$1" -At -c "select 'users', count(*) from users union all select 'hostels', count(*) from hostels
    union all select 'subscriptions', count(*) from subscriptions union all select 'invoices', count(*) from invoices
    union all select 'reviews', count(*) from reviews union all select 'issues', count(*) from issues"
}

if $check; then
  scratch="restore_check_$(date -u +%s)"
  "${psql_as[@]}" -d postgres -c "create database $scratch" >/dev/null
  trap '"${psql_as[@]}" -d postgres -c "drop database if exists $scratch" >/dev/null' EXIT
  "${compose[@]}" exec -T postgres pg_restore --no-owner --exit-on-error -U hostels -d "$scratch" <"$dir/db.dump"
  echo "restore drill ok: $dir loads cleanly. Rows:"
  counts "$scratch" | sed 's/|/: /; s/^/  /'
  echo "  photos: $(tar -tzf "$dir/uploads.tgz" | grep -vc '/$') files"
  exit 0
fi

if [[ "${RESTORE_CONFIRM:-}" != "hostels" ]]; then
  answer=""
  read -r -p "This replaces the live database and photos with $dir. Type the database name (hostels) to continue: " answer || true
  [[ "$answer" == "hostels" ]] || { echo "cancelled: nothing was changed (set RESTORE_CONFIRM=hostels to run without a prompt)" >&2; exit 1; }
fi

# Stop everything that writes, restore, then let the migration job bring an older dump up to date.
"${compose[@]}" stop web api
"${psql_as[@]}" -d postgres -c "drop database if exists hostels with (force)" -c "create database hostels"
"${compose[@]}" exec -T postgres pg_restore --no-owner --exit-on-error -U hostels -d hostels <"$dir/db.dump"
"${compose[@]}" run --rm --no-deps -T --entrypoint sh api -c 'find /data/uploads -mindepth 1 -delete && tar -xzf - -C /data/uploads' <"$dir/uploads.tgz"
"${compose[@]}" up -d
echo "restored from $dir. Rows now:"
counts hostels | sed 's/|/: /; s/^/  /'
