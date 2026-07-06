#!/usr/bin/env bash
# Provision iOS App Store signing (bundle IDs + provisioning profiles) via the
# App Store Connect API. Idempotent; see ensure_ios_signing.py.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
# shellcheck source=lib/load-release-env.sh
source "$SCRIPT_DIR/lib/load-release-env.sh"
exec python3 "$SCRIPT_DIR/ensure_ios_signing.py" "$@"
