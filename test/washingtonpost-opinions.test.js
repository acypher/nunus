const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const core = readFileSync(join(__dirname, '../core.js'), 'utf8');
const handler = readFileSync(join(__dirname, '../sites/washingtonpost.js'), 'utf8');

function harness(host = 'www.washingtonpost.com') {
  let summary = null;
  let active = true;
  const document = {
    getElementById: () => active ? {} : null,
    querySelectorAll: () => summary ? [summary] : []
  };
  const window = { location: new URL('https://' + host + '/') };
  const context = vm.createContext({ window, document, URL });
  vm.runInContext(core, context);
  vm.runInContext(handler, context);
  const site = window.NunusSites.washingtonpost;
  function card(path = '/opinions/2026/10/23/policy/', label = 'Opinions', outside = false) {
    const section = { querySelectorAll: () => [{ textContent: label, closest: () => null }] };
    const link = { href: 'https://' + host + path, textContent: 'A headline', querySelectorAll: () => [], matches: s => s === 'a[href]' };
    const root = { matches: () => false, querySelectorAll: s => s.includes('web_headline') ? [link] : [], closest: () => outside ? null : section };
    return { root, id: link.href };
  }
  return { context, site, card,
    setSummary: value => { summary = value; },
    setActive: value => { active = value; }
  };
}

test('Washington Post waits for a completed summary only in the Opinions package', () => {
  const h = harness();
  const { root, id } = h.card();
  assert.equal(h.context.opinionNeedsSummary(h.site, id, [root]), true);
  h.setSummary({ dataset: { opinionSummaryUrl: id.replace(/\/$/, ''), opinionSummaryPending: '1' }, textContent: 'Summary coming…' });
  assert.equal(h.context.opinionNeedsSummary(h.site, id, [root]), true);
  h.setSummary({ dataset: { opinionSummaryUrl: id.replace(/\/$/, '') }, textContent: 'This finished summary explains the policy and its consequences for readers.' });
  assert.equal(h.context.opinionNeedsSummary(h.site, id, [root]), false);
  h.setSummary(null);
  h.setActive(false);
  assert.equal(h.context.opinionNeedsSummary(h.site, id, [root]), false);
  h.setActive(true);
  for (const c of [h.card('/politics/2026/10/23/news/'), h.card('/opinions/2026/10/23/policy/', 'Opinion'), h.card('/opinions/2026/10/23/policy/', 'Opinions', true)]) {
    assert.equal(h.context.opinionNeedsSummary(h.site, c.id, [c.root]), false);
  }
});

test('unrelated publications retain ordinary tracking and NYT retains its existing gate', () => {
  const h = harness('www.example.com');
  const c = h.card();
  assert.equal(h.context.opinionNeedsSummary(h.site, c.id, [c.root]), false);
  const nyt = harness('www.nytimes.com');
  const site = { isOpinionSummaryPackageArticle: () => true };
  assert.equal(nyt.context.opinionNeedsSummary(site, 'https://www.nytimes.com/2026/10/23/opinion/policy.html', [{}]), true);
  assert.equal(nyt.context.opinionNeedsSummary(site, 'https://www.nytimes.com/2026/10/23/politics/news.html', [{}]), false);
});
