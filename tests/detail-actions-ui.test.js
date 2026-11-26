const test = require('node:test');
const assert = require('node:assert/strict');

class FakeElement {
  constructor(attrs = {}) {
    this.attrs = attrs;
    this.listeners = new Map();
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  dispatch(type, event = {}) {
    return this.listeners.get(type)?.({ preventDefault() {}, stopPropagation() {}, ...event });
  }

  getAttribute(name) {
    return this.attrs[name] || null;
  }

  closest(selector) {
    return selector === '[data-detail-panel-more-action]' && this.attrs['data-detail-panel-more-action']
      ? this
      : null;
  }
}

function setup() {
  const elements = {
    detailPanelMoreBtn: new FakeElement(),
    detailPanelMoreMenu: new FakeElement(),
    detailHeaderAiTagBtn: new FakeElement()
  };
  const state = { activeId: 'b-1', bookmarks: [{ id: 'b-1', title: 'Current' }], allBookmarks: [] };
  const calls = [];
  let menuOpen = false;
  const controllerPromise = import('../public/js/app/detailActions.mjs');
  return controllerPromise.then(({ createDetailActionsController }) => ({
    controller: createDetailActionsController({
      byId: (id) => elements[id] || null,
      state,
      runAiAutoTag: () => calls.push('ai-autotag'),
      runAiTitleClean: () => calls.push('ai-title-clean'),
      openAiQa: (payload) => calls.push(['ai-qa', payload]),
      openPreview: (id) => calls.push(['preview', id]),
      openReader: (id) => calls.push(['reader', id]),
      setMoreMenuOpen: (value) => { menuOpen = value; },
      isMoreMenuOpen: () => menuOpen,
      showToast: () => calls.push('toast')
    }),
    elements,
    state,
    calls,
    get menuOpen() { return menuOpen; }
  }));
}

test('detail action controller dispatches AI menu actions without DOM button chaining', async () => {
  const { controller, calls } = await setup();

  await controller.runDetailPanelMoreAction('ai-autotag');
  await controller.runDetailPanelMoreAction('ai-qa');
  await controller.runDetailPanelMoreAction('preview-reader');

  assert.deepEqual(calls, [
    'ai-autotag',
    ['ai-qa', { bookmarkId: 'b-1', scope: 'auto' }],
    ['reader', 'b-1']
  ]);
});

test('detail action controller binds header and menu interactions to the active bookmark', async () => {
  const { controller, elements, calls, menuOpen } = await setup();
  controller.bind();

  await elements.detailHeaderAiTagBtn.dispatch('click');
  await elements.detailPanelMoreBtn.dispatch('click');
  const menuButton = new FakeElement({ 'data-detail-panel-more-action': 'ai-title-clean' });
  await elements.detailPanelMoreMenu.dispatch('click', { target: menuButton });

  assert.deepEqual(calls, ['ai-autotag', 'ai-title-clean']);
  assert.equal(menuOpen, false);
});

test('detail action controller ignores actions after the detail selection is cleared', async () => {
  const { controller, state, calls } = await setup();
  state.activeId = null;

  await controller.runDetailPanelMoreAction('ai-summary');
  assert.deepEqual(calls, []);
});
