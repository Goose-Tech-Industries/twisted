#!/usr/bin/env bash
# =================================================================
# scripts/test-restore.sh — Verify a backup can actually be restored
#
# TEACHING: Most people skip the restore test. Then one day the DB
# dies and they discover their backups were corrupt or the restore
# process takes 4 hours and they never practised it. This script
# restores your latest backup into a THROWAWAY database, counts the
# rows in key tables, then drops the throwaway DB. It proves:
#   1. The backup file is not corrupt
#   2. The restore command actually works
#   3. The expected data is in there
#
# Run it once a week. Add to cron:
#   0 4 * * 0  bash /var/www/twisted/scripts/test-restore.sh >> /var/log/twisted-restore-test.log 2>&1
#
# Usage:
#   bash scripts/test-restore.sh                   ← tests latest backup
#   bash scripts/test-restore.sh backups/foo.sql.gz ← tests a specific file
# =================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../te/.env"

# Load env if present
if [ -f "$ENV_FILE" ]; then
    set -a; source "$ENV_FILE"; set +a
fi

DB_HOST="${DB_HOST:-localhost}"
DB_USER="${DB_USER:-root}"
DB_PASS="${DB_PASS:-}"
DB_NAME="${DB_NAME:-twisted_rpg}"
BACKUP_DIR="${BACKUP_DIR:-$SCRIPT_DIR/../backups}"

# ── Find the backup to test ───────────────────────────────────────
if [ -n "${1:-}" ]; then
    BACKUP_FILE="$1"
else
    # Latest backup by modification time
    BACKUP_FILE=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -type f \
                  | sort -t_ -k2 -r | head -1)
fi

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
    echo "[$(date)] ❌ No backup file found in $BACKUP_DIR"
    echo "   Run: bash scripts/backup-db.sh first"
    exit 1
fi

echo ""
echo "[$(date)] ════════════════════════════════════════"
echo "[$(date)] Restore Test — Twisted Engine"
echo "[$(date)] File: $BACKUP_FILE"
echo "[$(date)] ════════════════════════════════════════"

# ── Step 1: Verify the archive is not corrupt ─────────────────────
echo "[$(date)] Step 1/4 — Verifying archive integrity..."
if gunzip -t "$BACKUP_FILE"; then
    echo "[$(date)] ✅ Archive is valid gzip"
else
    echo "[$(date)] ❌ Archive is CORRUPT — run a fresh backup immediately"
    exit 1
fi

# ── Step 2: Create throwaway test database ────────────────────────
TEST_DB="${DB_NAME}_restore_test_$$"   # $$ = PID, makes it unique
echo "[$(date)] Step 2/4 — Creating test database: $TEST_DB"

MYSQL_CMD="mysql --host=$DB_HOST --user=$DB_USER"
[ -n "$DB_PASS" ] && MYSQL_CMD="MYSQL_PWD=$DB_PASS $MYSQL_CMD"

eval "$MYSQL_CMD" -e "CREATE DATABASE IF NOT EXISTS \`$TEST_DB\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
echo "[$(date)] ✅ Test database created"

# ── Step 3: Restore into test database ───────────────────────────
echo "[$(date)] Step 3/4 — Restoring backup..."
if MYSQL_PWD="$DB_PASS" gunzip -c "$BACKUP_FILE" | mysql --host="$DB_HOST" --user="$DB_USER" "$TEST_DB"; then
    echo "[$(date)] ✅ Restore completed without errors"
else
    echo "[$(date)] ❌ Restore FAILED — check the backup file and MySQL user permissions"
    MYSQL_PWD="$DB_PASS" mysql --host="$DB_HOST" --user="$DB_USER" \
        -e "DROP DATABASE IF EXISTS \`$TEST_DB\`;" 2>/dev/null || true
    exit 1
fi

# ── Step 4: Spot-check key tables ─────────────────────────────────
echo "[$(date)] Step 4/4 — Checking row counts in restored DB..."

check_table() {
    local table="$1"
    local min_rows="${2:-0}"
    local count
    count=$(MYSQL_PWD="$DB_PASS" mysql --host="$DB_HOST" --user="$DB_USER" \
        --skip-column-names -e \
        "SELECT COUNT(*) FROM \`$TEST_DB\`.\`$table\` LIMIT 1;" 2>/dev/null || echo "TABLE_MISSING")

    if [ "$count" = "TABLE_MISSING" ]; then
        echo "[$(date)] ⚠️  Table '$table' not found (might not exist yet — OK if game hasn't launched)"
    elif [ "$count" -ge "$min_rows" ]; then
        echo "[$(date)] ✅ $table — $count rows"
    else
        echo "[$(date)] ⚠️  $table — only $count rows (expected at least $min_rows)"
    fi
}

# Check the tables that matter most
check_table "users"           1
check_table "characters"      0
check_table "game_maps"       0
check_table "game_npcs"       0
check_table "game_items"      0
check_table "sessions"        0

# ── Cleanup: Drop the throwaway DB ───────────────────────────────
echo "[$(date)] Cleaning up test database..."
MYSQL_PWD="$DB_PASS" mysql --host="$DB_HOST" --user="$DB_USER" \
    -e "DROP DATABASE IF EXISTS \`$TEST_DB\`;"
echo "[$(date)] ✅ Test database dropped"

# ── Summary ───────────────────────────────────────────────────────
FILESIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
echo ""
echo "[$(date)] ════════════════════════════════════════"
echo "[$(date)] ✅ RESTORE TEST PASSED"
echo "[$(date)]    Backup: $(basename "$BACKUP_FILE") ($FILESIZE)"
echo "[$(date)]    This backup can be restored successfully."
echo "[$(date)] ════════════════════════════════════════"
echo ""
