# Nunus

On the nytimes.com front page, this Nunus Chrome extension grays out article titles you've already seen.   
Also, autoplay is removed from videos.   
Option-downArrow jumps to the next unseen title.  
'Already seen' means at least 20 pixels of the title were on the screen for 3 seconds in a previous session.  
If the same title appears again later on the page, the later occurrences are immediately grayed out.


## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the Nunus folder

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

- **storage**: Used to remember which articles you've viewed across sessions
