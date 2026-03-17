#!/usr/bin/env bash
# =================================================================
# scripts/deploy.sh — Twisted Engine production deploy
#
# Usage:  bash scripts/deploy.sh
# Run from the monorepo root on your server.
#
# What it does:
#   1. Pulls latest code
#   2. Installs backend deps
#   3. Installs + builds Next.js UI
#   4. Restarts both PM2 processes
#   5. Confirms /health returns ok
# =================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND="$ROOT/te"
FRONTEND="$ROOT/ui"

echo ""
echo "🩸 ─────────────────────────────────────────────"
echo "   Twisted Engine Deploy — $(date '+%Y-%m-%d %H:%M:%S')"
echo "🩸 ─────────────────────────────────────────────"
echo ""

# ── 1. Pull latest ───────────────────────────────────────────────
if [ -d "$ROOT/.git" ]; then
  echo "▶ Pulling latest code..."
  git -C "$ROOT" pull --ff-only
else
  echo "ℹ  No .git directory — skipping git pull (deploy from zip assumed)"
fi

# ── 2. Backend deps ──────────────────────────────────────────────
echo ""
echo "▶ Installing backend dependencies..."
cd "$BACKEND"
npm install --omit=dev

# ── 3. Frontend build ────────────────────────────────────────────
echo ""
echo "▶ Installing + building Next.js UI..."
cd "$FRONTEND"
npm install --omit=dev  # or: pnpm install
npm run build

# ── 4. Restart PM2 processes ─────────────────────────────────────
echo ""
echo "▶ Restarting PM2 processes..."
cd "$ROOT"

# Start or restart backend
if pm2 describe twisted-backend > /dev/null 2>&1; then
  pm2 restart twisted-backend
else
  pm2 start te/server.js --name twisted-backend --cwd te
fi

# Start or restart UI
if pm2 describe twisted-ui > /dev/null 2>&1; then
  pm2 restart twisted-ui
else
  pm2 start --name twisted-ui --cwd ui -- npm start
fi

pm2 save

# ── 5. Health check ──────────────────────────────────────────────
echo ""
echo "▶ Waiting for backend to start..."
sleep 4

HEALTH=$(curl -sf http://localhost:3001/health 2>/dev/null || echo '{"status":"error"}')
STATUS=$(echo "$HEALTH" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','?'))" 2>/dev/null || echo "parse-error")

if [ "$STATUS" = "ok" ]; then
  echo ""
  echo "✅ Deploy complete — server is healthy"
  echo "   Backend:  http://localhost:3001/health"
  echo "   UI:       http://localhost:3000"
  echo "   Admin:    https://yourdomain.com/adminsauce"
  echo ""
else
  echo ""
  echo "⚠️  Deploy finished but health check returned: $HEALTH"
  echo "   Check logs: pm2 logs twisted-backend --lines 50"
  echo ""
  exit 1
fi
