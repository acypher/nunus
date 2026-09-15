#!/usr/bin/env bash
# Publish-check runner (launchd entry point).
#
# Reads scripts/.publish-check-watch.json, checks whether the watched version is
# live on all stores, emails progress every N days until complete, then stops.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=lib/load-release-env.sh
source "$SCRIPT_DIR/lib/load-release-env.sh"
# shellcheck source=lib/resolve-python.sh
source "$SCRIPT_DIR/lib/resolve-python.sh"

PYTHON="$(resolve_python3)"
exec "$PYTHON" "$SCRIPT_DIR/publish_check_watch.py" run
