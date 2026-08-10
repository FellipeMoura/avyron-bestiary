#!/usr/bin/env bash
# On-demand Postgres backup for the bestiary.
#
# Given the threat model (data has no external value), a scheduled cron is
# NOT required — this script exists so you can grab a snapshot before a
# risky deploy or schema migration. If you decide to schedule it later,
# add a weekly line to crontab (see docs/VPS_RUNBOOK.md).
#
# Usage:
#   ./scripts/backup-pg.sh                # writes to /srv/bestiary/backups/
#   BACKUP_DIR=/tmp ./scripts/backup-pg.sh
#
# Requires: pg_dump on PATH, PGPASSWORD in env OR ~/.pgpass configured.
#
# On the sysnode VPS the host has no pg_dump because Postgres runs in
# Docker — see docs/VPS_RUNBOOK.md → "Snapshot manual do banco" for the
# `docker exec` variant. Keep this script for when a VPS has native
# Postgres tools.

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/srv/bestiary/backups}"
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5434}"
PGUSER="${PGUSER:-bestiary_app}"
PGDATABASE="${PGDATABASE:-bestiary_prod}"

STAMP="$(date -u +'%Y%m%dT%H%M%SZ')"
OUT="$BACKUP_DIR/bestiary-$STAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "dumping $PGDATABASE from $PGHOST:$PGPORT as $PGUSER → $OUT"
pg_dump \
    --host="$PGHOST" \
    --port="$PGPORT" \
    --username="$PGUSER" \
    --dbname="$PGDATABASE" \
    --no-owner \
    --no-privileges \
    --format=plain \
    | gzip -9 > "$OUT"

echo "backup written: $OUT ($(du -h "$OUT" | cut -f1))"

# Prune backups older than 14 days — plenty for the "revert a bad deploy"
# use case; anything older than that would be older than the last live edit.
find "$BACKUP_DIR" -name 'bestiary-*.sql.gz' -mtime +14 -delete
