export function createSearchResultsController({
  api,
  queryString,
  state,
  store,
  isAdvancedSearchActive,
  currentAdvancedSearchQueryPayload,
  setAdvancedSearchResultMeta,
  currentQueryKey,
  getLayoutMode,
  renderHeader,
  renderCards,
  renderPager,
  renderLoadMoreBar,
  renderDetail,
  syncAdvancedSearchInputs
}) {
  const resultState = {
    loading: false,
    error: '',
    listLoadMore: {
      key: '',
      basePage: 1,
      lastLoadedPage: 1,
      total: 0,
      hasNext: false,
      pageSize: 24,
      loading: false
    }
  };

  function resetListLoadMoreState() {
    resultState.listLoadMore = {
      key: '',
      basePage: Number(state.filters.page || 1),
      lastLoadedPage: Number(state.filters.page || 1),
      total: Number(state.page?.total || 0),
      hasNext: Boolean(state.page?.hasNext),
      pageSize: Number(state.filters.pageSize || 24),
      loading: false
    };
  }

  function syncListLoadMoreBaselineFromPage() {
    const page = state.page || {};
    resultState.listLoadMore = {
      key: currentQueryKey(),
      basePage: Number(page.page || state.filters.page || 1),
      lastLoadedPage: Number(page.page || state.filters.page || 1),
      total: Number(page.total || state.bookmarks.length || 0),
      hasNext: Boolean(page.hasNext),
      pageSize: Number(page.pageSize || state.filters.pageSize || 24),
      loading: false
    };
  }

  async function fetchBookmarksPagePayload({ page = state.filters.page, pageSize = state.filters.pageSize } = {}) {
    if (isAdvancedSearchActive()) {
      const qs = queryString({
        ...currentAdvancedSearchQueryPayload(),
        page: Number(page || 1),
        pageSize: Number(pageSize || state.filters.pageSize || 24)
      });
      const payload = await api(`/api/product/search/query${qs ? `?${qs}` : ''}`);
      setAdvancedSearchResultMeta({
        usedFullText: Boolean(payload?.usedFullText),
        usedSemantic: Boolean(payload?.usedSemantic),
        semanticMode: String(payload?.semanticMode || ''),
        semanticProvider: payload?.semanticProvider && typeof payload.semanticProvider === 'object' ? payload.semanticProvider : null,
        semanticIndexUpdated: Number(payload?.semanticIndexUpdated || 0) || 0,
        semanticFallbackLocal: Boolean(payload?.semanticFallbackLocal),
        usedAiRerank: Boolean(payload?.usedAiRerank),
        rerankProvider: payload?.rerankProvider && typeof payload.rerankProvider === 'object' ? payload.rerankProvider : null,
        rerankTopK: Number(payload?.rerankTopK || 0) || 0,
        rerankAppliedCount: Number(payload?.rerankAppliedCount || 0) || 0,
        rerankSummary: String(payload?.rerankSummary || ''),
        total: Number(payload?.total || 0)
      });
      return payload;
    }
    const qs = queryString({
      ...state.filters,
      page: Number(page || 1),
      pageSize: Number(pageSize || state.filters.pageSize || 24)
    });
    const payload = await api(`/api/bookmarks${qs ? `?${qs}` : ''}`);
    setAdvancedSearchResultMeta(null);
    return payload;
  }

  async function loadBookmarks() {
    resultState.loading = true;
    resultState.error = '';
    renderCards();
    renderPager();
    renderLoadMoreBar();
    let payload;
    try {
      payload = await fetchBookmarksPagePayload();
    } catch (error) {
      resultState.loading = false;
      resultState.error = error?.message || '加载书签失败';
      resetListLoadMoreState();
      renderCards();
      renderPager();
      renderLoadMoreBar();
      throw error;
    }
    resultState.loading = false;
    store.setBookmarksPage(payload || {});
    syncListLoadMoreBaselineFromPage();

    for (const id of [...state.selected]) {
      if (!state.bookmarks.some((item) => item.id === id)) store.setSelected(id, false);
    }
    if (state.activeId && !state.bookmarks.some((item) => item.id === state.activeId)) store.setActiveId(null);

    renderHeader();
    renderCards();
    renderPager();
    renderLoadMoreBar();
    renderDetail();
    syncAdvancedSearchInputs();
  }

  async function loadMoreListPage() {
    if (getLayoutMode() !== 'list') return;
    if (resultState.loading || resultState.listLoadMore.loading) return;
    const queryKey = currentQueryKey();
    const page = state.page || {};
    if (!resultState.listLoadMore.key || resultState.listLoadMore.key !== queryKey) syncListLoadMoreBaselineFromPage();
    if (!resultState.listLoadMore.hasNext) return;

    const nextPage = Number(resultState.listLoadMore.lastLoadedPage || page.page || 1) + 1;
    resultState.listLoadMore = { ...resultState.listLoadMore, loading: true };
    renderLoadMoreBar();
    let payload;
    try {
      payload = await fetchBookmarksPagePayload({
        page: nextPage,
        pageSize: resultState.listLoadMore.pageSize || page.pageSize || state.filters.pageSize
      });
    } catch (error) {
      resultState.listLoadMore = { ...resultState.listLoadMore, loading: false };
      renderLoadMoreBar();
      throw error;
    }

    const existing = Array.isArray(state.bookmarks) ? state.bookmarks : [];
    const incoming = Array.isArray(payload?.items) ? payload.items : [];
    state.bookmarks = [...existing, ...incoming.filter((item) => !existing.some((entry) => String(entry.id) === String(item.id)))];
    resultState.listLoadMore = {
      ...resultState.listLoadMore,
      key: queryKey,
      total: Number(payload?.total || resultState.listLoadMore.total || state.bookmarks.length),
      hasNext: Boolean(payload?.hasNext),
      lastLoadedPage: Number(payload?.page || nextPage),
      pageSize: Number(payload?.pageSize || resultState.listLoadMore.pageSize || state.filters.pageSize || 24),
      loading: false
    };
    renderHeader();
    renderCards();
    renderPager();
    renderLoadMoreBar();
    renderDetail();
  }

  return {
    fetchBookmarksPagePayload,
    loadBookmarks,
    loadMoreListPage,
    resetListLoadMoreState,
    syncListLoadMoreBaselineFromPage,
    get state() { return resultState; }
  };
}
