const test = require('node:test');
const assert = require('node:assert/strict');

function makeElement(overrides = {}) {
  return {
    value: '',
    textContent: '',
    innerHTML: '',
    disabled: false,
    open: false,
    attrs: {},
    classList: { add() {}, remove() {} },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    showModal() { this.open = true; },
    close() { this.open = false; },
    focus() {},
    querySelectorAll: () => [],
    ...overrides
  };
}

function createFixture({ api, activeId = 'b-1' } = {}) {
  const elements = {
    aiQaDialog: makeElement(),
    aiQaQuestion: makeElement(),
    aiQaScope: makeElement({ value: 'auto' }),
    aiQaLimit: makeElement({ value: '6' }),
    aiQaAskBtn: makeElement(),
    aiQaCopyAnswerBtn: makeElement(),
    aiQaClearBtn: makeElement(),
    aiQaMeta: makeElement(),
    aiQaAnswer: makeElement(),
    aiQaSources: makeElement()
  };
  const state = {
    activeId,
    bookmarks: [{ id: 'b-1', title: 'Current' }, { id: 'b-2', title: 'Other' }],
    allBookmarks: []
  };
  return { elements, state, api: api || (async () => ({ answer: '<answer>', sources: [{ id: 'b-2', title: '<source>', reason: 'a & b', score: 0.9 }] })) };
}

function createController(fixture, { showToast = () => {}, setRunning = () => {} } = {}) {
  return import('../public/js/app/aiQa.mjs').then(({ createAiQaController }) => createAiQaController({
    ...fixture,
    byId: (id) => fixture.elements[id] || null,
    escapeHtml: (value) => String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;'),
    hostFromUrl: () => 'example.test',
    detailAiOperationBusy: () => false,
    setDetailAiQaRunning: setRunning,
    updateDetailPanelHeadUi: () => {},
    renderRelatedBookmarksUi: () => {},
    store: { setActiveId: (id) => { fixture.state.activeId = id; } },
    renderCards: () => {},
    renderDetail: () => {},
    showToast
  }));
}

test('AI Q&A controller escapes source content and keeps answer text safe', async () => {
  const fixture = createFixture();
  fixture.elements.aiQaQuestion.value = 'What is saved?';
  const controller = await createController(fixture);
  await controller.run();
  assert.equal(controller.state.loading, false);
  assert.equal(fixture.elements.aiQaAnswer.textContent, '<answer>');
  assert.match(fixture.elements.aiQaSources.innerHTML, /&lt;source&gt;/);
  assert.match(fixture.elements.aiQaSources.innerHTML, /a &amp; b/);
  assert.doesNotMatch(fixture.elements.aiQaSources.innerHTML, /<source>/);
});

test('AI Q&A controller ignores a response after opening a different bookmark', async () => {
  let resolveRequest;
  const fixture = createFixture({ api: () => new Promise((resolve) => { resolveRequest = resolve; }) });
  fixture.elements.aiQaQuestion.value = 'Question';
  const controller = await createController(fixture);
  const pending = controller.run();
  controller.open({ bookmarkId: 'b-2' });
  resolveRequest({ answer: 'stale', sources: [] });
  await pending;
  assert.equal(controller.state.answer, '');
  assert.equal(controller.state.loading, true);
});

test('AI Q&A controller blocks an empty question with a focused prompt', async () => {
  const fixture = createFixture();
  const messages = [];
  const controller = await createController(fixture, { showToast: (message) => messages.push(message) });
  await controller.run();
  assert.deepEqual(messages, ['请输入问题']);
  assert.equal(controller.state.loading, false);
});
