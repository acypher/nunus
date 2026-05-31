#!/usr/bin/env bash
# Attach the uploaded macOS build to an App Store version and submit for review.
#
# Usage:
#   ./scripts/submit-safari-appstore.sh
#   ./scripts/submit-safari-appstore.sh --dry-run
#   ./scripts/submit-safari-appstore.sh --skip-wait

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
exec python3 "$SCRIPT_DIR/submit_safari_appstore.py" "$@"
