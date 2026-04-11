/**
 * Runs first on NYT (isolated world): reads extension storage and mirrors the video-autoplay
 * block preference into sessionStorage so MAIN-world nyt-betamax-main.js can read it
 * without injecting inline script (CSP on strict pages forbids that).
 * Keys: nunusStopVideoAutoplay (preferred); legacy nunusDisableVideoAutoplay;
 * sessionStorage nunusBlockVideoAutoplay (1|0).
 */
(function() {
  const ext = globalThis.browser ?? globalThis.chrome;
  const h = window.location.hostname;
  const onNyt =
    h === 'www.nytimes.com' ||
    h === 'nytimes.com' ||
    (typeof h === 'string' && h.endsWith('.nytimes.com'));
  if (!onNyt) return;

  const STOP_KEY = 'nunusStopVideoAutoplay';
  const LEGACY_KEY = 'nunusDisableVideoAutoplay';
  const SESSION_KEY = 'nunusBlockVideoAutoplay';

  function readStopPref(obj) {
    if (Object.prototype.hasOwnProperty.call(obj, STOP_KEY)) return obj[STOP_KEY] === true;
    if (Object.prototype.hasOwnProperty.call(obj, LEGACY_KEY)) return obj[LEGACY_KEY] === true;
    return false;
  }

  function mirrorPrefToSession(shouldBlock) {
    try {
      sessionStorage.setItem(SESSION_KEY, shouldBlock ? '1' : '0');
    } catch (_) {}
  }

  try {
    ext.storage.local.get([STOP_KEY, LEGACY_KEY], r => {
      mirrorPrefToSession(readStopPref(r));
    });
    ext.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes[STOP_KEY]) {
        mirrorPrefToSession(changes[STOP_KEY].newValue === true);
        return;
      }
      if (changes[LEGACY_KEY]) {
        mirrorPrefToSession(changes[LEGACY_KEY].newValue === true);
      }
    });
  } catch (_) {
    mirrorPrefToSession(false);
  }
})();
