const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const core = readFileSync(join(__dirname, '..', 'core.js'), 'utf8');
const handler = readFileSync(join(__dirname, '..', 'sites/washingtonpost.js'), 'utf8');
const VIEWED = 'nunus_viewed_articles';
const TITLES = 'nunus_viewed_article_titles';
const SESSION = 'nunus_session_viewed';
const SESSION_TITLES = 'nunus_session_viewed_titles';
const HOST = 'www.washingtonpost.com';

// These six saved stories were still ungrayed after an actual same-tab reload.
const examples = [
  ['https://www.washingtonpost.com/podcasts/impromptu/how-the-dsa-is-reshaping-the-democratic-party/',
    'How the DSA went from fringe to power'],
  ['https://wpintelligence.washingtonpost.com/topics/ai-tech/2026/10/20/intelligence-council-report-ai-risks-havent-crippled-financial-services-adoption/',
    'Intelligence Council Report: AI risks haven’t crippled financial services’ adoption'],
  ['https://wpintelligence.washingtonpost.com/topics/ai-tech/2026/10/19/wpi-conversation-how-prepare-workforce-age-ai/',
    'The WPI Conversation: How to prepare the workforce for the age of AI'],
  ['https://wpintelligence.washingtonpost.com/topics/general/events/2026/10/23/next-big-bet-nuclear-power-smrs/',
    'The next big bet in nuclear power: SMRs'],
  ['https://www.washingtonpost.com/podcasts/dollars-and-sense/the-chapter-inbetween/',
    'The surprising mistake many retired people make'],
  ['https://www.washingtonpost.com/podcasts/freedom-desk/544-days-an-avocado-revolution/',
    '544 Days: An Avocado Revolution']
];

// A reload gets a fresh script context and DOM, retaining both browser stores.
// Use the real Washington Post handler, core startup, dwell loop and rescans.
function page(persistent = {}, tabStorage = new Map(), host = HOST) {
  let now = 0;
  let onMutation;
  const timers = [];
  const cards = [];
  class Element {}
  class Card extends Element {
    constructor(href, title, visible) {
      super();
      this.isConnected = true;
      this.visible = visible;
      this.position = cards.length;
      this.dataset = {};
      this.style = {};
      const card = this;
      this.link = Object.assign(new Element(), {
        href, textContent: title,
        matches: selector => selector === 'a[href]',
        querySelectorAll: () => [],
        closest: () => card,
        getBoundingClientRect: () => {
          const top = card.visible ? 100 : 2000;
          return { left: 100, right: 400, top, bottom: top + 40, width: 300, height: 40 };
        }
      });
    }
    querySelectorAll(selector) { return selector.includes('web_headline') ? [this.link] : []; }
    querySelector() { return null; }
    compareDocumentPosition(other) { return this.position < other.position ? 4 : 2; }
  }
  const window = {
    location: new URL(`https://${host}/`), innerWidth: 1000, innerHeight: 800,
    addEventListener() {}
  };
  const context = vm.createContext({
    window, URL, Element,
    Node: { DOCUMENT_POSITION_FOLLOWING: 4, DOCUMENT_POSITION_PRECEDING: 2 },
    document: {
      body: {}, visibilityState: 'visible', addEventListener() {},
      querySelector: () => null, getElementById: () => null,
      querySelectorAll: selector => selector.includes('web_headline')
        ? cards.filter(card => card.isConnected).map(card => card.link) : []
    },
    history: {}, performance: { now: () => now },
    setTimeout: (fn, delay) => timers.push({ fn, at: now + delay }),
    MutationObserver: class { constructor(fn) { onMutation = fn; } observe() {} },
    sessionStorage: {
      getItem: key => tabStorage.get(key) ?? null,
      setItem: (key, value) => tabStorage.set(key, value)
    },
    chrome: {
      runtime: { id: 'nunus-test' },
      storage: {
        local: {
          get: async keys => Object.fromEntries(
            (Array.isArray(keys) ? keys : Object.keys(keys)).map(key =>
              [key, structuredClone(persistent[key] ?? (Array.isArray(keys) ? undefined : keys[key]))])
          ),
          set: async values => Object.assign(persistent, structuredClone(values)),
          remove: async key => { delete persistent[key]; }
        },
        onChanged: { addListener() {} }
      }
    }
  });
  vm.runInContext(core, context);
  vm.runInContext(handler, context);
  const wp = window.NunusSites.washingtonpost;
  // Other publications retain their existing default graying policy.
  const site = host === HOST ? wp : {
    isHomepage: wp.isHomepage, findArticles: wp.findArticles,
    getArticleTitle: wp.getArticleTitle, getVisibilityTargets: wp.getVisibilityTargets
  };
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
    add(id, title = 'A headline', visible = true) {
      const card = new Card(id, title, visible);
      cards.push(card);
      return card;
    },
    start: async () => { await window.NunusRun(site); await settle(); },
    rescan: async () => { onMutation(); await advance(0); },
    key: id => context.getViewedKey(host, id)
  };
}

function assertGray(card) {
  assert.equal(card.dataset.nunusViewed, 'true');
  assert.equal(card.style.opacity, '0.2');
  assert.equal(card.style.filter, 'grayscale(1) brightness(0.72)');
}

for (const [id, title] of examples) {
  test(`Washington Post same-tab reload grays: ${title}`, async () => {
    const visit = page();
    const first = visit.add(id, title);
    const duplicate = visit.add(id, title);
    await visit.start();
    assert.equal(first.dataset.nunusViewed, undefined);
    assertGray(duplicate);
    await visit.advance(2999);
    assert.equal(visit.persistent[VIEWED], undefined, 'wait for the full dwell');
    await visit.advance(1);
    const key = visit.key(id);
    assert.ok(visit.persistent[VIEWED].includes(key));
    assert.equal(first.dataset.nunusViewed, undefined, 'current discovery stays readable');
    const savedTitles = structuredClone(visit.persistent[TITLES]);
    const tabHistory = new Map(visit.tabStorage);

    const reload = page(visit.persistent, visit.tabStorage);
    const old = reload.add(id + '?itid=hp_brand_promo_2#headline', title);
    const oldCopy = reload.add(id, title);
    await reload.start();
    assertGray(old);
    assertGray(oldCopy);
    assert.deepEqual(reload.tabStorage, tabHistory, 'keep Newly Viewed keys and titles');
    assert.deepEqual(reload.persistent[TITLES], savedTitles, 'keep persistent title history');

    const lateCopy = reload.add(id, title);
    const newId = 'https://www.washingtonpost.com/politics/2026/10/22/a-new-story/';
    const unread = reload.add(newId, 'A new headline');
    await reload.rescan();
    assertGray(lateCopy);
    assert.equal(unread.dataset.nunusViewed, undefined);
    await reload.advance(3500);
    assert.ok(reload.persistent[VIEWED].includes(reload.key(newId)));
    assert.equal(unread.dataset.nunusViewed, undefined);
    assert.equal(reload.context.getTabSessionViewedSet().size, 2);

    // A site rerender must preserve the current discovery's readable occurrence.
    unread.isConnected = false;
    const replacement = reload.add(newId, 'A new headline');
    await reload.rescan();
    assert.equal(replacement.dataset.nunusViewed, undefined);
    assertGray(old);

    const secondReload = page(reload.persistent, reload.tabStorage);
    const nextOld = secondReload.add(newId, 'A new headline');
    await secondReload.start();
    assertGray(nextOld);
    assert.equal(secondReload.context.getTabSessionViewedSet().size, 2);
  });
}

test('a saved Washington Post story inserted only after reload still grays', async () => {
  const [id, title] = examples[0];
  const visit = page();
  visit.add(id, title);
  await visit.start();
  await visit.advance(3000);
  const reload = page(visit.persistent, visit.tabStorage);
  await reload.start();
  const lazy = reload.add(id, title);
  await reload.rescan();
  assertGray(lazy);
});

for (const host of ['www.nytimes.com', 'www.theguardian.com', 'news.google.com',
  'ground.news', 'www.theepochtimes.com']) {
  test(`${host} retains its existing tab-session graying behavior`, async () => {
    const [id, title] = examples[0];
    const visit = page({}, new Map(), host);
    visit.add(id, title);
    await visit.start();
    await visit.advance(3000);
    assert.ok(visit.persistent[VIEWED].includes(visit.key(id)));
    const history = new Map(visit.tabStorage);
    const reload = page(visit.persistent, visit.tabStorage, host);
    const first = reload.add(id, title);
    const duplicate = reload.add(id, title);
    await reload.start();
    assert.equal(first.dataset.nunusViewed, undefined);
    assertGray(duplicate);
    assert.deepEqual(reload.tabStorage, history);
  });
}
