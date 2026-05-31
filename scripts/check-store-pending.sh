#!/usr/bin/env bash
# Check Chrome, Firefox, and Safari for pending submissions before publish.
#
# Usage:
#   ./scripts/check-store-pending.sh
#
# Exit 0 when all stores look clear; exit 1 when any store is pending or needs
# manual verification.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
exec python3 "$SCRIPT_DIR/check_store_pending.py"
