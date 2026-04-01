#!/bin/sh
# Copy shared web-extension assets from repo root into the built .appex bundle.
set -eu
WEBROOT="${PROJECT_DIR}/.."
WRAPPER="${BUILT_PRODUCTS_DIR}/${WRAPPER_NAME}"
if [ -d "${WRAPPER}/Contents/Resources" ]; then
  OUT="${WRAPPER}/Contents/Resources"
elif [ -d "${WRAPPER}/Resources" ]; then
  OUT="${WRAPPER}/Resources"
else
  OUT="${WRAPPER}"
fi
mkdir -p "${OUT}"
for f in manifest.json popup.html popup.js core.js content.js background.js ext-chrome-shim.js; do
  cp "${WEBROOT}/${f}" "${OUT}/"
done
mkdir -p "${OUT}/icons" "${OUT}/sites"
rsync -a "${WEBROOT}/icons/" "${OUT}/icons/"
rsync -a "${WEBROOT}/sites/" "${OUT}/sites/"
