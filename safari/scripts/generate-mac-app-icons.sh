#!/bin/sh
# Regenerate Mac host AppIcon:
#   - PNGs under Host/Assets.xcassets/AppIcon.appiconset (Xcode asset catalog)
#   - Host/AppIcon.icns (iconutil bundle; includes 512pt @2x = 1024×1024)
# Requires macOS `sips` and `iconutil`.
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/safari/Host/Assets.xcassets/AppIcon.appiconset"
ICNS_OUT="$ROOT/safari/Host/AppIcon.icns"

if [ -f "$ROOT/icons/letterNu1024.png" ]; then
  SRC="$ROOT/icons/letterNu1024.png"
elif [ -f "$ROOT/icons/letterNu128.png" ]; then
  SRC="$ROOT/icons/letterNu128.png"
else
  echo "Missing source icon: need icons/letterNu1024.png or icons/letterNu128.png" >&2
  exit 1
fi

mkdir -p "$OUT"
gen() {
  sips -z "$2" "$2" "$SRC" --out "$OUT/$1" >/dev/null
}

# Names expected by AppIcon.appiconset/Contents.json
gen mac16.png 16
gen mac16@2x.png 32
gen mac32.png 32
gen mac32@2x.png 64
gen mac128.png 128
gen mac128@2x.png 256
gen mac256.png 256
gen mac256@2x.png 512
gen mac512.png 512
gen mac512@2x.png 1024

echo "Wrote Mac AppIcon PNGs in $OUT"

# iconutil requires a folder whose name ends in .iconset and specific filenames.
BASE="$(mktemp -d "${TMPDIR:-/tmp}/nunus-appicon.XXXXXX")"
mv "$BASE" "${BASE}.iconset"
ICONSET="${BASE}.iconset"
cleanup() {
  rm -rf "$ICONSET"
}
trap cleanup EXIT

igen() {
  sips -z "$2" "$2" "$SRC" --out "$ICONSET/$1" >/dev/null
}

igen icon_16x16.png 16
igen icon_16x16@2x.png 32
igen icon_32x32.png 32
igen icon_32x32@2x.png 64
igen icon_128x128.png 128
igen icon_128x128@2x.png 256
igen icon_256x256.png 256
igen icon_256x256@2x.png 512
igen icon_512x512.png 512
igen icon_512x512@2x.png 1024

iconutil -c icns "$ICONSET" -o "$ICNS_OUT"
echo "Wrote $ICNS_OUT (includes 512×512 @2x)"
