#!/usr/bin/env bash
# Arm daily publish-check after a store publish.
#
# Usage:
#   ./scripts/setup-publish-check-daily.sh
#   ./scripts/setup-publish-check-daily.sh --version 1.6.6
#   ./scripts/setup-publish-check-daily.sh --stop
#   ./scripts/setup-publish-check-daily.sh --status

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=lib/load-release-env.sh
source "$SCRIPT_DIR/lib/load-release-env.sh"

VERSION=""
COMMAND=(setup)

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      VERSION="${2:-}"
      [[ -n "$VERSION" ]] || { echo "error: --version requires a value" >&2; exit 1; }
      shift 2
      ;;
    --stop)
      COMMAND=(stop)
      shift
      ;;
    --status)
      COMMAND=(status)
      shift
      ;;
    -h|--help)
      sed -n '2,8p' "$0"
      exit 0
      ;;
    *)
      echo "error: unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

ARGS=("${COMMAND[@]}")
if [[ "${COMMAND[0]}" == setup && -n "$VERSION" ]]; then
  ARGS+=(--version "$VERSION")
fi

exec python3 "$SCRIPT_DIR/publish_check_watch.py" "${ARGS[@]}"
