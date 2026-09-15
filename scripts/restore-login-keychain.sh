#!/usr/bin/env bash
# Restore login.keychain as the only user keychain in the search list.
#
# Older iOS builds permanently prepended safari/build/nunus-ios-signing.keychain-db
# ahead of login, which confused macOS Automatic signing. Run this once if macOS
# Safari export prompts for the wrong keychain or rejects your Mac password.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
# shellcheck source=lib/signing-keychain.sh
source "$SCRIPT_DIR/lib/signing-keychain.sh"

restore_login_keychain_default
echo "Restored login keychain as default for codesign."
