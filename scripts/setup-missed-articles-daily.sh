#!/usr/bin/env bash
# Arm / stop / status the local Missed Articles daily LaunchAgent (7:00 AM).
#
# Usage:
#   ./scripts/setup-missed-articles-daily.sh
#   ./scripts/setup-missed-articles-daily.sh --stop
#   ./scripts/setup-missed-articles-daily.sh --status
#   ./scripts/setup-missed-articles-daily.sh --run-now

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
# shellcheck source=lib/resolve-python.sh
source "$SCRIPT_DIR/lib/resolve-python.sh"

CMD=setup
case "${1:-}" in
  --stop) CMD=stop ;;
  --status) CMD=status ;;
  --run-now) CMD=run ;;
  -h|--help)
    sed -n '2,10p' "$0"
    exit 0
    ;;
  "")
    CMD=setup
    ;;
  *)
    echo "error: unknown argument: $1" >&2
    exit 1
    ;;
esac

exec "$(resolve_python3)" "$SCRIPT_DIR/missed_articles_daily.py" "$CMD"
