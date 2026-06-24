/**
 * The Guardian site handler (theguardian.com).
 * Selectors derived from samples in samples/theguardian/ (homepage DOM capture).
 *
 * Guardian fronts (Dotcom-Rendering, "DCR") render cards a few ways:
 *   - Lead / standard card: the card link is an <a data-link-name="… | card-@N">
 *     (often the picture link, "… | card-@N | media-picture"). Its headline lives
 *     in a SIBLING <h3 class="card-headline"><span class="headline-text">…, not
 *     inside the anchor.
 *   - Sublink: the <a data-link-name="sublinks | N"> WRAPS the headline
 *     (<h3 class="card-sublink-headline"><span class="headline-text">…).
 *   - "Most viewed" / list items: the <a> wraps plain headline text (no
 *     card-headline / headline-text classes).
 *
 * Identity is the canonical article URL (host + path, query/hash/trailing slash
 * stripped). Each distinct URL is its own article — Guardian sublinks ARE separate
 * articles (unlike Google News per-publisher sub-listings). Titles are display
 * metadata. "Most viewed" / duplicate placements share a URL, so core grays them
 * as repeats once the article has been seen.
 *
 * We track ONE root per article: the smallest wrapper holding both the article
 * link and its headline. Per-URL nested roots are pruned to the innermost so a
 * lead card never grays its own sublinks (and a card's picture-link + card-link
 * do not split into two halves).
 */
(function() {
  // /{section}/.../{YYYY}/{mon}/{DD}/{slug} — Guardian months are 3-letter abbrevs.
  const DATE_PATH = /\/\d{4}\/[a-z]{3}\/\d{1,2}\//;

  function isGuardianHost(hostname) {
    return (
      hostname === 'www.theguardian.com' ||
      hostname === 'theguardian.com' ||
      hostname.endsWith('.theguardian.com')
    );
  }

  function resolveUrl(href) {
    try {
      return new URL(href, window.location.href);
    } catch (_) {
      return null;
    }
  }

  function isArticleUrl(u) {
    return Boolean(u) && isGuardianHost(u.hostname) && DATE_PATH.test(u.pathname);
  }

  function isArticleAnchor(a) {
    if (!a || !a.getAttribute) return false;
    return isArticleUrl(resolveUrl(a.getAttribute('href')));
  }

  /** Canonical identity: https://host/path with query, hash and trailing slash removed. */
  function canonicalUrl(a) {
    if (!a || !a.getAttribute) return null;
    const u = resolveUrl(a.getAttribute('href'));
    if (!isArticleUrl(u)) return null;
    const path = u.pathname.replace(/\/+$/, '') || '/';
    return `https://${u.hostname}${path}`;
  }

  function norm(text) {
    const t = (text || '').replace(/\s+/g, ' ').trim();
    return t || null;
  }

  // Shadow DOM-aware query (consistent with nyt.js / googlenews.js).
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

  /**
   * The headline element tied to an article anchor:
   *   1. a structured headline inside the anchor (sublinks),
   *   2. a sibling card headline under the anchor's parent (overlay / picture cards),
   *   3. the anchor itself when it carries the headline as plain text ("Most viewed").
   * Returns null for media/image-only links that have no associated headline, so
   * each card contributes a single root.
   */
  function headlineForAnchor(a) {
    const inside = a.querySelector('.headline-text, .card-headline, .card-sublink-headline');
    if (inside) return inside;

    const parent = a.parentElement;
    if (parent) {
      const sibling = parent.querySelector('.card-headline, .headline-text');
      if (sibling) {
        // Only claim the sibling headline if it is not owned by a different link.
        const owner = sibling.closest('a[href]');
        if (!owner || owner === a) return sibling;
      }
    }

    if (norm(a.textContent)) return a;
    return null;
  }

  function headlineTextEl(root) {
    if (!root || typeof root.querySelector !== 'function') return null;
    return (
      root.querySelector('.headline-text') ||
      root.querySelector('.card-headline, .card-sublink-headline')
    );
  }

  /** A link that belongs to a sublink list item (a related article inside a card). */
  function isSublinkAnchor(a) {
    const dln = a.getAttribute('data-link-name') || '';
    if (/^\s*sublinks/i.test(dln)) return true;
    return Boolean(a.closest && a.closest('[data-link-name^="sublinks"], ul.sublinks'));
  }

  function articleAnchorIn(root) {
    if (!root) return null;
    if (root.tagName === 'A' && isArticleAnchor(root)) return root;
    // Headline inside an anchor (sublinks / "Most viewed" / wrapping links).
    const own = typeof root.closest === 'function' ? root.closest('a[href]') : null;
    if (own && isArticleAnchor(own)) return own;
    // An article link contained in the root (small self-contained wrappers).
    if (typeof root.querySelectorAll === 'function') {
      for (const a of root.querySelectorAll('a[href]')) {
        if (isArticleAnchor(a)) return a;
      }
    }
    // Overlay / picture lead: the card link is a sibling of the headline block.
    // Climb to the card and take the first NON-sublink article link (so we get the
    // lead's URL, not one of its sublinks).
    let n = root.parentElement;
    for (let i = 0; n && i < 5; i++, n = n.parentElement) {
      if (typeof n.querySelectorAll !== 'function') continue;
      for (const a of n.querySelectorAll('a[href]')) {
        if (isArticleAnchor(a) && !isSublinkAnchor(a)) return a;
      }
    }
    return null;
  }

  function getArticleUrl(root) {
    return canonicalUrl(articleAnchorIn(root));
  }

  function getArticleTitle(root) {
    if (!root) return null;
    const h = headlineTextEl(root);
    if (h) return norm(h.textContent);
    const a = articleAnchorIn(root);
    if (a) return norm(a.textContent);
    return norm(root.textContent);
  }

  function getVisibilityTargets(root) {
    const h = headlineTextEl(root);
    if (h) return [h];
    const a = articleAnchorIn(root);
    if (a) return [a];
    return [root];
  }

  /** Trail / standfirst text under the headline; the headline is stripped to avoid duplication. */
  function getBlockTopicHaystack(root) {
    if (!root || typeof root.cloneNode !== 'function') return '';
    const clone = root.cloneNode(true);
    clone
      .querySelectorAll('.card-headline, .card-sublink-headline')
      .forEach(el => el.remove());
    return norm(clone.textContent) || '';
  }

  /**
   * The element to gray for an article. Must not enclose a different article, so a
   * seen lead never dims its own (possibly unseen) sublinks.
   *   - Headline owned by the anchor (sublink / "Most viewed"): the list item.
   *   - Overlay / picture lead: the headline block (headline + trail), shrinking to
   *     the headline itself if that block would still contain sublinks.
   */
  function rootForAnchor(a, headline) {
    if (a.contains(headline) || headline === a) {
      return a.closest('li') || a;
    }
    const h = headline.closest('.card-headline, .card-sublink-headline') || headline;
    const block = h.parentElement || h;
    const hasSublinks =
      typeof block.querySelector === 'function' &&
      block.querySelector('[data-link-name^="sublinks"], ul.sublinks');
    return hasSublinks ? h : block;
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
      const headline = headlineForAnchor(a);
      if (!headline) continue;
      add(id, rootForAnchor(a, headline));
    }

    for (const [id, set] of articles) {
      articles.set(id, new Set(pruneNestedRoots(set)));
    }

    return articles;
  }

  function isHomepage() {
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    return (
      path === '/' ||
      path === '/us' ||
      path === '/uk' ||
      path === '/au' ||
      path === '/europe' ||
      path === '/international'
    );
  }

  window.NunusSites = window.NunusSites || {};
  window.NunusSites.guardian = {
    findArticles,
    isHomepage,
    getVisibilityTargets,
    getBlockTopicHaystack,
    getArticleUrl,
    getArticleTitle
  };
})();
