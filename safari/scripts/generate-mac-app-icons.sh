#!/bin/sh
# Regenerate AppIcon asset catalog (Mac + iOS) and Mac AppIcon.icns.
#   - PNGs under Host/Assets.xcassets/AppIcon.appiconset
#   - Host/AppIcon.icns (Mac host; iconutil)
# Run before archiving the iOS app so NunusHostIOS includes iPhone/iPad icons.
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

# macOS
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

# iOS — filenames must match Contents.json below
gen ios-iphone-20@2x.png 40
gen ios-iphone-20@3x.png 60
gen ios-iphone-29@2x.png 58
gen ios-iphone-29@3x.png 87
gen ios-iphone-40@2x.png 80
gen ios-iphone-40@3x.png 120
gen ios-iphone-60@2x.png 120
gen ios-iphone-60@3x.png 180
gen ios-ipad-20@1x.png 20
gen ios-ipad-20@2x.png 40
gen ios-ipad-29@1x.png 29
gen ios-ipad-29@2x.png 58
gen ios-ipad-40@1x.png 40
gen ios-ipad-40@2x.png 80
gen ios-ipad-76@1x.png 76
gen ios-ipad-76@2x.png 152
gen ios-ipad-83.5@2x.png 167
gen ios-marketing-1024.png 1024

echo "Wrote Mac + iOS AppIcon PNGs in $OUT"

# iconutil — Mac .icns only
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

cat > "$OUT/Contents.json" <<'JSON'
{
  "images" : [
    {
      "filename" : "mac16.png",
      "idiom" : "mac",
      "scale" : "1x",
      "size" : "16x16"
    },
    {
      "filename" : "mac16@2x.png",
      "idiom" : "mac",
      "scale" : "2x",
      "size" : "16x16"
    },
    {
      "filename" : "mac32.png",
      "idiom" : "mac",
      "scale" : "1x",
      "size" : "32x32"
    },
    {
      "filename" : "mac32@2x.png",
      "idiom" : "mac",
      "scale" : "2x",
      "size" : "32x32"
    },
    {
      "filename" : "mac128.png",
      "idiom" : "mac",
      "scale" : "1x",
      "size" : "128x128"
    },
    {
      "filename" : "mac128@2x.png",
      "idiom" : "mac",
      "scale" : "2x",
      "size" : "128x128"
    },
    {
      "filename" : "mac256.png",
      "idiom" : "mac",
      "scale" : "1x",
      "size" : "256x256"
    },
    {
      "filename" : "mac256@2x.png",
      "idiom" : "mac",
      "scale" : "2x",
      "size" : "256x256"
    },
    {
      "filename" : "mac512.png",
      "idiom" : "mac",
      "scale" : "1x",
      "size" : "512x512"
    },
    {
      "filename" : "mac512@2x.png",
      "idiom" : "mac",
      "scale" : "2x",
      "size" : "512x512"
    },
    {
      "filename" : "ios-iphone-20@2x.png",
      "idiom" : "iphone",
      "scale" : "2x",
      "size" : "20x20"
    },
    {
      "filename" : "ios-iphone-20@3x.png",
      "idiom" : "iphone",
      "scale" : "3x",
      "size" : "20x20"
    },
    {
      "filename" : "ios-iphone-29@2x.png",
      "idiom" : "iphone",
      "scale" : "2x",
      "size" : "29x29"
    },
    {
      "filename" : "ios-iphone-29@3x.png",
      "idiom" : "iphone",
      "scale" : "3x",
      "size" : "29x29"
    },
    {
      "filename" : "ios-iphone-40@2x.png",
      "idiom" : "iphone",
      "scale" : "2x",
      "size" : "40x40"
    },
    {
      "filename" : "ios-iphone-40@3x.png",
      "idiom" : "iphone",
      "scale" : "3x",
      "size" : "40x40"
    },
    {
      "filename" : "ios-iphone-60@2x.png",
      "idiom" : "iphone",
      "scale" : "2x",
      "size" : "60x60"
    },
    {
      "filename" : "ios-iphone-60@3x.png",
      "idiom" : "iphone",
      "scale" : "3x",
      "size" : "60x60"
    },
    {
      "filename" : "ios-ipad-20@1x.png",
      "idiom" : "ipad",
      "scale" : "1x",
      "size" : "20x20"
    },
    {
      "filename" : "ios-ipad-20@2x.png",
      "idiom" : "ipad",
      "scale" : "2x",
      "size" : "20x20"
    },
    {
      "filename" : "ios-ipad-29@1x.png",
      "idiom" : "ipad",
      "scale" : "1x",
      "size" : "29x29"
    },
    {
      "filename" : "ios-ipad-29@2x.png",
      "idiom" : "ipad",
      "scale" : "2x",
      "size" : "29x29"
    },
    {
      "filename" : "ios-ipad-40@1x.png",
      "idiom" : "ipad",
      "scale" : "1x",
      "size" : "40x40"
    },
    {
      "filename" : "ios-ipad-40@2x.png",
      "idiom" : "ipad",
      "scale" : "2x",
      "size" : "40x40"
    },
    {
      "filename" : "ios-ipad-76@1x.png",
      "idiom" : "ipad",
      "scale" : "1x",
      "size" : "76x76"
    },
    {
      "filename" : "ios-ipad-76@2x.png",
      "idiom" : "ipad",
      "scale" : "2x",
      "size" : "76x76"
    },
    {
      "filename" : "ios-ipad-83.5@2x.png",
      "idiom" : "ipad",
      "scale" : "2x",
      "size" : "83.5x83.5"
    },
    {
      "filename" : "ios-marketing-1024.png",
      "idiom" : "ios-marketing",
      "scale" : "1x",
      "size" : "1024x1024"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
JSON

echo "Wrote merged AppIcon Contents.json (mac + iOS)"
