# Safari (Xcode) and `copy-web-extension-resources.sh`

The Chrome/Firefox extension files live at the **repo root** (`manifest.json`, `popup.html`, `core.js`, `sites/`, …). The Safari **Nunus Extension** `.appex` must contain the same files in its **Resources** folder. This script copies them at build time.

## 1. Add a Run Script phase (Nunus Extension target)

1. Open your Xcode project.
2. Select the **Nunus Extension** target (the `.appex`, not the host app).
3. **Build Phases** → **+** → **New Run Script Phase**.
4. Drag that phase **above** **Copy Bundle Resources** (or clear **Copy Bundle Resources** so only the script supplies web assets).
5. **Turn off User Script Sandboxing** for this target (Xcode 15+ blocks `cp` into the `.appex` otherwise):
   - Select the **Nunus Extension** target → **Build Settings** → search **user script** → set **Enable User Script Sandboxing** to **No**,  
   - *or* open the Run Script phase and disable sandboxing there if Xcode shows that option.
6. **Shell:** `/bin/sh`
7. **Script body** — pick **one** approach:

**A — Xcode project is inside this repo** (e.g. `NunusCursor/safari/NunusSafari.xcodeproj`):

```sh
/bin/sh "${PROJECT_DIR}/scripts/copy-web-extension-resources.sh"
```

**B — Xcode project lives somewhere else** (e.g. `~/Site/Nunus/`). Set the repo root explicitly:

```sh
export NUNUS_WEBROOT="/Users/you/Projects/extensions/nunus/NunusCursor"
/bin/sh "${NUNUS_WEBROOT}/safari/scripts/copy-web-extension-resources.sh"
```

Adjust `NUNUS_WEBROOT` to your real **NunusCursor** path (the folder that contains `manifest.json`).

8. Remove template files from **Copy Bundle Resources** on **Nunus Extension** (`Main.html`, `Script.js`, duplicate `manifest.json`, etc.) so you do not ship two different versions.

9. **Optional — silence "Run Script … does not specify any outputs":** Open the Run Script phase and **uncheck** **Based on dependency analysis** (Xcode 14+). That tells Xcode you intentionally run the copy step on every build, which is reasonable when syncing from git. Alternatively, add **Output Files** such as `$(TARGET_BUILD_DIR)/$(UNLOCALIZED_RESOURCES_FOLDER_PATH)/manifest.json` if you want dependency-based skipping (only helps if inputs/outputs are wired correctly).

## 2. Build and check

1. **Product → Build**.
2. In the Report navigator, confirm the Run Script ran without errors.
3. In **Derived Data** (or the built product), open **`Nunus Extension.appex`** → **`Contents/Resources`** and verify `manifest.json`, `popup.html`, `core.js`, `ext-chrome-shim.js`, `icons/`, `sites/`, etc.

You do not need `chmod +x` if the Run Script uses `/bin/sh …/copy-web-extension-resources.sh` as above.

## Troubleshooting

### `cp: … Operation not permitted` / `Sandbox: … deny file-write-create`

That is **User Script Sandboxing** in Xcode, not a problem with the shell script. Follow step 5 above (**Enable User Script Sandboxing** = **No** on the **Nunus Extension** target), then **Product → Build** again.

### `unsealed contents present in the bundle root` (CodeSign)

The copy script put **`manifest.json` (or other files) in the root of the `.appex`**. On macOS, web assets must live under **`Contents/Resources/`**. Use the current [`scripts/copy-web-extension-resources.sh`](scripts/copy-web-extension-resources.sh) from this repo (it always targets that folder), then **Clean Build Folder** and build again. Remove any stray files from the `.appex` root in Finder if an old build left them there.

### Mac App Store validation (`manifest.json` description / app icon)

- **Safari Web Extension `description`:** Apple requires the root `manifest.json` **description** to be **112 characters or fewer** (stricter than the Chrome Web Store). Keep the store-style blurb short; put release notes in App Store Connect instead.
- **Host app icon:** Mac App Store validation requires an icon in ICNS format with a 512pt @2x (1024x1024) image. The host target needs: (1) `Assets.xcassets/AppIcon.appiconset` populated with PNGs (16 through 1024px) — run `sh safari/scripts/generate-mac-app-icons.sh` to generate them from `icons/letterNu1024.png`; (2) `ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon` in the host target's Build Settings (`INFOPLIST_KEY_CFBundleIconFile` does **not** work — Xcode's generated-plist system ignores that legacy key); (3) `COMBINE_HIDPI_IMAGES = YES` (default for Mac targets). Optionally keep `AppIcon.icns` in Copy Bundle Resources as a fallback.
