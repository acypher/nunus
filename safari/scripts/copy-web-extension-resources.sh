#!/bin/sh
# Copy shared web-extension assets from the Nunus git repo into the built .appex.
#
# Xcode: add a "Run Script" build phase on the Safari Web Extension target, placed
# before "Copy Bundle Resources". Example:
#   export NUNUS_WEBROOT="/absolute/path/to/NunusCursor"
#   /bin/sh "$PROJECT_DIR/relative/path/to/copy-web-extension-resources.sh"
# If this .xcodeproj lives in NunusCursor/safari/, you can omit NUNUS_WEBROOT
# (defaults to PROJECT_DIR/.. = repo root).
set -eu
WEBROOT="${NUNUS_WEBROOT:-${PROJECT_DIR}/..}"
WRAPPER="${BUILT_PRODUCTS_DIR}/${WRAPPER_NAME}"
# macOS .appex: Contents/Resources only. iOS .appex: Resources/ only — never the .appex
# root, or codesign fails ("unsealed contents present in the bundle root").
case "${PLATFORM_NAME:-}" in
  macosx) OUT="${WRAPPER}/Contents/Resources" ;;
  *)      OUT="${WRAPPER}/Resources" ;;
esac
if [ "${PLATFORM_NAME:-}" != "macosx" ]; then
  rm -rf "${WRAPPER}/Contents" 2>/dev/null || true
  for f in manifest.json popup.html popup.js core.js content.js background.js ext-chrome-shim.js; do
    rm -f "${WRAPPER}/${f}"
  done
  rm -rf "${WRAPPER}/icons" "${WRAPPER}/sites"
fi
mkdir -p "${OUT}"
for f in manifest.json popup.html popup.js core.js content.js background.js ext-chrome-shim.js; do
  cp "${WEBROOT}/${f}" "${OUT}/"
done
mkdir -p "${OUT}/icons" "${OUT}/sites"
rsync -a "${WEBROOT}/icons/" "${OUT}/icons/"
rsync -a "${WEBROOT}/sites/" "${OUT}/sites/"
