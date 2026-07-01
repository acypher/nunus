/**
 * The Epoch Times site handler (theepochtimes.com).
 *
 * Epoch Times fronts (Next.js) render story cards a few ways:
 *   - Lead / section cards: <a data-title="true" data-testid="section-card-title">
 *     wrapping an <h3 class="et-headline-main_heading-*">.
 *   - Latest-news rail: <a data-title="true"> with <h3> (no section-card-title).
 *   - Sidebar / author blocks: <a data-testid="title"> wrapping <h2>.
 *   - Vertical video carousel: <a data-testid="vertical-video-title"> with <h3>.
 *   - Category columns (US NEWS, etc.): hero grid block plus text-only follow-ups
 *     in sibling flex rows under [data-testid="section/grid-group"].
 *   - Horizontal carousels [data-testid="section-carousel"]: one root per column.
 *   - Thumbnail / comment / share / read-time links point at the same URL but
 *     carry no headline; they are skipped so each story contributes one root.
 *   - EpochTV documentary carousel (dark thumbnail rail): always grayed, never
 *     tracked or recorded.
 *   - Games quick-link list in [data-testid="footer-terms-section"]: always
 *     grayed, never tracked or recorded.
 *
 * Identity is the canonical article URL (host + path; query, hash, and trailing slash
 * stripped). Article paths are /{section}/{slug}-{numeric_id}. Titles are display
 * metadata from the card headline element.
 */
(function() {
  const ARTICLE_PATH = /^\/[^/]+\/.+-\d+$/;

  function isEpochHost(hostname) {
    return (
      hostname === 'www.theepochtimes.com' ||
      hostname === 'theepochtimes.com' ||
      hostname.endsWith('.theepochtimes.com')
    );
  }

  function resolveUrl(href) {
    try {
      return new URL(href, window.location.href);
    } catch (_) {
      return null;
    }
  }

  function pathOf(u) {
    return u.pathname.replace(/\/+$/, '') || '/';
  }

  function isArticleUrl(u) {
    return Boolean(u) && isEpochHost(u.hostname) && ARTICLE_PATH.test(pathOf(u));
  }

  /** Comment / share / metadata chrome — same URL as the story but not a headline link. */
  function isNonArticleAnchor(a) {
    if (!a || !a.getAttribute) return true;
    const testId = a.getAttribute('data-testid') || '';
    if (
      testId === 'comment-button' ||
      testId === 'post-social-share' ||
      testId === 'reading-time-label'
    ) {
      return true;
    }
    if (a.getAttribute('data-thumbnail') === 'true') return true;
    return false;
  }

  /** Canonical identity: https://host/path with query, hash and trailing slash removed. */
  function canonicalUrl(a) {
    if (!a || !a.getAttribute || isNonArticleAnchor(a)) return null;
    const u = resolveUrl(a.getAttribute('href'));
    if (!isArticleUrl(u)) return null;
    return `https://${u.hostname}${pathOf(u)}`;
  }

  function norm(text) {
    const t = (text || '').replace(/\s+/g, ' ').trim();
    return t || null;
  }

  function headlineIn(a) {
    if (!a || typeof a.querySelector !== 'function' || isNonArticleAnchor(a)) return null;
    const h = a.querySelector('h1, h2, h3, h4');
    if (h && norm(h.textContent)) return h;
    const img = a.querySelector('img[alt]');
    if (img && norm(img.getAttribute('alt'))) return img;
    return null;
  }

  function isTitleAnchor(a) {
    if (!a || isNonArticleAnchor(a)) return false;
    const testId = a.getAttribute('data-testid') || '';
    if (
      a.getAttribute('data-title') === 'true' ||
      testId === 'title' ||
      testId === 'section-card-title' ||
      testId === 'vertical-video-title'
    ) {
      return true;
    }
    return Boolean(headlineIn(a));
  }

  // Shadow DOM-aware query (consistent with nyt.js / guardian.js).
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

  function articleUrlsIn(el) {
    const urls = new Set();
    if (!el || typeof el.querySelectorAll !== 'function') return urls;
    for (const a of el.querySelectorAll('a[href]')) {
      const id = canonicalUrl(a);
      if (id) urls.add(id);
    }
    return urls;
  }

  function hasMultipleArticleUrls(el) {
    return articleUrlsIn(el).size > 1;
  }

  /** One visible card/slide/column in a horizontal row or category stack. */
  function carouselColumnRoot(link) {
    const carousel = link.closest('[data-testid="section-carousel"]');
    if (!carousel) return null;
    for (const col of carousel.children) {
      if (col.contains(link)) return col;
    }
    return null;
  }

  /** Largest ancestor that still wraps just this one article URL. */
  function cardRoot(link) {
    const postItem = link.closest('[data-testid="post-item"]');
    if (postItem) return postItem;

    const carouselCol = carouselColumnRoot(link);
    if (carouselCol) return carouselCol;

    const subStory = link.closest(
      '[data-testid="section/main-story-item"] .border-t.border-dashed'
    );
    if (subStory) return subStory;

    const gridHero = gridGroupHeroRoot(link);
    if (gridHero) return gridHero;

    const gridSecondary = gridGroupSecondaryRoot(link);
    if (gridSecondary) return gridSecondary;

    const articleGridCol = link.closest(
      '[data-testid="section/article-grid"] .flex.w-full.shrink-0.flex-row > div'
    );
    if (articleGridCol) return articleGridCol;

    let root = link;
    let parent = link.parentElement;
    while (parent && !hasMultipleArticleUrls(parent)) {
      root = parent;
      parent = parent.parentElement;
    }
    if (root.tagName === 'A') {
      const promoted =
        gridGroupHeroRoot(root) ||
        gridGroupSecondaryRoot(root) ||
        carouselColumnRoot(root) ||
        root.closest('[data-testid="post-item"]');
      if (promoted) return promoted;
    }
    return root;
  }

  function gridGroupHeroRoot(link) {
    const hero = link.closest(
      '[data-testid="section/grid-group"] div.border-gray-40.mb-4.grid'
    );
    return hero || null;
  }

  function gridGroupSecondaryRoot(link) {
    const block = link.closest(
      'div.flex.flex-1.flex-col.gap-3.border-gray-40.mb-4'
    );
    if (
      !block ||
      !block.closest('[data-testid="section/grid-group"]') ||
      block.querySelector('[data-testid="post-thumbnail"]')
    ) {
      return null;
    }
    return block;
  }

  function isHeadlineDisplayed(el) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    if (Number.parseFloat(cs.opacity) < 0.05) return false;
    return true;
  }

  function titleAnchorsInRoot(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return [];
    const anchors = [];
    const seen = new Set();
    for (const sel of [
      'a[data-title="true"][href]',
      'a[data-testid="title"][href]',
      'a[data-testid="section-card-title"][href]',
      'a[data-testid="vertical-video-title"][href]'
    ]) {
      for (const a of root.querySelectorAll(sel)) {
        if (!canonicalUrl(a) || !headlineIn(a) || seen.has(a)) continue;
        seen.add(a);
        anchors.push(a);
      }
    }
    return anchors;
  }

  /** Hero cards ship mobile + desktop title links; prefer the one actually shown. */
  function pickTitleAnchor(root) {
    if (!root) return null;
    if (root.tagName === 'A' && canonicalUrl(root) && isTitleAnchor(root)) return root;
    const anchors = titleAnchorsInRoot(root);
    if (!anchors.length) return null;
    return anchors.find(a => isHeadlineDisplayed(headlineIn(a))) || null;
  }

  function headlineInRoot(root) {
    if (!root || typeof root.querySelector !== 'function') return null;
    const anchor = pickTitleAnchor(root);
    if (anchor) {
      const h = headlineIn(anchor);
      if (h && isHeadlineDisplayed(h)) return h;
    }
    for (const sel of [
      'a[data-title="true"] h1, a[data-title="true"] h2, a[data-title="true"] h3, a[data-title="true"] h4',
      'a[data-testid="title"] h1, a[data-testid="title"] h2, a[data-testid="title"] h3, a[data-testid="title"] h4',
      'a[data-testid="section-card-title"] h1, a[data-testid="section-card-title"] h2, a[data-testid="section-card-title"] h3, a[data-testid="section-card-title"] h4',
      'a[data-testid="vertical-video-title"] h1, a[data-testid="vertical-video-title"] h2, a[data-testid="vertical-video-title"] h3, a[data-testid="vertical-video-title"] h4',
      'h1, h2, h3, h4'
    ]) {
      for (const h of root.querySelectorAll(sel)) {
        if (!isHeadlineDisplayed(h)) continue;
        if (h.tagName === 'IMG') {
          const alt = norm(h.getAttribute('alt'));
          if (alt) return h;
        } else if (norm(h.textContent)) {
          return h;
        }
      }
    }
    return null;
  }

  function articleAnchorIn(root) {
    const picked = pickTitleAnchor(root);
    if (picked) return picked;
    if (!root || typeof root.querySelectorAll !== 'function') return null;
    for (const a of root.querySelectorAll('a[href]')) {
      if (canonicalUrl(a) && headlineIn(a)) return a;
    }
    for (const a of root.querySelectorAll('a[href]')) {
      if (canonicalUrl(a)) return a;
    }
    return null;
  }

  /** Epoch renders category-card on the typo attr date-testid (live DOM) and data-testid. */
  function* categoryCardsInGroup(group) {
    const cards = [
      ...group.querySelectorAll(
        '[date-testid="section/category-card"], [data-testid="section/category-card"]'
      )
    ];
    if (cards.length) {
      yield* cards;
      return;
    }
    if (group.firstElementChild) yield group.firstElementChild;
  }

  /** Category columns (US NEWS, etc.): hero grid block + text-only follow-ups. */
  function* collectCategoryCardBlocks() {
    for (const group of queryAll(document, '[data-testid="section/grid-group"]')) {
      for (const card of categoryCardsInGroup(group)) {
        for (const child of card.children) {
          if (
            child.querySelector(
              'a[data-title="true"], a[data-testid="title"], a[data-testid="section-card-title"]'
            )
          ) {
            yield child;
          }
        }
      }
    }
  }

  function addRootForBlock(articles, add, block) {
    const anchor = articleAnchorIn(block);
    const id = canonicalUrl(anchor);
    const title = getArticleTitle(block);
    if (id && title) add(id, block);
  }

  function getArticleTitleFromRoot(root, anchor) {
    const h = headlineInRoot(root);
    if (!h) return null;
    if (h.tagName === 'IMG') return norm(h.getAttribute('alt'));
    return norm(h.textContent);
  }

  /**
   * Drop nested duplicates for one URL. Prefer card wrappers (div) over bare
   * headline anchors so grid heroes stay visible when mobile/desktop dup links
   * also register the same story elsewhere on the page.
   */
  function pruneNestedRoots(rootSet) {
    const roots = [...rootSet];
    return roots.filter(r => {
      if (r.tagName === 'A') {
        return !roots.some(
          other => other !== r && other.contains(r) && other.tagName !== 'A'
        );
      }
      return !roots.some(
        other => other !== r && r.contains(other) && other.tagName !== 'A'
      );
    });
  }

  function findArticles() {
    const articles = new Map();
    const add = (id, el) => {
      if (!id || !el) return;
      if (!articles.has(id)) articles.set(id, new Set());
      articles.get(id).add(el);
    };

    for (const a of queryAll(document, 'a[href]')) {
      if (!isTitleAnchor(a)) continue;
      const id = canonicalUrl(a);
      if (!id || !headlineIn(a)) continue;
      add(id, cardRoot(a));
    }

    for (const block of collectCategoryCardBlocks()) {
      addRootForBlock(articles, add, block);
    }

    for (const carousel of queryAll(document, '[data-testid="section-carousel"]')) {
      for (const col of carousel.children) {
        addRootForBlock(articles, add, col);
      }
    }

    for (const item of queryAll(document, '[data-testid="section/main-story-item"]')) {
      for (const sub of item.querySelectorAll('.border-t.border-dashed')) {
        addRootForBlock(articles, add, sub);
      }
    }

    for (const el of queryAll(document, '[data-testid="post-item"]')) {
      addRootForBlock(articles, add, el);
    }

    for (const [id, set] of articles) {
      articles.set(id, new Set(pruneNestedRoots(set)));
    }

    return articles;
  }

  function getArticleUrl(root) {
    return canonicalUrl(articleAnchorIn(root));
  }

  function getArticleTitle(root) {
    for (const a of titleAnchorsInRoot(root)) {
      const h = headlineIn(a);
      if (!h) continue;
      const t = h.tagName === 'IMG' ? norm(h.getAttribute('alt')) : norm(h.textContent);
      if (t) return t;
    }
    return getArticleTitleFromRoot(root, articleAnchorIn(root));
  }

  function getVisibilityTargets(root) {
    const h = headlineInRoot(root);
    if (h) return [h];
    const thumb = root?.querySelector?.('[data-testid="post-thumbnail"] img[alt]');
    if (thumb && isHeadlineDisplayed(thumb)) return [thumb];
    return [root];
  }

  /** Excerpt / standfirst under the headline; headline stripped to avoid duplication. */
  function getBlockTopicHaystack(root) {
    if (!root || typeof root.cloneNode !== 'function') return '';
    const clone = root.cloneNode(true);
    clone.querySelectorAll('h1, h2, h3, h4').forEach(el => el.remove());
    const excerpt = clone.querySelector('[data-testid="section-post-excerpt"]');
    if (excerpt) return norm(excerpt.textContent) || '';
    return norm(clone.textContent) || '';
  }

  /** Listing surfaces (home, sections, latest); not individual article pages. */
  function isHomepage() {
    return !ARTICLE_PATH.test(pathOf(resolveUrl(window.location.href)));
  }

  /** Dark “Documentaries” thumbnail rail — image tiles only, no headline markup. */
  function isEpochTvDocCarouselBox(el) {
    if (!el || el.tagName !== 'DIV') return false;
    const cls = typeof el.className === 'string' ? el.className : '';
    return cls.includes('2f2f2f') && cls.includes('rounded') && cls.includes('border');
  }

  function isEpochTvPath(u) {
    return Boolean(u) && pathOf(u).startsWith('/epochtv/');
  }

  function isEpochFunPath(u) {
    return Boolean(u) && pathOf(u).startsWith('/epochfun/');
  }

  function docCarouselItemRoot(link) {
    if (!link) return null;
    const snap = link.closest('.snap-start');
    if (snap) return snap;
    if (link.getAttribute('data-thumbnail') === 'true') return link;
    return null;
  }

  function* collectEpochTvDocCarouselRoots() {
    const seen = new Set();
    for (const box of queryAll(document, 'div.rounded.border')) {
      if (!isEpochTvDocCarouselBox(box)) continue;
      for (const a of box.querySelectorAll('a[href]')) {
        const u = resolveUrl(a.getAttribute('href'));
        if (!u || !isArticleUrl(u) || !isEpochTvPath(u)) continue;
        const root = docCarouselItemRoot(a);
        if (!root || seen.has(root)) continue;
        seen.add(root);
        yield root;
      }
    }
  }

  /** Plain-text game shortcuts in the footer games list (not the main GAMES carousel). */
  function* collectGamesRailSidebarRoots() {
    const section = document.querySelector('[data-testid="footer-terms-section"]');
    if (!section) return;
    const seen = new Set();
    for (const a of section.querySelectorAll('ul a[href]')) {
      const u = resolveUrl(a.getAttribute('href'));
      if (!u || !isEpochHost(u.hostname) || !isEpochFunPath(u)) continue;
      if (a.querySelector('h1, h2, h3, h4')) continue;
      if (!norm(a.textContent)) continue;
      if (seen.has(a)) continue;
      seen.add(a);
      yield a;
    }
  }

  /** Decorative placements: gray on sight, never dwell-tracked or stored. */
  function findAlwaysGrayRoots() {
    return [...collectEpochTvDocCarouselRoots(), ...collectGamesRailSidebarRoots()];
  }

  window.NunusSites = window.NunusSites || {};
  window.NunusSites.epochtimes = {
    findArticles,
    findAlwaysGrayRoots,
    isHomepage,
    getVisibilityTargets,
    getBlockTopicHaystack,
    getArticleUrl,
    getArticleTitle
  };
})();
