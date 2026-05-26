#!/usr/bin/env bash
# Source release credentials. Safe to source from other release scripts.

set -euo pipefail

RELEASE_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ROOT="$(cd "$RELEASE_LIB_DIR/../.." && pwd)"
export ROOT
ENV_FILE="${NUNUS_RELEASE_ENV:-$ROOT/scripts/release.env}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$ENV_FILE"
  set +a
fi

export RELEASE_GIT_REMOTE="${RELEASE_GIT_REMOTE:-origin}"
