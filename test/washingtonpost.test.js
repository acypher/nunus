const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const manifest = JSON.parse(readFileSync(join(__dirname, '..', 'manifest.json'), 'utf8'));
const handler = readFileSync(join(__dirname, '..', 'sites/washingtonpost.js'), 'utf8');
const entry = readFileSync(join(__dirname, '..', 'content.js'), 'utf8');
const registration = manifest.content_scripts.find(s => s.js.includes('sites/washingtonpost.js'));

// Browser match-pattern paths include the query string.
function matches(pattern, href) {
  if (!pattern.startsWith('https://')) return false;
  const url = new URL(href);
  const allowed = new URL(pattern);
  const path = allowed.pathname + allowed.search;
  return url.origin === allowed.origin &&
    new RegExp('^' + path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$')
      .test(url.pathname + url.search);
}

test('Washington Post registers the handler before the entry point on homepage URLs', () => {
  assert.ok(registration, 'Washington Post content script must be registered');
  assert.deepEqual(registration.js, ['ext-chrome-shim.js', 'core.js', 'sites/washingtonpost.js', 'content.js']);
  for (const host of ['www.washingtonpost.com', 'washingtonpost.com']) {
    for (const path of ['/', '/?source=bookmark', '/index.html', '/index.html?source=bookmark']) {
      const href = 'https://' + host + path;
      assert.ok(registration.matches.some(p => matches(p, href)), href);
      assert.ok(manifest.host_permissions.some(p => matches(p, href)), href);
    }
    for (const path of ['/politics/', '/politics/2026/10/21/a-story/', '/index.html/other']) {
      const href = 'https://' + host + path;
      assert.ok(!registration.matches.some(p => matches(p, href)), href);
    }
  }
});

test('entry point starts Washington Post tracking only on a homepage', () => {
  for (const path of ['/', '/index.html', '/politics/', '/politics/2026/10/21/a-story/']) {
    let started = 0;
    const location = new URL('https://www.washingtonpost.com' + path);
    const window = { location, localStorage: { getItem: () => null },
      NunusRun: site => { started++; assert.equal(site, window.NunusSites.washingtonpost); return Promise.resolve(); } };
    const context = vm.createContext({ window, document: {}, URL, URLSearchParams });
    vm.runInContext(handler, context);
    vm.runInContext(entry, context);
    assert.equal(started, ['/', '/index.html'].includes(path) ? 1 : 0, path);
  }
});

function headlineHarness(hrefs) {
  const links = hrefs.map((href, index) => ({
    href, textContent: `Headline ${index + 1}`,
    matches: selector => selector === 'a[href]',
    querySelectorAll: () => [],
    closest: () => null
  }));
  const document = { querySelectorAll: selector => selector.startsWith('a[') ? links : [] };
  const window = { location: new URL('https://www.washingtonpost.com/') };
  vm.runInContext(handler, vm.createContext({ window, document, URL }));
  return { site: window.NunusSites.washingtonpost, links };
}

test('finds Intelligence stories, podcast episodes and recipes alongside ordinary articles', () => {
  // URL formats inspected on the live Washington Post homepage.
  const urls = [
    'https://wpintelligence.washingtonpost.com/topics/ai-tech/2026/10/19/wpi-conversation-how-prepare-workforce-age-ai/',
    'https://wpintelligence.washingtonpost.com/topics/general/events/2026/10/23/next-big-bet-nuclear-power-smrs/',
    'https://www.washingtonpost.com/podcasts/dollars-and-sense/the-chapter-inbetween/',
    'https://www.washingtonpost.com/podcasts/life-hax/i-think-my-daughters-best-friend-is-why-shes-still-single/',
    'https://www.washingtonpost.com/recipes/chile-shrimp-brussels-sprouts-and-lemon-aioli/',
    'https://www.washingtonpost.com/recipes/chocolate-cream-pie/',
    'https://www.washingtonpost.com/politics/2026/10/21/a-story/',
    'https://www.washingtonpost.com/local/old-article_story.html'
  ];
  const { site, links } = headlineHarness(urls.map(url => url + '?itid=hp_promo#headline'));
  const articles = site.findArticles();
  assert.deepEqual([...articles.keys()], urls);
  links.forEach((link, index) => {
    assert.equal(site.getArticleUrl(link), urls[index]);
    assert.equal(site.getArticleTitle(link), `Headline ${index + 1}`);
    assert.deepEqual([...site.getVisibilityTargets(link)], [link]);
    assert.ok(articles.get(urls[index]).has(link));
  });
});

test('ignores section, podcast-show, search and unrelated-host links', () => {
  const rejected = [
    'https://www.washingtonpost.com/podcasts/',
    'https://www.washingtonpost.com/podcasts/life-hax/',
    'https://www.washingtonpost.com/recipes/',
    'https://www.washingtonpost.com/recipes/search/?query=pie',
    'https://wpintelligence.washingtonpost.com/topics/ai-tech/',
    'https://www.washingtonpost.com/politics/',
    'https://other.washingtonpost.com/news/2026/10/21/story/',
    'https://washingtonpost.com.example.com/recipes/chocolate-cream-pie/',
    'https://example.com/2026/10/21/story/',
    'ftp://www.washingtonpost.com/recipes/chocolate-cream-pie/'
  ];
  const { site, links } = headlineHarness(rejected);
  assert.equal(site.findArticles().size, 0);
  links.forEach(link => assert.equal(site.getArticleUrl(link), null));
});
