const test = require('node:test');
const assert = require('node:assert/strict');

function makeElement(overrides = {}) {
  return {
    classList: {
      values: new Set(),
      add(name) { this.values.add(name); },
      remove(name) { this.values.delete(name); },
      toggle(name, enabled) { enabled ? this.values.add(name) : this.values.delete(name); }
    },
    dataset: {},
    attrs: {},
    textContent: '',
    disabled: false,
    setAttribute(name, value) { this.attrs[name] = String(value); },
    removeAttribute(name) { delete this.attrs[name]; },
    querySelector: () => null,
    ...overrides
  };
}

function makeHarness(api) {
  const elements = {
    previewDialog: makeElement({ open: false, showModal() { this.open = true; }, close() { this.open = false; this.onclose?.(); } }),
    previewStateBadge: makeElement(),
    previewStateNote: makeElement(),
    previewLoading: makeElement(),
    previewFrame: makeElement({ src: '', contentWindow: null }),
    previewImage: makeElement({ src: '' }),
    previewVideo: makeElement({ src: '', load() {} }),
    previewFallback: makeElement(),
    previewError: makeElement(),
    previewDialogTitle: makeElement(),
    previewDialogMeta: makeElement(),
    previewPayload: makeElement(),
    previewReaderBtn: makeElement(),
    previewExtractArticleBtn: makeElement(),
    previewOriginalBtn: makeElement(),
    previewAddHighlightBtn: makeElement(),
    previewRefreshBtn: makeElement(),
    previewCloseBtn: makeElement(),
    detailArticleInfo: makeElement()
  };
  const state = { activeId: 'a', bookmarks: [{ id: 'a' }], allBookmarks: [{ id: 'a' }] };
  let renders = 0;
  const controller = createPreviewController({
    api,
    byId: (id) => elements[id] || null,
    state,
    store: { setActiveId(id) { state.activeId = id; } },
    safeUrl: (url) => String(url).startsWith('https://') ? `safe:${url}` : 'unsafe:',
    kindLabel: (kind) => String(kind || 'web'),
    setIconButtonLabel: (element, _icon, label) => { if (element) element.textContent = label; },
    renderDetail: () => { renders += 1; },
    refreshAll: async () => {},
    renderDetailFetchStatusSummary: () => {},
    showToast: () => {}
  });
  return { controller, elements, state, get renders() { return renders; } };
}

let createPreviewController;

test.before(async () => {
  ({ createPreviewController } = await import('../public/js/app/previewController.mjs'));
});

test('preview controller renders safe media and exposes loading state', async () => {
  const harness = makeHarness(async () => ({
    preview: {
      title: 'Image',
      kind: 'image',
      summary: { siteName: 'example.test' },
      render: { mode: 'image', url: 'https://example.test/image.png' },
      reader: { available: false }
    }
  }));
  await harness.controller.openPreviewDialog('a');
  assert.equal(harness.controller.state.activeBookmarkId, 'a');
  assert.equal(harness.controller.state.uiState, 'ready');
  assert.equal(harness.elements.previewImage.src, 'safe:https://example.test/image.png');
  assert.equal(harness.elements.previewImage.classList.values.has('hidden'), false);
  assert.equal(harness.elements.previewFrame.classList.values.has('hidden'), true);
  assert.match(harness.elements.previewPayload.textContent, /example\.test/);
  assert.ok(harness.renders > 0);
});

test('preview controller ignores stale responses when bookmark changes', async () => {
  const pending = [];
  const harness = makeHarness((url) => new Promise((resolve) => pending.push({ url, resolve })));
  const first = harness.controller.loadPreviewForBookmark('a');
  const second = harness.controller.loadPreviewForBookmark('a');
  pending[1].resolve({ preview: { title: 'B', render: { mode: 'iframe', url: 'https://b.test' }, reader: { available: false } } });
  await second;
  pending[0].resolve({ preview: { title: 'A', render: { mode: 'iframe', url: 'https://a.test' }, reader: { available: false } } });
  await first;
  assert.equal(harness.controller.state.activeBookmarkId, 'a');
  assert.equal(harness.controller.state.payload.preview.title, 'B');
});

test('preview controller extracts text selection anchors without DOM writes', () => {
  const harness = makeHarness(async () => ({}));
  const textNode = { nodeType: 3, textContent: 'prefix selected suffix' };
  harness.elements.previewFrame.contentWindow = {
    getSelection() {
      return {
        rangeCount: 1,
        toString: () => 'selected',
        getRangeAt: () => ({ startContainer: textNode, startOffset: 7, endOffset: 15 })
      };
    }
  };
  assert.deepEqual(harness.controller.getReaderSelectionPayload(), {
    text: 'selected',
    quote: 'selected',
    anchors: {
      exact: 'selected',
      prefix: 'prefix ',
      suffix: ' suffix',
      startOffset: 7,
      endOffset: 15,
      selector: ''
    }
  });
});
