#!/usr/bin/env bash
# Archive and export the iOS Safari host app (NunusHostIOS) for App Store Connect.
# Prints the exported .ipa path on the last line (mirrors build-safari-mac.sh).
#
# Signing is fully headless: the iOS Release configs use Manual signing with an
# "Apple Distribution" identity + explicit App Store provisioning profiles. The
# identity lives in a dedicated keychain (created here, self-passworded) so we
# never prompt the login keychain. If the .p12 signing asset is missing (e.g. a
# fresh checkout), we fall back to Automatic signing via -allowProvisioningUpdates.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=lib/load-release-env.sh
source "$SCRIPT_DIR/lib/load-release-env.sh"
# shellcheck source=lib/signing-keychain.sh
source "$SCRIPT_DIR/lib/signing-keychain.sh"

SAFARI_DIR="$ROOT/safari"
PROJECT="$SAFARI_DIR/NunusSafari.xcodeproj"
SCHEME="NunusHostIOS"
BUILD_DIR="$SAFARI_DIR/build"
ARCHIVE_PATH="$BUILD_DIR/NunusHostIOS.xcarchive"
EXPORT_DIR="$BUILD_DIR/export-ios"
EXPORT_PLIST="$BUILD_DIR/ExportOptions-ios.plist"

# --- signing configuration (overridable via env / release.env) ---
IOS_SIGN_IDENTITY="${IOS_SIGN_IDENTITY:-Apple Distribution}"
IOS_HOST_PROFILE="${IOS_HOST_PROFILE:-Nunus iOS App Store}"
IOS_EXT_PROFILE="${IOS_EXT_PROFILE:-Nunus iOS Extension App Store}"
IOS_HOST_BUNDLE="${IOS_BUNDLE_ID:-com.acypher.nunus.ios}"
IOS_EXT_BUNDLE="${IOS_EXT_BUNDLE_ID:-${IOS_HOST_BUNDLE}.extension}"

if [[ -z "${APPLE_TEAM_ID:-}" ]]; then
  echo "error: APPLE_TEAM_ID is required (set in scripts/release.env)" >&2
  exit 1
fi

mkdir -p "$BUILD_DIR"
NUNUS_SIGN_ROOT="$ROOT"
NUNUS_SIGN_BUILD_DIR="$BUILD_DIR"
NUNUS_SIGN_IDENTITY="$IOS_SIGN_IDENTITY"
NUNUS_SIGN_KEYCHAIN="${IOS_SIGN_KEYCHAIN:-$BUILD_DIR/nunus-ios-signing.keychain-db}"

SIGN_MODE="manual"
if ! setup_signing_keychain; then
  echo "note: signing .p12 not found ($NUNUS_SIGN_P12); falling back to Automatic signing." >&2
  SIGN_MODE="auto"
  NUNUS_CODE_SIGN_FLAGS=""
fi

if [[ "$SIGN_MODE" == "manual" ]]; then
  cat >"$EXPORT_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>method</key>
	<string>app-store-connect</string>
	<key>destination</key>
	<string>export</string>
	<key>teamID</key>
	<string>${APPLE_TEAM_ID}</string>
	<key>uploadSymbols</key>
	<true/>
	<key>signingStyle</key>
	<string>manual</string>
	<key>signingCertificate</key>
	<string>${IOS_SIGN_IDENTITY}</string>
	<key>provisioningProfiles</key>
	<dict>
		<key>${IOS_HOST_BUNDLE}</key>
		<string>${IOS_HOST_PROFILE}</string>
		<key>${IOS_EXT_BUNDLE}</key>
		<string>${IOS_EXT_PROFILE}</string>
	</dict>
</dict>
</plist>
EOF

  echo "Archiving $SCHEME (Release, manual signing) for iOS..."
  (
    _nunus_sign_defaults
    save_user_keychains
    trap restore_user_keychains EXIT
    security list-keychains -d user -s "$NUNUS_SIGN_KEYCHAIN"

    xcodebuild \
      -project "$PROJECT" \
      -scheme "$SCHEME" \
      -configuration Release \
      -sdk iphoneos \
      -destination "generic/platform=iOS" \
      -archivePath "$ARCHIVE_PATH" \
      archive \
      OTHER_CODE_SIGN_FLAGS="$NUNUS_CODE_SIGN_FLAGS"

    echo "Exporting App Store package (manual)..."
    rm -rf "$EXPORT_DIR"
    xcodebuild \
      -exportArchive \
      -archivePath "$ARCHIVE_PATH" \
      -exportPath "$EXPORT_DIR" \
      -exportOptionsPlist "$EXPORT_PLIST"
  )
else
  cat >"$EXPORT_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>method</key>
	<string>app-store-connect</string>
	<key>destination</key>
	<string>export</string>
	<key>teamID</key>
	<string>${APPLE_TEAM_ID}</string>
	<key>uploadSymbols</key>
	<true/>
</dict>
</plist>
EOF

  echo "Archiving $SCHEME (Release, automatic signing) for iOS..."
  xcodebuild \
    -project "$PROJECT" \
    -scheme "$SCHEME" \
    -configuration Release \
    -sdk iphoneos \
    -destination "generic/platform=iOS" \
    -archivePath "$ARCHIVE_PATH" \
    archive \
    DEVELOPMENT_TEAM="$APPLE_TEAM_ID" \
    CODE_SIGN_STYLE=Automatic \
    -allowProvisioningUpdates

  echo "Exporting App Store package (automatic)..."
  rm -rf "$EXPORT_DIR"
  xcodebuild \
    -exportArchive \
    -archivePath "$ARCHIVE_PATH" \
    -exportPath "$EXPORT_DIR" \
    -exportOptionsPlist "$EXPORT_PLIST" \
    -allowProvisioningUpdates
fi

ipa="$(find "$EXPORT_DIR" -maxdepth 1 -name '*.ipa' | head -1)"
if [[ -z "$ipa" ]]; then
  echo "error: no .ipa found under $EXPORT_DIR" >&2
  exit 1
fi

echo "Exported: $ipa"
echo "$ipa"
