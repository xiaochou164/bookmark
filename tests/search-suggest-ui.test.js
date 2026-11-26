const test = require('node:test');
const assert = require('node:assert/strict');

function makeElement(overrides = {}) {
  return {
    value: '',
    innerHTML: '',
    attrs: {},
    classList: {
      values: new Set(),
      toggle(name, enabled) { enabled ? this.values.add(name) : this.values.delete(name); },
      add(name) { this.values.add(name); },
      remove(name) { this.values.delete(name); }
    },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    removeAttribute(name) { delete this.attrs[name]; },
    focus() {},
    setSelectionRange() {},
    ...overrides
  };
}

test('search suggestion controller renders accessible token suggestions and applies tokens', async () => {
  const { createSearchSuggestController } = await import('../public/js/app/searchSuggest.mjs');
  const elements = {
    searchInput: makeElement(),
    searchSuggestPopover: makeElement(),
    searchSuggestList: makeElement()
  };
  const state = { filters: { q: '' } };
  const filters = [];
  let loads = 0;
  let sidebars = 0;
  let clearedSavedSearch = 0;
  const controller = createSearchSuggestController({
    byId: (id) => elements[id] || null,
    state,
    store: { setFilter(key, value) { state.filters[key] = value; filters.push([key, value]); } },
    escapeHtml: (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'),
    iconSvg: (name) => `<svg data-icon="${name}"></svg>`,
    tokenSuggestions: [{ token: 'tag:', label: '标签', desc: '<危险>', icon: 'tag' }],
    recentLimit: 5,
    recentStorageKey: 'test.search.recent',
    loadBookmarks: async () => { loads += 1; },
    renderSidebar: () => { sidebars += 1; },
    clearAdvancedSavedSearch: () => { clearedSavedSearch += 1; }
  });

  controller.setSearchSuggestOpen(true);
  assert.equal(elements.searchInput.attrs['aria-expanded'], 'true');
  assert.match(elements.searchSuggestList.innerHTML, /role="option"/);
  assert.match(elements.searchSuggestList.innerHTML, /&lt;危险&gt;/);
  assert.doesNotMatch(elements.searchSuggestList.innerHTML, /<危险>/);

  controller.moveSearchSuggestActive(1);
  assert.equal(controller.state.activeIndex, 1);
  assert.equal(elements.searchInput.attrs['aria-activedescendant'], 'searchSuggestOption-1');

  await controller.activateSearchSuggestItem(1);
  assert.equal(elements.searchInput.value, 'tag:');
  assert.equal(state.filters.q, 'tag:');
  assert.equal(loads, 1);
  assert.equal(sidebars, 1);
  assert.equal(clearedSavedSearch, 1);
  assert.deepEqual(filters, [['q', 'tag:'], ['page', 1]]);
  assert.equal(controller.state.open, true);
});

test('search suggestion controller applies recent searches and stores immediate commits', async () => {
  const { createSearchSuggestController } = await import('../public/js/app/searchSuggest.mjs');
  const elements = {
    searchInput: makeElement(),
    searchSuggestPopover: makeElement(),
    searchSuggestList: makeElement()
  };
  const state = { filters: { q: '' } };
  const controller = createSearchSuggestController({
    byId: (id) => elements[id] || null,
    state,
    store: { setFilter(key, value) { state.filters[key] = value; } },
    escapeHtml: (value) => String(value),
    iconSvg: () => '<svg></svg>',
    tokenSuggestions: [],
    recentLimit: 5,
    recentStorageKey: 'test.search.recent',
    loadBookmarks: async () => {},
    renderSidebar: () => {},
    clearAdvancedSavedSearch: () => {}
  });
  elements.searchInput.value = 'example';
  controller.rememberRecentSearch('example', { immediate: true });
  controller.setSearchSuggestOpen(true);
  const recentIndex = controller.state.items.findIndex((item) => item.kind === 'recent');
  assert.ok(recentIndex >= 0);
  elements.searchInput.value = '';
  await controller.activateSearchSuggestItem(recentIndex);
  assert.equal(elements.searchInput.value, 'example');
  assert.equal(state.filters.q, 'example');
});
