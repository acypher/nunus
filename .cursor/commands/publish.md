# Publish Nunus to all stores

Build and upload the current `manifest.json` version to **Chrome Web Store**, **Firefox AMO**, and **Mac App Store** (Safari).

Read and follow **`.cursor/skills/publish-nunus/SKILL.md`** completely.

## What to do

1. If the user did not say whether they want a **new version bump**, assume **publish current version** (`./scripts/publish-stores.sh`).
2. If they want to ship **new uncommitted changes** or asked for a **version bump**, use `./scripts/release.sh "summary"` instead (requires clean tree + release summary).
3. Run `./scripts/check-release-credentials.sh`. If it fails, stop and explain how to set up `scripts/release.env` (see README).
4. Run `./scripts/publish-stores.sh` (or `--dry-run` if they asked to preview).
5. Report version, artifact paths, and that Safari still needs App Store Connect review after upload.

Do **not** run `version-commit.sh` alone unless they only want GitHub/zip (that is **`/version`**, not publish).
