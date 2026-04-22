# Safari (Xcode): macOS and iOS

The Chrome/Firefox extension lives at the **repo root** (`manifest.json`, `popup.html`, `core.js`, `sites/`, …). Each Safari **Web Extension** `.appex` must ship the same files inside its bundle. [`scripts/copy-web-extension-resources.sh`](scripts/copy-web-extension-resources.sh) copies them at build time.

This Xcode project has **four targets**:

| Platform | Host app | Extension `.appex` |
|----------|----------|----------------------|
| **macOS** | `NunusHost` | `Nunus Extension` |
| **iOS** | `NunusHostIOS` | `NunusExtensioniOS` |

**Deployment (see `project.pbxproj` / `gen_pbxproj.py`):** macOS **14.0+**, iOS **17.0+**. That matches `SafariWebExtensionHandler.swift`, which uses `SFExtensionProfileKey` (not available on older OS releases).

**End users:** The host app is only a shell; the extension runs in Safari. In-app copy matches [`Shared/NunusHostApp.swift`](Shared/NunusHostApp.swift): **Mac** — Safari → Settings → Extensions; **iPhone/iPad** — Settings → Apps → Safari → Extensions (wording may vary slightly by iOS version).

---

## 1. Run Script phase (each extension target)

Repeat for **both** `Nunus Extension` (Mac) and `NunusExtensioniOS` (iOS):

1. Open `safari/NunusSafari.xcodeproj`.
2. Select the **extension** target (the `.appex`, not the host app).
3. **Build Phases** → confirm a **Run Script** named like **Copy web extension resources** runs **before** **Copy Bundle Resources** (if present). The checked-in project already wires this; only add it in a fresh project.
4. **Turn off User Script Sandboxing** for that target (Xcode 15+ otherwise blocks `cp` into the `.appex`):
   - Extension target → **Build Settings** → **Enable User Script Sandboxing** → **No**,  
   - or disable sandboxing on the Run Script phase if Xcode offers it.
5. **Shell:** `/bin/sh`
6. **Script body** — use one of:

**A — Project lives in this repo** (`NunusCursor/safari/NunusSafari.xcodeproj`):

```sh
cd "$PROJECT_DIR" && /bin/sh ./scripts/copy-web-extension-resources.sh
```

**B — Project elsewhere:** set the repo root that contains `manifest.json`:

```sh
export NUNUS_WEBROOT="/Users/you/Projects/extensions/nunus/NunusCursor"
/bin/sh "${NUNUS_WEBROOT}/safari/scripts/copy-web-extension-resources.sh"
```

7. Remove template web files from **Copy Bundle Resources** on the extension target (`Main.html`, `Script.js`, extra `manifest.json`, etc.) so only the script supplies assets.
8. **Optional — “Run Script … does not specify any outputs”:** Uncheck **Based on dependency analysis** on the Run Script, or add **Output Files** such as `$(TARGET_BUILD_DIR)/$(UNLOCALIZED_RESOURCES_FOLDER_PATH)/manifest.json` if paths match your platform layout.

---

## 2. Where the script puts web assets

| Platform | Path inside the `.appex` |
|----------|---------------------------|
| **macOS** | `Contents/Resources/` |
| **iOS** | `Resources/` (not the `.appex` root) |

The script uses `PLATFORM_NAME` from Xcode. On iOS it also deletes stale copies of web files from the bundle root (and any old `Contents/` folder) so **codesign** does not fail with *unsealed contents present in the bundle root*.

---

## 3. Build and verify

### macOS

1. Scheme **NunusHost** → **Product → Build**.
2. In Report navigator, confirm the Run Script ran without errors.
3. Open the built **`Nunus Extension.appex`** → **`Contents/Resources`** and confirm `manifest.json`, `popup.html`, `core.js`, `ext-chrome-shim.js`, `icons/`, `sites/`, etc.

### iOS

1. Scheme **NunusHostIOS** → select a simulator or device → **Product → Build**.
2. Open **`NunusExtensioniOS.appex`** → **`Resources`** and confirm the same set of files (nothing duplicated at the `.appex` root).

You do not need `chmod +x` when invoking the script with `/bin/sh …/copy-web-extension-resources.sh`.

---

## 4. Regenerating `project.pbxproj`

The canonical generator is [`scripts/gen_pbxproj.py`](scripts/gen_pbxproj.py). From the **repo root**:

```sh
python3 safari/scripts/gen_pbxproj.py
```

Then re-open the project in Xcode if needed.

---

## Troubleshooting

### `cp: … Operation not permitted` / `Sandbox: … deny file-write-create`

**User Script Sandboxing** on the **extension** target. Set **Enable User Script Sandboxing** to **No** (see §1), then build again.

### `unsealed contents present in the bundle root` (codesign)

- **macOS:** Web assets must be only under **`Contents/Resources/`**, not the `.appex` root.
- **iOS:** Web assets must be only under **`Resources/`**. Files at the `.appex` root (or a stray **`Contents/`** tree) will trigger this; use the current copy script, **Clean Build Folder**, and rebuild.

### Mac App Store validation (`manifest.json` description / icon)

- **Safari Web Extension `description`:** Apple caps the root `manifest.json` **description** at **112 characters** (stricter than Chrome Web Store). Keep it short; use App Store Connect release notes for detail.
- **Mac host icon:** Requires a full **App Icon** set including **1024×1024** — run `sh safari/scripts/generate-mac-app-icons.sh` from `icons/letterNu1024.png`, with **`ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon`** on the **Mac host** target. See comments in `gen_pbxproj.py` / asset catalog.

### iOS: `ValidateEmbeddedBinary` / “Couldn't load Info dictionary”

If Xcode’s validator fails but `plutil` / `defaults read` on the `.appex/Info.plist` works, try **Clean Build Folder**, delete **Derived Data** for this project, or update Xcode — some toolchain betas have flaky `embeddedBinaryValidationUtility` behavior.
