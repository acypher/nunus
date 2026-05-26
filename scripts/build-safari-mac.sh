#!/usr/bin/env bash
# Archive and export the macOS Safari host app for App Store Connect.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=lib/load-release-env.sh
source "$SCRIPT_DIR/lib/load-release-env.sh"

SAFARI_DIR="$ROOT/safari"
PROJECT="$SAFARI_DIR/NunusSafari.xcodeproj"
SCHEME="NunusHost"
BUILD_DIR="$SAFARI_DIR/build"
ARCHIVE_PATH="$BUILD_DIR/NunusHost.xcarchive"
EXPORT_DIR="$BUILD_DIR/export"
EXPORT_PLIST="$BUILD_DIR/ExportOptions.plist"

if [[ -z "${APPLE_TEAM_ID:-}" ]]; then
  echo "error: APPLE_TEAM_ID is required (set in scripts/release.env)" >&2
  exit 1
fi

mkdir -p "$BUILD_DIR"

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

echo "Archiving $SCHEME (Release)..."
xcodebuild \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration Release \
  -archivePath "$ARCHIVE_PATH" \
  archive \
  DEVELOPMENT_TEAM="$APPLE_TEAM_ID" \
  CODE_SIGN_STYLE=Automatic

echo "Exporting App Store package..."
rm -rf "$EXPORT_DIR"
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist "$EXPORT_PLIST" \
  -allowProvisioningUpdates

pkg="$(find "$EXPORT_DIR" -maxdepth 1 -name '*.pkg' | head -1)"
if [[ -z "$pkg" ]]; then
  echo "error: no .pkg found under $EXPORT_DIR" >&2
  exit 1
fi

echo "Exported: $pkg"
echo "$pkg"
