/**
 * Google News site handler (news.google.com).
 * Selectors derived from samples in samples/googlenews/ (homepage DOM capture).
 *
 * Google News groups multi-source coverage into story "clusters", identified by
 * a ./stories/<token> redirector link (current) or ./articles/<token> (legacy).
 * Standalone stories (e.g. "Picks for you" / "More news" cards) have no cluster
 * link - just a single ./read/<token> article.
 *
 * Nunus tracks ONE entry per story:
 *   - Multi-source cluster -> the cluster headline. The individual publisher
 *     sub-listings inside the cluster ("Title - Source - time - By author"
 *     ./read links) are intentionally ignored.
 *       identity : https://news.google.com/stories/<token>
 *       title    : the cluster summary headline when shown, otherwise the lead
 *                  article's headline (single-source clusters)
 *   - Standalone article (not inside any cluster) -> the article itself.
 *       identity : https://news.google.com/read/<token>
 *       title    : the article headline
 *
 * Identities are rebuilt from the token so they stay stable regardless of which
 * feed resolves the relative href. The summary headline link has an empty
 * aria-label and visible text (trailing icon ligature stripped); the "See more"
 * / chevron controls carry a non-empty aria-label or "See more" text, so they
 * are excluded.
 */
(function() {
  const STORY_PATH = /\/(stories|articles)\/([^/?#]+)/;
  const READ_PATH = /\/(read|articles)\/([^/?#]+)/;

  function isGoogleNewsHost(hostname) {
    return hostname === 'news.google.com' || hostname.endsWith('.news.google.com');
  }

  function resolveUrl(href) {
    try {
      return new URL(href, window.location.href);
    } catch (_) {
      return null;
    }
  }

  function norm(text) {
    const t = (text || '').replace(/\s+/g, ' ').trim();
    return t || null;
  }

  /** Anchor text minus icon ligatures (material-icons <i> renders its name as text). */
  function cleanText(a) {
    if (!a) return null;
    let s = '';
    for (const node of a.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        s += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = node.tagName;
        if (tag === 'I' || tag === 'SVG' || tag === 'svg') continue;
        if (/material-icons|google-symbols/i.test(node.className || '')) continue;
        s += node.textContent;
      }
    }
    return norm(s);
  }

  function storyToken(a) {
    if (!a || !a.getAttribute) return null;
    const href = a.getAttribute('href');
    if (!href) return null;
    const u = resolveUrl(href);
    if (!u || !isGoogleNewsHost(u.hostname)) return null;
    const m = u.pathname.match(STORY_PATH);
    return m ? m[2] : null;
  }

  function clusterIdFromToken(token) {
    return token ? `https://news.google.com/stories/${token}` : null;
  }

  /** Canonical standalone-article URL for a ./read (or legacy ./articles) link. */
  function readArticleUrl(a) {
    if (!a || !a.getAttribute) return null;
    const href = a.getAttribute('href');
    if (!href) return null;
    const u = resolveUrl(href);
    if (!u || !isGoogleNewsHost(u.hostname)) return null;
    const m = u.pathname.match(READ_PATH);
    return m ? `https://news.google.com/${m[1]}/${m[2]}` : null;
  }

  /** Cluster summary headline: a story link with no aria-label and real (non-"See more") text. */
  function isSummaryHeadline(a) {
    if (!storyToken(a)) return false;
    if (norm(a.getAttribute('aria-label'))) return false;
    const t = cleanText(a);
    return Boolean(t) && !/^see more/i.test(t);
  }

  /** Visible publisher sub-listing inside a cluster (used only as title fallback / topic text). */
  function isVisibleReadLink(a) {
    if (!a || a.getAttribute('aria-hidden') === 'true') return false;
    const href = a.getAttribute('href');
    if (!href) return false;
    const u = resolveUrl(href);
    if (!u || !isGoogleNewsHost(u.hostname) || !READ_PATH.test(u.pathname)) return false;
    return Boolean(norm(a.textContent));
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

  /** True once the element's subtree holds two or more distinct story tokens. */
  function hasMultipleStoryTokens(el) {
    if (!el || !el.querySelectorAll) return false;
    let first = null;
    for (const a of el.querySelectorAll('a[href]')) {
      const t = storyToken(a);
      if (!t) continue;
      if (first === null) first = t;
      else if (t !== first) return true;
    }
    return false;
  }

  function hasAnyStoryToken(el) {
    if (!el || !el.querySelectorAll) return false;
    for (const a of el.querySelectorAll('a[href]')) {
      if (storyToken(a)) return true;
    }
    return false;
  }

  function countVisibleReadLinks(el) {
    if (!el || !el.querySelectorAll) return 0;
    let n = 0;
    for (const a of el.querySelectorAll('a[href]')) {
      if (isVisibleReadLink(a)) n++;
    }
    return n;
  }

  /** The cluster card: the largest ancestor still wrapping just this one story token. */
  function clusterRoot(link) {
    let root = link;
    let parent = link.parentElement;
    while (parent && !hasMultipleStoryTokens(parent)) {
      root = parent;
      parent = parent.parentElement;
    }
    return root;
  }

  /** The card for a standalone article: largest ancestor with just this one article and no cluster. */
  function standaloneReadRoot(link) {
    let root = link;
    let parent = link.parentElement;
    while (
      parent &&
      countVisibleReadLinks(parent) === 1 &&
      !hasAnyStoryToken(parent)
    ) {
      root = parent;
      parent = parent.parentElement;
    }
    return root;
  }

  function summaryLinkIn(root) {
    if (!root) return null;
    if (root.tagName === 'A' && isSummaryHeadline(root)) return root;
    if (typeof root.querySelectorAll === 'function') {
      for (const a of root.querySelectorAll('a[href]')) {
        if (isSummaryHeadline(a)) return a;
      }
    }
    return null;
  }

  function leadReadLinkIn(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return null;
    for (const a of root.querySelectorAll('a[href]')) {
      if (isVisibleReadLink(a)) return a;
    }
    return null;
  }

  /** The element whose dwell counts as "seen the cluster": summary headline, else lead article. */
  function headlineElementIn(root) {
    return summaryLinkIn(root) || leadReadLinkIn(root);
  }

  function findArticles() {
    const articles = new Map();
    const add = (id, el) => {
      if (!id || !el) return;
      if (!articles.has(id)) articles.set(id, new Set());
      articles.get(id).add(el);
    };

    // Pass 1: multi-source / cluster stories, represented by the cluster headline.
    const clusterRoots = [];
    for (const a of queryAll(document, 'a[href]')) {
      const token = storyToken(a);
      if (!token) continue;
      const root = clusterRoot(a);
      if (!headlineElementIn(root)) continue;
      clusterRoots.push(root);
      add(clusterIdFromToken(token), root);
    }

    // Pass 2: standalone articles that are not part of any cluster.
    for (const a of queryAll(document, 'a[href]')) {
      if (!isVisibleReadLink(a)) continue;
      if (clusterRoots.some(root => root.contains(a))) continue;
      const id = readArticleUrl(a);
      if (!id) continue;
      add(id, standaloneReadRoot(a));
    }

    return articles;
  }

  function getArticleUrl(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return null;
    if (root.tagName === 'A') {
      const t = storyToken(root);
      if (t) return clusterIdFromToken(t);
    }
    for (const a of root.querySelectorAll('a[href]')) {
      const t = storyToken(a);
      if (t) return clusterIdFromToken(t);
    }
    // No cluster token: standalone article identified by its own ./read link.
    const read = leadReadLinkIn(root);
    return read ? readArticleUrl(read) : null;
  }

  function getArticleTitle(root) {
    const el = headlineElementIn(root);
    return el ? cleanText(el) : null;
  }

  function getVisibilityTargets(root) {
    const el = headlineElementIn(root);
    return el ? [el] : [root];
  }

  /** Cluster summary + every sub-listing headline, so topic blocking matches the whole story. */
  function getBlockTopicHaystack(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return '';
    const parts = [];
    const summary = summaryLinkIn(root);
    if (summary) parts.push(cleanText(summary));
    for (const a of root.querySelectorAll('a[href]')) {
      if (isVisibleReadLink(a)) parts.push(norm(a.textContent));
    }
    return norm(parts.filter(Boolean).join(' ')) || '';
  }

  /** news.google.com surfaces are feeds; article links open the publisher in a new tab. */
  function isHomepage() {
    return !READ_PATH.test(window.location.pathname);
  }

  window.NunusSites = window.NunusSites || {};
  window.NunusSites.googlenews = {
    findArticles,
    isHomepage,
    getVisibilityTargets,
    getBlockTopicHaystack,
    getArticleUrl,
    getArticleTitle
  };
})();
