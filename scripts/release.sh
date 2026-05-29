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
#
# To publish the current version to all stores (no version bump):
#   ./scripts/publish-stores.sh
#   or the Cursor command: /publish

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

if [[ "$SKIP_PUBLISH" -eq 1 ]]; then
  echo
  echo "== Build artifacts only (--skip-publish) =="
  "$SCRIPT_DIR/publish-stores.sh" --build-only
  exit 0
fi

"$SCRIPT_DIR/publish-stores.sh"

echo
echo "Release ${VERSION} complete (git tag: ${TAG})."
