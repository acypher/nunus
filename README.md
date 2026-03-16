# Nunus

A Chrome extension that grays out news articles you've already viewed on the home pages of supported news sites.

**Supported News sites:** New York Times, Washington Post, The Guardian, The Epoch Times

**"Viewed"** means the top third of the article was visible on your screen for at least 3 seconds in a previous session.

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the Nunus folder

## How it works

- When you visit a supported homepage, articles you've viewed before appear grayed out (reduced opacity + grayscale)
- As you scroll, any article whose top third stays visible for 3+ seconds is marked as viewed and saved
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
