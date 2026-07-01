/**
 * Nunus - Core shared logic for graying out viewed articles.
 * "Viewed" = headline (or site.getVisibilityTargets) has ≥20px visible in the
 * viewport (per axis, capped to element size) for at least 3 seconds continuously.
 *
 * "Session" for gray-out / newly-viewed is tab-local: window.sessionStorage
 * (survives reload in the same tab; new tab = fresh session).
 *
 * Same article URL on the page more than once: after you read it this session,
 * only the canonical occurrence stays ungrayed; extra placements are grayed as
 * duplicates. Titles are display metadata and may change for the same URL.
 */

/** WebExtension namespace: prefer `browser` when present, else `chrome`. */
const ext = globalThis.browser ?? globalThis.chrome;

function isExtensionContextValid() {
  try {
    return Boolean(ext?.runtime?.id);
  } catch (_) {
    return false;
  }
}

function isContextInvalidatedError(err) {
  const msg = err && (err.message || String(err));
  return typeof msg === 'string' && msg.includes('Extension context invalidated');
}

async function storageLocalGet(keysOrDefaults) {
  if (!isExtensionContextValid()) {
    if (Array.isArray(keysOrDefaults)) {
      const out = {};
      for (const k of keysOrDefaults) out[k] = undefined;
      return out;
    }
    return { ...keysOrDefaults };
  }
  try {
    return await ext.storage.local.get(keysOrDefaults);
  } catch (err) {
    if (isContextInvalidatedError(err)) {
      if (Array.isArray(keysOrDefaults)) {
        const out = {};
        for (const k of keysOrDefaults) out[k] = undefined;
        return out;
      }
      return { ...keysOrDefaults };
    }
    throw err;
  }
}

async function storageLocalSet(obj) {
  if (!isExtensionContextValid()) return false;
  try {
    await ext.storage.local.set(obj);
    return true;
  } catch (err) {
    if (isContextInvalidatedError(err)) return false;
    throw err;
  }
}

async function storageLocalRemove(keys) {
  if (!isExtensionContextValid()) return false;
  try {
    await ext.storage.local.remove(keys);
    return true;
  } catch (err) {
    if (isContextInvalidatedError(err)) return false;
    throw err;
  }
}

const VIEW_THRESHOLD_MS = 3000;
const CHECK_INTERVAL_MS = 500;
/** Min visible width/height (px) of the title rect inside the viewport. */
const TITLE_VISIBLE_MIN_PX = 20;
const STORAGE_KEY = 'nunus_viewed_articles';
const STORAGE_TITLES_KEY = 'nunus_viewed_article_titles';
const LEGACY_STORAGE_KEY = 'nunusnyt_viewed_articles';
const STORAGE_BLOCK_TOPICS_KEY = 'nunus_block_topics';
const SESSION_KEY = 'nunus_session_viewed';
const SESSION_TITLES_KEY = 'nunus_session_viewed_titles';

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

function getTabSessionTitleMap() {
  try {
    const raw = sessionStorage.getItem(SESSION_TITLES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out = {};
    for (const [key, titles] of Object.entries(parsed)) {
      if (!Array.isArray(titles)) continue;
      out[key] = [...new Set(titles.map(t => String(t).trim()).filter(Boolean))];
    }
    return out;
  } catch (_) {
    return {};
  }
}

function saveTabSessionTitleMap(titleMap) {
  try {
    sessionStorage.setItem(SESSION_TITLES_KEY, JSON.stringify(titleMap));
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
let _titleCache = null;

async function loadViewedArticles() {
  const result = await storageLocalGet([STORAGE_KEY, LEGACY_STORAGE_KEY]);
  let current = new Set(result[STORAGE_KEY] || []);
  const legacy = result[LEGACY_STORAGE_KEY] || [];

  // Migrate legacy storage
  if (legacy.length > 0) {
    legacy.forEach(id => current.add(id));
    await storageLocalRemove(LEGACY_STORAGE_KEY);
    await storageLocalSet({ [STORAGE_KEY]: [...current] });
  }

  return current;
}

async function getViewed() {
  if (!_viewedCache) _viewedCache = await loadViewedArticles();
  return _viewedCache;
}

async function loadViewedArticleTitles() {
  const result = await storageLocalGet({ [STORAGE_TITLES_KEY]: {} });
  const raw = result[STORAGE_TITLES_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, titles] of Object.entries(raw)) {
    if (!Array.isArray(titles)) continue;
    out[key] = [...new Set(titles.map(t => String(t).trim()).filter(Boolean))];
  }
  return out;
}

async function getViewedArticleTitles() {
  if (!_titleCache) _titleCache = await loadViewedArticleTitles();
  return _titleCache;
}

function getViewedKey(hostname, articleId) {
  const id = normalizeArticleUrlKey(articleId) || String(articleId || '').trim();
  return hostname + '|' + id;
}

function isArticleViewed(viewed, hostname, articleId) {
  return viewed.has(getViewedKey(hostname, articleId)) || viewed.has(articleId);
}

function normalizeArticleUrlKey(rawUrl) {
  if (!rawUrl) return null;
  try {
    const u = new URL(rawUrl, window.location.href);
    const pathname = u.pathname.replace(/\/+$/, '') || '/';
    return `${u.hostname}${pathname}`;
  } catch (_) {
    return null;
  }
}

function getArticleDisplayTitle(site, articleRoot, fallback = '') {
  if (articleRoot && typeof site.getArticleTitle === 'function') {
    const title = String(site.getArticleTitle(articleRoot) || '').trim();
    if (title) return title.replace(/\s+/g, ' ');
  }
  return String(fallback || '').trim();
}

async function saveViewedState(viewed, sessionViewed) {
  await storageLocalSet({ [STORAGE_KEY]: [...viewed] });
  saveTabSessionViewedSet(sessionViewed);
}

function addTitleToMap(titleMap, key, title) {
  const t = String(title || '').trim().replace(/\s+/g, ' ');
  if (!key || !t) return false;
  if (/^https?:\/\//i.test(t) || /^[a-z0-9.-]+\.[a-z]{2,}\//i.test(t)) return false;
  const titles = Array.isArray(titleMap[key]) ? titleMap[key] : [];
  if (titles.includes(t)) return false;
  titleMap[key] = [...titles, t];
  return true;
}

async function rememberArticleTitles(site, articleId, elements, sessionViewed, hostname) {
  const key = getViewedKey(hostname, articleId);
  const titles = [];
  for (const element of elements) {
    const title = getArticleDisplayTitle(site, element);
    if (title && !titles.includes(title)) titles.push(title);
  }
  if (!titles.length) return;

  const titleMap = await getViewedArticleTitles();
  let localChanged = false;
  for (const title of titles) {
    localChanged = addTitleToMap(titleMap, key, title) || localChanged;
  }
  if (localChanged) {
    await storageLocalSet({ [STORAGE_TITLES_KEY]: titleMap });
  }

  if (!sessionViewed.has(key)) return;
  const sessionTitleMap = getTabSessionTitleMap();
  let sessionChanged = false;
  for (const title of titles) {
    sessionChanged = addTitleToMap(sessionTitleMap, key, title) || sessionChanged;
  }
  if (sessionChanged) {
    saveTabSessionTitleMap(sessionTitleMap);
  }
}

async function markAsViewed(site, articleId, canonicalRoot, allRoots) {
  const hostname = window.location.hostname;
  const key = getViewedKey(hostname, articleId);
  const viewed = await getViewed();
  viewed.add(key);

  const sessionViewed = getTabSessionViewedSet();
  sessionViewed.add(key);
  await saveViewedState(viewed, sessionViewed);

  if (canonicalRoot instanceof Element) {
    sessionCanonicalRootByKey.set(key, canonicalRoot);
  }
  const titleRoots = Array.isArray(allRoots) && allRoots.length
    ? allRoots.filter(el => el instanceof Element && el.isConnected)
    : [canonicalRoot];
  await rememberArticleTitles(site, articleId, titleRoots, sessionViewed, hostname);
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
  const r = await storageLocalGet({ [STORAGE_BLOCK_TOPICS_KEY]: [] });
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

/** Roots permanently grayed by site handler (never tracked or stored). */
const alwaysGrayRootsTracked = new Set();

function applyAlwaysGrayStyle(element) {
  applyViewedStyle(element);
  element.dataset.nunusAlwaysGray = 'true';
}

function removeAlwaysGrayStyle(element) {
  if (element.dataset.nunusAlwaysGray !== 'true') return;
  removeViewedStyle(element);
  delete element.dataset.nunusAlwaysGray;
}

function syncAlwaysGrayRoots(site) {
  if (typeof site.findAlwaysGrayRoots !== 'function') return;
  const next = new Set(
    site.findAlwaysGrayRoots().filter(el => el instanceof Element && el.isConnected)
  );
  for (const el of alwaysGrayRootsTracked) {
    if (!next.has(el)) removeAlwaysGrayStyle(el);
  }
  alwaysGrayRootsTracked.clear();
  for (const el of next) {
    applyAlwaysGrayStyle(el);
    alwaysGrayRootsTracked.add(el);
  }
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
  const topicTitle = getArticleDisplayTitle(site, topicRoot, id);
  for (const element of elements) {
    if (articleMatchesBlockTopics(site, topicRoot, topicTitle, topics)) {
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

function sortRootsByVisualPosition(roots, site) {
  roots.sort((a, b) => {
    const ar = scrollNavRect(site, a);
    const br = scrollNavRect(site, b);
    const atop = ar.top + window.scrollY;
    const btop = br.top + window.scrollY;

    // Treat tiny layout differences as the same visual row, then scan left to right.
    if (Math.abs(atop - btop) > 2) return atop - btop;
    if (Math.abs(ar.left - br.left) > 2) return ar.left - br.left;

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

function scrollNavTarget(site, articleRoot) {
  const raw =
    typeof site.getVisibilityTargets === 'function'
      ? site.getVisibilityTargets(articleRoot)
      : [articleRoot];
  const targets = Array.isArray(raw) && raw.length ? raw : [articleRoot];
  return targets.find(el => el && el.isConnected) || articleRoot;
}

function scrollNavRect(site, el) {
  return scrollNavTarget(site, el).getBoundingClientRect();
}

function scrollNavDocTop(site, el) {
  return scrollNavRect(site, el).top + window.scrollY;
}

function scrollNavDocBottom(site, el) {
  return scrollNavRect(site, el).bottom + window.scrollY;
}

/** Popup "Viewed Articles": seen on a previous load, gray on page (persistent, not this session). */
function isViewedArticlesListEntry(viewedArticles, sessionViewed, key) {
  return viewedArticles.has(key) && !sessionViewed.has(key);
}

/** root element -> storage key, for scroll-nav lookups. */
function buildRootToKeyMap(articlesMap, hostname) {
  const map = new Map();
  for (const [id, elements] of articlesMap) {
    const key = getViewedKey(hostname, id);
    for (const el of elements) map.set(el, key);
  }
  return map;
}

/** Shared eligibility: not grayed, not topic-blocked, on-screen column. */
function isOptionScrollEligible(el, vw, viewedArticles, sessionViewed, rootToKey) {
  if (!el.isConnected) return false;
  if (el.dataset.nunusTopicBlocked === 'true') return false;
  // Never stop on a visually grayed card. Covers previous-load views AND
  // duplicate occurrences of an article already viewed this session (whose key
  // is in sessionViewed, so the list-entry check below would miss them).
  if (el.dataset.nunusViewed === 'true') return false;
  const rect = el.getBoundingClientRect();
  if (rect.left >= vw) return false;
  const key = rootToKey.get(el);
  if (key && isViewedArticlesListEntry(viewedArticles, sessionViewed, key)) return false;
  return true;
}

/** Treat positions within this many px as the same stop (mini-section row). */
const OPTION_SCROLL_ROW_EPS = 2;

/**
 * Force lazy-loaded sections (e.g. the lower NEWS rails) to render so article
 * positions are stable before an option-scroll jump. Jumps to the bottom of the
 * page, waits for its height to settle, then restores the original scroll
 * position.
 */
async function warmUpHomepageLayout(restoreY) {
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const pageHeight = () =>
    Math.max(
      document.documentElement.scrollHeight,
      document.body?.scrollHeight || 0
    );

  let lastHeight = pageHeight();
  let stableCount = 0;
  for (let i = 0; i < 12 && stableCount < 2; i++) {
    window.scrollTo({ top: maxScrollY(), behavior: 'auto' });
    await delay(80);
    const height = pageHeight();
    if (height === lastHeight) {
      stableCount += 1;
    } else {
      stableCount = 0;
      lastHeight = height;
    }
  }
  window.scrollTo({ top: restoreY, behavior: 'auto' });
  await delay(60);
}

/**
 * Option + ArrowDown/Up: stop at the next article not in Viewed Articles (previous
 * load) whose top is below/above the viewport. Skip gray cards and anything on screen.
 */
function registerSkipGrayScroll(site, mergeNewArticles) {
  if (typeof site.isHomepage !== 'function') return;

  /** Document Y of the last option-scroll stop (avoids re-targeting the same row). */
  let lastOptionStopDocTop = null;
  let lastOptionDirection = null;
  /** Once per page: fly through the page so lazy sections load before we jump. */
  let warmedUpLazyLoad = false;
  /** True while the warm-up fly-through is in progress (drops concurrent presses). */
  let warmingUpLazyLoad = false;

  document.addEventListener(
    'keydown',
    e => {
      if (!e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      if (!site.isHomepage()) return;

      e.preventDefault();
      e.stopPropagation();

      void (async () => {
        const hostname = window.location.hostname;

        // First option-scroll on this page: fly to the bottom and back so lazy
        // sections (e.g. the lower NEWS rails) load and article positions are
        // stable. Otherwise the first jump into an unloaded region overshoots.
        if (!warmedUpLazyLoad) {
          if (warmingUpLazyLoad) return;
          warmingUpLazyLoad = true;
          await warmUpHomepageLayout(window.scrollY);
          warmingUpLazyLoad = false;
          warmedUpLazyLoad = true;
        }

        if (typeof mergeNewArticles === 'function') await mergeNewArticles();

        const viewedArticles = await getViewed();
        const articlesMap = site.findArticles();
        const sessionViewed = getTabSessionViewedSet();
        const rootToKey = buildRootToKeyMap(articlesMap, hostname);
        const roots = flattenArticleRoots(articlesMap);
        if (roots.length === 0) return;
        sortRootsByVisualPosition(roots, site);

        const cap = maxScrollY();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const scrollY = window.scrollY;

        if (e.key === 'ArrowDown') {
          const minScrollY = scrollY + vh;

          for (const el of roots) {
            if (!isOptionScrollEligible(el, vw, viewedArticles, sessionViewed, rootToKey))
              continue;
            const docTop = scrollNavDocTop(site, el);
            if (docTop + 0.5 < minScrollY) continue;
            if (
              lastOptionDirection === 'down' &&
              lastOptionStopDocTop !== null &&
              docTop <= lastOptionStopDocTop + OPTION_SCROLL_ROW_EPS
            ) {
              continue;
            }
            const target = Math.min(docTop, cap);
            lastOptionStopDocTop = target;
            lastOptionDirection = 'down';
            window.scrollTo({ top: target, behavior: 'smooth' });
            return;
          }

          lastOptionStopDocTop = cap;
          lastOptionDirection = 'down';
          window.scrollTo({ top: cap, behavior: 'smooth' });
        } else {
          // Mirror of ArrowDown: jump to the nearest non-old article whose top is
          // above the viewport top (its headline was scrolled past, so it hasn't
          // been read) and place it at the BOTTOM of the viewport so the articles
          // above it are revealed.
          const maxDocTop = scrollY - 1;
          let targetEl = null;
          let targetDocTop = null;

          for (const el of roots) {
            if (!isOptionScrollEligible(el, vw, viewedArticles, sessionViewed, rootToKey))
              continue;
            const docTop = scrollNavDocTop(site, el);
            if (docTop > maxDocTop) break;
            if (
              lastOptionDirection === 'up' &&
              lastOptionStopDocTop !== null &&
              docTop >= lastOptionStopDocTop - OPTION_SCROLL_ROW_EPS
            ) {
              continue;
            }
            targetEl = el;
            targetDocTop = docTop;
          }

          if (targetEl === null) {
            lastOptionStopDocTop = 0;
            lastOptionDirection = 'up';
            window.scrollTo({ top: 0, behavior: 'smooth' });
          } else {
            // For articles taller than the viewport, fall back to aligning the top
            // so we do not scroll past them.
            const docBottom = scrollNavDocBottom(site, targetEl);
            const scrollTarget = Math.max(
              0,
              Math.min(docBottom - vh, targetDocTop, cap)
            );
            lastOptionStopDocTop = targetDocTop;
            lastOptionDirection = 'up';
            window.scrollTo({ top: scrollTarget, behavior: 'smooth' });
          }
        }
      })();
    },
    true
  );
}

async function run(site) {
  if (!isExtensionContextValid()) return;

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
        const title = getArticleDisplayTitle(site, root, id);
        return !articleMatchesBlockTopics(site, root, title, blockTopics);
      })
      .map(([id]) => id)
  );

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      dwellStartById.clear();
    }
  });

  const mergeNewArticles = async () => {
    if (!isExtensionContextValid()) return;
    blockTopics = await loadBlockTopics();
    const sessionNow = getTabSessionViewedSet();
    const newArticles = site.findArticles();
    for (const [id, elements] of newArticles) {
      if (!articles.has(id)) {
        articles.set(id, new Set(elements));
      } else {
        for (const element of elements) articles.get(id).add(element);
      }
      const allElements = [...articles.get(id)].filter(el => el.isConnected);
      if (isArticleViewed(viewedArticles, hostname, id)) {
        await rememberArticleTitles(site, id, allElements, sessionNow, hostname);
      }
      const root = pickArticleRootForTopics(allElements);
      const title = getArticleDisplayTitle(site, root, id);
      if (articleMatchesBlockTopics(site, root, title, blockTopics)) trackedIds.delete(id);
      else if (isArticleViewed(viewedArticles, hostname, id)) trackedIds.delete(id);
      else trackedIds.add(id);
      syncGrayForElements(
        site,
        allElements,
        id,
        viewedArticles,
        sessionNow,
        hostname,
        blockTopics
      );
    }
    syncAlwaysGrayRoots(site);
  };

  // Sync gray from persistent storage vs this tab's session; strip when session has the key.
  for (const [id, elements] of articles) {
    if (isArticleViewed(viewedArticles, hostname, id)) {
      await rememberArticleTitles(site, id, [...elements], sessionViewed, hostname);
    }
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
  syncAlwaysGrayRoots(site);

  try {
    ext.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[STORAGE_BLOCK_TOPICS_KEY]) return;
      void mergeNewArticles();
    });
  } catch (_) {}

  let visibilityCheckRunning = false;

  const checkVisibility = async () => {
    if (!isExtensionContextValid()) return;
    const now = performance.now();
    for (const [id, elements] of articles) {
      if (!trackedIds.has(id)) continue;
      const topicRoot = pickArticleRootForTopics([...elements]);
      const topicTitle = getArticleDisplayTitle(site, topicRoot, id);
      if (articleMatchesBlockTopics(site, topicRoot, topicTitle, blockTopics)) continue;

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
          await markAsViewed(site, id, canonical, [...elements]);
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
    if (!isExtensionContextValid()) return;
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

  registerSkipGrayScroll(site, mergeNewArticles);
}

window.NunusRun = run;
