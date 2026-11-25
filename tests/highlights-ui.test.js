const test = require('node:test');
const assert = require('node:assert/strict');

test('highlights controller escapes bookmark annotations and ignores stale bookmark renders', async () => {
  const { createHighlightsController } = await import('../public/js/app/highlights.mjs');
  const elements = {
    detailHighlightsList: { innerHTML: '', querySelectorAll: () => [] },
    detailHighlightsInfo: { textContent: '' }
  };
  const state = { activeId: 'bookmark-1' };
  const controller = createHighlightsController({
    api: async () => ({ highlights: [] }),
    byId: (id) => elements[id] || null,
    state,
    escapeHtml: (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'),
    uiPrompt: async () => null,
    uiConfirm: async () => false,
    refreshAll: async () => {},
    showToast: () => {}
  });

  controller.renderHighlightsList([{
    id: 'hl-1',
    quote: '<script>alert(1)</script>',
    note: 'note & detail',
    annotations: [{ id: 'ann-1', text: '"quoted"' }]
  }], { bookmarkId: 'bookmark-1' });
  assert.match(elements.detailHighlightsInfo.textContent, /1 条高亮 · 1 条注释/);
  assert.doesNotMatch(elements.detailHighlightsList.innerHTML, /<script>/);
  assert.match(elements.detailHighlightsList.innerHTML, /&lt;script&gt;/);

  state.activeId = 'bookmark-2';
  controller.renderHighlightsList([{ id: 'hl-2', quote: 'stale' }], { bookmarkId: 'bookmark-1' });
  assert.doesNotMatch(elements.detailHighlightsList.innerHTML, /stale/);
});
