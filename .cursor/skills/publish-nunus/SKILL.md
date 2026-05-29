---
name: publish-nunus
description: >-
  Build and publish Nunus to Chrome Web Store, Firefox AMO, and Mac App Store
  (Safari). Use when the user says Publish Nunus, publish nunus, publish to
  stores, ship to Chrome/Firefox/Safari, or run a store release.
---

# Publish Nunus

End-to-end store publish for the browser extension in this repo.

## Two modes

| User intent | Script |
|-------------|--------|
| **Publish Nunus** / publish current version to stores | `./scripts/publish-stores.sh` |
| **New release** (bump version + git tag + publish) | `./scripts/release.sh "summary"` |

Default to **publish-stores** when the user says "Publish Nunus" and does not ask for a version bump.

Use **release.sh** when they want to ship **new** changes: uncommitted work should be committed first, or they provide a release summary for a version bump.

## Before publishing

1. Run from the **NunusCursor repo root** (this workspace).
2. Confirm `manifest.json` version is what they intend to ship.
3. Check credentials:

```bash
./scripts/check-release-credentials.sh
```

If missing, tell the user to copy `scripts/release.env.example` → `scripts/release.env` and fill in values (see README **Release automation** table). Do not commit `release.env`.

4. Optional dry run:

```bash
./scripts/publish-stores.sh --dry-run
```

## Publish current version (usual)

```bash
./scripts/publish-stores.sh
```

This builds `../nunus-<version>.zip`, `../nunus-<version>.xpi`, the Safari macOS archive, then uploads to:

- Chrome Web Store (`publish-chrome.py`)
- Firefox AMO (`publish-firefox.sh` / web-ext)
- App Store Connect (`publish-safari-mac.sh`)

**Safari** requires manual review in App Store Connect after upload before it goes live.

## Full release (bump + git + publish)

When the user wants a **new version** committed and tagged:

```bash
./scripts/release.sh "short summary of this release"
```

Requires a **clean** git tree. Adds `--major` or `--version X.Y.Z` when they specify.

`release.sh` runs `version-commit.sh --package` (bump, commit, tag, push, zip/xpi) then `publish-stores.sh`.

## Build only (no upload)

```bash
./scripts/publish-stores.sh --build-only
```

Or `./scripts/release.sh --skip-publish "summary"` for bump + artifacts without stores.

## On failure

- If credentials check fails: list missing vars from script output; artifacts may still be built.
- If one store fails: report which step failed; do not claim all three succeeded.
- Re-run `./scripts/publish-stores.sh` after fixing credentials (safe to rebuild same version).

## Do not confuse with

- **`/version`** or `version-commit.sh` — GitHub + zip/xpi only, **no** store upload.
- **Unpacked load** — local dev; not a store publish.

## After success

Report:

- Version from `manifest.json`
- Paths to zip/xpi if built
- That Chrome/Firefox uploads are submitted; Safari needs App Store Connect review
