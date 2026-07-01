#!/usr/bin/env bash
# Report which release credentials are configured and which are still missing.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
# shellcheck source=lib/load-release-env.sh
source "$SCRIPT_DIR/lib/load-release-env.sh"

missing=()
warn=()
ok=()

need_var() {
  local name="$1"
  local value="${!name-}"
  if [[ -z "$value" ]]; then
    missing+=("$name")
  else
    ok+=("$name")
  fi
}

need_file() {
  local name="$1"
  local value="${!name-}"
  if [[ -z "$value" ]]; then
    missing+=("$name")
  elif [[ ! -f "$value" ]]; then
    warn+=("$name (set but file not found: $value)")
  else
    ok+=("$name")
  fi
}

section() {
  echo
  echo "== $1 =="
}

section "Chrome Web Store"
need_var CHROME_EXTENSION_ID
need_var CHROME_CLIENT_ID
need_var CHROME_CLIENT_SECRET
need_var CHROME_REFRESH_TOKEN

section "Firefox AMO"
need_var AMO_JWT_ISSUER
need_var AMO_JWT_SECRET
if [[ -z "${AMO_CHANNEL-}" ]]; then
  export AMO_CHANNEL=listed
fi
ok+=("AMO_CHANNEL (default: listed)")
if ! command -v web-ext >/dev/null 2>&1; then
  warn+=("web-ext CLI (install: npm install -g web-ext)")
fi

section "Apple Mac App Store (Safari)"
need_var APPLE_TEAM_ID
if [[ -n "${APP_STORE_CONNECT_API_KEY_ID:-}" || -n "${APP_STORE_CONNECT_ISSUER_ID:-}" || -n "${APP_STORE_CONNECT_API_KEY_PATH:-}" ]]; then
  need_var APP_STORE_CONNECT_API_KEY_ID
  need_var APP_STORE_CONNECT_ISSUER_ID
  need_file APP_STORE_CONNECT_API_KEY_PATH
else
  need_var APPLE_ID
  need_var APPLE_APP_SPECIFIC_PASSWORD
fi
if ! command -v xcodebuild >/dev/null 2>&1; then
  warn+=("xcodebuild (install Xcode)")
fi

section "Apple iOS App Store (Safari)"
# iOS reuses the same Apple credentials as macOS; only the target app differs.
ok+=("IOS_BUNDLE_ID (default: ${IOS_BUNDLE_ID:-com.acypher.nunus.ios})")
if [[ "${PUBLISH_INCLUDE_IOS:-1}" == "0" ]]; then
  ok+=("iOS skipped (PUBLISH_INCLUDE_IOS=0)")
else
  ok+=("iOS included by default (skip with --no-ios)")
fi

section "Summary"
if ((${#ok[@]})); then
  echo "Configured:"
  for name in "${ok[@]}"; do
    echo "  ✓ $name"
  done
fi

if ((${#warn[@]})); then
  echo
  echo "Warnings:"
  for item in "${warn[@]}"; do
    echo "  ! $item"
  done
fi

if ((${#missing[@]})); then
  echo
  echo "Missing (copy scripts/release.env.example → scripts/release.env):"
  for name in "${missing[@]}"; do
    echo "  ✗ $name"
  done
  echo
  echo "Env file: ${NUNUS_RELEASE_ENV:-$ROOT/scripts/release.env}"
  exit 1
fi

echo
echo "All release credentials look configured."
