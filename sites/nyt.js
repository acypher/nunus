/**
 * New York Times site handler
 */
(function() {
  const linkSelector = 'a[href*="nytimes.com/"]';
  const urlPattern = /\/\d{4}\/\d{1,2}\/\d{1,2}(\/|$)/;
  const containerSelectors = 'article, [data-testid="article-card"], [data-testid="story-wrapper"], section.story-wrapper, section, div[class*="carousel"], div[class*="PersonalizedAddOn"], div[class*="StoryWrapper"]';

  const selectors = [
    'article[data-story-id]',
    '[data-testid="article-card"]',
    '[data-testid="story-wrapper"]',
    'article.story',
    'article.lede',
    'article.theme-summary',
    'article',
    '[class*="StoryWrapper"] a[href*="nytimes.com/"]',
    '[class*="storyWrapper"] a[href*="nytimes.com/"]',
    'a[href*="nytimes.com/"][href*="/20"]',
  ];

  function getArticleId(element) {
    const link = element.querySelector(linkSelector)
      || element.closest(linkSelector)
      || (element.tagName === 'A' ? element : null);
    if (!link || !link.href) return null;
    const url = new URL(link.href);
    if (!urlPattern.test(url.pathname)) return null;
    const title = link.textContent.trim().replace(/\s+/g, ' ');
    if (!title) return null;
    return title;
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
          || link.closest('[data-testid="article-card"]')
          || link.closest('[data-testid="story-wrapper"]')
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
    return path === '/' || path === '' || path === '/index.html';
  }

  window.NunusSites = window.NunusSites || {};
  window.NunusSites.nyt = { findArticles, isHomepage };
})();
