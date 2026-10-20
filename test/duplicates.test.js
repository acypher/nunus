const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

function harness() {
  const context = vm.createContext({
    URL,
    window: { location: { hostname: 'www.nytimes.com', href: 'https://www.nytimes.com/' } },
    document: { querySelector: () => null, getElementById: () => null },
    Node: { DOCUMENT_POSITION_FOLLOWING: 4, DOCUMENT_POSITION_PRECEDING: 2 }
  });
  vm.runInContext(readFileSync(join(__dirname, '..', 'core.js'), 'utf8'), context);
  const id = 'https://www.nytimes.com/2026/10/20/us/politics/iran-trump-midterm-elections.html';
  const key = context.getViewedKey('www.nytimes.com', id);
  const site = { getArticleTitle: () => 'A headline' };
  const root = position => ({
    isConnected: true, dataset: {}, style: {},
    compareDocumentPosition: other => position < other.position ? 4 : 2,
    position
  });
  const first = root(1), second = root(2), third = root(3);
  const sync = (roots, viewed = new Set(), session = new Set(), topics = []) =>
    context.syncGrayForElements(site, roots, id, viewed, session, 'www.nytimes.com', topics);
  return { context, id, key, first, second, third, sync };
}

test('new articles gray every later copy immediately without marking the story viewed', () => {
  const { first, second, third, sync } = harness();
  const viewed = new Set(), session = new Set();
  sync([third, first, second], viewed, session);
  assert.equal(first.dataset.nunusViewed, undefined);
  for (const root of [second, third]) {
    assert.equal(root.dataset.nunusViewed, 'true');
    assert.equal(root.style.opacity, '0.2');
  }
  assert.equal(viewed.size, 0);
  assert.equal(session.size, 0);
});

test('a single new article remains readable', () => {
  const { first, sync } = harness();
  sync([first]);
  assert.equal(first.dataset.nunusViewed, undefined);
});

test('a copy inserted later grays on the next rescan', () => {
  const { first, second, sync } = harness();
  sync([first]);
  sync([first, second]);
  assert.equal(first.dataset.nunusViewed, undefined);
  assert.equal(second.dataset.nunusViewed, 'true');
});

test('replacing or removing the first card promotes the next connected copy', () => {
  const { first, second, third, sync } = harness();
  sync([first, second, third]);
  first.isConnected = false;
  sync([second, third]);
  assert.equal(second.dataset.nunusViewed, undefined);
  assert.equal(second.style.opacity, '');
  assert.equal(third.dataset.nunusViewed, 'true');
});

test('viewed stories from previous visits still gray every copy', () => {
  const { key, first, second, sync } = harness();
  sync([first, second], new Set([key]));
  assert.equal(first.dataset.nunusViewed, 'true');
  assert.equal(second.dataset.nunusViewed, 'true');
});

test('the occurrence actually read this session stays readable across rescans', () => {
  const { context, key, first, second, sync } = harness();
  context.savedRoot = second;
  context.savedKey = key;
  vm.runInContext('sessionCanonicalRootByKey.set(savedKey, savedRoot)', context);
  sync([first, second], new Set([key]), new Set([key]));
  assert.equal(first.dataset.nunusViewed, 'true');
  assert.equal(second.dataset.nunusViewed, undefined);
  second.isConnected = false;
  sync([first], new Set([key]), new Set([key]));
  assert.equal(first.dataset.nunusViewed, undefined);
});

test('topic blocking still grays every occurrence', () => {
  const { first, second, sync } = harness();
  sync([first, second], new Set(), new Set(), ['headline']);
  assert.equal(first.dataset.nunusTopicBlocked, 'true');
  assert.equal(second.dataset.nunusTopicBlocked, 'true');
});
