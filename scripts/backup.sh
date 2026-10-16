#!/bin/sh
# scripts/backup.sh — periodic database backup, run by the compose `backup`
# service (docker compose --profile backup up -d).
#
#   SQLite (default): online `.backup` of /data/dev.db (the bitflow-data volume)
#   Postgres:         pg_dump of $DATABASE_URL when it is a postgres:// URL
#
# Files go to /backups (host ./backups) as bitflow-<UTC timestamp>.db.gz / .sql.gz;
# only the newest $BACKUP_KEEP are kept. Restore steps: see README "Backups".

set -eu
set -o pipefail   # a failed pg_dump must not leave a "successful" empty backup

KEEP="${BACKUP_KEEP:-14}"
INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"
SQLITE_PATH="${SQLITE_PATH:-/data/dev.db}"
DB_URL="${DATABASE_URL:-}"

command -v sqlite3 >/dev/null 2>&1 || apk add --no-cache sqlite >/dev/null

# Explicit `|| return 1`: set -e is ignored inside a function called with `||`.
backup_once() {
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  case "$DB_URL" in
    postgres://*|postgresql://*)
      out="/backups/bitflow-$stamp.sql.gz"
      pg_dump --no-owner --dbname="$DB_URL" | gzip > "$out.tmp" || { rm -f "$out.tmp"; return 1; }
      ;;
    *)
      # Back up to container-local /tmp first, then write one compressed file:
      # SQLite's many small locked writes misbehave on some bind mounts.
      out="/backups/bitflow-$stamp.db.gz"
      sqlite3 "$SQLITE_PATH" ".backup '/tmp/bitflow.db'" \
        && gzip -c /tmp/bitflow.db > "$out.tmp" \
        || { rm -f /tmp/bitflow.db "$out.tmp"; return 1; }
      rm -f /tmp/bitflow.db
      ;;
  esac
  mv "$out.tmp" "$out" || return 1
  echo "[backup] wrote $out ($(wc -c < "$out") bytes)"

  # Keep the newest $KEEP completed backups.
  ls -1t /backups/bitflow-*.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
}

rm -f /backups/bitflow-*.tmp   # leftovers from a run killed mid-write

while true; do
  backup_once || echo "[backup] FAILED — will retry next interval"
  sleep "$INTERVAL"
done
