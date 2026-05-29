#!/usr/bin/env bash
# End-to-end Nunus release: version commit → build → store publish.
#
# Usage:
#   ./scripts/release.sh "what changed in this release"
#   ./scripts/release.sh --major "breaking change summary"
#   ./scripts/release.sh --skip-publish "build artifacts only"
#
# For GitHub + zip/xpi (no Safari or stores), use:
#   ./scripts/version-commit.sh --package "summary"
#   or the Cursor command: /version

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

DRY_RUN=0
SKIP_PUSH=0
SKIP_PUBLISH=0
VC_ARGS=()
MESSAGE=""

usage() {
  sed -n '2,11p' "$0" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; VC_ARGS+=(--dry-run); shift ;;
    --skip-push) SKIP_PUSH=1; VC_ARGS+=(--skip-push); shift ;;
    --skip-publish) SKIP_PUBLISH=1; shift ;;
    --major) VC_ARGS+=(--major); shift ;;
    --version)
      [[ $# -ge 2 ]] || usage
      VC_ARGS+=(--version "$2")
      shift 2
      ;;
    -h|--help) usage ;;
    *)
      if [[ -n "$MESSAGE" ]]; then
        MESSAGE+=" $1"
      else
        MESSAGE="$1"
      fi
      shift
      ;;
  esac
done

if [[ -z "$MESSAGE" ]]; then
  echo "error: commit message is required" >&2
  usage
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  [[ "$SKIP_PUBLISH" -eq 0 ]] && VC_ARGS+=(--package)
  "$SCRIPT_DIR/version-commit.sh" "${VC_ARGS[@]}" "$MESSAGE"
  echo
  echo "Dry run only. Would also build Safari and publish to stores."
  exit 0
fi

VC_ARGS+=(--package)
"$SCRIPT_DIR/version-commit.sh" "${VC_ARGS[@]}" "$MESSAGE"
VERSION="$(python3 -c "import json; print(json.load(open('$ROOT/manifest.json'))['version'])")"
TAG="v${VERSION}"
PARENT="$(cd "$ROOT/.." && pwd)"
ZIP="$PARENT/nunus-${VERSION}.zip"
XPI="$PARENT/nunus-${VERSION}.xpi"

echo
echo "== Build Safari macOS archive =="
PKG="$("$SCRIPT_DIR/build-safari-mac.sh" | tail -1)"

if [[ "$SKIP_PUBLISH" -eq 1 ]]; then
  echo
  echo "Publish skipped (--skip-publish)."
  echo "Artifacts:"
  echo "  Chrome: $ZIP"
  echo "  Firefox source xpi: $XPI"
  echo "  Safari: $PKG"
  exit 0
fi

echo
echo "== Check store credentials =="
if ! "$SCRIPT_DIR/check-release-credentials.sh"; then
  echo
  echo "Stopped before publishing. Artifacts are ready:"
  echo "  Chrome: $ZIP"
  echo "  Firefox: $XPI"
  echo "  Safari: $PKG"
  echo
  echo "Fill in scripts/release.env, then publish manually:"
  echo "  python3 scripts/publish-chrome.py \"$ZIP\""
  echo "  scripts/publish-firefox.sh"
  echo "  scripts/publish-safari-mac.sh \"$PKG\""
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

echo
echo "Release ${VERSION} complete."
echo "  Git tag: ${TAG}"
echo "  Chrome: ${ZIP}"
echo "  Firefox: signed via web-ext"
echo "  Safari: ${PKG} uploaded to App Store Connect"
echo "Review Safari submission in App Store Connect before release."
