/** Washington Post homepage headline tracking. */
(function() {
  const headlineSelector = 'a[data-pb-local-content-field="web_headline"], h1 a[href], h2 a[href], h3 a[href]';
  const urlPattern = /\/\d{4}\/\d{1,2}\/\d{1,2}(\/|$)|_story\.html$/;
  const undatedContentPattern = /^\/(?:podcasts\/[^/]+\/[^/]+|recipes\/(?!search(?:\/|$))[^/]+)\/?$/;
  const cardSelector = '[data-feature-id="homepage/story"], article, [data-article-id], .card';

  function articleUrl(link) {
    try {
      const url = new URL(link.href, window.location.href);
      const isMainSite = /^(www\.)?washingtonpost\.com$/.test(url.hostname);
      const isIntelligence = url.hostname === 'wpintelligence.washingtonpost.com';
      if (!/^https?:$/.test(url.protocol) ||
          !(isMainSite || isIntelligence) ||
          !(urlPattern.test(url.pathname) ||
            (isMainSite && undatedContentPattern.test(url.pathname)))) return null;
      url.search = '';
      url.hash = '';
      return url.href;
    } catch (_) {
      return null;
    }
  }

  function headlineLinks(root) {
    const links = new Set();
    if (root.matches?.('a[href]')) links.add(root);
    for (const link of root.querySelectorAll(headlineSelector)) links.add(link);
    // Some layouts wrap the heading in a link rather than putting a link inside it.
    for (const heading of root.querySelectorAll('h1, h2, h3')) {
      const link = heading.closest('a[href]');
      if (link) links.add(link);
    }
    return [...links].filter(link => articleUrl(link) && link.textContent.trim());
  }

  function headlineLink(root) {
    return root ? headlineLinks(root)[0] || null : null;
  }

  function getArticleTitle(root) {
    const link = headlineLink(root);
    return link?.textContent.trim().replace(/\s+/g, ' ') || null;
  }

  function getArticleUrl(root) {
    const link = headlineLink(root);
    return link ? articleUrl(link) : null;
  }

  function findArticles() {
    const articles = new Map();
    for (const link of headlineLinks(document)) {
      const id = articleUrl(link);
      const card = link.closest(cardSelector);
      // A section-wide card must never stand in for several separate headlines.
      const root = card && new Set(headlineLinks(card).map(articleUrl)).size === 1
        ? card : link;
      if (!articles.has(id)) articles.set(id, new Set());
      articles.get(id).add(root);
    }
    return articles;
  }

  function isHomepage() {
    return ['/', '', '/index.html'].includes(window.location.pathname);
  }

  function getVisibilityTargets(root) {
    const link = headlineLink(root);
    return link ? [link] : [];
  }

  function getBlockTopicHaystack(root) {
    return root?.querySelector('[data-testid="article-lede"], .font--subhead, [data-pb-type="description"], .description')
      ?.textContent.trim().replace(/\s+/g, ' ') || '';
  }

  window.NunusSites = window.NunusSites || {};
  window.NunusSites.washingtonpost = {
    findArticles,
    isHomepage,
    getVisibilityTargets,
    getBlockTopicHaystack,
    getArticleUrl,
    getArticleTitle
  };
})();
