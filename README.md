# Nunus

A Chrome extension that grays out news articles you've already viewed on the home pages of supported news sites.

**Supported News sites:** New York Times, Washington Post, The Guardian, The Epoch Times

**"Viewed"** means at least 20 pixels of the article headline (width and height) were on screen for at least 3 seconds in a previous session.

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the Nunus folder

## How it works

- If the **same headline** appears in more than one place on the page, after you read it **this tab session** only **one** of those cards stays ungrayed; the other placements are grayed as duplicates.
- On a supported **homepage**, **Option (⌥) + ↓** scrolls down at least one screen and lands on the next **non-gray** article with its top aligned to the top of the viewport (skipping long runs of already-viewed cards).
- When you visit a supported homepage, articles you've viewed before appear grayed out (reduced opacity + grayscale)
- As you scroll, any article whose headline has at least 20×20px in view for 3+ seconds is marked as viewed and saved
- Viewed state persists across browser sessions via Chrome's local storage

## Versioning

Uses [Semantic Versioning](https://semver.org/) (MAJOR.MINOR.PATCH):

- **MAJOR**: Breaking changes (removed sites, incompatible storage format)
- **MINOR**: New features (new sites, new behavior)
- **PATCH**: Bug fixes, small improvements

Increment the version in `manifest.json` when making changes.

## Project structure

- `core.js` - Shared logic (storage, visibility tracking, styling)
- `content.js` - Entry point; dispatches to site handlers
- `sites/nyt.js` - New York Times
- `sites/washingtonpost.js` - Washington Post
- `sites/guardian.js` - The Guardian
- `sites/epochtimes.js` - The Epoch Times

To add a new site, create `sites/newsite.js` following the pattern of existing handlers, register it in `content.js` and `manifest.json`, and add the site's `findArticles` and `isHomepage` functions.

## Permissions

- **storage**: Used to remember which articles you've viewed across sessions
