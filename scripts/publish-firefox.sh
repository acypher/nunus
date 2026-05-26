#!/usr/bin/env bash
# Sign and upload the Firefox extension to AMO via web-ext.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=lib/load-release-env.sh
source "$SCRIPT_DIR/lib/load-release-env.sh"

for var in AMO_JWT_ISSUER AMO_JWT_SECRET; do
  if [[ -z "${!var:-}" ]]; then
    echo "error: $var is required (set in scripts/release.env)" >&2
    exit 1
  fi
done

if ! command -v web-ext >/dev/null 2>&1; then
  echo "error: web-ext CLI not found (npm install -g web-ext)" >&2
  exit 1
fi

channel="${AMO_CHANNEL:-listed}"
artifacts_dir="$ROOT/safari/build/firefox-artifacts"
mkdir -p "$artifacts_dir"

web-ext sign \
  --source-dir "$ROOT" \
  --api-key "$AMO_JWT_ISSUER" \
  --api-secret "$AMO_JWT_SECRET" \
  --channel "$channel" \
  --artifacts-dir "$artifacts_dir" \
  --ignore-files \
    "safari/**" \
    "samples/**" \
    "scripts/**" \
    ".git/**" \
    ".cursor/**" \
    ".idea/**" \
    "**/.DS_Store" \
    "**/*.iml"

signed="$(find "$artifacts_dir" -name '*.xpi' | head -1)"
if [[ -z "$signed" ]]; then
  echo "error: web-ext sign did not produce an .xpi" >&2
  exit 1
fi

echo "Signed and submitted to AMO ($channel): $signed"
