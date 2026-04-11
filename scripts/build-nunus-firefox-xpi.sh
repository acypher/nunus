#!/usr/bin/env bash
# Build ../nunus.xpi from this repo (Firefox / AMO). 
# Sanity-check: manifest.json at zip root.
#
# Add to ~/.bashrc (adjust path to your clone):
#   buildNunusFirefox() { /path/to/NunusCursor/scripts/build-nunus-firefox-xpi.sh "$@"; }
#
# Optional env:
#   NUNUS_EXTENSION_ROOT  — repo root (default: parent of this script’s directory)
#   NUNUS_XPI           — output .xpi path (default: $ROOT/../nunus.xpi)
#
# Versioned zip + .xpi together: scripts/newnunus.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ROOT="${NUNUS_EXTENSION_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
OUT="${NUNUS_XPI:-$ROOT/../nunus.xpi}"

cd "$ROOT" || {
  echo "buildNunusFirefox: cannot cd to $ROOT" >&2
  exit 1
}

rm -f "$OUT"

zip -r "$OUT" . \
  -x "*.git*" \
  -x ".DS_Store" \
  -x "*/.DS_Store" \
  -x "safari/*" \
  -x "samples/*" \
  -x ".idea/*" \
  -x ".cursor/*" \
  -x "scripts/*" \
  -x "*.iml"

manifest_at_root() {
  local z="$1"
  # Avoid pipe + pipefail + SIGPIPE: grep may close the pipe after a match while
  # zipinfo is still writing, yielding exit 141 on the whole pipeline.
  if command -v zipinfo >/dev/null 2>&1; then
    grep -Fqx 'manifest.json' < <(zipinfo -1 "$z")
  else
    grep -qE '[[:space:]]manifest\.json$' < <(unzip -l "$z")
  fi
}

if ! manifest_at_root "$OUT"; then
  echo "buildNunusFirefox: sanity check failed (manifest.json not at zip root): $OUT" >&2
  exit 1
fi

echo 'zipped and checked'
