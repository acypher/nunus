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
# macOS .appex is a deep bundle: resources go under Contents/Resources.
# iOS .appex is a SHALLOW bundle: resources go at the bundle ROOT. Putting them in
# a Resources/ subfolder makes codesign reject the whole bundle with
# "bundle format unrecognized, invalid, or unsuitable" (a shallow bundle must not
# contain a Resources/ directory). This matches Xcode's own iOS Copy Bundle
# Resources behaviour, which writes to the appex root.
case "${PLATFORM_NAME:-}" in
  macosx) OUT="${WRAPPER}/Contents/Resources" ;;
  *)      OUT="${WRAPPER}" ;;
esac
if [ "${PLATFORM_NAME:-}" != "macosx" ]; then
  # Clean any stale layout from earlier builds (deep Contents/ or a Resources/ subfolder).
  rm -rf "${WRAPPER}/Contents" "${WRAPPER}/Resources" 2>/dev/null || true
fi
mkdir -p "${OUT}"
for f in manifest.json popup.html popup.js core.js content.js background.js ext-chrome-shim.js; do
  cp "${WEBROOT}/${f}" "${OUT}/"
done
mkdir -p "${OUT}/icons" "${OUT}/sites"
rsync -a --exclude ".DS_Store" "${WEBROOT}/icons/" "${OUT}/icons/"
rsync -a --exclude ".DS_Store" "${WEBROOT}/sites/" "${OUT}/sites/"
