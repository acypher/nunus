const STORAGE_KEY = 'nunus_viewed_articles';
const SESSION_KEY = 'nunus_session_viewed';

function parseStoredKey(key) {
  const sep = key.indexOf('|');
  if (sep === -1) return { hostname: null, title: key };
  return { hostname: key.slice(0, sep), title: key.slice(sep + 1) };
}

async function readTabSessionKeys(tabId) {
  try {
    const [r] = await chrome.scripting.executeScript({
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
    await chrome.scripting.executeScript({
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

document.getElementById('viewedResults').addEventListener('click', async (e) => {
  if (e.target.id === 'clearBtn') {
    await chrome.storage.local.set({ [STORAGE_KEY]: [] });
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) await clearTabSessionKeys(tab.id);
    } catch (_) {}
    const status = document.getElementById('status');
    const resultsEl = document.getElementById('viewedResults');
    status.textContent = 'History cleared!';
    resultsEl.innerHTML = '';
    resultsEl.classList.remove('expanded');
    setTimeout(() => { status.textContent = ''; }, 2000);
  }
});

document.getElementById('showViewedBtn').addEventListener('click', async () => {
  const resultsEl = document.getElementById('viewedResults');
  const statusEl = document.getElementById('status');
  statusEl.textContent = '';

  let hostname = null;
  let tabId = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tab?.id;
    if (tab?.url) {
      try {
        hostname = new URL(tab.url).hostname;
      } catch (_) {}
    }
  } catch (_) {}

  if (!hostname) {
    resultsEl.innerHTML = '<p style="color:#888">Open a supported news site first.</p>';
    resultsEl.classList.add('expanded');
    return;
  }

  resultsEl.classList.add('expanded');

  const local = await chrome.storage.local.get([STORAGE_KEY]);
  const sessionKeys =
    tabId != null ? await readTabSessionKeys(tabId) : [];

  const allViewed = new Set(local[STORAGE_KEY] || []);
  const sessionViewed = new Set(sessionKeys);

  const viewedTitles = [];
  const newlyTitles = [];

  for (const key of allViewed) {
    const { hostname: h, title } = parseStoredKey(key);
    if (h === hostname) {
      viewedTitles.push(title);
    }
  }

  for (const key of sessionViewed) {
    const { hostname: h, title } = parseStoredKey(key);
    if (h === hostname && title) {
      newlyTitles.push(title);
    }
  }

  let html = '<button id="clearBtn" class="clear-btn">Clear Viewed History</button>';
  html += `<h4>Viewed Articles (${viewedTitles.length})</h4>`;
  if (viewedTitles.length) {
    html += '<ul>' + viewedTitles.map(t => `<li>${escapeHtml(t)}</li>`).join('') + '</ul>';
  } else {
    html += '<p style="color:#888">None yet.</p>';
  }

  html += `<h4>Newly Viewed (this tab) (${newlyTitles.length})</h4>`;
  if (newlyTitles.length) {
    html += '<ul>' + newlyTitles.map(t => `<li>${escapeHtml(t)}</li>`).join('') + '</ul>';
  } else {
    html += '<p style="color:#888">None in this tab yet.</p>';
  }

  resultsEl.innerHTML = html;
});

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
