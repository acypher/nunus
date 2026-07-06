// ==UserScript==
// @name         NYT World Cup AI Filter
// @namespace    https://github.com/acypher/NunusCursor
// @version      1.1.0
// @description  Gray out NYTimes stories about the soccer World Cup using on-device or OpenAI classification
// @author       Allen Cypher
// @match        https://www.nytimes.com/*
// @match        https://nytimes.com/*
// @match        https://*.nytimes.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      api.openai.com
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  /** Change in Tampermonkey storage or edit here. */
  const DEFAULT_TOPIC =
    'the FIFA soccer World Cup (tournament news, matches, teams, players, host nation, qualifying — not unrelated soccer or generic sports)';

  const STORAGE_TOPIC_KEY = 'nyt_ai_filter_topic';
  const STORAGE_CACHE_KEY = 'nyt_ai_filter_cache_v2';
  const STORAGE_OPENAI_KEY = 'nyt_ai_filter_openai_key';
  const MAX_BATCH = 12;
  const SCAN_DEBOUNCE_MS = 350;
  const CACHE_MAX_ENTRIES = 800;
  const CLASSIFIER_RETRY_MS = 30000;
  const WORLD_CUP_URL = /world-cup|worldcup/i;

  const GRAY_STYLE = {
    opacity: '0.2',
    filter: 'grayscale(1) brightness(0.72)',
    transition: 'opacity 0.3s ease, filter 0.3s ease'
  };

  // --- NYT article detection (aligned with sites/nyt.js) ---

  const DATE_ARTICLE_PATH = /\/\d{4}\/\d{1,2}\/\d{1,2}\//;

  function normalizeTitle(text) {
    let t = (text || '').replace(/\s+/g, ' ').trim();
    t = t.replace(/\s+By\s+[A-Za-z].*$/i, '').trim();
    t = t.replace(/\s+[-|]\s+.*$/, '').trim();
    return t || null;
  }

  function titleFromLabelLink(a) {
    if (!a) return null;
    const hoverP = a.querySelector('p.indicate-hover');
    if (hoverP) {
      const id = normalizeTitle(hoverP.textContent);
      if (id) return id;
    }
    return normalizeTitle(a.textContent);
  }

  function isNytimesHost(hostname) {
    return (
      hostname === 'www.nytimes.com' ||
      hostname === 'nytimes.com' ||
      hostname.endsWith('.nytimes.com')
    );
  }

  function resolveArticleUrl(href) {
    try {
      return new URL(href, window.location.href);
    } catch (_) {
      return null;
    }
  }

  function isNytArticleUrl(href) {
    const u = resolveArticleUrl(href);
    if (!u || !isNytimesHost(u.hostname)) return false;
    if (DATE_ARTICLE_PATH.test(u.pathname)) return true;
    if (u.pathname.startsWith('/interactive/')) return true;
    if (u.pathname.startsWith('/live/')) return true;
    if (u.pathname.startsWith('/video/')) return true;
    if (u.pathname.startsWith('/wirecutter/')) return true;
    if (u.pathname.startsWith('/athletic/')) return true;
    if (
      u.hostname === 'cooking.nytimes.com' &&
      /^\/(?:recipes|article)\//.test(u.pathname)
    ) {
      return true;
    }
    return false;
  }

  function anchorLooksLikeArticle(a) {
    if (!a || !a.href) return false;
    const uri = a.getAttribute('data-uri');
    if (
      uri &&
      (uri.startsWith('nyt://article/') ||
        uri.startsWith('nyt://interactive/') ||
        uri.startsWith('nyt://promo/') ||
        uri.startsWith('nyt://recipe/'))
    ) {
      return true;
    }
    return isNytArticleUrl(a.href);
  }

  function rootHasArticleAnchor(root) {
    for (const a of root.querySelectorAll('a[href]')) {
      if (anchorLooksLikeArticle(a)) return true;
    }
    const wrap = root.closest('a[href]');
    if (wrap && anchorLooksLikeArticle(wrap)) return true;
    return false;
  }

  function getArticleUrl(root) {
    if (!root) return null;
    for (const a of root.querySelectorAll('a[href]')) {
      if (anchorLooksLikeArticle(a)) return a.href;
    }
    const wrap = root.closest('a[href]');
    if (wrap && anchorLooksLikeArticle(wrap)) return wrap.href;
    return null;
  }

  function rectIntersectionArea(a, b) {
    const left = Math.max(a.left, b.left);
    const right = Math.min(a.right, b.right);
    const top = Math.max(a.top, b.top);
    const bottom = Math.min(a.bottom, b.bottom);
    const w = Math.max(0, right - left);
    const h = Math.max(0, bottom - top);
    return w * h;
  }

  function isCarouselSlideShownInStrip(root) {
    const outer = root.closest('[data-testid="carouselOuterClass"]');
    if (!outer) return null;
    const strip = outer.firstElementChild;
    const clipEl = strip instanceof HTMLElement ? strip : outer;
    const card = root.closest('a[href]');
    if (!card || !anchorLooksLikeArticle(card)) return null;
    const clip = clipEl.getBoundingClientRect();
    const r = card.getBoundingClientRect();
    const cardArea = Math.max(1, r.width * r.height);
    const overlap = rectIntersectionArea(r, clip);
    if (overlap / cardArea < 0.12) return false;
    const cs = window.getComputedStyle(card);
    if (Number.parseFloat(cs.opacity) < 0.05) return false;
    return true;
  }

  function isArticleRootEffectivelyHidden(root) {
    let n = root;
    while (n && n !== document.documentElement) {
      if (n.getAttribute('aria-hidden') === 'true') return true;
      if (n.hasAttribute('hidden')) return true;
      if (n.getAttribute('inert') != null) return true;
      n = n.parentElement;
    }
    const cs = window.getComputedStyle(root);
    if (cs.display === 'none' || cs.visibility === 'hidden') return true;
    const carousel = isCarouselSlideShownInStrip(root);
    if (carousel === false) return true;
    return false;
  }

  function* queryAll(root, selector) {
    try {
      yield* root.querySelectorAll(selector);
    } catch (_) {}
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) yield* queryAll(el.shadowRoot, selector);
    }
  }

  function pruneNestedRoots(rootSet) {
    const roots = [...rootSet];
    return roots.filter(r => !roots.some(other => other !== r && r.contains(other)));
  }

  function getTitleFromRoot(root) {
    const hSlot = root.querySelector('[data-tpl="h"]');
    if (hSlot) {
      const lblInH = hSlot.querySelector('a[data-tpl="l"]');
      if (lblInH) {
        const id = titleFromLabelLink(lblInH);
        if (id) return id;
      }
      const hoverInH = hSlot.querySelector('p.indicate-hover');
      if (hoverInH) {
        const id = normalizeTitle(hoverInH.textContent);
        if (id) return id;
      }
      const p = hSlot.querySelector('p');
      if (p) {
        const id = normalizeTitle(p.textContent);
        if (id) return id;
      }
      const id = normalizeTitle(hSlot.textContent);
      if (id) return id;
    }
    const lbl = root.querySelector('a[data-tpl="l"]');
    if (lbl) {
      const id = titleFromLabelLink(lbl);
      if (id) return id;
    }
    const hover = root.querySelector('p.indicate-hover');
    if (hover) {
      const id = normalizeTitle(hover.textContent);
      if (id) return id;
    }
    if (root.tagName === 'ARTICLE') {
      for (const a of root.querySelectorAll('a[href]')) {
        if (!anchorLooksLikeArticle(a)) continue;
        const tp = a.querySelector('p');
        if (tp) {
          const id = normalizeTitle(tp.textContent);
          if (id) return id;
        }
        const id = normalizeTitle(a.textContent);
        if (id) return id;
      }
    }
    for (const a of root.querySelectorAll('a[href]')) {
      if (!anchorLooksLikeArticle(a)) continue;
      const id = normalizeTitle(a.textContent);
      if (id) return id;
    }
    return null;
  }

  function getBlockTopicHaystack(root) {
    if (!root) return '';
    const slic = root.querySelector('[data-tpl="slic"]');
    if (!slic) return '';
    const clone = slic.cloneNode(true);
    const hSlot = clone.querySelector('[data-tpl="h"]');
    if (hSlot) hSlot.remove();
    const t = normalizeTitle(clone.textContent);
    return t || '';
  }

  function collectStoryRoots() {
    const candidates = new Set();
    for (const el of queryAll(document, 'div.story-wrapper[data-tpl="sli"]')) {
      if (rootHasArticleAnchor(el)) candidates.add(el);
    }
    for (const el of queryAll(document, 'div.story-wrapper')) {
      if (rootHasArticleAnchor(el)) candidates.add(el);
    }
    for (const a of queryAll(document, 'a[href]')) {
      if (!anchorLooksLikeArticle(a)) continue;
      const wrap =
        a.closest('div.story-wrapper') || a.closest('section.story-wrapper');
      if (wrap) candidates.add(wrap);
    }
    for (const el of queryAll(document, 'section.story-wrapper')) {
      if (el.querySelector('div.story-wrapper')) continue;
      if (!rootHasArticleAnchor(el)) continue;
      candidates.add(el);
    }
    for (const el of queryAll(document, '[data-testid$="-section"] article')) {
      if (rootHasArticleAnchor(el)) candidates.add(el);
    }
    for (const li of queryAll(document, 'li')) {
      for (const el of li.querySelectorAll('article')) {
        if (!el.querySelector('.assetWrapper')) continue;
        if (!rootHasArticleAnchor(el)) continue;
        candidates.add(el);
      }
    }
    for (const el of queryAll(document, 'section[data-tpl="lb"]')) {
      if (el.querySelector('.story-wrapper')) continue;
      if (rootHasArticleAnchor(el)) candidates.add(el);
    }
    for (const el of [...candidates]) {
      if (
        el.tagName === 'SECTION' &&
        el.classList.contains('story-wrapper') &&
        el.querySelector('div.story-wrapper[data-tpl="sli"]')
      ) {
        candidates.delete(el);
      }
    }
    return [...candidates];
  }

  function findArticles() {
    const articles = new Map();
    const add = (id, el) => {
      if (!id || !el) return;
      if (!articles.has(id)) articles.set(id, new Set());
      articles.get(id).add(el);
    };
    for (const root of collectStoryRoots()) {
      if (isArticleRootEffectivelyHidden(root)) continue;
      const title = getTitleFromRoot(root);
      const id = getArticleUrl(root);
      if (title && id) add(id, root);
    }
    for (const [id, set] of articles) {
      articles.set(id, new Set(pruneNestedRoots(set)));
    }
    return articles;
  }

  function closestDisplayRoot(el) {
    if (!el) return null;
    return (
      el.closest('div.story-wrapper[data-tpl="sli"]') ||
      el.closest('div.story-wrapper') ||
      el.closest('section.story-wrapper') ||
      el.closest('article') ||
      el.closest('section[data-tpl="lb"]') ||
      el.closest('li') ||
      el
    );
  }

  function titleFingerprint(title) {
    return normalizeTitle(title) || '';
  }

  function urlHintsWorldCup(id) {
    return WORLD_CUP_URL.test(id);
  }

  /** Canonical article identity (matches Nunus URL normalization). */
  function normalizeArticleId(url) {
    try {
      const u = new URL(url, window.location.href);
      u.search = '';
      u.hash = '';
      let path = u.pathname.replace(/\/+$/, '');
      if (!path) path = '/';
      return `${u.origin}${path}`;
    } catch (_) {
      return String(url || '').trim();
    }
  }

  // --- Classification ---

  let cache = loadCache();
  const pendingById = new Map();
  const rootsById = new Map();
  let classifyChain = Promise.resolve();
  let lmSession = null;
  let classifierRetryTimer = null;

  function loadCache() {
    try {
      const raw = GM_getValue(STORAGE_CACHE_KEY, '{}');
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function saveCache() {
    const keys = Object.keys(cache);
    if (keys.length > CACHE_MAX_ENTRIES) {
      const drop = keys.length - CACHE_MAX_ENTRIES;
      for (let i = 0; i < drop; i++) delete cache[keys[i]];
    }
    GM_setValue(STORAGE_CACHE_KEY, JSON.stringify(cache));
  }

  function getTopic() {
    return GM_getValue(STORAGE_TOPIC_KEY, DEFAULT_TOPIC);
  }

  function getCachedMatch(id, title) {
    const entry = cache[id];
    if (entry == null) return undefined;
    const fp = titleFingerprint(title);
    if (typeof entry === 'boolean') return entry;
    if (entry.t !== fp) return undefined;
    return entry.m === true;
  }

  function setCachedMatch(id, title, match) {
    cache[id] = { m: match === true, t: titleFingerprint(title) };
  }

  function buildPromptLines(items, topic) {
    return items
      .map((item, i) => {
        const summary = item.summary ? `\nSummary: ${item.summary}` : '';
        const urlLine = item.id ? `\nURL: ${item.id}` : '';
        return `${i}. Title: ${item.title}${summary}${urlLine}`;
      })
      .join('\n\n');
  }

  const BOOL_ARRAY_SCHEMA = {
    type: 'object',
    properties: {
      match: {
        type: 'array',
        items: { type: 'boolean' }
      }
    },
    required: ['match']
  };

  async function ensureLanguageModelSession() {
    if (lmSession) return lmSession;
    if (!('LanguageModel' in self)) return null;
    const availability = await LanguageModel.availability();
    if (availability === 'unavailable') return null;
    lmSession = await LanguageModel.create({
      systemPrompt:
        'You classify NYTimes homepage headlines. Reply with JSON only. ' +
        'For each numbered story, set match[i] true when the story is primarily about the given topic.'
    });
    return lmSession;
  }

  async function classifyWithLanguageModel(items, topic) {
    const session = await ensureLanguageModelSession();
    if (!session) return null;
    const userPrompt =
      `Topic: ${topic}\n\n` +
      `Return {"match":[...]} with one boolean per story index (0..${items.length - 1}).\n\n` +
      buildPromptLines(items, topic);
    const raw = await session.prompt(userPrompt, { responseConstraint: BOOL_ARRAY_SCHEMA });
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.match)) return null;
    if (parsed.match.length !== items.length) return null;
    return parsed.match.map(Boolean);
  }

  function classifyWithOpenAI(items, topic) {
    const apiKey = GM_getValue(STORAGE_OPENAI_KEY, '').trim();
    if (!apiKey) return Promise.resolve(null);

    const body = {
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'topic_match',
          strict: true,
          schema: BOOL_ARRAY_SCHEMA
        }
      },
      messages: [
        {
          role: 'system',
          content:
            'Classify NYTimes headlines. Return JSON {"match":[booleans]} — one boolean per story index.'
        },
        {
          role: 'user',
          content:
            `Topic: ${topic}\n\n` +
            buildPromptLines(items, topic) +
            `\n\nReturn match array length ${items.length}.`
        }
      ]
    };

    return new Promise(resolve => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: 'https://api.openai.com/v1/chat/completions',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        data: JSON.stringify(body),
        timeout: 45000,
        onload(resp) {
          try {
            const data = JSON.parse(resp.responseText);
            const content = data?.choices?.[0]?.message?.content;
            if (!content) return resolve(null);
            const parsed = JSON.parse(content);
            if (!Array.isArray(parsed.match) || parsed.match.length !== items.length) {
              return resolve(null);
            }
            resolve(parsed.match.map(Boolean));
          } catch (_) {
            resolve(null);
          }
        },
        onerror() {
          resolve(null);
        },
        ontimeout() {
          resolve(null);
        }
      });
    });
  }

  async function classifyBatch(items, topic) {
    if (!items.length) return [];
    const resolved = items.map(item =>
      urlHintsWorldCup(item.id) ? true : null
    );
    const needsAi = items
      .map((item, i) => ({ item, i }))
      .filter(({ i }) => resolved[i] == null);
    if (needsAi.length) {
      const aiItems = needsAi.map(({ item }) => item);
      let aiResult = await classifyWithLanguageModel(aiItems, topic);
      if (!aiResult) aiResult = await classifyWithOpenAI(aiItems, topic);
      if (!aiResult) {
        console.warn(
          '[NYT World Cup AI Filter] Classifier unavailable for',
          needsAi.length,
          'stories. Enable Chrome Prompt API (chrome://flags → Prompt API for Gemini Nano) ' +
            'or set nyt_ai_filter_openai_key in Tampermonkey storage. Retrying…'
        );
        scheduleClassifierRetry();
        return null;
      }
      needsAi.forEach(({ i }, j) => {
        resolved[i] = aiResult[j] === true;
      });
    }
    return resolved.map(v => v === true);
  }

  function scheduleClassifierRetry() {
    if (classifierRetryTimer) return;
    classifierRetryTimer = setTimeout(() => {
      classifierRetryTimer = null;
      scanPage();
    }, CLASSIFIER_RETRY_MS);
  }

  function applyBlockedStyle(el) {
    el.style.opacity = GRAY_STYLE.opacity;
    el.style.filter = GRAY_STYLE.filter;
    el.style.transition = GRAY_STYLE.transition;
    el.dataset.nytAiTopicBlocked = 'true';
  }

  function removeBlockedStyle(el) {
    if (el.dataset.nytAiTopicBlocked !== 'true') return;
    el.style.opacity = '';
    el.style.filter = '';
    el.style.transition = '';
    delete el.dataset.nytAiTopicBlocked;
  }

  function syncStylesForId(id, blocked) {
    const roots = rootsById.get(id);
    if (!roots) return;
    for (const el of roots) {
      if (!el.isConnected) continue;
      if (blocked) applyBlockedStyle(el);
      else removeBlockedStyle(el);
    }
  }

  function queueClassification(id, title, summary, roots) {
    const cached = getCachedMatch(id, title);
    if (cached === true) {
      syncStylesForId(id, true);
      return;
    }
    if (cached === false) {
      syncStylesForId(id, false);
      return;
    }
    if (urlHintsWorldCup(id)) {
      setCachedMatch(id, title, true);
      saveCache();
      syncStylesForId(id, true);
      return;
    }
    const pending = pendingById.get(id);
    if (pending) {
      pending.title = title;
      pending.summary = summary;
      pending.roots = roots;
      return;
    }
    pendingById.set(id, { id, title, summary, roots });
    scheduleFlush();
  }

  function scheduleFlush() {
    classifyChain = classifyChain.then(() => flushPending()).catch(() => flushPending());
  }

  async function flushPending() {
    if (pendingById.size === 0) return;
    const topic = getTopic();
    const batch = [...pendingById.values()].slice(0, MAX_BATCH);
    for (const item of batch) pendingById.delete(item.id);

    const items = batch.map(({ id, title, summary }) => ({ id, title, summary }));
    const matches = await classifyBatch(items, topic);
    if (!matches) {
      for (const item of batch) pendingById.set(item.id, item);
      return;
    }

    for (let i = 0; i < batch.length; i++) {
      const { id, title } = batch[i];
      setCachedMatch(id, title, matches[i] === true);
      syncStylesForId(id, matches[i] === true);
    }
    saveCache();

    if (pendingById.size > 0) await flushPending();
  }

  function collectPageArticles() {
    const byId = new Map();

    const upsert = (id, root, title, summary, rootsOnly = false) => {
      if (!id || !root) return;
      let row = byId.get(id);
      if (!row) {
        row = { roots: new Set(), title: '', summary: '' };
        byId.set(id, row);
      }
      row.roots.add(root);
      if (rootsOnly) return;
      if (title && title.length >= row.title.length) row.title = title;
      if (summary && summary.length >= row.summary.length) row.summary = summary;
    };

    for (const [url, rootsSet] of findArticles()) {
      const id = normalizeArticleId(url);
      for (const root of rootsSet) {
        if (!root?.isConnected || isArticleRootEffectivelyHidden(root)) continue;
        upsert(id, root, getTitleFromRoot(root) || '', getBlockTopicHaystack(root));
      }
    }

    for (const a of document.querySelectorAll('a[href]')) {
      if (!anchorLooksLikeArticle(a)) continue;
      const id = normalizeArticleId(a.href);
      const root = closestDisplayRoot(a);
      if (!root?.isConnected || isArticleRootEffectivelyHidden(root)) continue;
      upsert(id, root, normalizeTitle(a.textContent) || '', '', true);
    }

    return byId;
  }

  function scanPage() {
    for (const [id, row] of collectPageArticles()) {
      const roots = [...row.roots].filter(el => el.isConnected);
      if (!roots.length) continue;
      rootsById.set(id, roots);
      queueClassification(id, row.title, row.summary, roots);
    }
  }

  let scanTimer;
  function debouncedScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scanPage, SCAN_DEBOUNCE_MS);
  }

  scanPage();
  const mo = new MutationObserver(debouncedScan);
  if (document.body) mo.observe(document.body, { childList: true, subtree: true });
  else window.addEventListener('DOMContentLoaded', () => {
    scanPage();
    mo.observe(document.body, { childList: true, subtree: true });
  });

  console.info(
    '[NYT World Cup AI Filter] Running. Topic:',
    getTopic(),
    '— cache hits:',
    Object.keys(cache).length
  );
})();
