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
