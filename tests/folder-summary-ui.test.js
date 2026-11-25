const test = require('node:test');
const assert = require('node:assert/strict');

function makeElement(overrides = {}) {
  return {
    innerHTML: '',
    textContent: '',
    attrs: {},
    disabled: false,
    open: false,
    setAttribute(name, value) { this.attrs[name] = String(value); },
    showModal() { this.open = true; },
    close() { this.open = false; },
    querySelectorAll: () => [],
    ...overrides
  };
}

function createFixture({ folderId = 'f-1', api } = {}) {
  const elements = {
    aiFolderSummaryDialog: makeElement(),
    aiFolderSummarySubtitle: makeElement(),
    aiFolderSummaryMeta: makeElement(),
    aiFolderSummaryContent: makeElement(),
    aiFolderSummaryRunBtn: makeElement(),
    aiFolderSummaryCopyBtn: makeElement(),
    aiFolderSummaryClearBtn: makeElement()
  };
  const state = { filters: { folderId } };
  const folder = { id: 'f-1', name: 'AI', path: 'AI', aiSuggestions: null };
  return {
    elements,
    state,
    folder,
    getFolderById: (id) => String(id) === 'f-1' ? folder : null,
    api: api || (async () => ({
      collectionSummary: {
        summary: '<script>alert(1)</script>',
        themes: ['<tag>'],
        notableBookmarks: [{ bookmarkId: 'b-1', title: '<x>', reason: 'a & b' }]
      }
    }))
  };
}

test('AI folder summary controller escapes generated content before rendering', async () => {
  const { createAiFolderSummaryController } = await import('../public/js/app/folderSummary.mjs');
  const fixture = createFixture();
  const controller = createAiFolderSummaryController({
    ...fixture,
    byId: (id) => fixture.elements[id] || null,
    escapeHtml: (value) => String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;'),
    folderName: () => 'AI',
    store: { setActiveId() {} },
    renderCards() {},
    renderDetail() {},
    refreshAll: async () => {},
    showToast() {}
  });

  await controller.run();
  assert.equal(controller.state.loading, false);
  assert.match(fixture.elements.aiFolderSummaryContent.innerHTML, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(fixture.elements.aiFolderSummaryContent.innerHTML, /&lt;x&gt;/);
  assert.match(fixture.elements.aiFolderSummaryContent.innerHTML, /a &amp; b/);
  assert.doesNotMatch(fixture.elements.aiFolderSummaryContent.innerHTML, /<script>/);
});

test('AI folder summary controller ignores a response after the selected folder changes', async () => {
  const { createAiFolderSummaryController } = await import('../public/js/app/folderSummary.mjs');
  let resolveRequest;
  const fixture = createFixture({ api: () => new Promise((resolve) => { resolveRequest = resolve; }) });
  const controller = createAiFolderSummaryController({
    ...fixture,
    byId: (id) => fixture.elements[id] || null,
    escapeHtml: (value) => String(value),
    folderName: () => 'AI',
    store: { setActiveId() {} },
    renderCards() {},
    renderDetail() {},
    refreshAll: async () => {},
    showToast() {}
  });

  const pending = controller.run();
  fixture.state.filters.folderId = 'all';
  resolveRequest({ collectionSummary: { summary: 'stale' } });
  await pending;
  assert.equal(controller.state.result, null);
  assert.equal(controller.state.loading, true);
});

test('AI folder summary controller reports when no collection is selected', async () => {
  const { createAiFolderSummaryController } = await import('../public/js/app/folderSummary.mjs');
  const fixture = createFixture({ folderId: 'all' });
  const messages = [];
  const controller = createAiFolderSummaryController({
    ...fixture,
    byId: (id) => fixture.elements[id] || null,
    escapeHtml: (value) => String(value),
    folderName: () => '',
    store: { setActiveId() {} },
    renderCards() {},
    renderDetail() {},
    refreshAll: async () => {},
    showToast: (message) => messages.push(message)
  });

  await controller.run();
  assert.deepEqual(messages, ['请先在左侧选择一个集合']);
  assert.equal(controller.state.result, null);
});
