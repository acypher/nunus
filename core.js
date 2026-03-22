/**
 * Nunus - Core shared logic for graying out viewed articles.
 * "Viewed" = headline (or site.getVisibilityTargets) has ≥20px visible in the
 * viewport (per axis, capped to element size) for at least 3 seconds continuously.
 *
 * "Session" for gray-out / newly-viewed is tab-local: window.sessionStorage
 * (survives reload in the same tab; new tab = fresh session).
 *
 * Same title on the page more than once: after you read it this session, only the
 * canonical occurrence stays ungrayed; extra placements are grayed as duplicates.
 */

const VIEW_THRESHOLD_MS = 3000;
const CHECK_INTERVAL_MS = 500;
/** Min visible width/height (px) of the title rect inside the viewport. */
const TITLE_VISIBLE_MIN_PX = 20;
const STORAGE_KEY = 'nunus_viewed_articles';
const LEGACY_STORAGE_KEY = 'nunusnyt_viewed_articles';
const SESSION_KEY = 'nunus_session_viewed';

/** storage key -> root kept ungrayed this session when the same story appears twice */
const sessionCanonicalRootByKey = new Map();

const VIEWED_STYLE = {
  opacity: '0.4',
  filter: 'grayscale(0.8)',
  transition: 'opacity 0.3s ease, filter 0.3s ease'
};

function getTabSessionViewedSet() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (_) {
    return new Set();
  }
}

function saveTabSessionViewedSet(sessionViewed) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify([...sessionViewed]));
  } catch (_) {}
}

/** Title counts as visible only if the viewport overlap is at least TITLE_VISIBLE_MIN_PX on each axis (or the full element if smaller). */
function isRectIntersectingViewport(element) {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const right = Math.min(vw, rect.right);
  const bottom = Math.min(vh, rect.bottom);
  const visW = right - left;
  const visH = bottom - top;
  if (visW <= 0 || visH <= 0) return false;
  const needW = Math.min(TITLE_VISIBLE_MIN_PX, rect.width);
  const needH = Math.min(TITLE_VISIBLE_MIN_PX, rect.height);
  return visW >= needW && visH >= needH;
}

function titleVisibleForTracking(site, articleRoot) {
  const raw =
    typeof site.getVisibilityTargets === 'function'
      ? site.getVisibilityTargets(articleRoot)
      : [articleRoot];
  const targets = Array.isArray(raw) && raw.length ? raw : [articleRoot];
  return targets.some(el => el && isRectIntersectingViewport(el));
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

function getViewedKey(hostname, articleId) {
  return hostname + '|' + articleId;
}

function isArticleViewed(viewed, hostname, articleId) {
  return viewed.has(getViewedKey(hostname, articleId)) || viewed.has(articleId);
}

async function markAsViewed(articleId, canonicalRoot) {
  const hostname = window.location.hostname;
  const key = getViewedKey(hostname, articleId);
  const viewed = await getViewed();
  viewed.add(key);
  await chrome.storage.local.set({ [STORAGE_KEY]: [...viewed] });

  const sessionViewed = getTabSessionViewedSet();
  sessionViewed.add(key);
  saveTabSessionViewedSet(sessionViewed);

  if (canonicalRoot instanceof Element) {
    sessionCanonicalRootByKey.set(key, canonicalRoot);
  }
}

function applyViewedStyle(element) {
  element.style.opacity = VIEWED_STYLE.opacity;
  element.style.filter = VIEWED_STYLE.filter;
  element.style.transition = VIEWED_STYLE.transition;
  element.dataset.nunusViewed = 'true';
}

function removeViewedStyle(element) {
  if (element.dataset.nunusViewed !== 'true') return;
  element.style.opacity = '';
  element.style.filter = '';
  element.style.transition = '';
  delete element.dataset.nunusViewed;
}

function syncGrayForElements(elements, id, viewedArticles, sessionViewed, hostname) {
  const gray = shouldGrayOut(viewedArticles, sessionViewed, hostname, id);
  for (const element of elements) {
    if (gray) applyViewedStyle(element);
    else removeViewedStyle(element);
  }
}

/**
 * Run the main logic with a site-specific handler.
 * @param {Object} site - { isHomepage, findArticles, getVisibilityTargets? }
 */
function shouldGrayOut(viewedArticles, sessionViewed, hostname, articleId) {
  if (!isArticleViewed(viewedArticles, hostname, articleId)) return false;
  const key = getViewedKey(hostname, articleId);
  return !sessionViewed.has(key);
}

/** Unique article roots from findArticles(), in document order. */
function flattenArticleRoots(articlesMap) {
  const all = new Set();
  for (const set of articlesMap.values()) {
    for (const el of set) all.add(el);
  }
  const arr = [...all];
  arr.sort((a, b) => {
    const pos = a.compareDocumentPosition(b);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });
  return arr;
}

function maxScrollY() {
  const vh = window.innerHeight;
  const h = Math.max(
    document.documentElement.scrollHeight,
    document.body?.scrollHeight || 0
  );
  return Math.max(0, h - vh);
}

/**
 * Alt/Option + ArrowDown: scroll ≥1 viewport past current position, skipping gray
 * cards until a non-gray article can sit at the top of the viewport.
 */
function registerSkipGrayScroll(site) {
  if (typeof site.isHomepage !== 'function') return;

  document.addEventListener(
    'keydown',
    e => {
      if (!e.altKey || e.key !== 'ArrowDown' || e.metaKey || e.ctrlKey) return;
      if (e.shiftKey) return;
      if (!site.isHomepage()) return;

      const roots = flattenArticleRoots(site.findArticles());
      if (roots.length === 0) return;

      e.preventDefault();
      e.stopPropagation();

      const vh = window.innerHeight;
      const minScrollY = window.scrollY + vh;
      const cap = maxScrollY();

      for (const el of roots) {
        if (!el.isConnected) continue;
        const docTop = el.getBoundingClientRect().top + window.scrollY;
        if (docTop + 0.5 < minScrollY) continue;
        if (el.dataset.nunusViewed === 'true') continue;
        window.scrollTo({
          top: Math.min(docTop, cap),
          behavior: 'smooth'
        });
        return;
      }

      window.scrollTo({ top: Math.min(minScrollY, cap), behavior: 'smooth' });
    },
    true
  );
}

async function run(site) {
  const hostname = window.location.hostname;
  const viewedArticles = await getViewed();
  const sessionViewed = getTabSessionViewedSet();
  const articles = site.findArticles();

  const visibilityTime = new Map();
  const trackedIds = new Set([...articles.keys()].filter(id => !isArticleViewed(viewedArticles, hostname, id)));

  const mergeNewArticles = async () => {
    const sessionNow = getTabSessionViewedSet();
    const newArticles = site.findArticles();
    for (const [id, elements] of newArticles) {
      if (!articles.has(id)) {
        articles.set(id, new Set(elements));
        if (!isArticleViewed(viewedArticles, hostname, id)) trackedIds.add(id);
      } else {
        for (const element of elements) articles.get(id).add(element);
      }
      syncGrayForElements([...elements], id, viewedArticles, sessionNow, hostname);
    }
  };

  // Sync gray from persistent storage vs this tab's session; strip when session has the key.
  for (const [id, elements] of articles) {
    syncGrayForElements([...elements], id, viewedArticles, sessionViewed, hostname);
  }

  const checkVisibility = async () => {
    for (const [id, elements] of articles) {
      if (!trackedIds.has(id)) continue;

      const visibleRoots = [...elements].filter(
        el =>
          el.dataset.nunusViewed !== 'true' &&
          titleVisibleForTracking(site, el)
      );
      sortRootsByDocumentOrder(visibleRoots);

      if (visibleRoots.length > 0) {
        const current = visibilityTime.get(id) || 0;
        const newTime = current + CHECK_INTERVAL_MS;
        visibilityTime.set(id, newTime);
        if (newTime >= VIEW_THRESHOLD_MS) {
          trackedIds.delete(id);
          visibilityTime.delete(id);
          const canonical = visibleRoots[0];
          await markAsViewed(id, canonical);
          await mergeNewArticles();
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

  registerSkipGrayScroll(site);
}

window.NunusRun = run;
