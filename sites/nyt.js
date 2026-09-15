/**
 * New York Times site handler.
 * Selectors derived from samples in samples/nytimes/ (homepage DOM captures).
 *
 * Article root: Vi homepage “story list item” wrappers (data-tpl="sli"),
 * section.story-wrapper heroes, Live band rows (#hp-live-band-list), and bottom rails:
 * [data-testid$="-section"] article.
 * Title: headline slot [data-tpl="h"], label link [data-tpl="l"], or .indicate-hover.
 * URL: canonical identity from in-root / wrapping <a>, or desktop lockup overlay
 * <a> under [data-tpl="lb"] (sibling of the sli grid — no link inside the headline).
 * Title is display metadata.
 */
(function() {
  const DATE_ARTICLE_PATH = /\/\d{4}\/\d{1,2}\/\d{1,2}\//;

  function normalizeTitle(text) {
    let t = (text || '').split('\n')[0].trim().replace(/\s+/g, ' ');
    t = t.replace(/\s+By\s+[A-Za-z].*$/i, '').trim();
    t = t.replace(/\s+[-|]\s+.*$/, '').trim();
    return t || null;
  }

  /** Opinion / byline cards: <a data-tpl="l"><p>Author</p><p class="indicate-hover">Headline</p></a> */
  function titleFromLabelLink(a) {
    if (!a) return null;
    const hoverP = a.querySelector('p.indicate-hover');
    if (hoverP) {
      const id = normalizeTitle(hoverP.textContent);
      if (id) return id;
    }
    return normalizeTitle(a.textContent);
  }

  function visibilityTargetForLabelLink(a) {
    if (!a) return null;
    const hoverP = a.querySelector('p.indicate-hover');
    if (hoverP && normalizeTitle(hoverP.textContent)) return hoverP;
    if (normalizeTitle(a.textContent)) return a;
    return null;
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
    if (u.pathname.startsWith('/video/')) return true;
    // Undated evergreen explainers: /article/slug.html (no /YYYY/MM/DD/).
    if (u.pathname.startsWith('/article/')) return true;
    // Wirecutter / Athletic promos use nyt://promo/ and paths without /YYYY/MM/DD/.
    if (u.pathname.startsWith('/wirecutter/')) return true;
    if (u.pathname.startsWith('/athletic/')) return true;
    // Homepage “Cooking” promos link to cooking.nytimes.com/recipes/… or /article/… (no /YYYY/MM/DD/).
    if (
      u.hostname === 'cooking.nytimes.com' &&
      /^\/(?:recipes|article)\//.test(u.pathname)
    ) {
      return true;
    }
    return false;
  }

  function anchorLooksLikeArticle(a) {
    if (!a || !a.href) return false;
    const uri = a.getAttribute('data-uri');
    if (
      uri &&
      (uri.startsWith('nyt://article/') ||
        uri.startsWith('nyt://interactive/') ||
        uri.startsWith('nyt://promo/') ||
        uri.startsWith('nyt://recipe/'))
    ) {
      return true;
    }
    return isNytArticleUrl(a.href);
  }

  /**
   * Desktop Vi heroes put the click target on an empty overlay <a> that is a
   * direct child of [data-tpl="lb"], sibling to the grid that holds the sli —
   * so the headline lives in the sli with no descendant (or wrapping) <a>.
   * Narrow layouts instead wrap the title in a[data-tpl="l"] inside the sli.
   */
  function lockupOverlayArticleAnchor(root) {
    if (!root) return null;
    const lb = root.closest('[data-tpl="lb"]');
    if (!lb) return null;
    for (const child of lb.children) {
      if (child.tagName === 'A' && anchorLooksLikeArticle(child)) return child;
    }
    return null;
  }

  function articleAnchorForRoot(root) {
    if (!root) return null;
    for (const a of root.querySelectorAll('a[href]')) {
      if (anchorLooksLikeArticle(a)) return a;
    }
    // Carousel (and similar): the card link wraps the story-wrapper from outside,
    // so no article <a> is a descendant of the sli root.
    const wrap = root.closest('a[href]');
    if (wrap && anchorLooksLikeArticle(wrap)) return wrap;
    return lockupOverlayArticleAnchor(root);
  }

  function rootHasArticleAnchor(root) {
    return !!articleAnchorForRoot(root);
  }

  function getArticleUrl(root) {
    if (!root) return null;
    // nyt-video-feed items have no article anchor; synthesize a stable ID from title.
    const headlineEl = root.querySelector('[class*="_headline-container_"] p');
    if (headlineEl) {
      const t = normalizeTitle(headlineEl.textContent);
      if (t) {
        const slug = t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        return `https://www.nytimes.com/video-feed/${slug}`;
      }
    }
    const a = articleAnchorForRoot(root);
    return a ? a.href : null;
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

  /** Keep only the innermost roots for a URL (drops a root that contains another). */
  function pruneNestedRoots(rootSet) {
    const roots = [...rootSet];
    return roots.filter(
      r => !roots.some(other => other !== r && r.contains(other))
    );
  }

  /**
   * Prefer structured headline nodes; fall back to first qualifying in-root link text.
   * Video / magazine heroes: <p data-tpl="h"><a data-tpl="l"><span>Title</span></a></p>
   * Category + headline in [data-tpl="h"]: <p>Section</p><p class="indicate-hover">Title</p>
   */
  function getTitleFromRoot(root) {
    // nyt-video-feed item: title in headline container, no article link.
    const headlineEl = root.querySelector('[class*="_headline-container_"] p');
    if (headlineEl) {
      const t = normalizeTitle(headlineEl.textContent);
      if (t) return t;
    }
    const hSlot = root.querySelector('[data-tpl="h"]');
    if (hSlot) {
      const lblInH = hSlot.querySelector('a[data-tpl="l"]');
      if (lblInH) {
        const id = titleFromLabelLink(lblInH);
        if (id) return id;
      }
      const hoverInH = hSlot.querySelector('p.indicate-hover');
      if (hoverInH) {
        const id = normalizeTitle(hoverInH.textContent);
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
      const id = titleFromLabelLink(lbl);
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
    // nyt-video-feed item: use the headline <p> as the visibility target.
    const headlineEl = root.querySelector('[class*="_headline-container_"] p');
    if (headlineEl && normalizeTitle(headlineEl.textContent)) return [headlineEl];
    const hSlot = root.querySelector('[data-tpl="h"]');
    if (hSlot) {
      const lblInH = hSlot.querySelector('a[data-tpl="l"]');
      if (lblInH) {
        const t = visibilityTargetForLabelLink(lblInH);
        if (t) return [t];
      }
      const hoverInH = hSlot.querySelector('p.indicate-hover');
      if (hoverInH && normalizeTitle(hoverInH.textContent)) return [hoverInH];
      const p = hSlot.querySelector('p');
      if (p && normalizeTitle(p.textContent)) return [p];
      if (normalizeTitle(hSlot.textContent)) return [hSlot];
    }
    const lbl = root.querySelector('a[data-tpl="l"]');
    if (lbl) {
      const t = visibilityTargetForLabelLink(lbl);
      if (t) return [t];
    }
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
    // Merge every strategy; per-URL nested pruning happens in findArticles().
    // Early-returning on the first non-empty pass dropped video/magazine heroes:
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
    // Homepage / package rails: <ul><li>…<article>…<div class="… assetWrapper"> (any depth under li)
    for (const li of queryAll(document, 'li')) {
      for (const el of li.querySelectorAll('article')) {
        if (!el.querySelector('.assetWrapper')) continue;
        if (!rootHasArticleAnchor(el)) continue;
        candidates.add(el);
      }
    }
    // Kyt-style "Weekend Reads" video cards: <section data-tpl="lb"> wrapping
    // <p data-tpl="h"><a data-tpl="l"> — no story-wrapper anywhere in the subtree.
    for (const el of queryAll(document, 'section[data-tpl="lb"]')) {
      if (el.querySelector('.story-wrapper')) continue;
      if (rootHasArticleAnchor(el)) candidates.add(el);
    }
    // Live band: <ul id="hp-live-band-list"><li><a><p class="indicate-hover"> — no story-wrapper.
    for (const a of queryAll(document, '#hp-live-band-list a[href]')) {
      if (!anchorLooksLikeArticle(a)) continue;
      candidates.add(a.closest('li') || a);
    }
    // nyt-video-feed carousel: article[data-testid="feed-item"] live in the component shadow DOM.
    // Only collect items currently visible in the carousel (user doesn't care about off-screen slides).
    for (const feed of document.querySelectorAll('nyt-video-feed')) {
      const sr = feed.shadowRoot;
      if (!sr) continue;
      for (const el of sr.querySelectorAll('article[data-testid="feed-item"]')) {
        const rect = el.getBoundingClientRect();
        if (rect.width < 20) continue;
        // Skip items scrolled outside the viewport horizontally.
        if (rect.right <= 0 || rect.left >= window.innerWidth) continue;
        candidates.add(el);
      }
    }

    // When the main card link is section > a > … > div.story-wrapper[data-tpl="sli"],
    // the anchor pass adds the section and the sli pass adds the inner roots.
    // A global outermost filter would keep only the section; a single section wrapping
    // multiple columns would then collapse to one article. Prefer inner sli cards whenever
    // present (heroes without sli still use section-only roots).
    for (const el of [...candidates]) {
      if (
        el.tagName === 'SECTION' &&
        el.classList.contains('story-wrapper') &&
        el.querySelector('div.story-wrapper[data-tpl="sli"]')
      ) {
        candidates.delete(el);
      }
    }

    return [...candidates];
  }

  /**
   * Summary / lede under the headline in Vi cards (`data-tpl="slic"`), excluding the
   * headline slot so we do not duplicate the title text for matching.
   */
  function getBlockTopicHaystack(root) {
    if (!root) return '';
    const slic = root.querySelector('[data-tpl="slic"]');
    if (!slic) return '';
    const clone = slic.cloneNode(true);
    const hSlot = clone.querySelector('[data-tpl="h"]');
    if (hSlot) hSlot.remove();
    const t = normalizeTitle(clone.textContent);
    return t || '';
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
      const title = getTitleFromRoot(root);
      const id = getArticleUrl(root);
      if (title && id) add(id, root);
    }

    for (const [id, set] of articles) {
      articles.set(id, new Set(pruneNestedRoots(set)));
    }

    return articles;
  }

  function canonicalArticleId(href) {
    const u = resolveArticleUrl(href);
    if (!u || !isNytimesHost(u.hostname)) return null;
    u.hash = '';
    u.search = '';
    let path = u.pathname || '/';
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    // Hub landing pages, not stories.
    if (path === '/wirecutter' || path === '/athletic') return null;
    return `${u.protocol}//${u.host}${path}`;
  }

  /**
   * Story roots to consider for Missed Articles — same shapes as collectStoryRoots,
   * but include cards even when the article <a> is a sibling overlay (pre-fix DOM).
   */
  function collectOracleStoryRoots() {
    const candidates = new Set();
    for (const el of queryAll(document, 'div.story-wrapper[data-tpl="sli"]')) {
      candidates.add(el);
    }
    for (const el of queryAll(document, 'div.story-wrapper')) {
      candidates.add(el);
    }
    for (const el of queryAll(document, 'section.story-wrapper')) {
      if (el.querySelector('div.story-wrapper')) continue;
      candidates.add(el);
    }
    for (const el of queryAll(document, '[data-testid$="-section"] article')) {
      candidates.add(el);
    }
    for (const li of queryAll(document, 'li')) {
      for (const el of li.querySelectorAll('article')) {
        if (!el.querySelector('.assetWrapper')) continue;
        candidates.add(el);
      }
    }
    for (const el of queryAll(document, 'section[data-tpl="lb"]')) {
      if (el.querySelector('.story-wrapper')) continue;
      candidates.add(el);
    }
    for (const a of queryAll(document, '#hp-live-band-list a[href]')) {
      if (!anchorLooksLikeArticle(a)) continue;
      candidates.add(a.closest('li') || a);
    }
    for (const feed of document.querySelectorAll('nyt-video-feed')) {
      const sr = feed.shadowRoot;
      if (!sr) continue;
      for (const el of sr.querySelectorAll('article[data-testid="feed-item"]')) {
        const rect = el.getBoundingClientRect();
        if (rect.width < 20) continue;
        if (rect.right <= 0 || rect.left >= window.innerWidth) continue;
        candidates.add(el);
      }
    }
    for (const el of [...candidates]) {
      if (
        el.tagName === 'SECTION' &&
        el.classList.contains('story-wrapper') &&
        el.querySelector('div.story-wrapper[data-tpl="sli"]')
      ) {
        candidates.delete(el);
      }
    }
    return [...candidates];
  }

  /**
   * Newsletter signup promos use the same sli / story-wrapper chrome as stories
   * but link to /newsletters/… (rejected by isNytArticleUrl → no-url orphans).
   */
  function isNewsletterSignupRoot(root) {
    if (!root) return false;
    const isNewsletterHref = (href) => {
      const u = resolveArticleUrl(href);
      return !!(
        u &&
        isNytimesHost(u.hostname) &&
        (u.pathname === '/newsletters' || u.pathname.startsWith('/newsletters/'))
      );
    };
    for (const a of root.querySelectorAll('a[href]')) {
      if (isNewsletterHref(a.getAttribute('href') || a.href)) return true;
    }
    const wrap = root.closest('a[href]');
    if (wrap && isNewsletterHref(wrap.getAttribute('href') || wrap.href)) {
      return true;
    }
    const lb = root.closest('[data-tpl="lb"]');
    if (lb) {
      for (const child of lb.children) {
        if (
          child.tagName === 'A' &&
          isNewsletterHref(child.getAttribute('href') || child.href)
        ) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Layout-aware Missed Articles: story-card roots with a headline whose URL is
   * missing from findArticles() (or cannot be resolved). Ignores bare teaser
   * <a> strips that are not story wrappers — those are noisy false positives.
   */
  function findMissedArticles() {
    const detected = new Set();
    for (const raw of findArticles().keys()) {
      const id = canonicalArticleId(raw);
      if (id) detected.add(id);
    }

    const missedByUrl = new Map();
    const orphanTitles = [];

    for (const root of collectOracleStoryRoots()) {
      if (isArticleRootEffectivelyHidden(root)) continue;
      if (isNewsletterSignupRoot(root)) continue;
      const title = getTitleFromRoot(root);
      if (!title || title.length < 20) continue;
      if (/›\s*$/.test(title)) continue;

      const rawUrl = getArticleUrl(root);
      const url = rawUrl ? canonicalArticleId(rawUrl) : null;
      if (!url) {
        orphanTitles.push({ url: null, title, reason: 'no-url' });
        continue;
      }
      if (detected.has(url)) continue;
      if (!missedByUrl.has(url)) {
        missedByUrl.set(url, { url, title, reason: 'not-detected' });
      }
    }

    const missed = [...missedByUrl.values(), ...orphanTitles];
    missed.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    return missed;
  }

  function collectCandidateArticles() {
    const byUrl = new Map();
    for (const root of collectOracleStoryRoots()) {
      if (isArticleRootEffectivelyHidden(root)) continue;
      const title = getTitleFromRoot(root);
      if (!title || title.length < 20) continue;
      const rawUrl = getArticleUrl(root);
      const url = rawUrl ? canonicalArticleId(rawUrl) : null;
      if (!url) continue;
      if (!byUrl.has(url)) byUrl.set(url, { url, title });
    }
    return byUrl;
  }

  function isHomepage() {
    const path = window.location.pathname;
    return path === '/' || path === '' || path === '/index.html';
  }

  /* —— Opinions homepage summaries (local Ollama; extractive fallback) —— */

  const OPINION_SUMMARY_STORAGE_KEY = 'nunus_nyt_opinion_summaries_v4';
  const OPINION_SUMMARY_CLASS = 'nunus-opinion-summary';
  const OPINION_SUMMARY_MAX_PARALLEL = 3;
  const OPINION_SUMMARY_MAX_CHARS = 420;
  const OPINION_SUMMARY_MIN_CHARS = 40;
  const OLLAMA_CHAT_URL = 'http://127.0.0.1:11434/api/chat';
  const OLLAMA_TAGS_URL = 'http://127.0.0.1:11434/api/tags';
  let ollamaModelName = null;
  let ollamaProbePromise = null;

  /** In-memory cache: canonicalUrl -> { summary, ts } | { failed: true, ts } */
  const opinionSummaryMem = new Map();
  let opinionSummaryStorageLoaded = false;
  let opinionSummaryPersistTimer = null;
  let opinionSummaryQueue = [];
  let opinionSummaryActive = 0;
  let opinionSummaryObserverStarted = false;

  function opinionExt() {
    return globalThis.browser ?? globalThis.chrome;
  }

  function isOpinionArticleUrl(href) {
    const u = resolveArticleUrl(href);
    if (!u || !isNytimesHost(u.hostname)) return false;
    // Pieces, not the /section/opinion hub or masthead chrome.
    return /\/opinion\//.test(u.pathname);
  }

  function isOpinionHeadingText(text) {
    return /^opinions?$/i.test(String(text || '').replace(/\s+/g, ' ').trim());
  }

  function isMastheadOrNav(el) {
    if (!el || !el.closest) return true;
    return !!(
      el.closest('header') ||
      el.closest('nav') ||
      el.closest('[data-testid="masthead-container"]') ||
      el.closest('[data-testid="floating-desktop-nested-nav"]')
    );
  }

  function homepageMain() {
    return document.getElementById('site-content') || document.querySelector('main');
  }

  /** True when most article links under node are Opinion pieces (not a mixed rail). */
  function sectionIsOpinionScoped(node) {
    if (!node) return false;
    let opinion = 0;
    let other = 0;
    for (const a of node.querySelectorAll('a[href]')) {
      if (isOpinionArticleUrl(a.href)) opinion += 1;
      else if (isNytArticleUrl(a.href)) other += 1;
    }
    if (!opinion) return false;
    return opinion >= other;
  }

  function isHomepageWideContainer(node) {
    if (!node) return true;
    const id = node.id || '';
    const hier = node.getAttribute('data-hierarchy');
    return (
      node === document.body ||
      node.tagName === 'MAIN' ||
      id === 'app' ||
      id === 'site-content' ||
      hier === 'feed'
    );
  }

  /**
   * Opinions cards sometimes put the click target on a sibling overlay <a> under
   * the surrounding section.story-wrapper / [data-tpl="lb"], not inside the sli.
   */
  function getArticleUrlForOpinionCard(root) {
    const direct = getArticleUrl(root);
    if (direct) return direct;
    if (!root) return null;
    const scope =
      root.closest('section.story-wrapper') ||
      root.closest('[data-tpl="lb"]') ||
      root.parentElement;
    if (!scope || scope === root) return null;
    for (const a of scope.querySelectorAll('a[href]')) {
      if (root.contains(a)) continue;
      if (anchorLooksLikeArticle(a)) return a.href;
    }
    return null;
  }

  /**
   * Heading of the homepage Opinions package — never the masthead/nav “Opinion” link
   * (climbing from nav reaches #app and would summarize every homepage card).
   */
  function findOpinionsSectionLabel() {
    const legacy =
      document.getElementById('large-opinion-label') ||
      document.querySelector('.g-large-opinion-label');
    if (legacy) return legacy;

    const main = homepageMain();
    if (!main) return null;

    const packageTitle = [...main.querySelectorAll('.package-title-wrapper')].find(el =>
      isOpinionHeadingText(el.textContent)
    );
    if (packageTitle) return packageTitle;

    return (
      [...main.querySelectorAll('a[href*="/section/opinion"]')].find(a => {
        if (isMastheadOrNav(a)) return false;
        return isOpinionHeadingText(a.textContent);
      }) || null
    );
  }

  /**
   * Homepage “Opinions” block: climb from the section label to the smallest
   * ancestor that also contains story cards.
   */
  function findOpinionsSectionContainer() {
    const label = findOpinionsSectionLabel();
    if (!label) return null;

    // Climb to the smallest ancestor that contains story cards, but stop before
    // the homepage programming zone / feed (those mix later non-Opinion rails).
    let node = label.parentElement;
    while (node && node !== document.body) {
      if (isHomepageWideContainer(node)) return null;
      if (isMastheadOrNav(node)) {
        node = node.parentElement;
        continue;
      }
      const isZone =
        node.getAttribute('data-testid') === 'programming-node' ||
        node.getAttribute('data-hierarchy') === 'zone';
      const hasStories = !!(
        node.querySelector('div.story-wrapper[data-tpl="sli"]') ||
        node.querySelector('section.story-wrapper')
      );
      if (hasStories) {
        if (sectionIsOpinionScoped(node)) return node;
        // Mixed zone: still return it; caller keeps only /opinion/ cards.
        if (isZone) return node;
        return null;
      }
      if (isZone) return null;
      node = node.parentElement;
    }
    return null;
  }

  function isOpinionCardRoot(root) {
    if (!root || isArticleRootEffectivelyHidden(root)) return false;
    const url = getArticleUrlForOpinionCard(root);
    return !!(url && isOpinionArticleUrl(url));
  }

  function collectOpinionsSectionRoots() {
    const section = findOpinionsSectionContainer();
    if (!section) return [];

    // Prefer the same roots findArticles() uses (Newly Viewed / gray-out), narrowed
    // to the Opinions block — so we never summarize a different card set than tracking.
    const fromFind = [];
    for (const [, roots] of findArticles()) {
      for (const root of roots) {
        if (section.contains(root) && isOpinionCardRoot(root)) fromFind.push(root);
      }
    }
    if (fromFind.length) {
      return pruneNestedRoots(new Set(fromFind));
    }

    // Fallback if findArticles is empty for this section (timing / pre-hydrate).
    const candidates = new Set();
    for (const el of section.querySelectorAll('div.story-wrapper[data-tpl="sli"]')) {
      if (rootHasArticleAnchor(el) || getArticleUrlForOpinionCard(el)) candidates.add(el);
    }
    for (const el of section.querySelectorAll('section.story-wrapper')) {
      if (el.querySelector('div.story-wrapper')) continue;
      if (rootHasArticleAnchor(el) || getArticleUrlForOpinionCard(el)) candidates.add(el);
    }
    for (const el of [...candidates]) {
      if (
        el.tagName === 'SECTION' &&
        el.classList.contains('story-wrapper') &&
        el.querySelector('div.story-wrapper[data-tpl="sli"]')
      ) {
        candidates.delete(el);
      }
    }

    return [...candidates].filter(isOpinionCardRoot);
  }

  function stripStrayOpinionSummaries(allowedRoots) {
    const allowed = allowedRoots instanceof Set ? allowedRoots : new Set(allowedRoots);
    for (const el of document.querySelectorAll('.' + OPINION_SUMMARY_CLASS)) {
      let keep = false;
      for (const root of allowed) {
        if (root.contains(el)) {
          keep = true;
          break;
        }
      }
      if (!keep) el.remove();
    }
  }

  function cleanExtractedText(raw) {
    let t = String(raw || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\s+/g, ' ')
      .trim();
    return t;
  }

  function truncateSummary(text) {
    let t = cleanExtractedText(text);
    if (!t) return null;
    if (t.length <= OPINION_SUMMARY_MAX_CHARS) return t;
    const slice = t.slice(0, OPINION_SUMMARY_MAX_CHARS - 1);
    const cut = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('? '), slice.lastIndexOf('! '));
    if (cut >= OPINION_SUMMARY_MIN_CHARS) return slice.slice(0, cut + 1).trim();
    const sp = slice.lastIndexOf(' ');
    return ((sp > 40 ? slice.slice(0, sp) : slice).trim() + '…');
  }

  function firstSentences(text, maxSentences) {
    const t = cleanExtractedText(text);
    if (!t) return null;
    const parts = t.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g);
    if (!parts || !parts.length) return truncateSummary(t);
    return truncateSummary(parts.slice(0, maxSentences).join(' ').trim());
  }

  function metaContent(doc, selectors) {
    for (const sel of selectors) {
      const el = doc.querySelector(sel);
      if (!el) continue;
      const c = el.getAttribute('content') || el.getAttribute('value') || '';
      const s = truncateSummary(c);
      if (s && s.length >= OPINION_SUMMARY_MIN_CHARS) return s;
    }
    return null;
  }

  function isTeaserSummary(text) {
    const t = cleanExtractedText(text);
    if (!t) return true;
    if (t.length < OPINION_SUMMARY_MIN_CHARS) return true;
    // Short abstract blurbs with no concrete anchors (the oembed/meta style).
    const hasProper =
      /[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}/.test(t) ||
      /\b(?:20\d{2}|Congress|Court|Republican|Democrat|Trump|Missouri|Texas|America)\b/.test(t);
    const hasConcrete =
      /\b(?:argues|examines|warns|says|claims|shows|describes|about|over|amid|after|before|because|despite)\b/i.test(
        t
      ) || /\d/.test(t);
    if (t.length < 90 && !hasProper && !hasConcrete) return true;
    if (t.length < 70 && (t.match(/[.!?]/g) || []).length <= 1 && !hasProper) return true;
    return false;
  }

  function extractJsonLdDescription(doc) {
    for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
      let data;
      try {
        data = JSON.parse(script.textContent || '');
      } catch (_) {
        continue;
      }
      const nodes = Array.isArray(data) ? data : data['@graph'] ? data['@graph'] : [data];
      for (const node of nodes) {
        if (!node || typeof node !== 'object') continue;
        const typ = node['@type'];
        const types = Array.isArray(typ) ? typ : [typ];
        if (!types.some(t => /Article|NewsArticle|Opinion|Reportage/i.test(String(t || '')))) {
          continue;
        }
        const d = cleanExtractedText(node.description || node.articleBody || '');
        if (d && d.length >= OPINION_SUMMARY_MIN_CHARS) return d;
      }
    }
    return null;
  }

  function extractArticlePayload(html) {
    if (!html || typeof html !== 'string') return null;
    let doc;
    try {
      doc = new DOMParser().parseFromString(html, 'text/html');
    } catch (_) {
      return null;
    }

    const title =
      cleanExtractedText(
        doc.querySelector('h1[data-testid="headline"]')?.textContent ||
          doc.querySelector('h1')?.textContent ||
          doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
          ''
      ) || null;

    let author =
      cleanExtractedText(
        doc.querySelector('[data-testid="byline-container"]')?.textContent ||
          doc.querySelector('meta[name="byl"]')?.getAttribute('content') ||
          doc.querySelector('meta[property="article:author"]')?.getAttribute('content') ||
          ''
      ) || null;
    if (author) author = author.replace(/^By\s+/i, '').split(/\n/)[0].trim();

    const body =
      doc.querySelector('section[name="articleBody"]') ||
      doc.querySelector('[data-testid="article-body"]') ||
      doc.querySelector('article#story') ||
      doc.querySelector('article[data-testid="article"]') ||
      doc.querySelector('article');

    const paras = [];
    if (body) {
      for (const p of body.querySelectorAll('p')) {
        const t = cleanExtractedText(p.textContent);
        if (!t || t.length < 35) continue;
        if (/^(credit|photo|by |advertisement|supported by)/i.test(t)) continue;
        paras.push(t);
        if (paras.length >= 8) break;
      }
    }

    const meta = metaContent(doc, [
      'meta[name="description"]',
      'meta[property="og:description"]',
      'meta[name="twitter:description"]'
    ]);
    const ld = extractJsonLdDescription(doc);
    let dek = null;
    const summaryEls = doc.querySelectorAll(
      '#article-summary, [data-testid="article-summary"], p#article-summary'
    );
    for (const el of summaryEls) {
      const s = cleanExtractedText(el.textContent);
      if (s && s.length >= OPINION_SUMMARY_MIN_CHARS) {
        dek = s;
        break;
      }
    }

    return { title, author, paras, meta, ld, dek, doc };
  }

  function buildSubstanceSummaryFromPayload(payload) {
    if (!payload) return null;
    const parts = [];
    // Prefer real article prose over marketing meta.
    if (payload.paras && payload.paras.length) {
      const joined = payload.paras.slice(0, 4).join(' ');
      const s = firstSentences(joined, 3);
      if (s && !isTeaserSummary(s)) parts.push(s);
      else if (s) parts.push(s);
    }
    for (const cand of [payload.dek, payload.ld, payload.meta]) {
      if (!cand || isTeaserSummary(cand)) continue;
      if (!parts.length) parts.push(firstSentences(cand, 2) || cand);
    }
    if (!parts.length) {
      for (const cand of [payload.dek, payload.ld, payload.meta]) {
        if (cand && cand.length >= OPINION_SUMMARY_MIN_CHARS) {
          parts.push(cand);
          break;
        }
      }
    }
    if (!parts.length) return null;

    let summary = truncateSummary(parts[0]);
    if (!summary) return null;

    // Prefatory author when the blurb doesn't already name them.
    if (payload.author) {
      const authorLast = payload.author.split(/\s+/).pop();
      if (authorLast && !new RegExp('\\b' + authorLast.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(summary)) {
        const lead = payload.author.includes(',')
          ? payload.author
          : payload.author;
        // "X argues/examines..." only when summary doesn't already start with a name.
        if (!/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\s+(argues|says|writes|examines)/.test(summary)) {
          summary = truncateSummary(lead + ' — ' + summary);
        }
      }
    }
    if (isTeaserSummary(summary) && payload.paras && payload.paras.length >= 2) {
      const richer = firstSentences(payload.paras.slice(0, 5).join(' '), 3);
      if (richer && richer.length > summary.length) summary = truncateSummary(richer);
    }
    return summary;
  }

  function extractSummaryFromHtml(html) {
    return buildSubstanceSummaryFromPayload(extractArticlePayload(html));
  }

  function opinionSummaryPromptParts(payload, url) {
    const bodyText = (payload.paras || []).slice(0, 6).join('\n\n');
    const system =
      'You write dense 1-2 sentence summaries of New York Times Opinion pieces for readers who will not open the article. ' +
      'Include the author when known, the concrete topic, and the writer\'s main claim or stakes. ' +
      'Never write teasers or withhold the key fact. No clickbait. No preface like "This article".';
    const user =
      'Title: ' +
      (payload.title || '') +
      '\nAuthor: ' +
      (payload.author || '') +
      '\nURL: ' +
      (url || '') +
      '\n\nArticle text:\n' +
      bodyText.slice(0, 4500);
    return { bodyText, system, user };
  }

  async function probeOllamaModel() {
    if (ollamaModelName) return ollamaModelName;
    if (ollamaProbePromise) return ollamaProbePromise;
    ollamaProbePromise = (async () => {
      try {
        const res = await fetch(OLLAMA_TAGS_URL, {
          method: 'GET',
          credentials: 'omit',
          cache: 'no-cache'
        });
        if (!res.ok) return null;
        const data = await res.json();
        const models = Array.isArray(data?.models) ? data.models : [];
        const names = models.map(m => m?.name || m?.model).filter(Boolean);
        const prefer = names.find(n => /llama3\.2:3b|llama3\.2|qwen2\.5:3b|qwen2\.5|mistral|phi3/i.test(n));
        ollamaModelName = prefer || names[0] || null;
        return ollamaModelName;
      } catch (_) {
        ollamaModelName = null;
        return null;
      }
    })();
    const name = await ollamaProbePromise;
    if (!name) ollamaProbePromise = null;
    return name;
  }

  async function summarizeWithOllama(payload, url) {
    const model = await probeOllamaModel();
    if (!model || !payload) return null;
    const { bodyText, system, user } = opinionSummaryPromptParts(payload, url);
    if (!bodyText || bodyText.length < 120) return null;

    const res = await fetch(OLLAMA_CHAT_URL, {
      method: 'POST',
      credentials: 'omit',
      cache: 'no-cache',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        options: { temperature: 0.2, num_predict: 180 },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      })
    });
    if (!res.ok) throw new Error('ollama HTTP ' + res.status);
    const data = await res.json();
    const raw = data?.message?.content || data?.response || '';
    const summary = truncateSummary(String(raw).replace(/^["']|["']$/g, ''));
    if (!summary || summary.length < OPINION_SUMMARY_MIN_CHARS) return null;
    return summary;
  }

  async function loadOpinionSummaryStorage() {
    if (opinionSummaryStorageLoaded) return;
    opinionSummaryStorageLoaded = true;
    const ext = opinionExt();
    if (!ext?.storage?.local) return;
    try {
      const result = await ext.storage.local.get({ [OPINION_SUMMARY_STORAGE_KEY]: {} });
      const raw = result[OPINION_SUMMARY_STORAGE_KEY];
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
      for (const [url, entry] of Object.entries(raw)) {
        if (!url || !entry || typeof entry !== 'object') continue;
        if (!isOpinionArticleUrl(url)) continue;
        // Drop cached teasers from older generations.
        if (entry.summary && isTeaserSummary(entry.summary)) continue;
        opinionSummaryMem.set(url, entry);
      }
    } catch (_) {}
  }

  function schedulePersistOpinionSummaries() {
    if (opinionSummaryPersistTimer) clearTimeout(opinionSummaryPersistTimer);
    opinionSummaryPersistTimer = setTimeout(() => {
      opinionSummaryPersistTimer = null;
      void persistOpinionSummaries();
    }, 400);
  }

  async function persistOpinionSummaries() {
    const ext = opinionExt();
    if (!ext?.storage?.local) return;
    const out = {};
    let n = 0;
    for (const [url, entry] of opinionSummaryMem) {
      if (!entry || entry.failed || !entry.summary) continue;
      if (!isOpinionArticleUrl(url)) continue;
      if (entry.source !== 'ollama') continue;
      if (isTeaserSummary(entry.summary)) continue;
      out[url] = {
        summary: entry.summary,
        ts: entry.ts || Date.now(),
        source: entry.source || 'extract'
      };
      n += 1;
      if (n >= 200) break;
    }
    try {
      await ext.storage.local.set({ [OPINION_SUMMARY_STORAGE_KEY]: out });
    } catch (_) {}
  }

  function ensureOpinionSummaryStyle() {
    if (document.getElementById('nunus-opinion-summary-style')) return;
    const style = document.createElement('style');
    style.id = 'nunus-opinion-summary-style';
    style.textContent = [
      '.' + OPINION_SUMMARY_CLASS + '{',
      '  display:block;',
      '  margin:0.35em 0 0;',
      '  padding:0;',
      '  font:400 0.92em/1.35 georgia,"times new roman",serif;',
      '  color:var(--color-content-secondary,#666);',
      '  max-width:42em;',
      '}',
    ].join('');
    (document.head || document.documentElement).appendChild(style);
  }

  function findOpinionSummaryAnchor(root) {
    const hSlot = root.querySelector('[data-tpl="h"]');
    if (hSlot) return hSlot;
    const hover = root.querySelector('p.indicate-hover');
    if (hover) return hover;
    const lbl = root.querySelector('a[data-tpl="l"]');
    if (lbl) return lbl;
    return null;
  }

  function renderOpinionSummary(root, summary) {
    ensureOpinionSummaryStyle();
    if (!summary) {
      const existing = root.querySelector('.' + OPINION_SUMMARY_CLASS);
      if (existing) existing.remove();
      return;
    }
    const raw = getArticleUrlForOpinionCard(root) || getArticleUrl(root);
    const canon = (raw && canonicalArticleId(raw)) || raw;
    let el = root.querySelector('.' + OPINION_SUMMARY_CLASS);
    if (!el) {
      el = document.createElement('p');
      el.className = OPINION_SUMMARY_CLASS;
      el.setAttribute('data-nunus-opinion-summary', '1');
      const anchor = findOpinionSummaryAnchor(root);
      if (anchor && anchor.parentNode) {
        if (anchor.nextSibling) {
          anchor.parentNode.insertBefore(el, anchor.nextSibling);
        } else {
          anchor.parentNode.appendChild(el);
        }
      } else {
        root.appendChild(el);
      }
    }
    if (canon) el.dataset.nunusSummaryUrl = canon;
    el.textContent = summary;
  }

  function pumpOpinionSummaryQueue() {
    while (
      opinionSummaryActive < OPINION_SUMMARY_MAX_PARALLEL &&
      opinionSummaryQueue.length
    ) {
      const job = opinionSummaryQueue.shift();
      opinionSummaryActive += 1;
      void job()
        .catch(() => {})
        .finally(() => {
          opinionSummaryActive -= 1;
          pumpOpinionSummaryQueue();
        });
    }
  }

  function enqueueOpinionSummary(task) {
    opinionSummaryQueue.push(task);
    pumpOpinionSummaryQueue();
  }

  async function fetchOpinionSummaryFromOembed(url) {
    const endpoint =
      'https://www.nytimes.com/svc/oembed/json/?url=' + encodeURIComponent(url);
    const res = await fetch(endpoint, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-cache',
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) throw new Error('oembed HTTP ' + res.status);
    const data = await res.json();
    const raw = data && (data.summary || data.description || '');
    const summary = truncateSummary(raw);
    if (!summary || isTeaserSummary(summary)) return null;
    return summary;
  }

  async function fetchOpinionArticlePayload(url) {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-cache'
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();
    return extractArticlePayload(html);
  }

  async function fetchOpinionSummary(url) {
    if (!isOpinionArticleUrl(url)) return null;
    const canon = canonicalArticleId(url) || url;
    const cached = opinionSummaryMem.get(canon);
    if (cached?.source === 'ollama' && cached.summary && cached.summary.length >= OPINION_SUMMARY_MIN_CHARS) {
      return cached.summary;
    }
    if (cached?.failed && Date.now() - (cached.ts || 0) < 2 * 60 * 1000) {
      return cached.summary || null;
    }

    let payload = null;
    try {
      payload = await fetchOpinionArticlePayload(url);
    } catch (_) {}

    let summary = null;
    let source = null;
    if (payload) {
      try {
        summary = await summarizeWithOllama(payload, url);
        if (summary) source = 'ollama';
      } catch (_) {}
      if (!summary) {
        summary = cached?.summary || buildSubstanceSummaryFromPayload(payload);
        if (summary) source = cached?.source || 'extract';
      }
    }

    if ((!summary || source !== 'ollama') && (!summary || isTeaserSummary(summary))) {
      try {
        const oembedSummary = await fetchOpinionSummaryFromOembed(url);
        if (oembedSummary && (!summary || oembedSummary.length > summary.length)) {
          summary = oembedSummary;
          source = 'oembed';
        }
      } catch (_) {}
    }

    if (summary && summary.length >= OPINION_SUMMARY_MIN_CHARS) {
      opinionSummaryMem.set(canon, { summary, ts: Date.now(), source: source || 'extract' });
      if (source === 'ollama') schedulePersistOpinionSummaries();
      return summary;
    }
    opinionSummaryMem.set(canon, { failed: true, ts: Date.now() });
    return null;
  }

  function syncOpinionsSummaries() {
    if (!isHomepage()) return;
    const roots = collectOpinionsSectionRoots();
    stripStrayOpinionSummaries(roots);
    if (!roots.length) return;

    const seen = new Set();
    for (const root of roots) {
      const rawUrl = getArticleUrlForOpinionCard(root);
      if (!isOpinionArticleUrl(rawUrl)) continue;
      const canon = rawUrl ? canonicalArticleId(rawUrl) : null;
      if (!canon || seen.has(canon)) continue;
      seen.add(canon);

      const cached = opinionSummaryMem.get(canon);
      if (cached?.source === 'ollama' && cached.summary) {
        renderOpinionSummary(root, cached.summary);
        continue;
      }
      if (cached?.summary) renderOpinionSummary(root, cached.summary);

      // Avoid re-queueing the same URL while in-flight / recently failed.
      if (root.dataset.nunusSummaryQueued === canon) continue;
      root.dataset.nunusSummaryQueued = canon;

      enqueueOpinionSummary(async () => {
        const summary = await fetchOpinionSummary(rawUrl);
        // NYT often replaces card nodes while fetches are in flight — never bail
        // solely because the original root disconnected; rebind by URL.
        const liveRoots = collectOpinionsSectionRoots().filter(r => {
          const u = getArticleUrlForOpinionCard(r);
          return u && canonicalArticleId(u) === canon;
        });
        let targets = liveRoots;
        if (!targets.length && root.isConnected && isOpinionCardRoot(root)) {
          targets = [root];
        }
        for (const r of targets) {
          if (summary) renderOpinionSummary(r, summary);
          // Allow a later retry if this attempt failed (DOM still present).
          if (!summary) delete r.dataset.nunusSummaryQueued;
        }
      });
    }
  }

  async function startOpinionsSummaries() {
    if (!isHomepage()) return;
    await loadOpinionSummaryStorage();
    ensureOpinionSummaryStyle();
    syncOpinionsSummaries();

    if (opinionSummaryObserverStarted) return;
    opinionSummaryObserverStarted = true;
    let debounce;
    const run = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        try {
          syncOpinionsSummaries();
        } catch (_) {}
      }, 500);
    };
    const mo = new MutationObserver(run);
    if (document.body) {
      mo.observe(document.body, { childList: true, subtree: true });
    }
    setTimeout(syncOpinionsSummaries, 2000);
  }

  window.NunusSites = window.NunusSites || {};
  window.NunusSites.nyt = {
    findArticles,
    findMissedArticles,
    collectCandidateArticles,
    isHomepage,
    getVisibilityTargets,
    getBlockTopicHaystack,
    getArticleUrl,
    getArticleTitle: getTitleFromRoot,
    canonicalArticleId,
    startOpinionsSummaries,
    collectOpinionsSectionRoots,
    // Exposed for tests / debug
    extractSummaryFromHtml
  };
})();
