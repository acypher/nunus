#!/usr/bin/env bash
# Attach the uploaded iOS build to an App Store version and submit for review.
#
# Usage:
#   ./scripts/submit-safari-ios.sh
#   ./scripts/submit-safari-ios.sh --dry-run
#   ./scripts/submit-safari-ios.sh --skip-wait

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
exec python3 "$SCRIPT_DIR/submit_safari_appstore.py" --platform IOS "$@"
