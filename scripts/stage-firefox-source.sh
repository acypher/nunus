#!/usr/bin/env bash
# Copy extension sources to DEST with a Firefox-patched manifest.json.
#
# Usage: stage-firefox-source.sh <dest-dir> [repo-root]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
DEST="${1:?dest directory required}"
ROOT="${2:-$(cd "$SCRIPT_DIR/.." && pwd)}"

mkdir -p "$DEST"

rsync -a \
  --exclude ".git/" \
  --exclude "safari/" \
  --exclude "samples/" \
  --exclude "scripts/" \
  --exclude ".cursor/" \
  --exclude ".idea/" \
  --exclude "*.iml" \
  --exclude ".DS_Store" \
  --exclude "*/.DS_Store" \
  "$ROOT/" "$DEST/"

python3 "$SCRIPT_DIR/patch-manifest-for-firefox.py" "$ROOT/manifest.json" >"$DEST/manifest.json"
