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

## Before publish

Do **not** run `./scripts/publish-stores.sh` until these pass:

1. Run from the **NunusCursor repo root** (this workspace).
2. Confirm `manifest.json` version is what they intend to ship.
3. Credentials configured:

```bash
./scripts/check-release-credentials.sh
```

If missing, tell the user to copy `scripts/release.env.example` → `scripts/release.env` and fill in values (see README **Release automation** table). Do not commit `release.env`.

4. **No pending submissions** on any store:

```bash
./scripts/check-store-pending.sh
```

**Stop if exit code is non-zero.** Interpret the summary:

| Result | Meaning |
|--------|---------|
| **READY** | Safe to run publish (nothing in review / processing). |
| **PENDING** | A store still has a submission in flight — wait or skip that store. |
| **CHECK** (Chrome) | Set `CHROME_PUBLISHER_ID` in `release.env` (Chrome Developer Dashboard → Publisher → Settings), or confirm manually in the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole). Do not publish Chrome if the item is **In review**. |

Optional dry run after the checks pass:

```bash
./scripts/publish-stores.sh --dry-run
```

`publish-stores.sh` also runs the credential and pending checks automatically before uploading; running them first avoids a long build when a store is not ready.

## Publish current version (usual)

```bash
./scripts/publish-stores.sh
```

This builds `../nunus-<version>.zip`, `../nunus-<version>.xpi`, the Safari macOS archive, then uploads to:

- Chrome Web Store (`publish-chrome.py`)
- Firefox AMO (`publish-firefox.sh` / web-ext)
- App Store Connect (`publish-safari-mac.sh` upload + `submit-safari-appstore.sh` submit for review)

When App Store Connect API credentials are configured, **Safari submit-for-review is automated** after upload (waits for build processing, creates/reuses the App Store version, attaches the build, sets What's New, submits via `reviewSubmissions` API). Set `APP_STORE_SKIP_SUBMIT=1` to upload only.

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
- Chrome and Firefox: submitted for store review — monitor dashboards
- Safari: upload + **submit for App Review via API** — monitor [App Store Connect](https://appstoreconnect.apple.com/); fix in ASC if submit fails (export compliance, missing metadata)
- **Daily publish-check** armed automatically (see below)

### Manual steps after publish (tell the user)

| Store | Automated | User still does |
|-------|-----------|-----------------|
| **Chrome** | Upload zip + submit review via API | Monitor [Developer Dashboard](https://chrome.google.com/webstore/devconsole); fix and re-publish if rejected |
| **Firefox** | `web-ext sign` submits listed build to AMO | Monitor [Developer Hub](https://addons.mozilla.org/developers/); fix and re-run `publish-firefox.sh` if rejected |
| **Safari** | Upload `.pkg`, wait for build, attach version, submit for review via API | Monitor App Store Connect; complete any ASC warnings the API cannot set (export compliance, listing gaps); re-run `./scripts/submit-safari-appstore.sh --skip-wait` if upload succeeded but submit failed |

Optional What's New text: set `APP_STORE_WHATS_NEW` or `docs/app-store-whats-new.txt` in `release.env` / repo.

Re-run `./scripts/check-store-pending.sh` after publish; expect **PENDING** on all three while reviews are in progress.

## Daily publish-check until live (automatic)

Every successful `./scripts/publish-stores.sh` (not `--build-only` or `--dry-run`) concludes by arming a **daily local check** via macOS `launchd`:

```bash
./scripts/setup-publish-check-daily.sh --version <published-version>
```

`publish-stores.sh` runs this automatically unless `PUBLISH_CHECK_SKIP_DAILY=1`.

### What the daily job does

Once per day (default **09:00** local; override with `PUBLISH_CHECK_DAILY_HOUR` / `PUBLISH_CHECK_DAILY_MINUTE` in `release.env`):

1. Run the same logic as **publishCheck** (`check_store_live.py`) for the **published version** stored in `scripts/.publish-check-watch.json`.
2. If Safari is **PENDING_DEVELOPER_RELEASE** (approved, not released), automatically release it via App Store Connect API (unless `APP_STORE_AUTO_RELEASE=0`).
3. If **not** live on all three stores: **do nothing** (silent; logged to `scripts/logs/publish-check-watch.log`).
4. When **live on all three**: send email to **`code@acypher.com`** (override with `PUBLISH_CHECK_NOTIFY_EMAIL`) with subject `Nunus version x.y.z is now Live on all stores`, then **stop** the daily schedule and remove the launch agent.

### Email configuration

Set SMTP in `scripts/release.env` (see `release.env.example`). Without SMTP, the script falls back to macOS `/usr/bin/mail` if configured.

### Manual controls

```bash
./scripts/setup-publish-check-daily.sh --status
./scripts/setup-publish-check-daily.sh --stop
./scripts/run-publish-check-watch.sh   # one check now (same as launchd)
```

For an immediate manual check without affecting the schedule, use `./scripts/check-store-live.sh --version X.Y.Z`.

See **publish-check** skill for interpreting live/pending states.
