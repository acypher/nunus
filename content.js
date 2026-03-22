/**
 * Content script entry point - selects site handler and runs Nunus.
 */
const NUNUS_DEBUG_BORDER = '0 0 0 6px rgba(255, 140, 0, 0.5)';

function nunusNytDebugEnabled() {
  try {
    if (new URLSearchParams(window.location.search).get('nunus_debug') === '1') return true;
    if (window.localStorage.getItem('nunus_debug') === '1') return true;
  } catch (_) {}
  return false;
}

function nunusFlattenArticlesInDocumentOrder(articlesMap) {
  const all = new Set();
  for (const set of articlesMap.values()) {
    for (const el of set) all.add(el);
  }
  const arr = [...all];
  arr.sort((a, b) => {
    const pos = a.compareDocumentPosition(b);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });
  return arr;
}

function nunusClearNytDebugOverlay() {
  document.querySelectorAll('.nunus-debug-article-badge').forEach(b => b.remove());
  document.querySelectorAll('[data-nunus-debug-article="1"]').forEach(el => {
    const prev = el.dataset.nunusDebugPrevBoxShadow;
    if (prev !== undefined) {
      el.style.boxShadow = prev;
      delete el.dataset.nunusDebugPrevBoxShadow;
    } else {
      el.style.boxShadow = '';
    }
    if (el.dataset.nunusDebugPositioned === '1') {
      el.style.position = '';
      delete el.dataset.nunusDebugPositioned;
    }
    delete el.dataset.nunusDebugArticle;
  });
}

function nunusInstallNytDebugOverlay(site) {
  if (typeof site.findArticles !== 'function') return;
  nunusClearNytDebugOverlay();

  const articles = site.findArticles();
  const ordered = nunusFlattenArticlesInDocumentOrder(articles);
  if (ordered.length === 0) {
    console.warn(
      '[Nunus] nunus_debug: findArticles() matched 0 article roots — check sites/nyt.js vs live DOM.'
    );
  }

  ordered.forEach((el, i) => {
    const n = i + 1;
    el.dataset.nunusDebugArticle = '1';
    const cs = window.getComputedStyle(el);
    if (cs.position === 'static') {
      el.style.position = 'relative';
      el.dataset.nunusDebugPositioned = '1';
    }
    el.dataset.nunusDebugPrevBoxShadow = el.style.boxShadow || '';
    const existing = el.style.boxShadow;
    el.style.boxShadow = existing
      ? `${existing}, ${NUNUS_DEBUG_BORDER}`
      : NUNUS_DEBUG_BORDER;

    const badge = document.createElement('span');
    badge.className = 'nunus-debug-article-badge';
    badge.textContent = String(n);
    badge.setAttribute('aria-hidden', 'true');
    badge.style.cssText = [
      'position:absolute',
      'top:6px',
      'left:6px',
      'z-index:2147483646',
      'font:bold 13px/1.2 system-ui,sans-serif',
      'padding:3px 8px',
      'background:rgba(255,140,0,0.85)',
      'color:#000',
      'border-radius:4px',
      'pointer-events:none',
      'box-shadow:0 1px 3px rgba(0,0,0,0.25)'
    ].join(';');
    el.appendChild(badge);
  });
}

(function() {
  const host = window.location.hostname;
  let site = null;

  if (host.includes('nytimes.com')) {
    site = window.NunusSites?.nyt;
  } else if (host.includes('washingtonpost.com')) {
    site = window.NunusSites?.washingtonpost;
  } else if (host.includes('theguardian.com') || host.includes('guardian.co.uk')) {
    site = window.NunusSites?.guardian;
  }

  if (site && typeof window.NunusRun === 'function') {
    window.NunusRun(site);
  }

  if (host.includes('nytimes.com') && site && nunusNytDebugEnabled()) {
    nunusInstallNytDebugOverlay(site);
    let debounce;
    const mo = new MutationObserver(() => {
      clearTimeout(debounce);
      debounce = setTimeout(() => nunusInstallNytDebugOverlay(site), 400);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }
})();
