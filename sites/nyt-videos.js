/**
 * NYTimes (isolated world): VHS + generic HTML5 video + iframe embed autoplay tweaks.
 * Betamax / cinemagraph / .vhs-grid-page / Gallery / story-wrapper[data-tpl=lb]: MAIN betamax (play()).
 *
 * Runs only when nunusStopVideoAutoplay is true (user opted in via popup). document_start; MutationObserver singleton.
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

  function readStopPref(obj) {
    if (Object.prototype.hasOwnProperty.call(obj, STOP_KEY)) return obj[STOP_KEY] === true;
    if (Object.prototype.hasOwnProperty.call(obj, LEGACY_KEY)) return obj[LEGACY_KEY] === true;
    return false;
  }

  ext.storage.local.get([STOP_KEY, LEGACY_KEY], r => {
    if (!readStopPref(r)) return;

  const ATTR_WATCH = [
    'autoplay',
    'loop',
    'data-play',
    'controls',
    'preload',
    'src'
  ];

  const ns = (window.__nunusNytVideos = window.__nunusNytVideos || {});

  function walkShadow(root, visit) {
    if (!root || !root.querySelectorAll) return;
    visit(root);
    if (root.shadowRoot) walkShadow(root.shadowRoot, visit);
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) walkShadow(el.shadowRoot, visit);
    }
  }

  function forEachVideo(root, fn) {
    walkShadow(root, r => {
      try {
        r.querySelectorAll('video').forEach(fn);
      } catch (_) {}
    });
  }

  function forEachIframe(root) {
    walkShadow(root, r => {
      try {
        r.querySelectorAll('iframe[src]').forEach(patchIframeAutoplay);
      } catch (_) {}
    });
  }

  function patchIframeAutoplay(iframe) {
    if (!(iframe instanceof HTMLIFrameElement)) return;
    const src = iframe.getAttribute('src');
    if (!src || iframe.dataset.nunusIframeAutoplayPatched === '1') return;
    try {
      const url = new URL(src, window.location.href);
      let changed = false;
      if (
        url.hostname.includes('youtube.com') ||
        url.hostname.includes('youtube-nocookie.com') ||
        url.hostname === 'youtu.be'
      ) {
        url.searchParams.set('autoplay', '0');
        changed = true;
      }
      if (url.hostname.includes('vimeo.com')) {
        url.searchParams.set('autoplay', '0');
        changed = true;
      }
      if (url.hostname === 'vp.nyt.com' || url.hostname.endsWith('.vp.nyt.com')) {
        url.searchParams.set('autoplay', '0');
        changed = true;
      }
      if (changed) {
        iframe.dataset.nunusIframeAutoplayPatched = '1';
        iframe.setAttribute('src', url.href);
      }
    } catch (_) {}
  }

  function isNytdVhsVideo(el) {
    try {
      return !!el.closest(
        '.nytd-player-container, .react-vhs-player, .react-vhs-container'
      );
    } catch (_) {
      return false;
    }
  }

  function stripBadVideoAttrs(el) {
    if (el.hasAttribute('autoplay')) el.removeAttribute('autoplay');
    if (el.hasAttribute('loop')) el.removeAttribute('loop');
    if (el.hasAttribute('data-play')) el.removeAttribute('data-play');
    try {
      el.autoplay = false;
      el.loop = false;
    } catch (_) {}

    if (isNytdVhsVideo(el)) {
      el.setAttribute('preload', 'none');
      try {
        el.preload = 'none';
      } catch (_) {}
    } else {
      const pre = el.getAttribute('preload');
      if (pre === 'auto') {
        el.setAttribute('preload', 'metadata');
        try {
          el.preload = 'metadata';
        } catch (_) {}
      }
    }

    if (!el.controls) el.controls = true;
    if (!el.hasAttribute('controls')) el.setAttribute('controls', '');
  }

  function lockLoopAndAutoplayIds(el) {
    try {
      Object.defineProperty(el, 'loop', {
        configurable: true,
        enumerable: true,
        get() {
          return false;
        },
        set() {}
      });
    } catch (_) {}
    try {
      Object.defineProperty(el, 'autoplay', {
        configurable: true,
        enumerable: true,
        get() {
          return false;
        },
        set() {}
      });
    } catch (_) {}
  }

  function applyVideo(el) {
    if (!(el instanceof HTMLVideoElement)) return;
    if (el.getAttribute('data-testid') === 'betamax-video') return;
    if (el.getAttribute('data-testid') === 'cinemagraph') return;
    if (el.closest('.vhs-grid-page')) return;
    if (el.closest('section[data-testid="Gallery"]')) return;
    if (el.closest('section.story-wrapper section[data-tpl="lb"]')) return;
    if (el.dataset.nunusVideoPatched === '1') return;
    el.dataset.nunusVideoPatched = '1';

    stripBadVideoAttrs(el);
    lockLoopAndAutoplayIds(el);

    const blockProgrammaticPlayback = e => {
      if (!e.isTrusted) {
        el.pause();
      }
    };

    el.addEventListener('play', blockProgrammaticPlayback, true);
    el.addEventListener('playing', blockProgrammaticPlayback, true);

    try {
      const attrMo = new MutationObserver(() => {
        stripBadVideoAttrs(el);
        try {
          el.pause();
        } catch (_) {}
      });
      attrMo.observe(el, {
        attributes: true,
        attributeFilter: ATTR_WATCH
      });
    } catch (_) {}

    try {
      el.pause();
    } catch (_) {}
  }

  function scanSubtree(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
    forEachVideo(node, applyVideo);
    forEachIframe(node);
  }

  function boot() {
    const root = document.documentElement;
    if (!root) return;
    scanSubtree(root);

    if (ns.docMoAttached) return;
    ns.docMoAttached = true;
    ns.docMo = new MutationObserver(mutations => {
      for (const m of mutations) {
        for (const n of m.addedNodes) {
          if (n.nodeType === Node.ELEMENT_NODE) scanSubtree(n);
        }
      }
    });
    ns.docMo.observe(root, { childList: true, subtree: true });
  }

  boot();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  }

  if (typeof customElements !== 'undefined' && customElements != null && typeof customElements.whenDefined === 'function') {
    customElements.whenDefined('nyt-betamax').then(() => {
      const r = document.documentElement;
      if (r) scanSubtree(r);
    });
  }
  });
})();
