#!/usr/bin/env bash
# Sync Mac App Store description and subtitle from docs/description.md.
#
# Usage:
#   ./scripts/patch-app-store-listing.sh
#   ./scripts/patch-app-store-listing.sh --version 3.0.4 --dry-run

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
exec python3 "$SCRIPT_DIR/patch-app-store-listing.py" "$@"
