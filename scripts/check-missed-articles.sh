#!/usr/bin/env bash
# Wrapper for check-missed-articles.py
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
# shellcheck source=lib/resolve-python.sh
source "$SCRIPT_DIR/lib/resolve-python.sh"
exec "$(resolve_python3)" "$SCRIPT_DIR/check-missed-articles.py" "$@"
