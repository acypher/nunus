#!/usr/bin/env bash
# Bump Nunus version, commit, tag, and push to GitHub.
#
# Usage:
#   ./scripts/version-commit.sh "what changed in this release"
#   ./scripts/version-commit.sh --package "also build zip + xpi"
#   ./scripts/version-commit.sh --major "new publication or breaking change"
#   ./scripts/version-commit.sh --version 2.0.0 "explicit version"
#   ./scripts/version-commit.sh --dry-run "preview only"
#   ./scripts/version-commit.sh --skip-push "commit and tag locally only"
#
# From a cursor/* branch: merges into main and pushes main + tag.
# Default bump is minor. Use --major when shipping a new publication.
# Does not build Safari or publish to stores (use release.sh for that).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=lib/load-release-env.sh
source "$SCRIPT_DIR/lib/load-release-env.sh"

DRY_RUN=0
SKIP_PUSH=0
PACKAGE=0
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
    --package) PACKAGE=1; shift ;;
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
  BRANCH="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD)"
  MAIN_BRANCH="${RELEASE_GIT_BRANCH:-main}"
  if [[ "$BRANCH" == cursor/* ]]; then
    echo "Would merge $BRANCH into $MAIN_BRANCH and push $MAIN_BRANCH + tag."
  else
    echo "Would tag v<new> and push $BRANCH."
  fi
  if [[ "$PACKAGE" -eq 1 ]]; then
    echo "Would run newnunus.sh → ../nunus-<version>.zip and ../nunus-<version>.xpi"
  fi
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
  MAIN_BRANCH="${RELEASE_GIT_BRANCH:-main}"

  if [[ "$BRANCH" == cursor/* ]]; then
    echo "Merging $BRANCH into $MAIN_BRANCH..."
    git -C "$ROOT" fetch "$RELEASE_GIT_REMOTE" "$MAIN_BRANCH"
    git -C "$ROOT" checkout "$MAIN_BRANCH"
    git -C "$ROOT" merge "$BRANCH" --no-edit
    git -C "$ROOT" push "$RELEASE_GIT_REMOTE" "$MAIN_BRANCH"
    git -C "$ROOT" push "$RELEASE_GIT_REMOTE" "$TAG"
    echo "Merged and pushed $MAIN_BRANCH ($TAG)."
  elif [[ "$BRANCH" == "$MAIN_BRANCH" ]]; then
    git -C "$ROOT" push "$RELEASE_GIT_REMOTE" "$MAIN_BRANCH"
    git -C "$ROOT" push "$RELEASE_GIT_REMOTE" "$TAG"
  else
    echo "warning: not on $MAIN_BRANCH or cursor/*; pushing $BRANCH only" >&2
    git -C "$ROOT" push "$RELEASE_GIT_REMOTE" "$BRANCH"
    git -C "$ROOT" push "$RELEASE_GIT_REMOTE" "$TAG"
  fi
fi

if [[ "$PACKAGE" -eq 1 ]]; then
  echo
  echo "== Package Chrome zip + Firefox xpi =="
  "$SCRIPT_DIR/newnunus.sh"
  PARENT="$(cd "$ROOT/.." && pwd)"
  echo "  Chrome: $PARENT/nunus-${VERSION}.zip"
  echo "  Firefox: $PARENT/nunus-${VERSION}.xpi"
fi

echo
echo "Version commit complete: ${VERSION} (${TAG})"
