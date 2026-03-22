/**
 * New York Times site handler.
 * Selectors derived from samples in samples/nytimes/ (homepage DOM captures).
 *
 * Article root: Vi homepage “story list item” wrappers (data-tpl="sli"),
 * section.story-wrapper heroes, and bottom rails: [data-testid$="-section"] article.
 * Title: headline slot [data-tpl="h"], label link [data-tpl="l"], or .indicate-hover.
 * URLs / data-uri: verification only (article-identification rule).
 */
(function() {
  const DATE_ARTICLE_PATH = /\/\d{4}\/\d{1,2}\/\d{1,2}\//;

  function normalizeTitle(text) {
    let t = (text || '').split('\n')[0].trim().replace(/\s+/g, ' ');
    t = t.replace(/\s+By\s+[A-Za-z].*$/i, '').trim();
    t = t.replace(/\s+[-|]\s+.*$/, '').trim();
    return t || null;
  }

  function isNytimesHost(hostname) {
    return (
      hostname === 'www.nytimes.com' ||
      hostname === 'nytimes.com' ||
      hostname.endsWith('.nytimes.com')
    );
  }

  function resolveArticleUrl(href) {
    try {
      return new URL(href, window.location.href);
    } catch (_) {
      return null;
    }
  }

  function isNytArticleUrl(href) {
    const u = resolveArticleUrl(href);
    if (!u || !isNytimesHost(u.hostname)) return false;
    if (DATE_ARTICLE_PATH.test(u.pathname)) return true;
    if (u.pathname.startsWith('/interactive/')) return true;
    if (u.pathname.startsWith('/live/')) return true;
    // Wirecutter / Athletic promos use nyt://promo/ and paths without /YYYY/MM/DD/.
    if (u.pathname.startsWith('/wirecutter/')) return true;
    if (u.pathname.startsWith('/athletic/')) return true;
    return false;
  }

  function anchorLooksLikeArticle(a) {
    if (!a || !a.href) return false;
    const uri = a.getAttribute('data-uri');
    if (
      uri &&
      (uri.startsWith('nyt://article/') || uri.startsWith('nyt://interactive/'))
    ) {
      return true;
    }
    return isNytArticleUrl(a.href);
  }

  function rootHasArticleAnchor(root) {
    for (const a of root.querySelectorAll('a[href]')) {
      if (anchorLooksLikeArticle(a)) return true;
    }
    // Carousel (and similar): the card link wraps the story-wrapper from outside,
    // so no article <a> is a descendant of the sli root.
    const wrap = root.closest('a[href]');
    if (wrap && anchorLooksLikeArticle(wrap)) return true;
    return false;
  }

  function rectIntersectionArea(a, b) {
    const left = Math.max(a.left, b.left);
    const right = Math.min(a.right, b.right);
    const top = Math.max(a.top, b.top);
    const bottom = Math.min(a.bottom, b.bottom);
    const w = Math.max(0, right - left);
    const h = Math.max(0, bottom - top);
    return w * h;
  }

  /**
   * Vi homepage carousels keep every slide in the DOM with aria-hidden="false".
   * Use overlap between the card and the slide strip (clipped row) instead.
   * @returns {boolean|null} false = exclude; true = include; null = not this carousel
   */
  function isCarouselSlideShownInStrip(root) {
    const outer = root.closest('[data-testid="carouselOuterClass"]');
    if (!outer) return null;
    const strip = outer.firstElementChild;
    const clipEl = strip instanceof HTMLElement ? strip : outer;
    const card = root.closest('a[href]');
    if (!card || !anchorLooksLikeArticle(card)) return null;

    const clip = clipEl.getBoundingClientRect();
    const r = card.getBoundingClientRect();
    const cardArea = Math.max(1, r.width * r.height);
    const overlap = rectIntersectionArea(r, clip);
    const visibleFrac = overlap / cardArea;
    if (visibleFrac < 0.12) return false;

    const cs = window.getComputedStyle(card);
    if (Number.parseFloat(cs.opacity) < 0.05) return false;

    return true;
  }

  /**
   * Skip carousel / tab slides that are in the DOM but not shown (and similar).
   * Carousels: Vi often leaves aria-hidden="false" on all slides; use strip overlap.
   */
  function isArticleRootEffectivelyHidden(root) {
    let n = root;
    while (n && n !== document.documentElement) {
      if (n.getAttribute('aria-hidden') === 'true') return true;
      if (n.hasAttribute('hidden')) return true;
      if (n.getAttribute('inert') != null) return true;
      n = n.parentElement;
    }
    const cs = window.getComputedStyle(root);
    if (cs.display === 'none' || cs.visibility === 'hidden') return true;

    const carousel = isCarouselSlideShownInStrip(root);
    if (carousel === false) return true;
    return false;
  }

  function* queryAll(root, selector) {
    try {
      yield* root.querySelectorAll(selector);
    } catch (_) {}
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) {
        yield* queryAll(el.shadowRoot, selector);
      }
    }
  }

  function filterOutermost(elements) {
    const arr = [...elements];
    return arr.filter(
      el => !arr.some(other => other !== el && other.contains(el))
    );
  }

  /**
   * Prefer structured headline nodes; fall back to first qualifying in-root link text.
   * Video / magazine heroes: <p data-tpl="h"><a data-tpl="l"><span>Title</span></a></p>
   */
  function getTitleFromRoot(root) {
    const hSlot = root.querySelector('[data-tpl="h"]');
    if (hSlot) {
      const lblInH = hSlot.querySelector('a[data-tpl="l"]');
      if (lblInH) {
        const id = normalizeTitle(lblInH.textContent);
        if (id) return id;
      }
      const p = hSlot.querySelector('p');
      if (p) {
        const id = normalizeTitle(p.textContent);
        if (id) return id;
      }
      const id = normalizeTitle(hSlot.textContent);
      if (id) return id;
    }
    const lbl = root.querySelector('a[data-tpl="l"]');
    if (lbl) {
      const id = normalizeTitle(lbl.textContent);
      if (id) return id;
    }
    const hover = root.querySelector('p.indicate-hover');
    if (hover) {
      const id = normalizeTitle(hover.textContent);
      if (id) return id;
    }
    // Bottom-of-page category rails: [data-testid$="-section"] > ul > li > article, title in a > … > p
    if (root.tagName === 'ARTICLE') {
      for (const a of root.querySelectorAll('a[href]')) {
        if (!anchorLooksLikeArticle(a)) continue;
        const tp = a.querySelector('p');
        if (tp) {
          const id = normalizeTitle(tp.textContent);
          if (id) return id;
        }
        const id = normalizeTitle(a.textContent);
        if (id) return id;
      }
    }
    for (const a of root.querySelectorAll('a[href]')) {
      if (!anchorLooksLikeArticle(a)) continue;
      const id = normalizeTitle(a.textContent);
      if (id) return id;
    }
    return null;
  }

  /**
   * DOM nodes used for “title visible” timing — same precedence as getTitleFromRoot.
   */
  function getVisibilityTargets(root) {
    const hSlot = root.querySelector('[data-tpl="h"]');
    if (hSlot) {
      const lblInH = hSlot.querySelector('a[data-tpl="l"]');
      if (lblInH && normalizeTitle(lblInH.textContent)) return [lblInH];
      const p = hSlot.querySelector('p');
      if (p && normalizeTitle(p.textContent)) return [p];
      if (normalizeTitle(hSlot.textContent)) return [hSlot];
    }
    const lbl = root.querySelector('a[data-tpl="l"]');
    if (lbl && normalizeTitle(lbl.textContent)) return [lbl];
    const hover = root.querySelector('p.indicate-hover');
    if (hover && normalizeTitle(hover.textContent)) return [hover];
    if (root.tagName === 'ARTICLE') {
      for (const a of root.querySelectorAll('a[href]')) {
        if (!anchorLooksLikeArticle(a)) continue;
        const tp = a.querySelector('p');
        if (tp && normalizeTitle(tp.textContent)) return [tp];
        if (normalizeTitle(a.textContent)) return [a];
      }
    }
    for (const a of root.querySelectorAll('a[href]')) {
      if (!anchorLooksLikeArticle(a)) continue;
      if (normalizeTitle(a.textContent)) return [a];
    }
    return [root];
  }

  function collectStoryRoots() {
    // Merge every strategy, then filterOutermost once. Early-returning on the
    // first non-empty pass dropped video/magazine heroes: they use
    // section.story-wrapper without div[data-tpl="sli"], while the rest of the
    // page has many sli cards.
    const candidates = new Set();

    for (const el of queryAll(document, 'div.story-wrapper[data-tpl="sli"]')) {
      if (rootHasArticleAnchor(el)) candidates.add(el);
    }
    for (const el of queryAll(document, 'div.story-wrapper')) {
      if (rootHasArticleAnchor(el)) candidates.add(el);
    }
    for (const a of queryAll(document, 'a[href]')) {
      if (!anchorLooksLikeArticle(a)) continue;
      const wrap =
        a.closest('div.story-wrapper') || a.closest('section.story-wrapper');
      if (wrap) candidates.add(wrap);
    }
    for (const el of queryAll(document, 'section.story-wrapper')) {
      if (el.querySelector('div.story-wrapper')) continue;
      if (!rootHasArticleAnchor(el)) continue;
      candidates.add(el);
    }
    for (const el of queryAll(document, '[data-testid$="-section"] article')) {
      if (rootHasArticleAnchor(el)) candidates.add(el);
    }

    return filterOutermost([...candidates]);
  }

  function findArticles() {
    const articles = new Map();
    const add = (id, el) => {
      if (!id || !el) return;
      if (!articles.has(id)) articles.set(id, new Set());
      articles.get(id).add(el);
    };

    for (const root of collectStoryRoots()) {
      if (isArticleRootEffectivelyHidden(root)) continue;
      const id = getTitleFromRoot(root);
      if (id) add(id, root);
    }

    return articles;
  }

  function isHomepage() {
    const path = window.location.pathname;
    return path === '/' || path === '' || path === '/index.html';
  }

  window.NunusSites = window.NunusSites || {};
  window.NunusSites.nyt = { findArticles, isHomepage, getVisibilityTargets };
})();
