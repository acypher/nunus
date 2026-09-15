#!/usr/bin/env bash
# Check whether manifest.json version is live on Chrome, Firefox, Safari macOS, and Safari iOS.
#
# Usage:
#   ./scripts/check-store-live.sh
#
# Exit 0 when all four stores serve the repo version; exit 1 otherwise.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
exec python3 "$SCRIPT_DIR/check_store_live.py" "$@"
