#!/usr/bin/env bash
# Build and publish the current manifest.json version to Chrome, Firefox, and Safari.
# No version bump or git operations — use release.sh for a full release.
#
# Before publish (run manually or rely on checks below):
#   ./scripts/check-release-credentials.sh
#   ./scripts/check-store-pending.sh   # must exit 0 (READY)
#
# Usage:
#   ./scripts/publish-stores.sh                # Chrome + Firefox + Safari macOS + Safari iOS
#   ./scripts/publish-stores.sh --build-only
#   ./scripts/publish-stores.sh --dry-run
#   ./scripts/publish-stores.sh --no-ios       # skip the iOS Safari app
#
# iOS Safari (separate App Store app com.acypher.nunus.ios) is included by default.
# Skip it with --no-ios or PUBLISH_INCLUDE_IOS=0.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=lib/load-release-env.sh
source "$SCRIPT_DIR/lib/load-release-env.sh"

BUILD_ONLY=0
DRY_RUN=0
INCLUDE_IOS="${PUBLISH_INCLUDE_IOS:-1}"

usage() {
  sed -n '2,12p' "$0" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --build-only) BUILD_ONLY=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --ios) INCLUDE_IOS=1; shift ;;
    --no-ios) INCLUDE_IOS=0; shift ;;
    -h|--help) usage ;;
    *) echo "error: unknown argument: $1" >&2; usage ;;
  esac
done

VERSION="$(python3 -c "import json; print(json.load(open('$ROOT/manifest.json'))['version'])")"
PARENT="$(cd "$ROOT/.." && pwd)"
ZIP="$PARENT/nunus-${VERSION}.zip"
XPI="$PARENT/nunus-${VERSION}.xpi"

echo "== Publish Nunus ${VERSION} =="

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "Dry run — would:"
  echo "  1. Build $ZIP and $XPI (newnunus.sh)"
  echo "  2. Build Safari macOS archive (build-safari-mac.sh)"
  if [[ "$INCLUDE_IOS" -eq 1 ]]; then
    echo "  2b. Build Safari iOS archive (build-safari-ios.sh)"
  fi
  if [[ "$BUILD_ONLY" -eq 0 ]]; then
    echo "  3. Upload to Chrome Web Store, Firefox AMO, and App Store Connect (macOS)"
    if [[ "$INCLUDE_IOS" -eq 1 ]]; then
      echo "  3b. Upload + submit the iOS Safari app"
    fi
    "$SCRIPT_DIR/check-release-credentials.sh" || true
    "$SCRIPT_DIR/check-store-pending.sh" || true
  fi
  exit 0
fi

echo
echo "== Build Chrome zip + Firefox xpi =="
"$SCRIPT_DIR/newnunus.sh"

echo
echo "== Build Safari macOS archive =="
PKG="$("$SCRIPT_DIR/build-safari-mac.sh" | tail -1)"

IPA=""
if [[ "$INCLUDE_IOS" -eq 1 ]]; then
  echo
  echo "== Build Safari iOS archive =="
  if IPA="$("$SCRIPT_DIR/build-safari-ios.sh" | tail -1)"; then
    :
  else
    echo "WARNING: iOS Safari build failed; skipping iOS for this run." >&2
    echo "  Ensure the iOS platform is installed (Xcode > Settings > Components) and that" >&2
    echo "  an App Store Connect app exists for ${IOS_BUNDLE_ID:-com.acypher.nunus.ios}." >&2
    INCLUDE_IOS=0
    IPA=""
  fi
fi

if [[ "$BUILD_ONLY" -eq 1 ]]; then
  echo
  echo "Build complete (--build-only; no store upload)."
  echo "  Chrome: $ZIP"
  echo "  Firefox: $XPI"
  echo "  Safari (macOS): $PKG"
  if [[ "$INCLUDE_IOS" -eq 1 ]]; then
    echo "  Safari (iOS): $IPA"
  fi
  exit 0
fi

echo
echo "== Check store credentials =="
if ! "$SCRIPT_DIR/check-release-credentials.sh"; then
  echo
  echo "Stopped before publishing. Artifacts are ready:"
  echo "  Chrome: $ZIP"
  echo "  Firefox: $XPI"
  echo "  Safari (macOS): $PKG"
  if [[ "$INCLUDE_IOS" -eq 1 ]]; then echo "  Safari (iOS): $IPA"; fi
  echo
  echo "Fill in scripts/release.env, then run:"
  echo "  ./scripts/publish-stores.sh"
  exit 1
fi

echo
echo "== Check for pending store submissions =="
if ! "$SCRIPT_DIR/check-store-pending.sh"; then
  echo
  echo "Stopped before publishing. Artifacts are ready:"
  echo "  Chrome: $ZIP"
  echo "  Firefox: $XPI"
  echo "  Safari (macOS): $PKG"
  if [[ "$INCLUDE_IOS" -eq 1 ]]; then echo "  Safari (iOS): $IPA"; fi
  exit 1
fi

echo
echo "== Publish Chrome =="
python3 "$SCRIPT_DIR/publish-chrome.py" "$ZIP"

echo
echo "== Publish Firefox =="
"$SCRIPT_DIR/publish-firefox.sh"

echo
echo "== Publish Safari (Mac App Store) =="
"$SCRIPT_DIR/publish-safari-mac.sh" "$PKG"

if [[ "${APP_STORE_SKIP_SUBMIT:-}" == "1" ]]; then
  echo "Skipped App Store submit (APP_STORE_SKIP_SUBMIT=1)."
else
  echo
  echo "== Submit Safari for App Review (macOS) =="
  "$SCRIPT_DIR/submit-safari-appstore.sh"
fi

if [[ "$INCLUDE_IOS" -eq 1 ]]; then
  echo
  echo "== Publish Safari (iOS App Store) =="
  "$SCRIPT_DIR/publish-safari-ios.sh" "$IPA"

  if [[ "${APP_STORE_SKIP_SUBMIT:-}" == "1" ]]; then
    echo "Skipped iOS App Store submit (APP_STORE_SKIP_SUBMIT=1)."
  else
    echo
    echo "== Submit Safari for App Review (iOS) =="
    "$SCRIPT_DIR/submit-safari-ios.sh"
  fi
fi

echo
echo "Publish ${VERSION} complete."
echo "  Chrome: ${ZIP}"
echo "  Firefox: signed via web-ext"
echo "  Safari (macOS): ${PKG} uploaded; App Review submission attempted via API"
if [[ "$INCLUDE_IOS" -eq 1 ]]; then
  echo "  Safari (iOS): ${IPA} uploaded; App Review submission attempted via API"
fi
echo "Monitor review status in App Store Connect."

if [[ "${PUBLISH_CHECK_SKIP_DAILY:-}" != "1" ]]; then
  echo
  echo "== Arm daily publish-check until live =="
  "$SCRIPT_DIR/setup-publish-check-daily.sh" --version "$VERSION"
fi
