# Nunus  

**Nunus for NYTimes and Google News Browser Extension**  

Nunus helps you find what’s new on the New York Times front page and on Google News since you last checked.  

**What it does**  

When you revisit the NYTimes front page, Nunus automatically grays out any article titles you have already seen on the front page, so new stories stand out immediately.  

On **Google News**, Nunus works at the story-cluster level: it grays out whole story clusters (the Google-generated cluster headline) you have already seen, and ignores the individual per-publisher sub-listings within a cluster.  

**How “already seen” is defined**  

An article title is considered "Seen" if that part of the front page has appeared on your screen for a few seconds. It is not about clicking to open the article's full page.   

**Keyboard shortcut**

Press Option + ↓ (Mac) to jump straight to the next unseen title on the page.

**Typical use case**

You read the Times over breakfast. As a news junkie, you check back in the afternoon. Most of the stories are the same — but several new ones have been added during the day. With Nunus, everything you have already seen is grayed out, so the new stories are immediately visible without any scanning.  
This is especially useful on the weekend, when the Times frequently recycles articles from earlier in the week or even from previous weeks. Nunus grays those out, so you only spend time on what is actually new to you.  The Times sometimes tweaks the title of an article, but as long as it links to the same article, that counts as having been seen.

## Installation

Install **Nunus** from the official extension listings (normal “add extension” flow —- no unpacked load or zip install).

- **Chrome** (and other browsers that install from the Chrome Web Store): **[Chrome Web Store](https://chromewebstore.google.com/)** — open the **Nunus** product page and choose **Add to Chrome**.
- **Firefox**: **[Firefox Browser Add-ons](https://addons.mozilla.org/firefox/)** — open the **Nunus** product page and choose **Add to Firefox**.

**Firefox 128+** is required (`strict_min_version` in `manifest.json`).

**Safari (your own Xcode build):** After you create the Safari Web Extension target, hook in [`safari/scripts/copy-web-extension-resources.sh`](safari/scripts/copy-web-extension-resources.sh) as described in [`safari/README.md`](safari/README.md) so the `.appex` loads the same files as the repo root.

## Versioning

Uses [Semantic Versioning](https://semver.org/) (MAJOR.MINOR.PATCH):

- **MAJOR**: A newly supported publication (e.g. adding The Guardian when Nunus was NYTimes-only), or breaking changes (removed sites, incompatible storage format)
- **MINOR**: Improvements within publications already shipped (e.g. better detection, new behavior on NYTimes)
- **PATCH**: Bug fixes and small polish

Use `./scripts/release.sh --major "…"` when enabling a new publication in `manifest.json`. The default release bump is **minor** (NYTimes-only improvements).

## Packaging (Chrome + Firefox)

- **`scripts/newnunus.sh`** — reads `manifest.json` **version**, writes **`../nunus-<version>.zip`** (Chrome Web Store–style) and **`../nunus-<version>.xpi`** (Firefox; runs the same checks as `build-nunus-firefox-xpi.sh`). From your shell:  
  `newnunus() { /path/to/NunusCursor/scripts/newnunus.sh "$@"; }`
- **`scripts/build-nunus-firefox-xpi.sh`** — Firefox **only**; default output **`../nunus.xpi`** (override with **`NUNUS_XPI`**).

Both artifacts exclude `safari/`, `samples/`, `.git`, IDE folders, `scripts/*`, and `*.iml`.

## Release automation

### Version commit to GitHub (usual step)

```bash
./scripts/version-commit.sh --package "short summary of this release"
```

Or in Cursor chat: **`/version`** then your summary.

This bumps the version (minor by default), commits, tags `vX.Y.Z`, pushes to GitHub, and writes **`../nunus-X.Y.Z.zip`** and **`.xpi`**. From a **`cursor/*` branch**, it merges into **`main`** and pushes `main` + the tag. No Safari build or store uploads.

### Publish to all stores

In Cursor chat: **`/publish`** or say **Publish Nunus**.

**Before publish** (required):

```bash
./scripts/check-release-credentials.sh
./scripts/check-store-pending.sh
```

Both must pass. The pending check exits **0 (READY)** only when Chrome, Firefox, and Safari have no submission in review or processing. Set `CHROME_PUBLISHER_ID` in `scripts/release.env` for automatic Chrome review detection (Chrome Developer Dashboard → Publisher → Settings).

Then:

```bash
./scripts/publish-stores.sh
```

Uploads the **current** `manifest.json` version to Chrome, Firefox, and Safari (Mac App Store). No version bump. See `.cursor/skills/publish-nunus/SKILL.md`.

**After publish:** Chrome and Firefox are submitted for review automatically. **Safari** upload and submit-for-review run via App Store Connect API (`submit-safari-appstore.sh` after upload). Monitor App Store Connect if submit fails (metadata/export compliance).

Options: `--build-only`, `--dry-run`

Options: `--major`, `--version X.Y.Z`, `--dry-run`, `--skip-push` (omit `--package` for git-only)

### Full release (build + store publish)

```bash
cp scripts/release.env.example scripts/release.env
./scripts/check-release-credentials.sh
./scripts/release.sh "short summary of this release"
```

`release.sh` runs `version-commit.sh --package`, then builds Safari and publishes when credentials are configured.

Options:

- `--major` — new publication or breaking change (`1.6.1` → `2.0.0`)
- `--version X.Y.Z` — set an explicit version
- `--dry-run` — preview the bump without changing files
- `--skip-push` — commit and tag locally only
- `--skip-publish` — stop after building zip/xpi/Safari pkg

Each release also increments Apple `CURRENT_PROJECT_VERSION` in the Safari Xcode project (all targets stay in sync).

**Credentials** live in `scripts/release.env` (gitignored). See `scripts/release.env.example`.

| Store | What to set | Where to get it |
|---|---|---|
| Chrome | `CHROME_EXTENSION_ID`, OAuth client + refresh token | [Chrome Web Store API](https://developer.chrome.com/docs/webstore/using-api) — enable API in Google Cloud, OAuth consent, one-time auth for refresh token |
| Firefox | `AMO_JWT_ISSUER`, `AMO_JWT_SECRET` | [addons.mozilla.org/developers](https://addons.mozilla.org/developers/) → Tools → Manage API Keys |
| Safari (Mac) | `APPLE_TEAM_ID` + App Store Connect API key **or** `APPLE_ID` + app-specific password | [developer.apple.com/account](https://developer.apple.com/account) — Team ID; API keys under Users and Access → Keys |

Check readiness: `./scripts/check-release-credentials.sh`

Before publishing: `./scripts/check-store-pending.sh` (must exit 0). See **Publish to all stores** above.

**Safari** builds the macOS `NunusHost` scheme only (not iOS). After upload, finish review in App Store Connect.

## Project structure

- `core.js` - Shared logic (storage, visibility tracking, styling)
- `content.js` - Entry point; dispatches to site handlers
- `sites/nyt.js` - New York Times (shipped in `manifest.json`)
- `sites/googlenews.js` - Google News (shipped in `manifest.json`)
- `sites/guardian.js` - The Guardian (theguardian.com edition fronts; shipped in `manifest.json`)
- `sites/washingtonpost.js` - work-in-progress handler (not in the current manifest)

To ship a new publication, create or finish `sites/newsite.js`, register it in `content.js` and `manifest.json` (host permissions, content script matches, and script list), and release with **`--major`**.

## Permissions

See `manifest.json` for the full list (e.g. **storage**, **activeTab**, **scripting**, and site-specific **host permissions**). In short: remembered titles and popup features use **storage**; the extension only injects on the declared homepage URL patterns.
