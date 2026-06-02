#!/usr/bin/env bash
# Daily publish-check runner (launchd entry point).
#
# Reads scripts/.publish-check-watch.json, checks whether the watched version is
# live on all stores, emails when it is, then stops the daily schedule.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=lib/load-release-env.sh
source "$SCRIPT_DIR/lib/load-release-env.sh"

exec python3 "$SCRIPT_DIR/publish_check_watch.py" run
