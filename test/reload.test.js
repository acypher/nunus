const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const core = readFileSync(join(__dirname, '..', 'core.js'), 'utf8');
const VIEWED = 'nunus_viewed_articles';
const TITLES = 'nunus_viewed_article_titles';
const SESSION = 'nunus_session_viewed';
const SESSION_TITLES = 'nunus_session_viewed_titles';

// Reload creates a fresh content-script context and DOM, but retains both stores,
// exactly as a browser does. Exercise the real startup, dwell timer and rescans.
function page(host, persistent = {}, tabStorage = new Map(), pendingOpinion = false) {
  let now = 0;
  let mutationCallback;
  const timers = [];
  const articles = new Map();
  class Article {
    constructor(title, position, visible) {
      this.title = title;
      this.position = position;
      this.visible = visible;
      this.isConnected = true;
      this.dataset = {};
      this.style = {};
    }
    compareDocumentPosition(other) { return this.position < other.position ? 4 : 2; }
    getBoundingClientRect() {
      const top = this.visible ? 100 : 2000;
      return { left: 100, right: 400, top, bottom: top + 40, width: 300, height: 40 };
    }
  }
  const window = {
    location: new URL(`https://${host}/`),
    innerWidth: 1000, innerHeight: 800,
    addEventListener() {}
  };
  const site = {
    isHomepage: () => true,
    findArticles: () => new Map([...articles].map(([id, roots]) => [id, new Set(roots)])),
    getArticleTitle: root => root.title,
    isOpinionSummaryPackageArticle: () => pendingOpinion
  };
  const context = vm.createContext({
    window, URL, Element: Article,
    Node: { DOCUMENT_POSITION_FOLLOWING: 4, DOCUMENT_POSITION_PRECEDING: 2 },
    document: {
      body: {}, visibilityState: 'visible', addEventListener() {},
      querySelector: () => null, querySelectorAll: () => [],
      getElementById: () => pendingOpinion ? {} : null
    },
    history: {}, performance: { now: () => now },
    setTimeout: (fn, delay) => timers.push({ fn, at: now + delay }),
    MutationObserver: class {
      constructor(fn) { mutationCallback = fn; }
      observe() {}
    },
    sessionStorage: {
      getItem: key => tabStorage.get(key) ?? null,
      setItem: (key, value) => tabStorage.set(key, value),
      removeItem: key => tabStorage.delete(key)
    },
    chrome: {
      runtime: { id: 'nunus-test' },
      storage: {
        local: {
          get: async keys => Object.fromEntries(
            (Array.isArray(keys) ? keys : Object.keys(keys)).map(key =>
              [key, structuredClone(persistent[key] ?? keys[key])])
          ),
          set: async values => Object.assign(persistent, structuredClone(values)),
          remove: async key => { delete persistent[key]; }
        },
        onChanged: { addListener() {} }
      }
    }
  });
  vm.runInContext(core, context);
  const settle = () => new Promise(resolve => setImmediate(resolve));
  async function advance(ms) {
    const end = now + ms;
    while (true) {
      timers.sort((a, b) => a.at - b.at);
      if (!timers.length || timers[0].at > end) break;
      const timer = timers.shift();
      now = timer.at;
      await timer.fn();
      await settle();
    }
    now = end;
  }
  return {
    persistent, tabStorage, context, advance,
    add(id, title = 'A discovered headline', visible = true) {
      const root = new Article(title, [...articles.values()].flat().length, visible);
      if (!articles.has(id)) articles.set(id, []);
      articles.get(id).push(root);
      return root;
    },
    start: async () => { await window.NunusRun(site); await settle(); },
    rescan: async () => { mutationCallback(); await advance(0); },
    key: id => context.getViewedKey(host, id)
  };
}

function assertGray(root) {
  assert.equal(root.dataset.nunusViewed, 'true');
  assert.equal(root.style.opacity, '0.2');
  assert.equal(root.style.filter, 'grayscale(1) brightness(0.72)');
}

for (const host of ['www.nytimes.com', 'www.washingtonpost.com', 'www.theguardian.com',
  'news.google.com', 'ground.news', 'www.theepochtimes.com']) {
  test(`${host}: discover, reload in the same tab, gray every saved occurrence`, async () => {
    const id = `https://${host}/2026/10/22/news/a-story`;
    const firstPage = page(host);
    const first = firstPage.add(id);
    const duplicate = firstPage.add(id);
    await firstPage.start();
    assert.equal(first.dataset.nunusViewed, undefined);
    assertGray(duplicate);
    await firstPage.advance(2999);
    assert.equal(firstPage.persistent[VIEWED], undefined, 'dwell must finish before recording');
    await firstPage.advance(1);
    const key = firstPage.key(id);
    assert.ok(firstPage.persistent[VIEWED].includes(key));
    assert.ok(JSON.parse(firstPage.tabStorage.get(SESSION)).includes(key));
    assert.equal(first.dataset.nunusViewed, undefined, 'stay readable until reload');
    const savedTitles = structuredClone(firstPage.persistent[TITLES]);

    const reloaded = page(host, firstPage.persistent, firstPage.tabStorage);
    const old = reloaded.add(id);
    const oldCopy = reloaded.add(id);
    const newId = `https://${host}/2026/10/22/news/new-story`;
    const unread = reloaded.add(newId, 'A new headline', false);
    await reloaded.start();
    assertGray(old);
    assertGray(oldCopy);
    assert.equal(unread.dataset.nunusViewed, undefined);
    assert.equal(reloaded.context.getTabSessionViewedSet().size, 0);
    assert.deepEqual(JSON.parse(JSON.stringify(reloaded.context.getTabSessionTitleMap())), {});
    assert.deepEqual(reloaded.persistent[TITLES], savedTitles, 'retain persistent titles');
    assert.ok(reloaded.context.isViewedArticlesListEntry(
      new Set(reloaded.persistent[VIEWED]), reloaded.context.getTabSessionViewedSet(), key));

    const lazyCopy = reloaded.add(id, 'A revised headline', false);
    await reloaded.rescan();
    assertGray(old);
    assertGray(lazyCopy);
    unread.visible = true;
    await reloaded.advance(3500);
    assert.ok(reloaded.persistent[VIEWED].includes(reloaded.key(newId)));
    assert.equal(unread.dataset.nunusViewed, undefined, 'new discovery stays readable on this load');
    assert.equal(reloaded.context.getTabSessionViewedSet().size, 1);
  });
}

test('a previously discovered Opinion grays on reload even without a rendered summary', async () => {
  const host = 'www.nytimes.com';
  const id = `https://${host}/2026/10/22/opinion/a-story.html`;
  const firstPage = page(host);
  firstPage.add(id);
  await firstPage.start();
  await firstPage.advance(3000);
  const reloaded = page(host, firstPage.persistent, firstPage.tabStorage, true);
  const old = reloaded.add(id);
  const unread = reloaded.add(`https://${host}/2026/10/22/opinion/new-story.html`);
  await reloaded.start();
  assertGray(old);
  await reloaded.advance(4000);
  assert.equal(unread.dataset.nunusViewed, undefined);
  assert.equal(reloaded.persistent[VIEWED].length, 1, 'unsummarized new Opinion stays new');
});
