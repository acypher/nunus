/**
 * Washington Post site handler
 */
(function() {
  const linkSelector = 'a[href*="washingtonpost.com/"]';
  const urlPattern = /\/\d{4}\/\d{1,2}\/\d{1,2}(\/|$)|_[a-zA-Z0-9]+_story\.|_story\.html/;
  const containerSelectors = 'article, [data-pb-layout], [data-article-id], section, div[class*="story"], div[class*="card"]';

  const selectors = [
    'article',
    '[data-pb-layout]',
    '[data-article-id]',
    'a[href*="washingtonpost.com/"][href*="/20"]',
    'a[href*="washingtonpost.com/"][href*="_story"]',
    'a[href*="washingtonpost.com/"][href*="_story.html"]'
  ];

  function getArticleId(element) {
    const link = element.querySelector(linkSelector) || element.closest(linkSelector) || (element.tagName === 'A' ? element : null);
    if (!link || !link.href) return null;
    const url = new URL(link.href);
    if (!urlPattern.test(url.pathname)) return null;
    const title = link.textContent.trim().replace(/\s+/g, ' ');
    if (!title) return null;
    return title;
  }

  function findArticles() {
    const articles = new Map();
    const add = (id, el) => {
      if (!id || !el) return;
      if (!articles.has(id)) articles.set(id, new Set());
      articles.get(id).add(el);
    };

    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        const articleEl = el.tagName === 'A' ? el.closest(containerSelectors) || el : el;
        if (!articleEl) continue;
        const id = getArticleId(articleEl);
        add(id, articleEl);
      }
    }

    for (const link of document.querySelectorAll(linkSelector)) {
      const id = getArticleId(link);
      if (id) {
        const articleEl = link.closest('article') || link.closest('[data-pb-layout]') || link.closest('[data-article-id]') || link.closest(containerSelectors) || link.parentElement?.closest('div') || link.parentElement || link;
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
  window.NunusSites.washingtonpost = { findArticles, isHomepage };
})();
