const test = require('node:test');
const assert = require('node:assert/strict');

function makeState() {
  return {
    filters: { view: 'all', folderId: 'all', tags: '', q: 'rainbow', sort: 'newest', page: 1, pageSize: 2 },
    page: {},
    bookmarks: [],
    allBookmarks: [],
    selected: new Set(['stale', 'keep']),
    activeId: 'stale'
  };
}

function makeControllerOptions(state, api, meta = {}) {
  const calls = [];
  const store = {
    setBookmarksPage(payload) {
      state.bookmarks = payload.items || [];
      state.page = payload;
      state.filters.page = Number(payload.page || 1);
      state.filters.pageSize = Number(payload.pageSize || 2);
    },
    setSelected(id, checked) {
      if (checked) state.selected.add(id);
      else state.selected.delete(id);
    },
    setActiveId(id) { state.activeId = id; }
  };
  return {
    api,
    queryString: (payload) => new URLSearchParams(payload).toString(),
    state,
    store,
    isAdvancedSearchActive: () => Boolean(meta.advanced),
    currentAdvancedSearchQueryPayload: () => ({ q: state.filters.q, semantic: 'true' }),
    setAdvancedSearchResultMeta: (value) => { meta.resultMeta = value; },
    currentQueryKey: () => JSON.stringify({ q: state.filters.q, pageSize: state.filters.pageSize }),
    getLayoutMode: () => 'list',
    renderHeader: () => calls.push('header'),
    renderCards: () => calls.push('cards'),
    renderPager: () => calls.push('pager'),
    renderLoadMoreBar: () => calls.push('more'),
    renderDetail: () => calls.push('detail'),
    syncAdvancedSearchInputs: () => calls.push('advanced'),
    calls,
    meta
  };
}

test('search results controller loads advanced results, metadata and prunes stale selection', async () => {
  const { createSearchResultsController } = await import('../public/js/app/searchResults.mjs');
  const state = makeState();
  const meta = { advanced: true };
  let requestUrl = '';
  const options = makeControllerOptions(state, async (url) => {
    requestUrl = url;
    return {
      items: [{ id: 'keep', title: 'Keep' }],
      page: 1,
      pageSize: 2,
      total: 1,
      hasNext: false,
      usedSemantic: true,
      semanticMode: 'semantic',
      rerankAppliedCount: 1
    };
  }, meta);
  const controller = createSearchResultsController(options);

  await controller.loadBookmarks();

  assert.match(requestUrl, /^\/api\/product\/search\/query\?/);
  assert.equal(state.activeId, null);
  assert.deepEqual([...state.selected], ['keep']);
  assert.equal(meta.resultMeta.usedSemantic, true);
  assert.equal(controller.state.loading, false);
});

test('search results controller appends only new items when loading the next page', async () => {
  const { createSearchResultsController } = await import('../public/js/app/searchResults.mjs');
  const state = makeState();
  state.bookmarks = [{ id: 'b-1' }, { id: 'b-2' }];
  state.page = { page: 1, pageSize: 2, total: 4, hasNext: true };
  const options = makeControllerOptions(state, async () => ({
    items: [{ id: 'b-2' }, { id: 'b-3' }],
    page: 2,
    pageSize: 2,
    total: 4,
    hasNext: false
  }));
  const controller = createSearchResultsController(options);
  controller.syncListLoadMoreBaselineFromPage();

  await controller.loadMoreListPage();

  assert.deepEqual(state.bookmarks.map((item) => item.id), ['b-1', 'b-2', 'b-3']);
  assert.equal(controller.state.listLoadMore.lastLoadedPage, 2);
  assert.equal(controller.state.listLoadMore.hasNext, false);
});

test('search results controller exposes a recoverable error state', async () => {
  const { createSearchResultsController } = await import('../public/js/app/searchResults.mjs');
  const state = makeState();
  const options = makeControllerOptions(state, async () => { throw new Error('network down'); });
  const controller = createSearchResultsController(options);

  await assert.rejects(controller.loadBookmarks(), /network down/);
  assert.equal(controller.state.loading, false);
  assert.equal(controller.state.error, 'network down');
});
