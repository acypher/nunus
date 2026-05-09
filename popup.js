/** WebExtension namespace: prefer `browser` when present, else `chrome`. */
const ext = globalThis.browser ?? globalThis.chrome;

const STORAGE_KEY = 'nunus_viewed_articles';
const STORAGE_TITLES_KEY = 'nunus_viewed_article_titles';
const SESSION_KEY = 'nunus_session_viewed';
const SESSION_TITLES_KEY = 'nunus_session_viewed_titles';
const LEGACY_SESSION_URL_KEY = 'nunus_session_viewed_urls';
const STORAGE_BLOCK_TOPICS_KEY = 'nunus_block_topics';

function normalizeBlockTopicsList(arr) {
  if (!Array.isArray(arr)) return [];
  return [...new Set(arr.map(t => String(t).trim()).filter(Boolean))];
}

async function loadBlockTopicsForPopup() {
  const r = await ext.storage.local.get({ [STORAGE_BLOCK_TOPICS_KEY]: [] });
  return normalizeBlockTopicsList(r[STORAGE_BLOCK_TOPICS_KEY]);
}

async function saveBlockTopicsForPopup(topics) {
  const t = normalizeBlockTopicsList(topics);
  await ext.storage.local.set({ [STORAGE_BLOCK_TOPICS_KEY]: t });
}

async function renderBlockTopicsList() {
  const ul = document.getElementById('blockTopicsList');
  if (!ul) return;
  const topics = await loadBlockTopicsForPopup();
  ul.replaceChildren();
  topics.forEach((topic, i) => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = topic;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'topic-remove';
    btn.dataset.index = String(i);
    btn.setAttribute('aria-label', 'Remove phrase');
    btn.textContent = '×';
    li.append(span, btn);
    ul.appendChild(li);
  });
}

/** Which list is currently shown in #viewedResults ('viewed' | 'newly' | null). */
let displayedPanel = null;

function parseStoredKey(key) {
  const sep = key.indexOf('|');
  if (sep === -1) return { hostname: null, articleKey: key, legacyTitle: key };
  return { hostname: key.slice(0, sep), articleKey: key.slice(sep + 1), legacyTitle: key.slice(sep + 1) };
}

function normalizeTitleMap(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, titles] of Object.entries(raw)) {
    if (!Array.isArray(titles)) continue;
    out[key] = [...new Set(titles.map(t => String(t).trim()).filter(Boolean))];
  }
  return out;
}

function titlesForKey(titleMap, key, fallbackTitle) {
  const titles = Array.isArray(titleMap[key]) ? titleMap[key] : [];
  if (titles.length) return titles;
  const fallback = String(fallbackTitle || '').trim();
  return fallback ? [fallback] : [];
}

async function readTabSessionState(tabId) {
  try {
    const [r] = await ext.scripting.executeScript({
      target: { tabId },
      func: (sessionKey, sessionTitlesKey) => {
        try {
          const keysRaw = sessionStorage.getItem(sessionKey);
          const titlesRaw = sessionStorage.getItem(sessionTitlesKey);
          return {
            keys: keysRaw ? JSON.parse(keysRaw) : [],
            titleMap: titlesRaw ? JSON.parse(titlesRaw) : {}
          };
        } catch (_) {
          return { keys: [], titleMap: {} };
        }
      },
      args: [SESSION_KEY, SESSION_TITLES_KEY]
    });
    const result = r?.result || {};
    return {
      keys: Array.isArray(result.keys) ? result.keys : [],
      titleMap: normalizeTitleMap(result.titleMap)
    };
  } catch (_) {
    return { keys: [], titleMap: {} };
  }
}

async function clearTabSessionKeys(tabId) {
  try {
    await ext.scripting.executeScript({
      target: { tabId },
      func: (sessionKey, sessionTitlesKey, legacySessionUrlKey) => {
        try {
          sessionStorage.removeItem(sessionKey);
          sessionStorage.removeItem(sessionTitlesKey);
          sessionStorage.removeItem(legacySessionUrlKey);
        } catch (_) {}
      },
      args: [SESSION_KEY, SESSION_TITLES_KEY, LEGACY_SESSION_URL_KEY]
    });
  } catch (_) {}
}

async function getActiveTabHostname() {
  let hostname = null;
  let tabId = null;
  try {
    const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
    tabId = tab?.id ?? null;
    if (tab?.url) {
      try {
        hostname = new URL(tab.url).hostname;
      } catch (_) {}
    }
  } catch (_) {}
  return { hostname, tabId };
}

function mountNoHostMessage(container) {
  container.replaceChildren();
  const p = document.createElement('p');
  p.style.color = '#888';
  p.textContent = 'Open a supported news site first.';
  container.appendChild(p);
}

/**
 * @param {HTMLElement} container - #viewedResults
 * @param {string[]} titles
 * @param {{ clearButtonId: string, clearButtonLabel: string, headingPrefix: string, emptyMessage: string }} opts
 */
function mountArticleListPanel(container, titles, opts) {
  container.replaceChildren();

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.id = opts.clearButtonId;
  clearBtn.className = 'clear-btn';
  clearBtn.textContent = opts.clearButtonLabel;
  container.appendChild(clearBtn);

  const h4 = document.createElement('h4');
  h4.append(document.createTextNode(`${opts.headingPrefix} (`));
  const countSpan = document.createElement('span');
  countSpan.id = 'articleListCount';
  countSpan.textContent = String(titles.length);
  h4.append(countSpan, document.createTextNode(')'));
  container.appendChild(h4);

  if (titles.length) {
    const toolbar = document.createElement('div');
    toolbar.className = 'article-panel-toolbar';

    const filterInput = document.createElement('input');
    filterInput.type = 'search';
    filterInput.id = 'articleListFilter';
    filterInput.placeholder = 'Search titles…';
    filterInput.autocomplete = 'off';
    filterInput.setAttribute('aria-label', 'Filter titles');

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.id = 'copyArticleListBtn';
    copyBtn.className = 'copy-list-btn';
    copyBtn.textContent = 'Copy visible';

    toolbar.append(filterInput, copyBtn);
    container.appendChild(toolbar);

    const ul = document.createElement('ul');
    ul.className = 'article-title-list';
    for (const t of titles) {
      const li = document.createElement('li');
      li.setAttribute('data-search', t.toLowerCase());
      const span = document.createElement('span');
      span.className = 'article-title';
      span.textContent = t;
      li.appendChild(span);
      ul.appendChild(li);
    }
    container.appendChild(ul);
  } else {
    const p = document.createElement('p');
    p.className = 'article-list-empty';
    p.style.color = '#888';
    p.textContent = opts.emptyMessage;
    container.appendChild(p);
  }
}

function updateArticleListFilter(totalCount) {
  const input = document.getElementById('articleListFilter');
  const countEl = document.getElementById('articleListCount');
  const q = (input?.value || '').trim().toLowerCase();
  const ul = document.querySelector('#viewedResults .article-title-list');
  if (!ul || !countEl) return;
  let visible = 0;
  for (const li of ul.querySelectorAll('li')) {
    const hay = li.getAttribute('data-search') || '';
    const match = !q || hay.includes(q);
    li.hidden = !match;
    if (match) visible++;
  }
  countEl.textContent = q ? `${visible} / ${totalCount}` : String(totalCount);
}

async function copyVisibleArticleTitles() {
  const ul = document.querySelector('#viewedResults .article-title-list');
  if (!ul) return;
  const lines = [...ul.querySelectorAll('li:not([hidden]) .article-title')].map(s => s.textContent || '');
  const text = lines.join('\n');
  const statusEl = document.getElementById('status');
  const msg = lines.length ? `Copied ${lines.length} title(s).` : 'Nothing to copy.';
  try {
    await navigator.clipboard.writeText(text);
    if (statusEl) {
      statusEl.textContent = msg;
      setTimeout(() => {
        if (statusEl.textContent === msg) statusEl.textContent = '';
      }, 2000);
    }
  } catch (_) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      if (statusEl) {
        statusEl.textContent = msg;
        setTimeout(() => {
          if (statusEl.textContent === msg) statusEl.textContent = '';
        }, 2000);
      }
    } catch (__) {}
    ta.remove();
  }
}

/** Call after mountArticleListPanel when the list has items. */
function wireArticleListControls(totalCount) {
  const input = document.getElementById('articleListFilter');
  const copyBtn = document.getElementById('copyArticleListBtn');
  if (input) {
    input.value = '';
    input.addEventListener('input', () => updateArticleListFilter(totalCount));
  }
  if (copyBtn) {
    copyBtn.addEventListener('click', () => void copyVisibleArticleTitles());
  }
}

function collapseResults() {
  const resultsEl = document.getElementById('viewedResults');
  const statusEl = document.getElementById('status');
  resultsEl.replaceChildren();
  resultsEl.classList.remove('expanded');
  statusEl.textContent = '';
  displayedPanel = null;
}

/**
 * @param {{ skipToggle?: boolean }} options - skipToggle: true when refreshing after Clear (do not collapse).
 */
async function showViewedArticles(options = {}) {
  const skipToggle = options.skipToggle === true;
  const resultsEl = document.getElementById('viewedResults');
  const statusEl = document.getElementById('status');

  if (!skipToggle && displayedPanel === 'viewed') {
    collapseResults();
    return;
  }

  if (!skipToggle) {
    statusEl.textContent = '';
  }

  const { hostname, tabId } = await getActiveTabHostname();
  if (!hostname) {
    mountNoHostMessage(resultsEl);
    resultsEl.classList.add('expanded');
    displayedPanel = 'viewed';
    return;
  }

  resultsEl.classList.add('expanded');

  const local = await ext.storage.local.get({ [STORAGE_KEY]: [], [STORAGE_TITLES_KEY]: {} });
  const rawKeys = Array.isArray(local[STORAGE_KEY]) ? local[STORAGE_KEY] : [];
  const titleMap = normalizeTitleMap(local[STORAGE_TITLES_KEY]);

  // UI only: omit URL keys that still appear under Newly Viewed (this tab), so the
  // two popup lists never duplicate the same story for the user.
  const sessionState = tabId != null
    ? await readTabSessionState(tabId)
    : { keys: [], titleMap: {} };
  const newlyKeysThisTab = new Set();
  for (const key of sessionState.keys) {
    const { hostname: h } = parseStoredKey(key);
    if (h === hostname) {
      newlyKeysThisTab.add(key);
    }
  }

  // Newest-added storage keys first; one row per observed title.
  const viewedTitles = [];
  const seenViewedTitle = new Set();
  for (let i = rawKeys.length - 1; i >= 0; i--) {
    const key = rawKeys[i];
    const { hostname: h, legacyTitle } = parseStoredKey(key);
    if (h !== hostname || newlyKeysThisTab.has(key)) continue;
    const titles = titlesForKey(titleMap, key, legacyTitle);
    for (let j = titles.length - 1; j >= 0; j--) {
      const title = titles[j];
      if (seenViewedTitle.has(title)) continue;
      seenViewedTitle.add(title);
      viewedTitles.push(title);
    }
  }

  mountArticleListPanel(resultsEl, viewedTitles, {
    clearButtonId: 'clearViewedBtn',
    clearButtonLabel: 'Clear Viewed Articles',
    headingPrefix: 'Viewed Articles',
    emptyMessage: 'None yet.'
  });
  if (viewedTitles.length) wireArticleListControls(viewedTitles.length);
  displayedPanel = 'viewed';
}

/**
 * @param {{ skipToggle?: boolean }} options
 */
async function showNewlyViewedArticles(options = {}) {
  const skipToggle = options.skipToggle === true;
  const resultsEl = document.getElementById('viewedResults');
  const statusEl = document.getElementById('status');

  if (!skipToggle && displayedPanel === 'newly') {
    collapseResults();
    return;
  }

  if (!skipToggle) {
    statusEl.textContent = '';
  }

  const { hostname, tabId } = await getActiveTabHostname();
  if (!hostname) {
    mountNoHostMessage(resultsEl);
    resultsEl.classList.add('expanded');
    displayedPanel = 'newly';
    return;
  }

  resultsEl.classList.add('expanded');

  const sessionState = tabId != null
    ? await readTabSessionState(tabId)
    : { keys: [], titleMap: {} };
  // Newest session keys first; one row per observed title.
  const newlyTitles = [];
  const seenNewTitle = new Set();
  for (let i = sessionState.keys.length - 1; i >= 0; i--) {
    const key = sessionState.keys[i];
    const { hostname: h, legacyTitle } = parseStoredKey(key);
    if (h !== hostname) continue;
    const titles = titlesForKey(sessionState.titleMap, key, legacyTitle);
    for (let j = titles.length - 1; j >= 0; j--) {
      const title = titles[j];
      if (seenNewTitle.has(title)) continue;
      seenNewTitle.add(title);
      newlyTitles.push(title);
    }
  }

  mountArticleListPanel(resultsEl, newlyTitles, {
    clearButtonId: 'clearNewlyViewedBtn',
    clearButtonLabel: 'Clear Newly Viewed Articles',
    headingPrefix: 'Newly Viewed (this tab)',
    emptyMessage: 'None in this tab yet.'
  });
  if (newlyTitles.length) wireArticleListControls(newlyTitles.length);
  displayedPanel = 'newly';
}

document.getElementById('viewedResults').addEventListener('click', async e => {
  const status = document.getElementById('status');

  if (e.target.id === 'clearViewedBtn') {
    await ext.storage.local.set({ [STORAGE_KEY]: [], [STORAGE_TITLES_KEY]: {} });
    status.textContent = 'Viewed articles cleared.';
    if (displayedPanel === 'viewed') {
      await showViewedArticles({ skipToggle: true });
    }
    setTimeout(() => {
      status.textContent = '';
    }, 2000);
    return;
  }

  if (e.target.id === 'clearNewlyViewedBtn') {
    try {
      const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) await clearTabSessionKeys(tab.id);
    } catch (_) {}
    status.textContent = 'Newly viewed (this tab) cleared.';
    if (displayedPanel === 'newly') {
      await showNewlyViewedArticles({ skipToggle: true });
    }
    setTimeout(() => {
      status.textContent = '';
    }, 2000);
  }
});

document.getElementById('showViewedBtn').addEventListener('click', () => {
  void showViewedArticles();
});

document.getElementById('showNewlyViewedBtn').addEventListener('click', () => {
  void showNewlyViewedArticles();
});

document.getElementById('addBlockTopicBtn')?.addEventListener('click', async () => {
  const input = document.getElementById('blockTopicInput');
  const v = (input?.value || '').trim();
  if (!v) return;
  const topics = await loadBlockTopicsForPopup();
  if (topics.some(t => t.toLowerCase() === v.toLowerCase())) {
    if (input) input.value = '';
    return;
  }
  topics.push(v);
  await saveBlockTopicsForPopup(topics);
  if (input) input.value = '';
  await renderBlockTopicsList();
});

document.getElementById('blockTopicInput')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('addBlockTopicBtn')?.click();
  }
});

document.getElementById('blockTopicsList')?.addEventListener('click', async e => {
  const btn = e.target.closest('.topic-remove');
  if (!btn) return;
  const i = parseInt(btn.getAttribute('data-index'), 10);
  if (Number.isNaN(i) || i < 0) return;
  const topics = await loadBlockTopicsForPopup();
  if (i >= topics.length) return;
  topics.splice(i, 1);
  await saveBlockTopicsForPopup(topics);
  await renderBlockTopicsList();
});

void renderBlockTopicsList();
