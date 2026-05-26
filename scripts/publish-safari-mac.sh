#!/usr/bin/env bash
# Upload an exported macOS .pkg to App Store Connect.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
# shellcheck source=lib/load-release-env.sh
source "$SCRIPT_DIR/lib/load-release-env.sh"

if [[ $# -ne 1 ]]; then
  echo "usage: $(basename "$0") /path/to/NunusHost.pkg" >&2
  exit 1
fi

pkg="$1"
if [[ ! -f "$pkg" ]]; then
  echo "error: pkg not found: $pkg" >&2
  exit 1
fi

upload_args=(--upload-app --type macos --file "$pkg")

if [[ -n "${APP_STORE_CONNECT_API_KEY_ID:-}" ]]; then
  for var in APP_STORE_CONNECT_API_KEY_ID APP_STORE_CONNECT_ISSUER_ID APP_STORE_CONNECT_API_KEY_PATH; do
    if [[ -z "${!var:-}" ]]; then
      echo "error: $var is required when using App Store Connect API keys" >&2
      exit 1
    fi
  done
  if [[ ! -f "$APP_STORE_CONNECT_API_KEY_PATH" ]]; then
    echo "error: API key file not found: $APP_STORE_CONNECT_API_KEY_PATH" >&2
    exit 1
  fi
  upload_args+=(--apiKey "$APP_STORE_CONNECT_API_KEY_ID")
  upload_args+=(--apiIssuer "$APP_STORE_CONNECT_ISSUER_ID")
  upload_args+=(--apiKeyPath "$APP_STORE_CONNECT_API_KEY_PATH")
elif [[ -n "${APPLE_ID:-}" && -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" ]]; then
  upload_args+=(--username "$APPLE_ID" --password "$APPLE_APP_SPECIFIC_PASSWORD")
else
  echo "error: set App Store Connect API key vars or APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD in scripts/release.env" >&2
  exit 1
fi

echo "Uploading $pkg to App Store Connect..."
xcrun altool "${upload_args[@]}"
echo "Upload submitted. Processing continues in App Store Connect."
