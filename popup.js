/** WebExtension namespace: prefer `browser` when present, else `chrome`. */
const ext = globalThis.browser ?? globalThis.chrome;

const STORAGE_KEY = 'nunus_viewed_articles';
const SESSION_KEY = 'nunus_session_viewed';
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
  if (sep === -1) return { hostname: null, title: key };
  return { hostname: key.slice(0, sep), title: key.slice(sep + 1) };
}

async function readTabSessionKeys(tabId) {
  try {
    const [r] = await ext.scripting.executeScript({
      target: { tabId },
      func: (k) => {
        try {
          const raw = sessionStorage.getItem(k);
          return raw ? JSON.parse(raw) : [];
        } catch (_) {
          return [];
        }
      },
      args: [SESSION_KEY]
    });
    return Array.isArray(r?.result) ? r.result : [];
  } catch (_) {
    return [];
  }
}

async function clearTabSessionKeys(tabId) {
  try {
    await ext.scripting.executeScript({
      target: { tabId },
      func: (k) => {
        try {
          sessionStorage.removeItem(k);
        } catch (_) {}
      },
      args: [SESSION_KEY]
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

  const local = await ext.storage.local.get([STORAGE_KEY]);
  const rawKeys = Array.isArray(local[STORAGE_KEY]) ? local[STORAGE_KEY] : [];

  // UI only: omit titles that still appear under Newly Viewed (this tab), so the two
  // popup lists never duplicate the same story for the user.
  const sessionKeys = tabId != null ? await readTabSessionKeys(tabId) : [];
  const newlyTitlesThisTab = new Set();
  for (const key of sessionKeys) {
    const { hostname: h, title } = parseStoredKey(key);
    if (h === hostname && title) {
      newlyTitlesThisTab.add(title);
    }
  }

  // Newest-added storage keys first; one row per title (latest key wins if duplicated).
  const viewedTitles = [];
  const seenViewedTitle = new Set();
  for (let i = rawKeys.length - 1; i >= 0; i--) {
    const key = rawKeys[i];
    const { hostname: h, title } = parseStoredKey(key);
    if (h !== hostname || !title || newlyTitlesThisTab.has(title)) continue;
    if (seenViewedTitle.has(title)) continue;
    seenViewedTitle.add(title);
    viewedTitles.push(title);
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

  const sessionKeys = tabId != null ? await readTabSessionKeys(tabId) : [];
  // Newest session keys first; one row per title (latest key wins if duplicated).
  const newlyTitles = [];
  const seenNewTitle = new Set();
  for (let i = sessionKeys.length - 1; i >= 0; i--) {
    const key = sessionKeys[i];
    const { hostname: h, title } = parseStoredKey(key);
    if (h !== hostname || !title) continue;
    if (seenNewTitle.has(title)) continue;
    seenNewTitle.add(title);
    newlyTitles.push(title);
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
    await ext.storage.local.set({ [STORAGE_KEY]: [] });
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
