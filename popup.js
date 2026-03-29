/** WebExtension namespace: Firefox uses `browser`, Chromium uses `chrome`. */
const ext = globalThis.browser ?? globalThis.chrome;

const STORAGE_KEY = 'nunus_viewed_articles';
const SESSION_KEY = 'nunus_session_viewed';
const DISABLE_VIDEO_AUTOPLAY_KEY = 'nunusDisableVideoAutoplay';
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
  ul.innerHTML = topics
    .map(
      (topic, i) =>
        `<li><span>${escapeHtml(topic)}</span><button type="button" class="topic-remove" data-index="${i}" aria-label="Remove phrase">×</button></li>`
    )
    .join('');
}

async function loadDisableVideoAutoplayCheckbox() {
  const r = await ext.storage.local.get({ [DISABLE_VIDEO_AUTOPLAY_KEY]: true });
  const cb = document.getElementById('disableVideoAutoplay');
  if (cb) cb.checked = r[DISABLE_VIDEO_AUTOPLAY_KEY] !== false;
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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function noHostMessage() {
  return '<p style="color:#888">Open a supported news site first.</p>';
}

function collapseResults() {
  const resultsEl = document.getElementById('viewedResults');
  const statusEl = document.getElementById('status');
  resultsEl.innerHTML = '';
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
    resultsEl.innerHTML = noHostMessage();
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

  let html =
    '<button type="button" id="clearViewedBtn" class="clear-btn">Clear Viewed Articles</button>';
  html += `<h4>Viewed Articles (${viewedTitles.length})</h4>`;
  if (viewedTitles.length) {
    html += '<ul>' + viewedTitles.map(t => `<li>${escapeHtml(t)}</li>`).join('') + '</ul>';
  } else {
    html += '<p style="color:#888">None yet.</p>';
  }

  resultsEl.innerHTML = html;
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
    resultsEl.innerHTML = noHostMessage();
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

  let html =
    '<button type="button" id="clearNewlyViewedBtn" class="clear-btn">Clear Newly Viewed Articles</button>';
  html += `<h4>Newly Viewed (this tab) (${newlyTitles.length})</h4>`;
  if (newlyTitles.length) {
    html += '<ul>' + newlyTitles.map(t => `<li>${escapeHtml(t)}</li>`).join('') + '</ul>';
  } else {
    html += '<p style="color:#888">None in this tab yet.</p>';
  }

  resultsEl.innerHTML = html;
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

document.getElementById('disableVideoAutoplay').addEventListener('change', async e => {
  const checked = e.target.checked;
  await ext.storage.local.set({ [DISABLE_VIDEO_AUTOPLAY_KEY]: checked });
  const statusEl = document.getElementById('status');
  statusEl.textContent = 'Reload nytimes.com tabs for video autoplay setting to apply.';
  setTimeout(() => {
    if (statusEl.textContent === 'Reload nytimes.com tabs for video autoplay setting to apply.') {
      statusEl.textContent = '';
    }
  }, 4000);
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

void loadDisableVideoAutoplayCheckbox();
void renderBlockTopicsList();
