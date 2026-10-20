const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const context = vm.createContext({
  window: { innerWidth: 823, innerHeight: 501 },
  document: {},
  getComputedStyle: element => element.computedStyle
});
vm.runInContext(readFileSync(join(__dirname, '..', 'core.js'), 'utf8'), context);
const isVisible = context.isRectIntersectingViewport;

function box(x, y, width, height, options = {}) {
  return {
    parentElement: options.parent || null,
    getRootNode: () => ({ host: options.host }),
    getBoundingClientRect: () => ({
      left: x, top: y, right: x + width, bottom: y + height, width, height
    }),
    offsetWidth: options.offsetWidth ?? width,
    offsetHeight: options.offsetHeight ?? height,
    clientLeft: options.clientLeft || 0,
    clientTop: options.clientTop || 0,
    clientWidth: options.clientWidth ?? width,
    clientHeight: options.clientHeight ?? height,
    computedStyle: {
      display: options.display || 'block',
      overflowX: options.overflowX || 'visible',
      overflowY: options.overflowY || 'visible'
    }
  };
}

// Measured on the Guardian's live Highlights strip in Comet at 150% zoom.
const highlights = box(56, 69, 700, 126, { overflowX: 'auto', overflowY: 'hidden' });

test('Guardian headline hidden beyond the right carousel edge stays unseen', () => {
  assert.equal(isVisible(box(786, 95, 152, 80, { parent: highlights })), false);
});

test('Guardian headline hidden beyond the left carousel edge stays unseen', () => {
  assert.equal(isVisible(box(-114, 95, 153, 80, { parent: highlights })), false);
});

test('the two visible Guardian highlights still count as visible', () => {
  assert.equal(isVisible(box(186, 95, 120, 80, { parent: highlights })), true);
  assert.equal(isVisible(box(486, 95, 135, 80, { parent: highlights })), true);
});

test('a partially clipped title still needs 20 visible pixels', () => {
  assert.equal(isVisible(box(737, 95, 152, 80, { parent: highlights })), false);
  assert.equal(isVisible(box(736, 95, 152, 80, { parent: highlights })), true);
});

test('vertical clipping also prevents unseen titles from being recorded', () => {
  const container = box(100, 100, 300, 100, { overflowY: 'hidden' });
  assert.equal(isVisible(box(120, 205, 100, 30, { parent: container })), false);
  assert.equal(isVisible(box(120, 180, 100, 30, { parent: container })), true);
});

test('all nested clipping containers constrain the visible title', () => {
  const outer = box(100, 100, 200, 200, { overflowX: 'clip' });
  const inner = box(50, 100, 300, 200, { overflowX: 'scroll', parent: outer });
  assert.equal(isVisible(box(60, 120, 30, 30, { parent: inner })), false);
});

test('overflow visible does not clip a title to its parent box', () => {
  const parent = box(100, 100, 100, 100);
  assert.equal(isVisible(box(250, 120, 100, 30, { parent })), true);
});

test('clipping applies only on the specified axis', () => {
  const parent = box(100, 100, 200, 100, { overflowX: 'hidden' });
  assert.equal(isVisible(box(120, 250, 100, 30, { parent })), true);
});

test('borders and scrollbars do not count as visible content', () => {
  const parent = box(100, 100, 200, 100, {
    overflowX: 'auto', clientLeft: 5, clientWidth: 180
  });
  assert.equal(isVisible(box(266, 120, 100, 30, { parent })), false);
  assert.equal(isVisible(box(265, 120, 100, 30, { parent })), true);
});

test('scaled clipping boxes use the scaled client area', () => {
  const parent = box(100, 100, 400, 200, {
    overflowX: 'hidden', offsetWidth: 200, clientLeft: 5, clientWidth: 180
  });
  assert.equal(isVisible(box(451, 120, 100, 30, { parent })), false);
  assert.equal(isVisible(box(450, 120, 100, 30, { parent })), true);
});

test('a shadow host can clip a headline inside its shadow root', () => {
  const host = box(100, 100, 200, 100, { overflowX: 'hidden' });
  assert.equal(isVisible(box(310, 120, 100, 30, { host })), false);
});

test('ancestors without a clipping box do not hide visible headlines', () => {
  for (const display of ['contents', 'inline']) {
    const parent = box(0, 0, 0, 0, { display, overflowX: 'hidden' });
    assert.equal(isVisible(box(120, 120, 100, 30, { parent })), true);
  }
});

test('ordinary viewport thresholds and small headlines are preserved', () => {
  assert.equal(isVisible(box(804, 120, 100, 30)), false);
  assert.equal(isVisible(box(803, 120, 100, 30)), true);
  assert.equal(isVisible(box(100, 482, 100, 30)), false);
  assert.equal(isVisible(box(100, 481, 100, 30)), true);
  assert.equal(isVisible(box(100, 120, 15, 15)), true);
  assert.equal(isVisible(box(100, 120, 0, 30)), false);
});

test('offscreen titles avoid expensive ancestor style reads', () => {
  const parent = box(0, 0, 823, 501);
  Object.defineProperty(parent, 'computedStyle', {
    get() { throw new Error('Offscreen ancestor should not be inspected'); }
  });
  assert.equal(isVisible(box(100, 600, 100, 30, { parent })), false);
});

test('NYT body overflow propagated to the viewport does not hide scrolled headlines', () => {
  const html = box(0, -13594, 823, 14095);
  const body = box(0, -13594, 823, 501, {
    parent: html, overflowX: 'hidden', overflowY: 'auto'
  });
  context.document = { documentElement: html, body, scrollingElement: html };
  try {
    assert.equal(isVisible(box(344, 128, 283, 36, { parent: body })), true);
    assert.equal(isVisible(box(344, 600, 283, 36, { parent: body })), false);
  } finally {
    context.document = {};
  }
});

test('the document scrolling element clips at the viewport, not its scrolled box', () => {
  const html = box(0, -1000, 823, 2000, { overflowY: 'auto' });
  context.document = { documentElement: html, scrollingElement: html };
  try {
    assert.equal(isVisible(box(100, 120, 200, 30, { parent: html })), true);
  } finally {
    context.document = {};
  }
});

test('BODY still clips when the root handles its own overflow', () => {
  const html = box(0, 0, 823, 501, { overflowY: 'auto' });
  const body = box(100, 100, 200, 100, {
    parent: html, overflowY: 'hidden'
  });
  context.document = { documentElement: html, body, scrollingElement: html };
  try {
    assert.equal(isVisible(box(120, 220, 100, 30, { parent: body })), false);
    assert.equal(isVisible(box(120, 120, 100, 30, { parent: body })), true);
  } finally {
    context.document = {};
  }
});
