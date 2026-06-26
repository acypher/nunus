#!/usr/bin/env bash
# Sync Firefox AMO listing summary/description from manifest.json + docs/description.md.
#
# Usage:
#   ./scripts/patch-amo-listing.sh
#   ./scripts/patch-amo-listing.sh --dry-run

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
exec python3 "$SCRIPT_DIR/patch-amo-listing.py" "$@"
