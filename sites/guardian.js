/**
 * The Guardian site handler
 */
(function() {
  const linkSelector = 'a[href*="theguardian.com/"], a[href*="guardian.co.uk/"]';
  const urlPattern = /\/\d{4}\/\d{1,2}\/\d{1,2}(\/|$)|\/[a-z-]+\/\d{4}\//;
  const containerSelectors = 'article, [data-link-name], [data-component], section, div[class*="fc-item"], div[class*="card"]';

  const selectors = [
    'article',
    '[data-link-name="article"]',
    '[data-component="card"]',
    'a[href*="theguardian.com/"][href*="/20"], a[href*="guardian.co.uk/"][href*="/20"]',
    'a[href*="theguardian.com/"][href*="/us/"], a[href*="guardian.co.uk/"][href*="/us/"]',
    'a[href*="theguardian.com/"][href*="/world/"], a[href*="guardian.co.uk/"][href*="/world/"]',
    'a[href*="theguardian.com/"][href*="/uk/"], a[href*="guardian.co.uk/"][href*="/uk/"]',
    'a[href*="theguardian.com/"][href*="/politics/"], a[href*="guardian.co.uk/"][href*="/politics/"]',
    'a[href*="theguardian.com/"][href*="/sport/"], a[href*="guardian.co.uk/"][href*="/sport/"]',
    'a[href*="theguardian.com/"][href*="/culture/"], a[href*="guardian.co.uk/"][href*="/culture/"]',
    'a[href*="theguardian.com/"][href*="/business/"], a[href*="guardian.co.uk/"][href*="/business/"]',
    'a[href*="theguardian.com/"][href*="/technology/"], a[href*="guardian.co.uk/"][href*="/technology/"]',
    'a[href*="theguardian.com/"][href*="/science/"], a[href*="guardian.co.uk/"][href*="/science/"]'
  ];

  function normalizeTitle(text) {
    let t = text.split('\n')[0].trim().replace(/\s+/g, ' ');
    t = t.replace(/\s+By\s+[A-Za-z].*$/i, '').trim();
    t = t.replace(/\s+[-|]\s+.*$/, '').trim();
    return t || null;
  }

  function getArticleId(element) {
    const link = element.querySelector(linkSelector)
      || element.closest(linkSelector)
      || (element.tagName === 'A' ? element : null);
    if (!link || !link.href) return null;
    const url = new URL(link.href);
    if (!urlPattern.test(url.pathname)) return null;
    return normalizeTitle(link.textContent);
  }

  // Shadow DOM-aware query (consistent with nyt.js)
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

  function findArticles() {
    const articles = new Map();
    const add = (id, el) => {
      if (!id || !el) return;
      if (!articles.has(id)) articles.set(id, new Set());
      articles.get(id).add(el);
    };

    for (const selector of selectors) {
      for (const el of queryAll(document, selector)) {
        const articleEl = el.tagName === 'A'
          ? el.closest(containerSelectors) || el
          : el;
        if (!articleEl) continue;
        const id = getArticleId(articleEl);
        add(id, articleEl);
      }
    }

    for (const link of queryAll(document, linkSelector)) {
      const id = getArticleId(link);
      if (id) {
        const articleEl = link.closest('article')
          || link.closest('[data-link-name]')
          || link.closest('[data-component]')
          || link.closest(containerSelectors)
          || link.parentElement?.closest('div')
          || link.parentElement
          || link;
        add(id, articleEl);
      }
    }

    return articles;
  }

  function isHomepage() {
    const path = window.location.pathname;
    return path === '/' || path === '' || path === '/us' || path === '/uk';
  }

  function getVisibilityTargets(root) {
    const link =
      root.querySelector(linkSelector) || root.closest(linkSelector);
    if (link) return [link];
    return [root];
  }

  /** Standfirst / trail text when present on front cards. */
  function getBlockTopicHaystack(root) {
    if (!root) return '';
    const el =
      root.querySelector('.fc-item__standfirst') ||
      root.querySelector('[class*="standfirst"]');
    if (!el) return '';
    const t = normalizeTitle(el.textContent);
    return t || '';
  }

  window.NunusSites = window.NunusSites || {};
  window.NunusSites.guardian = {
    findArticles,
    isHomepage,
    getVisibilityTargets,
    getBlockTopicHaystack
  };
})();
