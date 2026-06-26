#!/usr/bin/env bash
# Print step-by-step Chrome Web Store listing update instructions.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
exec python3 "$SCRIPT_DIR/print-chrome-listing-reminder.py" "$@"
