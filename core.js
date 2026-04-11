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

/** WebExtension namespace: prefer `browser` when present, else `chrome`. */
const ext = globalThis.browser ?? globalThis.chrome;

const VIEW_THRESHOLD_MS = 3000;
const CHECK_INTERVAL_MS = 500;
/** Min visible width/height (px) of the title rect inside the viewport. */
const TITLE_VISIBLE_MIN_PX = 20;
const STORAGE_KEY = 'nunus_viewed_articles';
const LEGACY_STORAGE_KEY = 'nunusnyt_viewed_articles';
const STORAGE_BLOCK_TOPICS_KEY = 'nunus_block_topics';
const SESSION_KEY = 'nunus_session_viewed';

/** storage key -> root kept ungrayed this session when the same story appears twice */
const sessionCanonicalRootByKey = new Map();

const VIEWED_STYLE = {
  opacity: '0.2',
  filter: 'grayscale(1) brightness(0.72)',
  transition: 'opacity 0.3s ease, filter 0.3s ease'
};

/** Same visuals as viewed; kept as an alias for topic-blocked code paths. */
const TOPIC_BLOCKED_STYLE = VIEWED_STYLE;

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

// In-memory cache — avoids hitting extension storage on every markAsViewed call
let _viewedCache = null;

async function loadViewedArticles() {
  const result = await ext.storage.local.get([STORAGE_KEY, LEGACY_STORAGE_KEY]);
  let current = new Set(result[STORAGE_KEY] || []);
  const legacy = result[LEGACY_STORAGE_KEY] || [];

  // Migrate legacy storage
  if (legacy.length > 0) {
    legacy.forEach(id => current.add(id));
    await ext.storage.local.remove(LEGACY_STORAGE_KEY);
    await ext.storage.local.set({ [STORAGE_KEY]: [...current] });
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
  await ext.storage.local.set({ [STORAGE_KEY]: [...viewed] });

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

function normalizeBlockTopics(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map(t => String(t).trim()).filter(Boolean))];
}

async function loadBlockTopics() {
  const r = await ext.storage.local.get({ [STORAGE_BLOCK_TOPICS_KEY]: [] });
  return normalizeBlockTopics(r[STORAGE_BLOCK_TOPICS_KEY]);
}

/** Strip surrounding punctuation so "Wordle," still matches. */
function normalizeBlockTopicToken(w) {
  return w.replace(/^[\s"'“”‘’.,!?:;()[\]{}]+|[\s"'“”‘’.,!?:;()[\]{}]+$/g, '').trim();
}

/**
 * Each whitespace-separated word in the topic must appear somewhere in the haystack
 * (title + lede); words need not be adjacent. Case-insensitive.
 */
function topicMatchesHaystack(haystackLower, topic) {
  const raw = String(topic).trim().toLowerCase();
  if (!raw) return false;
  const tokens = raw.split(/\s+/).map(normalizeBlockTopicToken).filter(Boolean);
  if (tokens.length === 0) return false;
  return tokens.every(t => haystackLower.includes(t));
}

function getBlockTopicHaystack(site, articleRoot, titleId) {
  const title = String(titleId || '').trim();
  let extra = '';
  if (articleRoot && typeof site.getBlockTopicHaystack === 'function') {
    const s = site.getBlockTopicHaystack(articleRoot);
    if (s && typeof s === 'string') extra = s.trim().replace(/\s+/g, ' ');
  }
  if (!title) return extra;
  if (!extra) return title;
  return `${title} ${extra}`;
}

function pickArticleRootForTopics(elements) {
  const arr = [...elements];
  return arr.find(el => el.isConnected) || arr[0] || null;
}

function articleMatchesBlockTopics(site, articleRoot, articleId, blockTopics) {
  if (!blockTopics.length) return false;
  const haystack = getBlockTopicHaystack(site, articleRoot, articleId).toLowerCase();
  if (!haystack) return false;
  return blockTopics.some(topic => topicMatchesHaystack(haystack, topic));
}

function applyTopicBlockedStyle(element) {
  element.style.opacity = TOPIC_BLOCKED_STYLE.opacity;
  element.style.filter = TOPIC_BLOCKED_STYLE.filter;
  element.style.transition = TOPIC_BLOCKED_STYLE.transition;
  element.dataset.nunusTopicBlocked = 'true';
}

function removeTopicBlockedStyle(element) {
  if (element.dataset.nunusTopicBlocked !== 'true') return;
  element.style.opacity = '';
  element.style.filter = '';
  element.style.transition = '';
  delete element.dataset.nunusTopicBlocked;
}

function syncGrayForElements(
  site,
  elements,
  id,
  viewedArticles,
  sessionViewed,
  hostname,
  blockTopics
) {
  const key = getViewedKey(hostname, id);
  let storedCanonical = sessionCanonicalRootByKey.get(key);
  if (storedCanonical && !storedCanonical.isConnected) {
    sessionCanonicalRootByKey.delete(key);
    storedCanonical = undefined;
  }
  const inStorage = isArticleViewed(viewedArticles, hostname, id);
  const inSession = sessionViewed.has(key);
  let canonicalLive = storedCanonical?.isConnected ? storedCanonical : null;
  if (inSession && !canonicalLive && elements.length) {
    const arr = [...elements].filter(el => el.isConnected);
    sortRootsByDocumentOrder(arr);
    canonicalLive = arr[0] || null;
  }

  const topics = blockTopics || [];

  const topicRoot = pickArticleRootForTopics(elements);
  for (const element of elements) {
    if (articleMatchesBlockTopics(site, topicRoot, id, topics)) {
      removeViewedStyle(element);
      applyTopicBlockedStyle(element);
      continue;
    }
    removeTopicBlockedStyle(element);

    let gray = false;
    if (!inStorage) {
      gray = false;
    } else if (!inSession) {
      gray = true;
    } else if (canonicalLive && element !== canonicalLive) {
      gray = true;
    } else {
      gray = false;
    }
    if (gray) applyViewedStyle(element);
    else removeViewedStyle(element);
  }
}

/** Unique article roots from findArticles(), in document order. */
function flattenArticleRoots(articlesMap) {
  const all = new Set();
  for (const set of articlesMap.values()) {
    for (const el of set) all.add(el);
  }
  const arr = [...all];
  sortRootsByDocumentOrder(arr);
  return arr;
}

function sortRootsByDocumentOrder(roots) {
  roots.sort((a, b) => {
    const pos = a.compareDocumentPosition(b);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });
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
 * Alt/Option + ArrowDown: scroll so the next unviewed article can sit at the top
 * of the viewport (skipping gray cards). If there is no such article below,
 * scroll to the bottom of the page.
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
        if (el.dataset.nunusTopicBlocked === 'true') continue;
        if (el.dataset.nunusViewed === 'true') continue;
        window.scrollTo({
          top: Math.min(docTop, cap),
          behavior: 'smooth'
        });
        return;
      }

      window.scrollTo({ top: cap, behavior: 'smooth' });
    },
    true
  );
}

async function run(site) {
  const hostname = window.location.hostname;
  const viewedArticles = await getViewed();
  const sessionViewed = getTabSessionViewedSet();
  let blockTopics = await loadBlockTopics();
  const articles = site.findArticles();

  /** performance.now() when the headline first met the visibility rule this dwell episode */
  const dwellStartById = new Map();
  const trackedIds = new Set(
    [...articles.entries()]
      .filter(([id, elSet]) => {
        if (isArticleViewed(viewedArticles, hostname, id)) return false;
        const root = pickArticleRootForTopics([...elSet]);
        return !articleMatchesBlockTopics(site, root, id, blockTopics);
      })
      .map(([id]) => id)
  );

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      dwellStartById.clear();
    }
  });

  const mergeNewArticles = async () => {
    blockTopics = await loadBlockTopics();
    const sessionNow = getTabSessionViewedSet();
    const newArticles = site.findArticles();
    for (const [id, elements] of newArticles) {
      if (!articles.has(id)) {
        articles.set(id, new Set(elements));
      } else {
        for (const element of elements) articles.get(id).add(element);
      }
      const root = pickArticleRootForTopics([...elements]);
      if (articleMatchesBlockTopics(site, root, id, blockTopics)) trackedIds.delete(id);
      else if (!isArticleViewed(viewedArticles, hostname, id)) trackedIds.add(id);
      syncGrayForElements(
        site,
        [...elements],
        id,
        viewedArticles,
        sessionNow,
        hostname,
        blockTopics
      );
    }
  };

  // Sync gray from persistent storage vs this tab's session; strip when session has the key.
  for (const [id, elements] of articles) {
    syncGrayForElements(
      site,
      [...elements],
      id,
      viewedArticles,
      sessionViewed,
      hostname,
      blockTopics
    );
  }

  try {
    ext.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[STORAGE_BLOCK_TOPICS_KEY]) return;
      void mergeNewArticles();
    });
  } catch (_) {}

  let visibilityCheckRunning = false;

  const checkVisibility = async () => {
    const now = performance.now();
    for (const [id, elements] of articles) {
      if (!trackedIds.has(id)) continue;
      const topicRoot = pickArticleRootForTopics([...elements]);
      if (articleMatchesBlockTopics(site, topicRoot, id, blockTopics)) continue;

      const visibleRoots = [...elements].filter(
        el =>
          el.dataset.nunusViewed !== 'true' &&
          el.dataset.nunusTopicBlocked !== 'true' &&
          titleVisibleForTracking(site, el)
      );
      sortRootsByDocumentOrder(visibleRoots);

      if (visibleRoots.length > 0) {
        if (!dwellStartById.has(id)) {
          dwellStartById.set(id, now);
        }
        const start = dwellStartById.get(id);
        if (now - start >= VIEW_THRESHOLD_MS) {
          trackedIds.delete(id);
          dwellStartById.delete(id);
          const canonical = visibleRoots[0];
          await markAsViewed(id, canonical);
          await mergeNewArticles();
        }
      } else {
        dwellStartById.delete(id);
      }
    }
  };

  // Poll only when tab is visible. Skip re-entrancy while a run awaits storage so
  // overlapping timers cannot credit extra dwell toward the threshold.
  const checkVisibilityLoop = () => {
    setTimeout(checkVisibilityLoop, CHECK_INTERVAL_MS);
    if (document.visibilityState === 'hidden' || visibilityCheckRunning) return;
    visibilityCheckRunning = true;
    void checkVisibility().finally(() => {
      visibilityCheckRunning = false;
    });
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
