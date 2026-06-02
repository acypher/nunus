# Publish Nunus to all stores

Build and upload the current `manifest.json` version to **Chrome Web Store**, **Firefox AMO**, and **Mac App Store** (Safari).

Read and follow **`.cursor/skills/publish-nunus/SKILL.md`** completely.

## Before publish

Run these from the repo root **before** `./scripts/publish-stores.sh`:

```bash
./scripts/check-release-credentials.sh
./scripts/check-store-pending.sh
```

- **Credentials check** must pass (`scripts/release.env` filled in).
- **Pending check** must exit **0 (READY)**. If any store is **PENDING** or Chrome shows **CHECK**, stop and explain — do not publish until clear (or publish only the stores that are ready, if the user asks).

`CHROME_PUBLISHER_ID` in `release.env` (Chrome Developer Dashboard → Publisher → Settings) enables automatic Chrome review detection.

## What to do

1. If the user did not say whether they want a **new version bump**, assume **publish current version** (`./scripts/publish-stores.sh`).
2. If they want to ship **new uncommitted changes** or asked for a **version bump**, use `./scripts/release.sh "summary"` instead (requires clean tree + release summary).
3. Run the **Before publish** checks above. If either fails, stop.
4. Run `./scripts/publish-stores.sh` (or `--dry-run` if they asked to preview).
5. Report version, artifact paths, and note that Safari submit-for-review is attempted automatically after upload (monitor App Store Connect if it fails).
6. Confirm that **daily publish-check** was armed for the published version (unless `PUBLISH_CHECK_SKIP_DAILY=1`). It emails `code@acypher.com` when all three stores are live, then stops.

Do **not** run `version-commit.sh` alone unless they only want GitHub/zip (that is **`/version`**, not publish).
