#!/usr/bin/env bash
# =================================================================
# scripts/backup-db.sh — Daily MySQL backup with 14-day rotation
#
# Usage:    bash scripts/backup-db.sh
# Schedule: 0 3 * * * /var/www/twisted/scripts/backup-db.sh >> /var/log/twisted-backup.log 2>&1
#
# Restoring a backup:
#   gunzip < backups/twisted_rpg_2026-03-13_03-00.sql.gz | mysql -u root -p twisted_rpg
# =================================================================
set -euo pipefail

# ── Config (reads from te/.env if present) ───────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../te/.env"

if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
fi

DB_HOST="${DB_HOST:-localhost}"
DB_USER="${DB_USER:-root}"
DB_PASS="${DB_PASS:-}"
DB_NAME="${DB_NAME:-twisted_rpg}"

BACKUP_DIR="${BACKUP_DIR:-$SCRIPT_DIR/../backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
TIMESTAMP=$(date '+%Y-%m-%d_%H-%M')
FILENAME="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting backup of $DB_NAME..."

# ── Dump + compress in one pipe ──────────────────────────────────
MYSQL_PWD="$DB_PASS" mysqldump \
  --host="$DB_HOST" \
  --user="$DB_USER" \
  --single-transaction \
  --routines \
  --triggers \
  --add-drop-table \
  "$DB_NAME" | gzip -9 > "$FILENAME"

SIZE=$(du -sh "$FILENAME" | cut -f1)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup written: $FILENAME ($SIZE)"

# ── Rotate — delete backups older than KEEP_DAYS ─────────────────
DELETED=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime "+${KEEP_DAYS}" -print -delete | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Rotated $DELETED old backup(s) (kept last ${KEEP_DAYS} days)"
fi

# ── Verify the backup is readable ────────────────────────────────
if gunzip -t "$FILENAME" 2>/dev/null; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ Backup verified OK"
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ Backup verification FAILED — $FILENAME may be corrupt"
  exit 1
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Done."
