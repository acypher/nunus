/**
 * Nunus - Core shared logic for graying out viewed articles.
 * "Viewed" = top third of article visible for at least 3 seconds.
 */

const VIEW_THRESHOLD_MS = 3000;
const CHECK_INTERVAL_MS = 500;
const STORAGE_KEY = 'nunus_viewed_articles';
const LEGACY_STORAGE_KEY = 'nunusnyt_viewed_articles';

const VIEWED_STYLE = {
  opacity: '0.4',
  filter: 'grayscale(0.8)',
  transition: 'opacity 0.3s ease, filter 0.3s ease'
};

function isTopThirdVisible(element) {
  const rect = element.getBoundingClientRect();
  const topThirdBottom = rect.top + rect.height / 3;
  const viewportHeight = window.innerHeight;
  return rect.top < viewportHeight && topThirdBottom > 0;
}

// In-memory cache — avoids hitting chrome.storage on every markAsViewed call
let _viewedCache = null;

async function loadViewedArticles() {
  const result = await chrome.storage.local.get([STORAGE_KEY, LEGACY_STORAGE_KEY]);
  let current = new Set(result[STORAGE_KEY] || []);
  const legacy = result[LEGACY_STORAGE_KEY] || [];

  // Migrate legacy storage
  if (legacy.length > 0) {
    legacy.forEach(id => current.add(id));
    await chrome.storage.local.remove(LEGACY_STORAGE_KEY);
    await chrome.storage.local.set({ [STORAGE_KEY]: [...current] });
  }

  return current;
}

async function getViewed() {
  if (!_viewedCache) _viewedCache = await loadViewedArticles();
  return _viewedCache;
}

async function markAsViewed(articleId) {
  const viewed = await getViewed();
  viewed.add(articleId);
  await chrome.storage.local.set({ [STORAGE_KEY]: [...viewed] });
}

function applyViewedStyle(element) {
  element.style.opacity = VIEWED_STYLE.opacity;
  element.style.filter = VIEWED_STYLE.filter;
  element.style.transition = VIEWED_STYLE.transition;
  element.dataset.nunusViewed = 'true';
}

/**
 * Run the main logic with a site-specific handler.
 * @param {Object} site - { isHomepage, findArticles }
 */
async function run(site) {
  const viewedArticles = await getViewed();
  const articles = site.findArticles();

  // Apply viewed style to already-seen articles immediately
  for (const [id, elements] of articles) {
    if (viewedArticles.has(id)) {
      for (const element of elements) {
        applyViewedStyle(element);
      }
    }
  }

  const visibilityTime = new Map();
  const trackedIds = new Set([...articles.keys()].filter(id => !viewedArticles.has(id)));

  const checkVisibility = async () => {
    for (const [id, elements] of articles) {
      if (!trackedIds.has(id)) continue;
      const anyVisible = [...elements].some(el =>
        el.dataset.nunusViewed !== 'true' && isTopThirdVisible(el)
      );
      if (anyVisible) {
        const current = visibilityTime.get(id) || 0;
        const newTime = current + CHECK_INTERVAL_MS;
        visibilityTime.set(id, newTime);
        if (newTime >= VIEW_THRESHOLD_MS) {
          trackedIds.delete(id);
          visibilityTime.delete(id);
          await markAsViewed(id);
          for (const el of articles.get(id)) applyViewedStyle(el);
        }
      } else {
        visibilityTime.set(id, 0);
      }
    }
  };

  // Poll only when tab is visible
  const checkVisibilityLoop = () => {
    if (document.visibilityState !== 'hidden') {
      void checkVisibility();
    }
    setTimeout(checkVisibilityLoop, CHECK_INTERVAL_MS);
  };
  checkVisibilityLoop();

  const mergeNewArticles = () => {
    const newArticles = site.findArticles();
    for (const [id, elements] of newArticles) {
      if (viewedArticles.has(id)) {
        for (const element of elements) {
          if (element.dataset.nunusViewed !== 'true') applyViewedStyle(element);
        }
      }
      if (!articles.has(id)) {
        articles.set(id, new Set(elements));
        if (!viewedArticles.has(id)) trackedIds.add(id);
      } else {
        for (const element of elements) articles.get(id).add(element);
        if (viewedArticles.has(id)) {
          for (const element of elements) {
            if (element.dataset.nunusViewed !== 'true') applyViewedStyle(element);
          }
        }
      }
    }
  };

  // MutationObserver handles dynamic content
  const observer = new MutationObserver(() => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(mergeNewArticles);
    } else {
      mergeNewArticles();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // One safety-net rescan for lazy-loaded content
  setTimeout(mergeNewArticles, 2000);
}

window.NunusRun = run;
