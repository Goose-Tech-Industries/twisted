#!/usr/bin/env bash
# =================================================================
# retire-node.sh — Take the legacy Node stack out of the active path
# without deleting anything. Idempotent. Safe to re-run.
# =================================================================
# What it does:
#   1. Stops + deletes the legacy PM2 apps (twisted-backend, twisted-ui).
#   2. Renames /root/twisted/te to te.retired (moved-aside, not deleted).
#   3. Renames /root/twisted/ui to ui.retired (Next.js client, replaced
#      by /root/twisted/player).
#   4. Renames /root/twisted/monorepo and monorepo_v27_build to .retired.
#
# What it does NOT do:
#   - Delete code. Everything is moved aside, so a `git history` /
#     `mv back` recovers it.
#   - Touch /etc/nginx (apply nginx.player.conf manually after testing).
#   - Touch the Phoenix or database state.
# =================================================================

set -euo pipefail

ROOT="${ROOT:-/root/twisted}"

retire_dir() {
  local d="$1"
  if [ -d "$ROOT/$d" ] && [ ! -e "$ROOT/$d.retired" ]; then
    echo "[retire] mv $d → $d.retired"
    mv "$ROOT/$d" "$ROOT/$d.retired"
  elif [ -e "$ROOT/$d.retired" ]; then
    echo "[skip ] $d already retired"
  else
    echo "[skip ] $d not present"
  fi
}

stop_pm2() {
  local app="$1"
  if command -v pm2 >/dev/null 2>&1 && pm2 jlist 2>/dev/null | grep -q "\"name\":\"$app\""; then
    echo "[pm2  ] stop $app"
    pm2 delete "$app" >/dev/null 2>&1 || true
  else
    echo "[pm2  ] $app not running"
  fi
}

echo "=== Twisted Engine — Node retirement ==="
echo "ROOT=$ROOT"
echo

# 1) Stop legacy PM2 apps
stop_pm2 twisted-backend
stop_pm2 twisted-ui

# 2) Move legacy directories aside
retire_dir te
retire_dir ui
retire_dir monorepo
retire_dir monorepo_v27_build

# 3) Sanity check the new stack is buildable
echo
echo "=== Verifying SvelteKit build ==="
cd "$ROOT"
pnpm --filter @twisted/player build > /tmp/player-build.log 2>&1 \
  && echo "[ok   ] @twisted/player build succeeded" \
  || { echo "[fail ] player build — see /tmp/player-build.log"; exit 1; }

echo
echo "=== Verifying Phoenix compile ==="
(cd te_phoenix && mix compile --warnings-as-errors > /tmp/phoenix-build.log 2>&1) \
  && echo "[ok   ] te_phoenix compile succeeded" \
  || { echo "[fail ] phoenix compile — see /tmp/phoenix-build.log"; exit 1; }

cat <<'NEXT'

=== Retired ===
  /root/twisted/te                 → te.retired
  /root/twisted/ui                 → ui.retired
  /root/twisted/monorepo           → monorepo.retired
  /root/twisted/monorepo_v27_build → monorepo_v27_build.retired

=== What's still active ===
  /root/twisted/player        — SvelteKit 2.50 + Svelte 5 player client
  /root/twisted/te_phoenix    — Phoenix backend (channels + LiveView admin)
  /root/twisted/packages      — @twisted/render shared rendering core

=== Next steps ===
  1. Start SvelteKit:
       pm2 start /root/twisted/ecosystem.player.config.js

  2. Apply the new nginx config:
       sudo cp /root/twisted/nginx.player.conf /etc/nginx/sites-available/twisted-engine
       sudo nginx -t && sudo systemctl reload nginx

  3. Confirm:
       curl -I https://twistedengine.com/login
       curl -I https://twistedengine.com/api/auth/me
       curl -I https://twistedengine.com/sauce

  4. Once verified, the *.retired directories can be deleted.
NEXT
