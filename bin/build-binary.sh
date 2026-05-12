#!/usr/bin/env bash
# Build a self-contained Twisted Carnage binary via Burrito.
#
# Usage:
#   bin/build-binary.sh                  # builds the current host target
#   bin/build-binary.sh linux_amd64      # explicit target
#   bin/build-binary.sh all              # all four targets sequentially
#
# Targets: linux_amd64 | mac_amd64 | mac_arm64 | win
#
# First build needs the zig toolchain on the build host. Install per
# https://github.com/burrito-elixir/burrito — `mix burrito.install`
# can fetch zig for you. Without zig present, mix release will fail
# clearly inside Burrito.wrap.
#
# Outputs land in te_phoenix/burrito_out/ (Burrito's default). The
# script copies them into /root/twisted/dist/ at the repo root.

set -euo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_DIR="$REPO_ROOT/te_phoenix"
DIST_DIR="$REPO_ROOT/dist"

ALL_TARGETS=(linux_amd64 mac_amd64 mac_arm64 win)

usage() {
  echo "Usage: $0 [target|all]"
  echo "  target: ${ALL_TARGETS[*]}"
  exit 1
}

require_zig() {
  if ! command -v zig >/dev/null 2>&1; then
    echo ""
    echo "Burrito wiring is in place but zig is not installed."
    echo ""
    echo "First cross-compile needs the zig toolchain on this host."
    echo "Install via https://ziglang.org/download/ (or use the"
    echo "Burrito helper: cd te_phoenix && mix burrito.install)."
    echo ""
    echo "Then re-run: $0 ${1:-all}"
    exit 2
  fi
}

require_zig "${1:-}"

mkdir -p "$DIST_DIR"
cd "$PROJECT_DIR"

run_target() {
  local target="$1"
  echo ""
  echo "── Building Burrito target: $target ──"
  echo ""
  BURRITO_TARGET="$target" MIX_ENV=prod mix release te_phoenix --overwrite
}

case "${1:-host}" in
  all)
    for t in "${ALL_TARGETS[@]}"; do
      run_target "$t"
    done
    ;;
  host)
    case "$(uname -s)-$(uname -m)" in
      Linux-x86_64)   run_target linux_amd64 ;;
      Darwin-x86_64)  run_target mac_amd64 ;;
      Darwin-arm64)   run_target mac_arm64 ;;
      *)              echo "Unknown host; pick a target explicitly."; usage ;;
    esac
    ;;
  linux_amd64|mac_amd64|mac_arm64|win)
    run_target "$1"
    ;;
  -h|--help)
    usage
    ;;
  *)
    echo "Unknown argument: $1"
    usage
    ;;
esac

echo ""
echo "── Collecting binaries into $DIST_DIR ──"
if [[ -d "$PROJECT_DIR/burrito_out" ]]; then
  cp -v "$PROJECT_DIR/burrito_out/"* "$DIST_DIR/" 2>/dev/null || true
fi

echo ""
echo "Done. Binaries in: $DIST_DIR"
ls -la "$DIST_DIR" 2>/dev/null || true
