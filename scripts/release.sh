#!/usr/bin/env bash
# End-to-end Nunus release: bump → commit → tag → push → build → publish.
#
# Usage:
#   ./scripts/release.sh "what changed in this release"
#   ./scripts/release.sh --major "breaking change summary"
#   ./scripts/release.sh --version 2.0.0 "explicit version"
#   ./scripts/release.sh --dry-run "preview only"
#   ./scripts/release.sh --skip-push "commit locally, no git push"
#   ./scripts/release.sh --skip-publish "build artifacts only"
#
# Default bump is minor (NYTimes improvements). Use --major when shipping a new publication.
# Copy scripts/release.env.example → scripts/release.env first.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=lib/load-release-env.sh
source "$SCRIPT_DIR/lib/load-release-env.sh"

DRY_RUN=0
SKIP_PUSH=0
SKIP_PUBLISH=0
BUMP_ARGS=()
MESSAGE=""

usage() {
  sed -n '2,12p' "$0" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --skip-push) SKIP_PUSH=1; shift ;;
    --skip-publish) SKIP_PUBLISH=1; shift ;;
    --major) BUMP_ARGS+=(--major); shift ;;
    --version)
      [[ $# -ge 2 ]] || usage
      BUMP_ARGS+=(--version "$2")
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

if [[ "$DRY_RUN" -eq 0 ]] && [[ -n "$(git -C "$ROOT" status --porcelain)" ]]; then
  echo "error: working tree is not clean; commit or stash changes first" >&2
  git -C "$ROOT" status --short >&2
  exit 1
fi

echo "== Bump version =="
if [[ "$DRY_RUN" -eq 1 ]]; then
  python3 "$SCRIPT_DIR/bump-version.py" --dry-run ${BUMP_ARGS[@]+"${BUMP_ARGS[@]}"}
  echo
  echo "Dry run only. Would commit: version <new>: $MESSAGE"
  echo "Would tag: v<new>, push, run newnunus.sh, build-safari-mac.sh, publish to stores."
  exit 0
fi

python3 "$SCRIPT_DIR/bump-version.py" ${BUMP_ARGS[@]+"${BUMP_ARGS[@]}"}
VERSION="$(python3 -c "import json; print(json.load(open('$ROOT/manifest.json'))['version'])")"
TAG="v${VERSION}"
COMMIT_MSG="version ${VERSION}: ${MESSAGE}"

echo
echo "== Commit =="
git -C "$ROOT" add manifest.json \
  safari/NunusSafari.xcodeproj/project.pbxproj \
  safari/scripts/gen_pbxproj.py
git -C "$ROOT" commit -m "$COMMIT_MSG"
git -C "$ROOT" tag -a "$TAG" -m "$COMMIT_MSG"

echo
echo "== Push =="
if [[ "$SKIP_PUSH" -eq 1 ]]; then
  echo "Skipped (--skip-push)."
else
  BRANCH="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD)"
  git -C "$ROOT" push "$RELEASE_GIT_REMOTE" "$BRANCH"
  git -C "$ROOT" push "$RELEASE_GIT_REMOTE" "$TAG"
fi

echo
echo "== Package Chrome zip + Firefox xpi =="
"$SCRIPT_DIR/newnunus.sh"
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
