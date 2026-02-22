function createInitialState() {
  return {
    folders: [],
    tags: [],
    stats: {},
    bookmarks: [],
    allBookmarks: [],
    filters: {
      view: 'all',
      folderId: 'all',
      tags: '',
      q: '',
      sort: 'newest',
      page: 1,
      pageSize: 24
    },
    page: {
      page: 1,
      pageSize: 24,
      total: 0,
      totalPages: 1,
      hasPrev: false,
      hasNext: false
    },
    selected: new Set(),
    activeId: null,
    pluginConfig: null
  };
}

export function createAppStore() {
  const state = createInitialState();

  return {
    state,
    setCollectionsSnapshot(payload = {}) {
      state.folders = payload.folders || [];
      state.tags = payload.tags || [];
      state.stats = payload.stats || {};
      state.allBookmarks = payload.bookmarks || [];
    },
    setBookmarksPage(payload = {}) {
      state.bookmarks = payload.items || [];
      state.page = {
        page: Number(payload.page || state.filters.page || 1),
        pageSize: Number(payload.pageSize || state.filters.pageSize || 24),
        total: Number(payload.total || 0),
        totalPages: Number(payload.totalPages || 1),
        hasPrev: Boolean(payload.hasPrev),
        hasNext: Boolean(payload.hasNext)
      };
      state.filters.page = state.page.page;
      state.filters.pageSize = state.page.pageSize;
    },
    setFilter(key, value) {
      state.filters[key] = value;
    },
    clearSelection() {
      state.selected.clear();
    },
    setSelected(id, checked) {
      if (checked) state.selected.add(id);
      else state.selected.delete(id);
    },
    setActiveId(id) {
      state.activeId = id;
    },
    setPluginConfig(config) {
      state.pluginConfig = config;
    }
  };
}
