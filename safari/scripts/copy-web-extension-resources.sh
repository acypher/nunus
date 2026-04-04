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
# macOS .appex: web assets MUST be under Contents/Resources/. Copying into the
# bundle root causes: codesign "unsealed contents present in the bundle root".
OUT="${WRAPPER}/Contents/Resources"
mkdir -p "${OUT}"
for f in manifest.json popup.html popup.js core.js content.js background.js ext-chrome-shim.js; do
  cp "${WEBROOT}/${f}" "${OUT}/"
done
mkdir -p "${OUT}/icons" "${OUT}/sites"
rsync -a "${WEBROOT}/icons/" "${OUT}/icons/"
rsync -a "${WEBROOT}/sites/" "${OUT}/sites/"
