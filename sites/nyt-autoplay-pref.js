/**
 * Runs first on NYT (isolated world): reads extension storage and mirrors the video-autoplay
 * block preference into sessionStorage so MAIN-world nyt-betamax-main.js can read it
 * without injecting inline script (CSP on strict pages forbids that).
 * Keys: nunusDisableVideoAutoplay; sessionStorage nunusBlockVideoAutoplay (1|0).
 */
(function() {
  const ext = globalThis.browser ?? globalThis.chrome;
  const h = window.location.hostname;
  const onNyt =
    h === 'www.nytimes.com' ||
    h === 'nytimes.com' ||
    (typeof h === 'string' && h.endsWith('.nytimes.com'));
  if (!onNyt) return;

  const KEY = 'nunusDisableVideoAutoplay';
  const SESSION_KEY = 'nunusBlockVideoAutoplay';

  function mirrorPrefToSession(shouldBlock) {
    try {
      sessionStorage.setItem(SESSION_KEY, shouldBlock ? '1' : '0');
    } catch (_) {}
  }

  try {
    ext.storage.local.get({ [KEY]: true }, r => {
      mirrorPrefToSession(r[KEY] !== false);
    });
  } catch (_) {
    mirrorPrefToSession(true);
  }
})();
