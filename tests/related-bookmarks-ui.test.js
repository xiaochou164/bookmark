const test = require('node:test');
const assert = require('node:assert/strict');

function makeElement(overrides = {}) {
  return {
    innerHTML: '',
    textContent: '',
    attrs: {},
    disabled: false,
    setAttribute(name, value) { this.attrs[name] = String(value); },
    querySelectorAll: () => [],
    querySelector: () => null,
    ...overrides
  };
}

test('related bookmarks controller escapes recommendation content and keeps tenant-local UI state', async () => {
  const { createRelatedBookmarksController } = await import('../public/js/app/relatedBookmarks.mjs');
  const list = makeElement();
  const elements = {
    detailRelatedBookmarksInfo: makeElement(),
    detailRelatedBookmarksList: list,
    refreshRelatedBookmarksBtn: makeElement()
  };
  const state = {
    activeId: 'b-1',
    bookmarks: [{ id: 'b-1', title: 'Current' }, { id: 'b-2', title: 'Related' }],
    allBookmarks: []
  };
  let busy = false;
  const controller = createRelatedBookmarksController({
    api: async () => ({
      items: [{ id: 'b-2', title: '<script>', url: 'https://example.test', reason: 'x & y', score: 0.8 }],
      summary: '相关',
      confidence: 0.8
    }),
    byId: (id) => elements[id] || null,
    state,
    store: { setActiveId: (id) => { state.activeId = id; } },
    escapeHtml: (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'),
    hostFromUrl: () => 'example.test',
    bookmarkTimeText: () => '刚刚',
    detailAiOperationBusy: () => busy,
    isDetailEditMode: () => false,
    renderCards: () => {},
    renderDetail: () => {},
    updateDetailPanelHeadUi: () => {},
    uiConfirm: async () => true,
    refreshAll: async () => {},
    showToast: () => {}
  });

  await controller.runAiRelatedBookmarksForActiveBookmark();
  assert.equal(controller.state.bookmarkId, 'b-1');
  assert.equal(controller.state.items.length, 1);
  assert.match(list.innerHTML, /&lt;script&gt;/);
  assert.match(list.innerHTML, /x &amp; y/);
  assert.doesNotMatch(list.innerHTML, /<script>/);
  assert.equal(controller.state.running, false);
});

test('related bookmarks controller cancels stale requests after switching bookmarks', async () => {
  const { createRelatedBookmarksController } = await import('../public/js/app/relatedBookmarks.mjs');
  const pending = [];
  const elements = {
    detailRelatedBookmarksInfo: makeElement(),
    detailRelatedBookmarksList: makeElement(),
    refreshRelatedBookmarksBtn: makeElement()
  };
  const state = { activeId: 'b-1', bookmarks: [{ id: 'b-1' }, { id: 'b-2' }], allBookmarks: [] };
  const controller = createRelatedBookmarksController({
    api: () => new Promise((resolve) => pending.push(resolve)),
    byId: (id) => elements[id] || null,
    state,
    store: { setActiveId: (id) => { state.activeId = id; } },
    escapeHtml: (value) => String(value),
    hostFromUrl: () => '',
    bookmarkTimeText: () => '',
    detailAiOperationBusy: () => controller.state.running,
    isDetailEditMode: () => false,
    renderCards: () => {},
    renderDetail: () => {},
    updateDetailPanelHeadUi: () => {},
    uiConfirm: async () => true,
    refreshAll: async () => {},
    showToast: () => {}
  });

  const first = controller.runAiRelatedBookmarksForActiveBookmark();
  state.activeId = 'b-2';
  controller.renderRelatedBookmarksUi({ id: 'b-2' });
  pending[0]({ items: [{ id: 'b-1', title: 'stale' }] });
  await first;
  assert.equal(controller.state.running, false);
  assert.equal(controller.state.bookmarkId, '');
  assert.equal(controller.state.items.length, 0);
});
