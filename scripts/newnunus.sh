#!/usr/bin/env bash
# Versioned Chrome/Web Store zip + Firefox .xpi in one step (manifest version in filenames).
#
# ~/.zshrc:
#   newnunus() { /path/to/NunusCursor/scripts/newnunus.sh "$@"; }
#
# Optional: NUNUS_EXTENSION_ROOT=/other/clone ./scripts/newnunus.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ROOT="${NUNUS_EXTENSION_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
PARENT="$(cd "$ROOT/.." && pwd)"

ver="$(python3 -c "import json; print(json.load(open('$ROOT/manifest.json'))['version'])")"
ZIP="$PARENT/nunus-${ver}.zip"

rm -f "$ZIP"
(
  cd "$ROOT" || exit 1
  zip -r "$ZIP" . \
    -x "*.git*" \
    -x ".DS_Store" \
    -x "*/.DS_Store" \
    -x "safari/*" \
    -x "samples/*" \
    -x ".idea/*" \
    -x ".cursor/*" \
    -x "scripts/*" \
    -x "*.iml"
)

echo "Wrote $ZIP"

NUNUS_XPI="$PARENT/nunus-${ver}.xpi" "$SCRIPT_DIR/build-nunus-firefox-xpi.sh"

echo "Wrote $PARENT/nunus-${ver}.xpi"
