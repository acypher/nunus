# Headless codesign keychain setup for iOS Safari builds only.
# shellcheck shell=bash
#
# macOS Safari uses Xcode Automatic signing + the login keychain (build-safari-mac.sh).
# iOS needs a dedicated keychain because Manual App Store signing must run headlessly.
#
# Callers set NUNUS_SIGN_ROOT / NUNUS_SIGN_BUILD_DIR, then:
#   with_isolated_signing_keychain <command...>

NUNUS_SAVED_KEYCHAINS=()

save_user_keychains() {
  NUNUS_SAVED_KEYCHAINS=()
  local line
  while IFS= read -r line; do
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    line="${line#\"}"
    line="${line%\"}"
    [[ -n "$line" ]] && NUNUS_SAVED_KEYCHAINS+=("$line")
  done < <(security list-keychains -d user)
}

restore_user_keychains() {
  if ((${#NUNUS_SAVED_KEYCHAINS[@]} > 0)); then
    security list-keychains -d user -s "${NUNUS_SAVED_KEYCHAINS[@]}"
  fi
}

_nunus_sign_defaults() {
  local root="${NUNUS_SIGN_ROOT:-}"
  local build_dir="${NUNUS_SIGN_BUILD_DIR:-}"
  NUNUS_SIGN_IDENTITY="${NUNUS_SIGN_IDENTITY:-Apple Distribution}"
  NUNUS_SIGN_P12="${NUNUS_SIGN_P12:-${root}/scripts/keys/ios-signing/dist.p12}"
  NUNUS_SIGN_KEYCHAIN="${NUNUS_SIGN_KEYCHAIN:-${build_dir}/nunus-ios-signing.keychain-db}"
  NUNUS_SIGN_KEYCHAIN_PW="${NUNUS_SIGN_KEYCHAIN_PW:-nunus-temp-signing}"
  if [[ -z "${NUNUS_SIGN_P12_PW:-}" && -f "${NUNUS_SIGN_P12}.password" ]]; then
    NUNUS_SIGN_P12_PW="$(tr -d '\n' <"${NUNUS_SIGN_P12}.password")"
  fi
  NUNUS_SIGN_P12_PW="${NUNUS_SIGN_P12_PW:-nunus}"
}

# Prepare the dedicated iOS keychain. Does not change the user's default search list.
setup_signing_keychain() {
  _nunus_sign_defaults
  [[ -f "$NUNUS_SIGN_P12" ]] || return 1

  if [[ ! -f "$NUNUS_SIGN_KEYCHAIN" ]]; then
    security create-keychain -p "$NUNUS_SIGN_KEYCHAIN_PW" "$NUNUS_SIGN_KEYCHAIN"
  fi
  security set-keychain-settings "$NUNUS_SIGN_KEYCHAIN"
  security unlock-keychain -p "$NUNUS_SIGN_KEYCHAIN_PW" "$NUNUS_SIGN_KEYCHAIN"
  if ! security find-identity -v -p codesigning "$NUNUS_SIGN_KEYCHAIN" | grep -q "$NUNUS_SIGN_IDENTITY"; then
    security import "$NUNUS_SIGN_P12" -k "$NUNUS_SIGN_KEYCHAIN" -P "$NUNUS_SIGN_P12_PW" \
      -T /usr/bin/codesign -T /usr/bin/xcodebuild -T /usr/bin/productbuild
  fi
  security set-key-partition-list -S apple-tool:,apple:,codesign: \
    -s -k "$NUNUS_SIGN_KEYCHAIN_PW" "$NUNUS_SIGN_KEYCHAIN" >/dev/null 2>&1 || true
  NUNUS_CODE_SIGN_FLAGS="--keychain $NUNUS_SIGN_KEYCHAIN"
  return 0
}

# Run a command with only the dedicated signing keychain visible to codesign.
with_isolated_signing_keychain() {
  _nunus_sign_defaults
  save_user_keychains
  trap restore_user_keychains EXIT
  security list-keychains -d user -s "$NUNUS_SIGN_KEYCHAIN"
  "$@"
}

# One-time fix if an older build left the iOS keychain ahead of login in the search list.
restore_login_keychain_default() {
  local login="$HOME/Library/Keychains/login.keychain-db"
  security list-keychains -d user -s "$login"
}
