#!/usr/bin/env bash
# launchd entrypoint for Missed Articles daily (local Mac).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
# shellcheck source=lib/resolve-python.sh
source "$SCRIPT_DIR/lib/resolve-python.sh"
# Ensure Cursor + common bins are on PATH for LaunchAgents (minimal env).
export PATH="/Applications/Cursor.app/Contents/Resources/app/bin:${HOME}/.local/bin:/usr/local/bin:/opt/homebrew/bin:${PATH}"
# Wrapper sends the definitive iMessage after the agent exits.
export MISSED_ARTICLES_DAILY_WRAPPER=1
cd "$SCRIPT_DIR/.."
PY="$(resolve_python3 2>/dev/null || command -v python3)"
exec "$PY" "$SCRIPT_DIR/missed_articles_daily.py" run
