# Nunus

**Nunus for NYTimes Browser Extension**

Nunus helps you find what’s new on the New York Times front page since you last checked.

**What it does**

When you revisit the NYTimes front page, Nunus automatically grays out any article titles you have already seen, so new stories stand out immediately.  
As an unrelated bonus, on **NYTimes** homepages it can stop videos from autoplaying.

**How “already seen” is defined**

A title counts as seen once at least 20 pixels of it were visible on your screen for 3 seconds in a previous session. If the same title appears more than once on the page, all later occurrences are grayed out automatically.

**Keyboard shortcut**

Press Option + ↓ (Mac) to jump straight to the next unseen title on the page.

**Typical use case**

You read the Times over breakfast. When you check back in the afternoon, most of the stories are the same — but several new ones have been added during the day. With Nunus, everything you have already seen is grayed out, so the new stories are immediately visible without any scanning.

Also useful on the weekend, when the Times frequently recycles articles from earlier in the week or even from previous weeks. Nunus grays those out too, so you only spend time on what is actually new to you.

## Installation

Install **Nunus** from the official extension listings (normal “add extension” flow—no unpacked load or zip install).

- **Chrome** (and other browsers that install from the Chrome Web Store): **[Chrome Web Store](https://chromewebstore.google.com/)** — open the **Nunus** product page and choose **Add to Chrome**.
- **Firefox**: **[Firefox Browser Add-ons](https://addons.mozilla.org/firefox/)** — open the **Nunus** product page and choose **Add to Firefox**.

**Firefox 128+** is required (`strict_min_version` in `manifest.json`).

**Safari (your own Xcode build):** After you create the Safari Web Extension target, hook in [`safari/scripts/copy-web-extension-resources.sh`](safari/scripts/copy-web-extension-resources.sh) as described in [`safari/README.md`](safari/README.md) so the `.appex` loads the same files as the repo root.

## Versioning

Uses [Semantic Versioning](https://semver.org/) (MAJOR.MINOR.PATCH):

- **MAJOR**: Breaking changes (removed sites, incompatible storage format)
- **MINOR**: New features (new sites, new behavior)
- **PATCH**: Bug fixes, small improvements

Increment the version in `manifest.json` when making changes.

## Project structure

- `core.js` - Shared logic (storage, visibility tracking, styling)
- `content.js` - Entry point; dispatches to site handlers
- `sites/nyt.js` - New York Times article detection / gray-out
- `sites/nyt-betamax-main.js` - NYT MAIN-world `play()` hook (Betamax, cinemagraph, VHS grid, Gallery carousel)
- `sites/nyt-videos.js` - NYT isolated-world video attribute / iframe tweaks
- `sites/washingtonpost.js` - Washington Post
- `sites/guardian.js` - The Guardian

To add a new site, create `sites/newsite.js` following the pattern of existing handlers, register it in `content.js` and `manifest.json`, and add the site's `findArticles` and `isHomepage` functions.

## Permissions

See `manifest.json` for the full list (e.g. **storage**, **activeTab**, **scripting**, and site-specific **host permissions**). In short: remembered titles and popup features use **storage**; the extension only injects on the declared homepage URL patterns.
