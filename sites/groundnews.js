/**
 * Ground News site handler (ground.news).
 *
 * Ground News is a Next.js feed of story clusters. Each story links to
 * /article/<slug-or-id> on ground.news; the Daily Briefing digest links to
 * /daily-briefing. Cards render in a few layouts:
 *   - Newsroom feed: sibling <a data-dd-action-name="article-card-click"> links
 *     (headline block + image block) share an id; the headline anchor wraps an
 *     <h4 class="… line-clamp-3 …">.
 *   - Hero / side rails: a single <a class="… cursor-pointer …"> wraps an <h2>.
 *   - Daily Briefing: <a data-dd-action-name="gaia-digest-briefing-story-click"
 *     href="/daily-briefing"> with the lead story in a <span class="…font-extrabold…">.
 *     The separate section label link (<h3>Daily Briefing</h3>) is ignored.
 *   - Lead modules may also expose a media-only article link without a heading;
 *     those are skipped — the feed card for the same URL supplies the root.
 *
 * Identity is the canonical story URL (host + path; query, hash, and trailing slash
 * stripped). Titles are display metadata from the card headline element.
 * cardRoot() climbs to the largest wrapper that still holds only one article URL,
 * then nested roots for the same URL are pruned to the innermost.
 */
(function() {
  const STORY_PATH = /^\/(?:article\/[^/]+|daily-briefing)\/?$/;
  const DAILY_BRIEFING_PATH = '/daily-briefing';
  const BRIEFING_STORY_ACTION = 'gaia-digest-briefing-story-click';

  function isGroundHost(hostname) {
    return (
      hostname === 'ground.news' ||
      hostname === 'www.ground.news' ||
      hostname.endsWith('.ground.news')
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

  function isStoryUrl(u) {
    return Boolean(u) && isGroundHost(u.hostname) && STORY_PATH.test(u.pathname);
  }

  function isDailyBriefingPath(path) {
    return path === DAILY_BRIEFING_PATH;
  }

  function isBriefingStoryCard(a) {
    return a.getAttribute('data-dd-action-name') === BRIEFING_STORY_ACTION;
  }

  /** Section chrome link above the digest card — not the story itself. */
  function isBriefingSectionLabel(a, h) {
    const u = resolveUrl(a.getAttribute('href'));
    return (
      Boolean(u) &&
      isDailyBriefingPath(pathOf(u)) &&
      !isBriefingStoryCard(a) &&
      h &&
      h.tagName === 'H3' &&
      norm(h.textContent) === 'Daily Briefing'
    );
  }

  /** Canonical identity: https://host/path with query, hash and trailing slash removed. */
  function canonicalUrl(a) {
    if (!a || !a.getAttribute) return null;
    const u = resolveUrl(a.getAttribute('href'));
    if (!isStoryUrl(u)) return null;
    return `https://${u.hostname}${pathOf(u)}`;
  }

  function norm(text) {
    const t = (text || '').replace(/\s+/g, ' ').trim();
    return t || null;
  }

  function briefingHeadlineIn(a) {
    if (!a || !isBriefingStoryCard(a)) return null;
    for (const el of a.querySelectorAll('span')) {
      const cls = typeof el.className === 'string' ? el.className : '';
      if (cls.includes('font-extrabold') && norm(el.textContent)) return el;
    }
    for (const img of a.querySelectorAll('img[alt]')) {
      const alt = norm(img.getAttribute('alt'));
      if (alt && alt.length > 12) return img;
    }
    return null;
  }

  function headlineIn(a) {
    if (!a || typeof a.querySelector !== 'function') return null;
    const briefingHeadline = briefingHeadlineIn(a);
    if (briefingHeadline) return briefingHeadline;
    const h = a.querySelector('h1, h2, h3, h4');
    if (h && !isBriefingSectionLabel(a, h)) return h;
    return null;
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

  /** Largest ancestor that still wraps just this one article URL. */
  function cardRoot(link) {
    let root = link;
    let parent = link.parentElement;
    while (parent && !hasMultipleArticleUrls(parent)) {
      root = parent;
      parent = parent.parentElement;
    }
    return root;
  }

  function headlineInRoot(root) {
    if (!root || typeof root.querySelector !== 'function') return null;
    const briefing = root.querySelector(
      `a[data-dd-action-name="${BRIEFING_STORY_ACTION}"]`
    );
    if (briefing) {
      const headline = briefingHeadlineIn(briefing);
      if (headline) return headline;
    }
    for (const h of root.querySelectorAll('h1, h2, h3, h4')) {
      const owner = typeof h.closest === 'function' ? h.closest('a[href]') : null;
      if (owner && isBriefingSectionLabel(owner, h)) continue;
      return h;
    }
    return null;
  }

  function articleAnchorIn(root) {
    if (!root) return null;
    if (root.tagName === 'A' && canonicalUrl(root)) return root;
    if (typeof root.querySelectorAll === 'function') {
      for (const a of root.querySelectorAll('a[href]')) {
        if (canonicalUrl(a) && headlineIn(a)) return a;
      }
      for (const a of root.querySelectorAll('a[href]')) {
        if (canonicalUrl(a)) return a;
      }
    }
    return null;
  }

  /** Keep only the innermost roots for a URL (drops a root that contains another). */
  function pruneNestedRoots(rootSet) {
    const roots = [...rootSet];
    return roots.filter(
      r => !roots.some(other => other !== r && r.contains(other))
    );
  }

  function findArticles() {
    const articles = new Map();
    const add = (id, el) => {
      if (!id || !el) return;
      if (!articles.has(id)) articles.set(id, new Set());
      articles.get(id).add(el);
    };

    for (const a of queryAll(document, 'a[href]')) {
      const id = canonicalUrl(a);
      if (!id) continue;
      if (!headlineIn(a)) continue;
      add(id, cardRoot(a));
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
    const h = headlineInRoot(root);
    if (!h) return null;
    if (h.tagName === 'IMG') return norm(h.getAttribute('alt'));
    return norm(h.textContent);
  }

  function getVisibilityTargets(root) {
    const h = headlineInRoot(root);
    return h ? [h] : [root];
  }

  /** Bias bar / source-count line under the headline (headline stripped). */
  function getBlockTopicHaystack(root) {
    if (!root || typeof root.cloneNode !== 'function') return '';
    const clone = root.cloneNode(true);
    clone.querySelectorAll('h1, h2, h3, h4').forEach(el => el.remove());
    clone
      .querySelectorAll('span[class*="font-extrabold"], img[alt]')
      .forEach(el => el.remove());
    return norm(clone.textContent) || '';
  }

  /** Feed surfaces (home, local, blindspot, topics); not individual article pages. */
  function isHomepage() {
    return !/^\/article\//.test(window.location.pathname);
  }

  window.NunusSites = window.NunusSites || {};
  window.NunusSites.groundnews = {
    findArticles,
    isHomepage,
    getVisibilityTargets,
    getBlockTopicHaystack,
    getArticleUrl,
    getArticleTitle
  };
})();
