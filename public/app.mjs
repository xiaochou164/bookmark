import { quickViews } from './js/constants.mjs';
import { byId, escapeHtml, hostFromUrl } from './js/utils.mjs';
import { api, queryString } from './js/api.mjs';
import { createAppStore } from './js/stateStore.mjs';

const store = createAppStore();
const state = store.state;
const SAVED_SEARCHES_UI_ENABLED = false;
let draggedFolderId = null;
let toastTimer = null;
let toastUndoHandler = null;
let pluginTaskPollTimer = null;
let metadataTaskPollTimer = null;
let detailMetadataTaskBookmarkId = null;
let detailMetadataTaskLatestId = null;
let metadataTaskLoadSeq = 0;
let previewActiveBookmarkId = null;
let previewPayload = null;
let previewMode = 'auto';
let previewUiState = 'idle';
let detailHighlightsBookmarkId = null;
let detailHighlightsLoadSeq = 0;
let detailRelatedBookmarksState = {
  bookmarkId: '',
  loading: false,
  items: [],
  summary: '',
  confidence: 0,
  error: ''
};
let aiQaDialogState = {
  loading: false,
  question: '',
  answer: '',
  sources: [],
  insufficient: false,
  confidence: 0,
  error: '',
  bookmarkId: '',
  scope: 'auto',
  limit: 6
};
let aiFolderSummaryDialogState = {
  loading: false,
  folderId: '',
  result: null,
  error: '',
  suppressPersisted: false
};
let detailEditMode = false;
let detailEditBookmarkId = null;
let detailAiAutoTagRunning = false;
let detailAiTitleCleanRunning = false;
let detailAiSummaryRunning = false;
let detailAiReaderSummaryRunning = false;
let detailAiHighlightCandidatesRunning = false;
let detailAiHighlightDigestRunning = false;
let detailAiFolderRecommendRunning = false;
let detailAiRelatedRunning = false;
let detailAiQaRunning = false;
let bulkAiAutoTagRunning = false;
let ioTaskPollTimer = null;
let ioActiveTaskId = null;
let actionDialogSession = null;
let bookmarksLoading = false;
let bookmarksLoadError = '';
let listVirtualRenderRaf = 0;
let collectionsTreeVirtualRenderRaf = 0;
let refreshAllInFlight = null;
let refreshAllQueued = false;
let folderDragAutoExpandTimer = null;
let folderDragHoverState = { targetId: '', mode: '' };
let listLoadMoreState = {
  key: '',
  basePage: 1,
  lastLoadedPage: 1,
  total: 0,
  hasNext: false,
  pageSize: 24,
  loading: false
};
const LIST_VIRTUAL_THRESHOLD = 120;
const LIST_VIRTUAL_ROW_HEIGHT = 70;
const LIST_VIRTUAL_OVERSCAN = 8;
const COLLECTIONS_TREE_VIRTUAL_THRESHOLD = 140;
const COLLECTIONS_TREE_VIRTUAL_ROW_HEIGHT = 32;
const COLLECTIONS_TREE_VIRTUAL_OVERSCAN = 10;
let authState = {
  loading: false,
  authenticated: false,
  user: null,
  auth: null,
  tokens: [],
  latestPlainToken: ''
};
let authGuardLastCheckAt = 0;
let authGuardInFlight = null;
let sidebarAccountMenuOpen = false;
let listColumnsMenuOpen = false;
let headerSortMenuOpen = false;
let headerViewMenuOpen = false;
let headerMoreMenuOpen = false;
let addToolbarMenuOpen = false;
let detailPanelMoreMenuOpen = false;
let quickFiltersMenuOpen = false;
let systemViewContextMenuState = { open: false, view: '', x: 0, y: 0 };
let collectionsHeaderMenuState = { open: false, x: 0, y: 0 };
let quickFilterContextMenuState = { open: false, id: '', query: '', x: 0, y: 0 };
let tagContextMenuState = { open: false, tag: '', x: 0, y: 0 };
let collectionContextMenuState = {
  open: false,
  folderId: '',
  x: 0,
  y: 0
};
let advancedSearchState = {
  panelOpen: false,
  enabled: false,
  tags: '',
  domain: '',
  type: '',
  favorite: '',
  archived: '',
  semanticEnabled: false,
  semanticMode: 'hybrid',
  rerankEnabled: false,
  rerankTopK: 36,
  saved: [],
  activeSavedId: '',
  lastResultMeta: null,
  lastAiParseMeta: null
};
const SEARCH_RECENT_STORAGE_KEY = 'rainboard.searchRecentQueries';
const SEARCH_RECENT_LIMIT = 12;
const SEARCH_TOKEN_SUGGESTIONS = [
  { id: 'tag', token: 'tag:', label: '标签', desc: '例如 tag:AI', icon: 'tag' },
  { id: 'type', token: 'type:', label: '类型', desc: '例如 type:web / type:pdf', icon: 'type' },
  { id: 'created', token: 'created:', label: '创建日期', desc: '例如 created:2026-02', icon: 'calendar' },
  { id: 'link', token: 'link:', label: '在 URL', desc: '例如 link:example.com', icon: 'link' },
  { id: 'info', token: 'info:', label: '标题/描述', desc: '在标题或摘要中查找', icon: 'info' },
  { id: 'note', token: 'note:true', label: '备注', desc: '仅显示有备注的条目', icon: 'note' },
  { id: 'highlights', token: 'highlights:true', label: '高亮', desc: '仅显示有高亮的条目', icon: 'highlights' },
  { id: 'notag', token: 'notag:true', label: '没有标签', desc: '仅显示未打标签条目', icon: 'tag' }
];
let searchSuggestState = {
  open: false,
  activeIndex: -1,
  items: [],
  recent: []
};
let searchSuggestCloseTimer = null;
let searchRecentCommitTimer = null;
let searchInputApplyTimer = null;
const SEARCH_INPUT_DEBOUNCE_MS = 180;
const BOOKMARK_LAYOUT_STORAGE_KEY = 'rainboard.bookmarkLayoutMode';
const BOOKMARK_LAYOUT_MODES = ['list', 'card', 'headline', 'moodboard'];
let bookmarkLayoutMode = loadBookmarkLayoutMode();
const LIST_COLUMNS_STORAGE_KEY = 'rainboard.listColumns';
const DEFAULT_LIST_COLUMNS = Object.freeze({
  folder: true,
  type: true,
  excerpt: true,
  tags: true,
  time: true
});
let listColumns = loadListColumns();
const COLLAPSED_FOLDERS_STORAGE_KEY = 'rainboard.collapsedFolders';
const SIDEBAR_TAGS_UI_STORAGE_KEY = 'rainboard.sidebarTagsUi';
const DETAIL_SECTIONS_UI_STORAGE_KEY = 'rainboard.detailSectionsUi';
let collapsedFolderIds = loadCollapsedFolderIds();
let sidebarTagsUi = loadSidebarTagsUi();
let detailSectionsUi = loadDetailSectionsUi();
searchSuggestState.recent = loadSearchRecentQueries();

function setSavedSearchesUiVisible(visible) {
  const on = Boolean(visible);
  const sidebarRefreshBtn = byId('savedQueriesSidebarRefreshBtn');
  const sidebarMeta = byId('savedQueriesSidebarMeta');
  const sidebarNav = byId('savedQueriesSidebar');
  const sidebarHead = sidebarRefreshBtn?.closest('.section-head');
  [sidebarHead, sidebarMeta, sidebarNav].forEach((el) => el?.classList.toggle('hidden', !on));

  [
    'advancedSearchSaveBtn',
    'advancedSearchSavedRefreshBtn',
    'advancedSearchSavedSelect',
    'advancedSearchSavedApplyBtn',
    'advancedSearchSavedDeleteBtn'
  ].forEach((id) => byId(id)?.classList.toggle('hidden', !on));
}

function normalizeBookmarkLayoutMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  return BOOKMARK_LAYOUT_MODES.includes(mode) ? mode : 'list';
}

function loadBookmarkLayoutMode() {
  try {
    return normalizeBookmarkLayoutMode(window.localStorage.getItem(BOOKMARK_LAYOUT_STORAGE_KEY));
  } catch (_err) {
    return 'list';
  }
}

function setBookmarkLayoutMode(mode) {
  bookmarkLayoutMode = normalizeBookmarkLayoutMode(mode);
  try {
    window.localStorage.setItem(BOOKMARK_LAYOUT_STORAGE_KEY, bookmarkLayoutMode);
  } catch (_err) {
    // ignore storage errors
  }
  if (bookmarkLayoutMode !== 'list') setListColumnsMenuOpen(false);
  renderBookmarkLayoutSwitch();
  renderListColumnsMenu();
  renderHeaderMenuControls();
  renderCards();
  renderListLoadMoreBar();
}

function normalizeListColumns(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  return {
    folder: typeof input.folder === 'boolean' ? input.folder : DEFAULT_LIST_COLUMNS.folder,
    type: typeof input.type === 'boolean' ? input.type : DEFAULT_LIST_COLUMNS.type,
    excerpt: typeof input.excerpt === 'boolean' ? input.excerpt : DEFAULT_LIST_COLUMNS.excerpt,
    tags: typeof input.tags === 'boolean' ? input.tags : DEFAULT_LIST_COLUMNS.tags,
    time: typeof input.time === 'boolean' ? input.time : DEFAULT_LIST_COLUMNS.time
  };
}

function loadListColumns() {
  try {
    const raw = window.localStorage.getItem(LIST_COLUMNS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_LIST_COLUMNS };
    return normalizeListColumns(JSON.parse(raw));
  } catch (_err) {
    return { ...DEFAULT_LIST_COLUMNS };
  }
}

function persistListColumns() {
  try {
    window.localStorage.setItem(LIST_COLUMNS_STORAGE_KEY, JSON.stringify(listColumns));
  } catch (_err) {
    // ignore
  }
}

function loadCollapsedFolderIds() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(COLLAPSED_FOLDERS_STORAGE_KEY) || '[]');
    return new Set(Array.isArray(raw) ? raw.map((x) => String(x)) : []);
  } catch (_err) {
    return new Set();
  }
}

function persistCollapsedFolderIds() {
  try {
    window.localStorage.setItem(COLLAPSED_FOLDERS_STORAGE_KEY, JSON.stringify([...collapsedFolderIds]));
  } catch (_err) {
    // ignore
  }
}

function isFolderCollapsed(folderId) {
  return collapsedFolderIds.has(String(folderId || ''));
}

function setFolderCollapsed(folderId, collapsed) {
  const key = String(folderId || '');
  if (!key) return;
  if (collapsed) collapsedFolderIds.add(key);
  else collapsedFolderIds.delete(key);
  persistCollapsedFolderIds();
  renderSidebar();
}

function getTopLevelCollections() {
  return (state.folders || []).filter((f) => String(f.id) !== 'root' && String(f.parentId || 'root') === 'root');
}

function setTopLevelCollectionsCollapsed(collapsed) {
  for (const f of getTopLevelCollections()) {
    if (collapsed) collapsedFolderIds.add(String(f.id));
    else collapsedFolderIds.delete(String(f.id));
  }
  persistCollapsedFolderIds();
  renderSidebar();
}

function toggleTopLevelCollectionsCollapse() {
  const topLevel = getTopLevelCollections();
  const shouldExpand = topLevel.length > 0 && topLevel.every((f) => isFolderCollapsed(f.id));
  setTopLevelCollectionsCollapsed(!shouldExpand);
}

function setCollectionsSectionDragState(active) {
  byId('collectionsSectionHead')?.classList.toggle('drag-active', Boolean(active));
}

function buildCollectionsTreeIndices() {
  const childrenByParent = new Map();
  for (const folder of state.folders.filter((f) => f.id !== 'root')) {
    const parent = folder.parentId || 'root';
    if (!childrenByParent.has(parent)) childrenByParent.set(parent, []);
    childrenByParent.get(parent).push(folder);
  }
  for (const arr of childrenByParent.values()) {
    arr.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  }

  const folderBadgeMap = new Map();
  for (const item of state.allBookmarks || []) {
    if (item.deletedAt) continue;
    const key = String(item.folderId || 'root');
    folderBadgeMap.set(key, Number(folderBadgeMap.get(key) || 0) + 1);
  }

  return { childrenByParent, folderBadgeMap };
}

function collectionTreeRowHtml(f, {
  badge = 0,
  hasChildren = false,
  collapsed = false,
  active = false,
  level = 0
} = {}) {
  return `<div class="tree-row" data-tree-row-folder="${f.id}" style="--tree-level:${Number(level || 0)}">
    ${hasChildren
      ? `<button type="button" class="tree-expander ${collapsed ? 'collapsed' : ''}" data-folder-toggle="${f.id}" aria-label="${collapsed ? '展开集合' : '折叠集合'}" aria-expanded="${String(!collapsed)}">▾</button>`
      : '<span class="tree-expander tree-expander-spacer" aria-hidden="true"></span>'
    }
    <button class="tree-item ${active ? 'active' : ''}" data-folder="${f.id}" draggable="true">
      <span class="tree-item-inner">
        ${f.icon
      ? `<span class="tree-folder-icon" aria-hidden="true">${escapeHtml(String(f.icon || ''))}</span>`
      : `<span class="tree-color-dot" style="background:${escapeHtml(f.color)}"></span>`
    }
        <span class="tree-item-name">${escapeHtml(f.name)}</span>
        <span class="muted tree-item-count">${Number(badge || 0)}</span>
      </span>
    </button>
    <button type="button" class="tree-hover-action ghost" data-folder-menu="${f.id}" title="集合菜单" aria-label="集合菜单">…</button>
  </div>`;
}

function flattenVisibleCollectionTreeRows(childrenByParent, folderBadgeMap, parentId = 'root', level = 0, acc = []) {
  const rows = childrenByParent.get(parentId) || [];
  for (const f of rows) {
    const hasChildren = Boolean((childrenByParent.get(f.id) || []).length);
    const collapsed = hasChildren && isFolderCollapsed(f.id);
    acc.push({
      folder: f,
      level,
      badge: Number(folderBadgeMap.get(String(f.id)) || 0),
      hasChildren,
      collapsed,
      active: state.filters.folderId === f.id
    });
    if (hasChildren && !collapsed) {
      flattenVisibleCollectionTreeRows(childrenByParent, folderBadgeMap, f.id, level + 1, acc);
    }
  }
  return acc;
}

function collectionsTreeOffsetTopWithinScroller(el, scroller) {
  if (!el || !scroller) return 0;
  let top = 0;
  let node = el;
  while (node && node !== scroller && node instanceof HTMLElement) {
    top += node.offsetTop || 0;
    node = node.offsetParent;
  }
  if (node === scroller) return top;
  const elRect = el.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  return (elRect.top - scrollerRect.top) + (scroller.scrollTop || 0);
}

function collectionsTreeVirtualWindow(tree, totalItems) {
  const count = Math.max(0, Number(totalItems || 0));
  if (!count) return { start: 0, end: 0, topPad: 0, bottomPad: 0 };
  const scroller = tree?.closest('.sidebar') || document.scrollingElement || document.documentElement;
  const treeTop = collectionsTreeOffsetTopWithinScroller(tree, scroller);
  const scrollTop = Number(scroller.scrollTop || 0);
  const viewportHeight = Number(scroller.clientHeight || window.innerHeight || 0);
  const visibleTop = Math.max(0, scrollTop - treeTop);
  const visibleBottom = Math.max(0, visibleTop + viewportHeight);
  const start = Math.max(0, Math.floor(visibleTop / COLLECTIONS_TREE_VIRTUAL_ROW_HEIGHT) - COLLECTIONS_TREE_VIRTUAL_OVERSCAN);
  const end = Math.min(count, Math.ceil(visibleBottom / COLLECTIONS_TREE_VIRTUAL_ROW_HEIGHT) + COLLECTIONS_TREE_VIRTUAL_OVERSCAN);
  const safeEnd = Math.max(start + 1, end);
  const topPad = start * COLLECTIONS_TREE_VIRTUAL_ROW_HEIGHT;
  const bottomPad = Math.max(0, (count - safeEnd) * COLLECTIONS_TREE_VIRTUAL_ROW_HEIGHT);
  return { start, end: safeEnd, topPad, bottomPad };
}

function canUseCollectionsTreeVirtualization(tree, visibleRowsCount) {
  if (!tree) return false;
  if (draggedFolderId) return false;
  if (window.innerWidth <= 920) return false;
  return Number(visibleRowsCount || 0) >= COLLECTIONS_TREE_VIRTUAL_THRESHOLD;
}

function collectionsTreeRecursiveHtml(childrenByParent, folderBadgeMap, parentId = 'root') {
  const rows = childrenByParent.get(parentId) || [];
  return rows
    .map((f) => {
      const active = state.filters.folderId === f.id;
      const badge = Number(folderBadgeMap.get(String(f.id)) || 0);
      const hasChildren = Boolean((childrenByParent.get(f.id) || []).length);
      const collapsed = hasChildren && isFolderCollapsed(f.id);
      return `<div class="tree-node" data-tree-node="${f.id}">
        ${collectionTreeRowHtml(f, { badge, hasChildren, collapsed, active, level: 0 })}
        <div class="tree-group${collapsed ? ' hidden' : ''}" data-drop-parent="${f.id}">${collectionsTreeRecursiveHtml(childrenByParent, folderBadgeMap, f.id)}</div>
      </div>`;
    })
    .join('');
}

function clearFolderDragAutoExpandTimer() {
  if (folderDragAutoExpandTimer) {
    clearTimeout(folderDragAutoExpandTimer);
    folderDragAutoExpandTimer = null;
  }
}

function clearCollectionsTreeDragUi(tree, {
  preserveSource = false,
  preserveHoverState = false,
  preserveAutoExpandTimer = false
} = {}) {
  if (!tree) return;
  const itemSelector = preserveSource
    ? '.tree-item.drag-over, .tree-item.drag-over-inside, .tree-item.drag-expand-pending'
    : '.tree-item.drag-over, .tree-item.drag-source, .tree-item.drag-over-inside, .tree-item.drag-expand-pending';
  tree.querySelectorAll(itemSelector)
    .forEach((node) => node.classList.remove('drag-over', 'drag-source', 'drag-over-inside', 'drag-expand-pending'));
  tree.querySelectorAll('.tree-row.drop-before, .tree-row.drop-after')
    .forEach((node) => node.classList.remove('drop-before', 'drop-after'));
  tree.querySelectorAll('.tree-group.drag-over-group, .tree.drag-over-group')
    .forEach((node) => node.classList.remove('drag-over-group'));
  if (!preserveHoverState) folderDragHoverState = { targetId: '', mode: '' };
  if (!preserveAutoExpandTimer) clearFolderDragAutoExpandTimer();
}

function isFolderDescendantOf(folderId, maybeAncestorId) {
  let current = state.folders.find((f) => f.id === folderId);
  let guard = 0;
  while (current && guard < 2000) {
    const parentId = current.parentId || 'root';
    if (parentId === maybeAncestorId) return true;
    if (parentId === 'root') return false;
    current = state.folders.find((f) => f.id === parentId);
    guard += 1;
  }
  return false;
}

function folderDropIntentFromRowPointer(rowEl, e, { hasChildren = false } = {}) {
  const rect = rowEl.getBoundingClientRect();
  const y = Number(e.clientY || 0) - rect.top;
  const ratio = rect.height > 0 ? (y / rect.height) : 0.5;
  if (ratio <= 0.26) return 'before';
  if (ratio >= 0.74) return 'after';
  return hasChildren ? 'inside' : 'after';
}

function applyCollectionsTreeRowDropIndicator(rowEl, mode) {
  if (!rowEl) return;
  rowEl.classList.remove('drop-before', 'drop-after');
  const itemBtn = rowEl.querySelector('[data-folder]');
  itemBtn?.classList.remove('drag-over-inside');
  if (mode === 'before') rowEl.classList.add('drop-before');
  else if (mode === 'after') rowEl.classList.add('drop-after');
  else if (mode === 'inside') itemBtn?.classList.add('drag-over-inside');
}

function scheduleFolderAutoExpandOnDrag(targetId, childrenByParent, rowEl, mode) {
  if (!targetId || mode !== 'inside') {
    clearFolderDragAutoExpandTimer();
    rowEl?.querySelector?.('[data-folder]')?.classList.remove('drag-expand-pending');
    return;
  }
  const hasChildren = Boolean((childrenByParent.get(targetId) || []).length);
  if (!hasChildren || !isFolderCollapsed(targetId)) {
    clearFolderDragAutoExpandTimer();
    rowEl?.querySelector?.('[data-folder]')?.classList.remove('drag-expand-pending');
    return;
  }
  const sourceId = String(draggedFolderId || '');
  if (!sourceId || sourceId === targetId || isFolderDescendantOf(targetId, sourceId)) {
    clearFolderDragAutoExpandTimer();
    rowEl?.querySelector?.('[data-folder]')?.classList.remove('drag-expand-pending');
    return;
  }

  if (folderDragHoverState.targetId === targetId && folderDragHoverState.mode === mode && folderDragAutoExpandTimer) {
    rowEl?.querySelector?.('[data-folder]')?.classList.add('drag-expand-pending');
    return;
  }

  clearFolderDragAutoExpandTimer();
  rowEl?.querySelector?.('[data-folder]')?.classList.add('drag-expand-pending');
  folderDragHoverState = { targetId: String(targetId), mode: String(mode) };
  folderDragAutoExpandTimer = setTimeout(() => {
    folderDragAutoExpandTimer = null;
    rowEl?.querySelector?.('[data-folder]')?.classList.remove('drag-expand-pending');
    if (!draggedFolderId) return;
    if (folderDragHoverState.targetId !== String(targetId) || folderDragHoverState.mode !== 'inside') return;
    if (isFolderCollapsed(targetId)) setFolderCollapsed(targetId, false);
  }, 520);
}

function folderDropOperationFromIntent(sourceId, targetId, mode) {
  const source = state.folders.find((f) => f.id === sourceId);
  const target = state.folders.find((f) => f.id === targetId);
  if (!source || !target) return null;
  if (source.id === target.id) return null;

  if (mode === 'inside') {
    if (isFolderDescendantOf(target.id, source.id)) return null;
    const parentId = target.id;
    const siblings = state.folders
      .filter((f) => f.id !== source.id && (f.parentId || 'root') === parentId)
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
    return { parentId, position: siblings.length };
  }

  const parentId = target.parentId || 'root';
  if (isFolderDescendantOf(parentId, source.id)) return null;
  const siblings = state.folders
    .filter((f) => f.id !== source.id && (f.parentId || 'root') === parentId)
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  const targetIndex = siblings.findIndex((f) => f.id === target.id);
  if (targetIndex < 0) return null;
  const position = mode === 'before' ? targetIndex : (targetIndex + 1);
  return { parentId, position };
}

function bindCollectionsTreeEvents(tree, childrenByParent) {
  if (!tree) return;
  const collapseAllBtn = byId('collapseAllCollectionsBtn');
  if (collapseAllBtn) {
    const topLevel = childrenByParent.get('root') || [];
    const allCollapsed = topLevel.length > 0 && topLevel.every((f) => isFolderCollapsed(f.id));
    collapseAllBtn.textContent = allCollapsed ? '▸' : '▾';
    collapseAllBtn.title = allCollapsed ? '展开全部集合' : '折叠全部集合';
    collapseAllBtn.setAttribute('aria-label', allCollapsed ? '展开全部集合' : '折叠全部集合');
  }

  tree.querySelectorAll('[data-folder-toggle]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setFolderCollapsed(el.dataset.folderToggle, !isFolderCollapsed(el.dataset.folderToggle));
    });
  });
  tree.querySelectorAll('[data-folder]').forEach((el) => {
    el.addEventListener('click', async () => {
      store.setFilter('folderId', el.dataset.folder);
      store.setFilter('page', 1);
      if (state.filters.view === 'trash') store.setFilter('view', 'all');
      store.clearSelection();
      await loadBookmarks();
      renderSidebar();
    });

    el.addEventListener('dragstart', (e) => {
      draggedFolderId = el.dataset.folder;
      setCollectionsSectionDragState(true);
      clearCollectionsTreeDragUi(tree, {
        preserveSource: true,
        preserveHoverState: true,
        preserveAutoExpandTimer: true
      });
      el.classList.add('drag-source');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggedFolderId);
      }
    });

    el.addEventListener('dragend', () => {
      draggedFolderId = null;
      setCollectionsSectionDragState(false);
      clearCollectionsTreeDragUi(tree, {
        preserveSource: true,
        preserveHoverState: true,
        preserveAutoExpandTimer: true
      });
    });

    el.addEventListener('dragover', (e) => {
      if (!draggedFolderId || draggedFolderId === el.dataset.folder) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      const targetId = String(el.dataset.folder || '');
      const rowEl = el.closest('[data-tree-row-folder]');
      const hasChildren = Boolean((childrenByParent.get(targetId) || []).length);
      const mode = folderDropIntentFromRowPointer(rowEl, e, { hasChildren });
      clearCollectionsTreeDragUi(tree);
      applyCollectionsTreeRowDropIndicator(rowEl, mode);
      if (mode === 'inside') {
        el.classList.add('drag-over');
      }
      folderDragHoverState = { targetId, mode };
      scheduleFolderAutoExpandOnDrag(targetId, childrenByParent, rowEl, mode);
    });

    el.addEventListener('dragleave', (e) => {
      const rowEl = el.closest('[data-tree-row-folder]');
      const nextTarget = e.relatedTarget instanceof Node ? e.relatedTarget : null;
      if (nextTarget && rowEl?.contains(nextTarget)) return;
      el.classList.remove('drag-over', 'drag-over-inside', 'drag-expand-pending');
      rowEl?.classList.remove('drop-before', 'drop-after');
      clearFolderDragAutoExpandTimer();
    });

    el.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const sourceId = draggedFolderId || e.dataTransfer?.getData('text/plain');
      const targetId = el.dataset.folder;
      const mode = (folderDragHoverState.targetId === String(targetId) && folderDragHoverState.mode)
        ? folderDragHoverState.mode
        : 'after';
      clearCollectionsTreeDragUi(tree);
      if (!sourceId || sourceId === targetId) return;
      const op = folderDropOperationFromIntent(String(sourceId), String(targetId), mode);
      if (!op) return;
      await reorderFolder(String(sourceId), op.parentId, Number(op.position || 0));
    });
  });
  tree.querySelectorAll('[data-folder-menu]').forEach((el) => {
    el.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const folderId = el.dataset.folderMenu;
      if (!folderId) return;
      openCollectionContextMenuForFolder(folderId, { anchorEl: el });
    });
  });

  tree.querySelectorAll('[data-tree-row-folder]').forEach((row) => {
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const folderId = row.getAttribute('data-tree-row-folder') || '';
      if (!folderId) return;
      openCollectionContextMenuForFolder(folderId, { x: e.clientX, y: e.clientY });
    });
  });

  tree.querySelectorAll('[data-drop-parent]').forEach((el) => {
    el.addEventListener('dragover', (e) => {
      if (!draggedFolderId) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      clearCollectionsTreeDragUi(tree);
      el.classList.add('drag-over-group');
      folderDragHoverState = { targetId: String(el.dataset.dropParent || 'root'), mode: 'inside' };
    });

    el.addEventListener('dragleave', () => {
      el.classList.remove('drag-over-group');
    });

    el.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const sourceId = draggedFolderId || e.dataTransfer?.getData('text/plain');
      const parentId = el.dataset.dropParent || 'root';
      clearCollectionsTreeDragUi(tree);
      if (!sourceId) return;
      if (sourceId === parentId) return;
      if (parentId !== 'root' && isFolderDescendantOf(String(parentId), String(sourceId))) return;
      const siblings = state.folders
        .filter((f) => f.id !== sourceId && (f.parentId || 'root') === parentId)
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
      await reorderFolder(sourceId, parentId, siblings.length);
    });
  });
}

function renderCollectionsTreeSection() {
  const tree = byId('collectionsTree');
  if (!tree) return;
  const { childrenByParent, folderBadgeMap } = buildCollectionsTreeIndices();
  const visibleRows = flattenVisibleCollectionTreeRows(childrenByParent, folderBadgeMap);
  const useVirtual = canUseCollectionsTreeVirtualization(tree, visibleRows.length);

  if (useVirtual) {
    const win = collectionsTreeVirtualWindow(tree, visibleRows.length);
    const slice = visibleRows.slice(win.start, win.end);
    tree.classList.add('is-virtualized');
    tree.dataset.virtualCount = String(visibleRows.length);
    tree.dataset.virtualStart = String(win.start);
    tree.dataset.virtualEnd = String(win.end);
    tree.innerHTML = `${win.topPad ? `<div class="tree-virtual-spacer" style="height:${win.topPad}px" aria-hidden="true"></div>` : ''}${slice.map((row) => `<div class="tree-node tree-node-flat" data-tree-node="${row.folder.id}">${collectionTreeRowHtml(row.folder, row)}</div>`).join('')
      }${win.bottomPad ? `<div class="tree-virtual-spacer" style="height:${win.bottomPad}px" aria-hidden="true"></div>` : ''}`;
  } else {
    tree.classList.remove('is-virtualized');
    delete tree.dataset.virtualCount;
    delete tree.dataset.virtualStart;
    delete tree.dataset.virtualEnd;
    tree.innerHTML = collectionsTreeRecursiveHtml(childrenByParent, folderBadgeMap, 'root');
  }

  tree.setAttribute('data-drop-parent', 'root');
  bindCollectionsTreeEvents(tree, childrenByParent);
}

async function activateSystemView(viewKey) {
  const nextView = String(viewKey || 'all');
  store.setFilter('view', nextView);
  store.setFilter('page', 1);
  store.setFilter('folderId', 'all');
  store.clearSelection();
  await loadBookmarks();
  renderSidebar();
}

function loadSidebarTagsUi() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(SIDEBAR_TAGS_UI_STORAGE_KEY) || '{}');
    return {
      expanded: Boolean(raw.expanded),
      sort: raw && raw.sort === 'name' ? 'name' : 'count'
    };
  } catch (_err) {
    return { expanded: false, sort: 'count' };
  }
}

function persistSidebarTagsUi() {
  try {
    window.localStorage.setItem(SIDEBAR_TAGS_UI_STORAGE_KEY, JSON.stringify(sidebarTagsUi));
  } catch (_err) {
    // ignore
  }
}

function loadDetailSectionsUi() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(DETAIL_SECTIONS_UI_STORAGE_KEY) || '{}');
    return {
      basic: Boolean(raw.basic),
      status: Boolean(raw.status),
      fetch: Boolean(raw.fetch),
      highlights: Boolean(raw.highlights)
    };
  } catch (_err) {
    return {
      basic: false,
      status: false,
      fetch: false,
      highlights: false
    };
  }
}

function persistDetailSectionsUi() {
  try {
    window.localStorage.setItem(DETAIL_SECTIONS_UI_STORAGE_KEY, JSON.stringify(detailSectionsUi));
  } catch (_err) {
    // ignore
  }
}

function loadSearchRecentQueries() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(SEARCH_RECENT_STORAGE_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .slice(0, SEARCH_RECENT_LIMIT);
  } catch (_err) {
    return [];
  }
}

function persistSearchRecentQueries() {
  try {
    window.localStorage.setItem(SEARCH_RECENT_STORAGE_KEY, JSON.stringify((searchSuggestState.recent || []).slice(0, SEARCH_RECENT_LIMIT)));
  } catch (_err) {
    // ignore
  }
}

function rememberRecentSearch(term, { immediate = false } = {}) {
  const value = String(term || '').trim();
  if (!value || value.length < 2) return;

  const commit = () => {
    const current = String(byId('searchInput')?.value || '').trim();
    if (!immediate && current !== value) return;
    searchSuggestState.recent = [value, ...(searchSuggestState.recent || []).filter((x) => x !== value)].slice(0, SEARCH_RECENT_LIMIT);
    persistSearchRecentQueries();
    if (searchSuggestState.open) renderSearchSuggestPopover();
  };

  if (immediate) {
    if (searchRecentCommitTimer) {
      clearTimeout(searchRecentCommitTimer);
      searchRecentCommitTimer = null;
    }
    commit();
    return;
  }

  if (searchRecentCommitTimer) clearTimeout(searchRecentCommitTimer);
  searchRecentCommitTimer = setTimeout(() => {
    searchRecentCommitTimer = null;
    commit();
  }, 800);
}

function clearSearchSuggestCloseTimer() {
  if (searchSuggestCloseTimer) {
    clearTimeout(searchSuggestCloseTimer);
    searchSuggestCloseTimer = null;
  }
}

function setSearchSuggestOpen(open) {
  searchSuggestState.open = Boolean(open);
  if (!searchSuggestState.open) searchSuggestState.activeIndex = -1;
  const popover = byId('searchSuggestPopover');
  const input = byId('searchInput');
  if (popover) popover.classList.toggle('hidden', !searchSuggestState.open);
  if (input) {
    input.setAttribute('aria-expanded', String(searchSuggestState.open));
    if (!searchSuggestState.open) input.removeAttribute('aria-activedescendant');
  }
  if (searchSuggestState.open) renderSearchSuggestPopover();
}

function normalizedSearchQuery() {
  return String(byId('searchInput')?.value || state.filters.q || '').trim();
}

function buildSearchSuggestItems() {
  const q = normalizedSearchQuery();
  const qLower = q.toLowerCase();
  const items = [];

  const matchedTokens = SEARCH_TOKEN_SUGGESTIONS.filter((s) => {
    if (!qLower) return true;
    return s.token.toLowerCase().includes(qLower) || s.label.toLowerCase().includes(qLower) || String(s.desc || '').toLowerCase().includes(qLower);
  }).slice(0, 8);

  if (matchedTokens.length) {
    items.push({ kind: 'section', label: '建议的' });
    for (const token of matchedTokens) {
      items.push({ kind: 'token', ...token });
    }
  }

  const recent = (searchSuggestState.recent || [])
    .filter((x) => !qLower || x.toLowerCase().includes(qLower))
    .slice(0, 6);
  if (recent.length) {
    items.push({ kind: 'section', label: '最近使用的' });
    for (const text of recent) {
      items.push({ kind: 'recent', value: text });
    }
  }

  items.push({ kind: 'help' });
  return items;
}

function searchSuggestSelectableIndices() {
  const out = [];
  (searchSuggestState.items || []).forEach((item, idx) => {
    if (item.kind === 'token' || item.kind === 'recent') out.push(idx);
  });
  return out;
}

function setSearchSuggestActiveIndex(nextIndex) {
  const selectable = new Set(searchSuggestSelectableIndices());
  if (!selectable.size) {
    searchSuggestState.activeIndex = -1;
    renderSearchSuggestPopover();
    return;
  }
  const idx = Number(nextIndex);
  searchSuggestState.activeIndex = Number.isFinite(idx) && selectable.has(idx) ? idx : -1;
  renderSearchSuggestPopover();
}

function moveSearchSuggestActive(delta) {
  const selectable = searchSuggestSelectableIndices();
  if (!selectable.length) return;
  if (!searchSuggestState.open) setSearchSuggestOpen(true);
  const currentPos = selectable.indexOf(searchSuggestState.activeIndex);
  const base = currentPos >= 0 ? currentPos : (delta > 0 ? -1 : 0);
  let nextPos = base + (delta > 0 ? 1 : -1);
  if (nextPos < 0) nextPos = selectable.length - 1;
  if (nextPos >= selectable.length) nextPos = 0;
  setSearchSuggestActiveIndex(selectable[nextPos]);
}

function searchSuggestItemHtml(item, idx) {
  if (item.kind === 'section') {
    return `<div class="search-suggest-section">${escapeHtml(item.label || '')}</div>`;
  }
  if (item.kind === 'help') {
    return `<div class="search-suggest-help">
      <div class="search-suggest-help-icon">${iconSvg('help')}</div>
      <div class="search-suggest-help-text">
        <div class="search-suggest-help-title">提示</div>
        <div class="muted">输入 token（如 <code>tag:</code> / <code>type:</code>）可快速构造搜索，复杂组合推荐用右侧高级搜索。</div>
      </div>
    </div>`;
  }
  if (item.kind === 'token') {
    const active = searchSuggestState.activeIndex === idx ? ' active' : '';
    return `<button type="button" id="searchSuggestOption-${idx}" class="search-suggest-item${active}" role="option" aria-selected="${active ? 'true' : 'false'}" data-search-suggest-index="${idx}">
      <span class="search-suggest-item-icon" aria-hidden="true">${iconSvg(item.icon || 'search')}</span>
      <span class="search-suggest-item-main">
        <span class="search-suggest-item-title">${escapeHtml(item.label || item.token || '')}</span>
        <span class="search-suggest-item-desc muted">${escapeHtml(item.desc || '')}</span>
      </span>
      <span class="search-suggest-item-token">${escapeHtml(item.token || '')}</span>
    </button>`;
  }
  if (item.kind === 'recent') {
    const active = searchSuggestState.activeIndex === idx ? ' active' : '';
    return `<button type="button" id="searchSuggestOption-${idx}" class="search-suggest-item${active}" role="option" aria-selected="${active ? 'true' : 'false'}" data-search-suggest-index="${idx}">
      <span class="search-suggest-item-icon" aria-hidden="true">${iconSvg('search')}</span>
      <span class="search-suggest-item-main">
        <span class="search-suggest-item-title">${escapeHtml(item.value || '')}</span>
        <span class="search-suggest-item-desc muted">最近使用的搜索</span>
      </span>
    </button>`;
  }
  return '';
}

function renderSearchSuggestPopover() {
  const list = byId('searchSuggestList');
  const popover = byId('searchSuggestPopover');
  const input = byId('searchInput');
  if (!list || !popover || !input) return;
  if (!searchSuggestState.open) {
    popover.classList.add('hidden');
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    return;
  }

  searchSuggestState.items = buildSearchSuggestItems();
  const selectable = searchSuggestSelectableIndices();
  if (!selectable.includes(searchSuggestState.activeIndex)) {
    searchSuggestState.activeIndex = -1;
  }

  list.innerHTML = searchSuggestState.items.map((item, idx) => searchSuggestItemHtml(item, idx)).join('');
  popover.classList.toggle('hidden', false);
  input.setAttribute('aria-expanded', 'true');
  if (searchSuggestState.activeIndex >= 0) {
    input.setAttribute('aria-activedescendant', `searchSuggestOption-${searchSuggestState.activeIndex}`);
    const activeEl = byId(`searchSuggestOption-${searchSuggestState.activeIndex}`);
    activeEl?.scrollIntoView?.({ block: 'nearest' });
  } else {
    input.removeAttribute('aria-activedescendant');
  }
}

async function applySearchQueryValue(nextValue, { closeSuggest = true, remember = true } = {}) {
  const value = String(nextValue || '').trim();
  const input = byId('searchInput');
  if (input) input.value = value;
  store.setFilter('q', value);
  advancedSearchState.activeSavedId = '';
  store.setFilter('page', 1);
  await loadBookmarks();
  renderSidebar();
  if (remember) rememberRecentSearch(value, { immediate: true });
  if (closeSuggest) setSearchSuggestOpen(false);
}

async function activateSearchSuggestItem(index) {
  const item = (searchSuggestState.items || [])[Number(index)];
  if (!item) return false;
  if (item.kind === 'recent') {
    await applySearchQueryValue(item.value, { closeSuggest: true, remember: true });
    return true;
  }
  if (item.kind === 'token') {
    const input = byId('searchInput');
    if (!input) return false;
    const current = String(input.value || '').trim();
    const sep = current && !/\s$/.test(current) ? ' ' : '';
    const next = `${current}${sep}${item.token}`.trimStart();
    input.value = next;
    store.setFilter('q', next.trim());
    advancedSearchState.activeSavedId = '';
    store.setFilter('page', 1);
    await loadBookmarks();
    renderSidebar();
    setSearchSuggestOpen(true);
    input.focus();
    try {
      input.setSelectionRange(next.length, next.length);
    } catch (_err) {
      // ignore
    }
    return true;
  }
  return false;
}

function setListColumnsMenuOpen(open) {
  listColumnsMenuOpen = Boolean(open);
  const btn = byId('listColumnsBtn');
  const menu = byId('listColumnsMenu');
  if (btn) btn.setAttribute('aria-expanded', String(listColumnsMenuOpen));
  if (menu) menu.classList.toggle('hidden', !listColumnsMenuOpen || bookmarkLayoutMode !== 'list');
}

function setHeaderSortMenuOpen(open) {
  headerSortMenuOpen = Boolean(open);
  const btn = byId('headerSortBtn');
  const menu = byId('headerSortMenu');
  if (btn) btn.setAttribute('aria-expanded', String(headerSortMenuOpen));
  if (menu) menu.classList.toggle('hidden', !headerSortMenuOpen);
}

function setHeaderViewMenuOpen(open) {
  headerViewMenuOpen = Boolean(open);
  const btn = byId('headerViewBtn');
  const menu = byId('headerViewMenu');
  if (btn) btn.setAttribute('aria-expanded', String(headerViewMenuOpen));
  if (menu) menu.classList.toggle('hidden', !headerViewMenuOpen);
  if (!headerViewMenuOpen && listColumnsMenuOpen) setListColumnsMenuOpen(false);
}

function setHeaderMoreMenuOpen(open) {
  headerMoreMenuOpen = Boolean(open);
  const btn = byId('headerMoreBtn');
  const menu = byId('headerMoreMenu');
  if (btn) btn.setAttribute('aria-expanded', String(headerMoreMenuOpen));
  if (menu) menu.classList.toggle('hidden', !headerMoreMenuOpen);
}

function setAddToolbarMenuOpen(open) {
  addToolbarMenuOpen = Boolean(open);
  const btn = byId('addMenuToggleBtn');
  const menu = byId('addToolbarMenu');
  if (btn) btn.setAttribute('aria-expanded', String(addToolbarMenuOpen));
  if (menu) menu.classList.toggle('hidden', !addToolbarMenuOpen);
}

function closeHeaderMenus({ keep = '' } = {}) {
  const k = String(keep || '');
  if (k !== 'sort' && headerSortMenuOpen) setHeaderSortMenuOpen(false);
  if (k !== 'view' && headerViewMenuOpen) setHeaderViewMenuOpen(false);
  if (k !== 'more' && headerMoreMenuOpen) setHeaderMoreMenuOpen(false);
  if (k !== 'add' && addToolbarMenuOpen) setAddToolbarMenuOpen(false);
}

function sortLabelText(sortValue) {
  const v = String(sortValue || '');
  if (v === 'updated') return '按更新';
  if (v === 'oldest') return '按日期 ↑';
  if (v === 'title') return '按标题';
  return '按日期 ↓';
}

function layoutMenuLabel(mode) {
  const m = String(mode || bookmarkLayoutMode || 'list');
  if (m === 'card') return '卡片';
  if (m === 'headline') return '标题';
  if (m === 'moodboard') return '看板';
  return '列表';
}

function renderHeaderMenuControls() {
  const sortBtn = byId('headerSortBtn');
  if (sortBtn) sortBtn.textContent = sortLabelText(state.filters.sort);
  byId('headerSortMenu')?.querySelectorAll('[data-sort-option]').forEach((el) => {
    const active = String(el.dataset.sortOption || '') === String(state.filters.sort || '');
    el.classList.toggle('active', active);
    el.setAttribute('aria-checked', String(active));
  });

  const viewBtn = byId('headerViewBtn');
  if (viewBtn) viewBtn.textContent = layoutMenuLabel(bookmarkLayoutMode);
  byId('headerViewMenu')?.querySelectorAll('[data-layout-option]').forEach((el) => {
    const active = String(el.dataset.layoutOption || '') === String(bookmarkLayoutMode || '');
    el.classList.toggle('active', active);
    el.setAttribute('aria-checked', String(active));
  });
  byId('headerViewColumnsBtn')?.classList.toggle('hidden', bookmarkLayoutMode !== 'list');

  const aiFolderSummaryItem = byId('headerMoreMenu')?.querySelector('[data-header-more-action="ai-folder-summary"]');
  if (aiFolderSummaryItem) {
    const folderId = String(state.filters.folderId || 'all');
    const hasCollection = folderId && folderId !== 'all' && Boolean(getFolderById(folderId));
    aiFolderSummaryItem.disabled = !hasCollection;
    aiFolderSummaryItem.title = hasCollection ? '生成当前集合知识摘要' : '请先选择一个集合';
  }
}

function getFolderById(folderId) {
  const id = String(folderId || '');
  return state.folders.find((f) => String(f.id) === id) || null;
}

function getFolderDescendantIdSet(folderId) {
  const rootId = String(folderId || '');
  const childrenByParent = new Map();
  for (const f of state.folders || []) {
    const key = String(f.parentId || 'root');
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key).push(String(f.id || ''));
  }
  const out = new Set([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const current = queue.shift();
    for (const childId of childrenByParent.get(String(current || '')) || []) {
      if (out.has(childId)) continue;
      out.add(childId);
      queue.push(childId);
    }
  }
  return out;
}

function positionCollectionContextMenu() {
  const menu = byId('collectionContextMenu');
  if (!menu || menu.classList.contains('hidden')) return;
  positionFloatingMenu(menu, collectionContextMenuState.x, collectionContextMenuState.y);
}

function positionFloatingMenu(menu, x, y) {
  if (!menu) return;
  const margin = 8;
  const rect = menu.getBoundingClientRect();
  const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
  const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
  const left = Math.min(Math.max(margin, Number(x || 0)), maxLeft);
  const top = Math.min(Math.max(margin, Number(y || 0)), maxTop);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function positionFloatingMenuByAnchor(menu, anchorEl, {
  align = 'end',
  side = 'bottom',
  gap = 4
} = {}) {
  if (!menu || !anchorEl || !(anchorEl instanceof HTMLElement)) return false;
  const margin = 8;
  const anchorRect = anchorEl.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const width = Math.max(0, menuRect.width || 0);
  const height = Math.max(0, menuRect.height || 0);
  let left = align === 'start' ? anchorRect.left : (anchorRect.right - width);
  let top = side === 'top' ? (anchorRect.top - height - gap) : (anchorRect.bottom + gap);

  if (side === 'bottom' && top + height + margin > window.innerHeight) {
    const flipped = anchorRect.top - height - gap;
    if (flipped >= margin) top = flipped;
  } else if (side === 'top' && top < margin) {
    const flipped = anchorRect.bottom + gap;
    if (flipped + height + margin <= window.innerHeight) top = flipped;
  }

  if (align === 'end' && left < margin) {
    const flipped = anchorRect.left;
    if (flipped + width + margin <= window.innerWidth) left = flipped;
  } else if (align === 'start' && left + width + margin > window.innerWidth) {
    const flipped = anchorRect.right - width;
    if (flipped >= margin) left = flipped;
  }

  positionFloatingMenu(menu, left, top);
  return true;
}

function setCollectionContextMenuOpen(open, options = {}) {
  const menu = byId('collectionContextMenu');
  if (!menu) return;
  if (!open) {
    collectionContextMenuState = { open: false, folderId: '', x: 0, y: 0 };
    menu.classList.add('hidden');
    menu.style.left = '';
    menu.style.top = '';
    menu.removeAttribute('data-folder-id');
    return;
  }

  const folderId = String(options.folderId || '');
  if (!folderId) return;
  const x = Number(options.x ?? 0) || 0;
  const y = Number(options.y ?? 0) || 0;
  collectionContextMenuState = { open: true, folderId, x, y };
  menu.setAttribute('data-folder-id', folderId);
  menu.classList.remove('hidden');
  positionCollectionContextMenu();
}

function openCollectionContextMenuForFolder(folderId, { x = 0, y = 0, anchorEl = null } = {}) {
  const menu = byId('collectionContextMenu');
  if (anchorEl && menu) {
    setCollectionContextMenuOpen(true, {
      folderId: String(folderId || ''),
      x: 0,
      y: 0
    });
    if (positionFloatingMenuByAnchor(menu, anchorEl, { align: 'end', side: 'bottom', gap: 4 })) {
      collectionContextMenuState.x = Number.parseFloat(menu.style.left || '0') || 0;
      collectionContextMenuState.y = Number.parseFloat(menu.style.top || '0') || 0;
      return;
    }
  }
  setCollectionContextMenuOpen(true, {
    folderId: String(folderId || ''),
    x: Number(x || 0),
    y: Number(y || 0)
  });
}

function setSystemViewContextMenuOpen(open, options = {}) {
  const menu = byId('systemViewContextMenu');
  if (!menu) return;
  if (!open) {
    systemViewContextMenuState = { open: false, view: '', x: 0, y: 0 };
    menu.classList.add('hidden');
    menu.style.left = '';
    menu.style.top = '';
    menu.removeAttribute('data-system-view');
    return;
  }
  const view = String(options.view || '');
  if (!view) return;
  const x = Number(options.x ?? 0) || 0;
  const y = Number(options.y ?? 0) || 0;
  systemViewContextMenuState = { open: true, view, x, y };
  menu.setAttribute('data-system-view', view);
  menu.classList.remove('hidden');
  positionFloatingMenu(menu, x, y);
}

function openSystemViewContextMenu(view, { x = 0, y = 0, anchorEl = null } = {}) {
  const menu = byId('systemViewContextMenu');
  if (anchorEl && menu) {
    setSystemViewContextMenuOpen(true, { view: String(view || ''), x: 0, y: 0 });
    if (positionFloatingMenuByAnchor(menu, anchorEl, { align: 'end', side: 'bottom', gap: 4 })) return;
  }
  setSystemViewContextMenuOpen(true, {
    view: String(view || ''),
    x: Number(x || 0),
    y: Number(y || 0)
  });
}

function setCollectionsHeaderMenuOpen(open, options = {}) {
  const menu = byId('collectionsHeaderContextMenu');
  const btn = byId('collectionsSectionMenuBtn');
  const isOpen = Boolean(open);
  if (btn) btn.setAttribute('aria-expanded', String(isOpen));
  if (!menu) return;
  if (!isOpen) {
    collectionsHeaderMenuState = { open: false, x: 0, y: 0 };
    menu.classList.add('hidden');
    menu.style.left = '';
    menu.style.top = '';
    return;
  }
  const x = Number(options.x ?? 0) || 0;
  const y = Number(options.y ?? 0) || 0;
  collectionsHeaderMenuState = { open: true, x, y };
  menu.classList.remove('hidden');
  positionFloatingMenu(menu, x, y);
}

function openCollectionsHeaderMenu({ x = 0, y = 0, anchorEl = null } = {}) {
  const menu = byId('collectionsHeaderContextMenu');
  if (anchorEl && menu) {
    setCollectionsHeaderMenuOpen(true, { x: 0, y: 0 });
    if (positionFloatingMenuByAnchor(menu, anchorEl, { align: 'end', side: 'bottom', gap: 4 })) {
      collectionsHeaderMenuState.x = Number.parseFloat(menu.style.left || '0') || 0;
      collectionsHeaderMenuState.y = Number.parseFloat(menu.style.top || '0') || 0;
      return;
    }
  }
  setCollectionsHeaderMenuOpen(true, { x: Number(x || 0), y: Number(y || 0) });
}

function setQuickFiltersMenuOpen(open) {
  quickFiltersMenuOpen = Boolean(open);
  const btn = byId('quickFiltersMenuBtn');
  const menu = byId('quickFilterContextMenu');
  if (btn) btn.setAttribute('aria-expanded', String(quickFiltersMenuOpen));
  if (!menu) return;
  if (!quickFiltersMenuOpen) {
    menu.classList.add('hidden');
    menu.style.left = '';
    menu.style.top = '';
    return;
  }
  const rect = btn?.getBoundingClientRect?.();
  const x = rect ? rect.right - 12 : 24;
  const y = rect ? rect.bottom + 4 : 48;
  menu.setAttribute('data-quick-filter-id', '');
  menu.setAttribute('data-quick-filter-query', '');
  menu.querySelectorAll('[data-quick-filter-menu-action="apply"], [data-quick-filter-menu-action="copy"]').forEach((el) => {
    el.classList.add('hidden');
  });
  menu.classList.remove('hidden');
  if (!(btn && positionFloatingMenuByAnchor(menu, btn, { align: 'end', side: 'bottom', gap: 4 }))) {
    positionFloatingMenu(menu, x, y);
  }
}

function setQuickFilterContextMenuOpen(open, options = {}) {
  const menu = byId('quickFilterContextMenu');
  if (!menu) return;
  if (!open) {
    quickFilterContextMenuState = { open: false, id: '', query: '', x: 0, y: 0 };
    menu.classList.add('hidden');
    menu.style.left = '';
    menu.style.top = '';
    menu.removeAttribute('data-quick-filter-id');
    menu.removeAttribute('data-quick-filter-query');
    return;
  }
  const id = String(options.id || '');
  const query = String(options.query || '');
  if (!id) return;
  const x = Number(options.x ?? 0) || 0;
  const y = Number(options.y ?? 0) || 0;
  quickFilterContextMenuState = { open: true, id, query, x, y };
  menu.setAttribute('data-quick-filter-id', id);
  menu.setAttribute('data-quick-filter-query', query);
  menu.querySelectorAll('[data-quick-filter-menu-action="apply"], [data-quick-filter-menu-action="copy"]').forEach((el) => {
    el.classList.remove('hidden');
  });
  menu.classList.remove('hidden');
  positionFloatingMenu(menu, x, y);
}

function openQuickFilterContextMenu(item, { x = 0, y = 0, anchorEl = null } = {}) {
  if (quickFiltersMenuOpen) setQuickFiltersMenuOpen(false);
  const menu = byId('quickFilterContextMenu');
  if (anchorEl && menu) {
    setQuickFilterContextMenuOpen(true, {
      id: String(item?.id || ''),
      query: String(item?.query || ''),
      x: 0,
      y: 0
    });
    if (positionFloatingMenuByAnchor(menu, anchorEl, { align: 'end', side: 'bottom', gap: 4 })) {
      quickFilterContextMenuState.x = Number.parseFloat(menu.style.left || '0') || 0;
      quickFilterContextMenuState.y = Number.parseFloat(menu.style.top || '0') || 0;
      return;
    }
  }
  setQuickFilterContextMenuOpen(true, {
    id: String(item?.id || ''),
    query: String(item?.query || ''),
    x: Number(x || 0),
    y: Number(y || 0)
  });
}

function setTagContextMenuOpen(open, options = {}) {
  const menu = byId('tagContextMenu');
  if (!menu) return;
  if (!open) {
    tagContextMenuState = { open: false, tag: '', x: 0, y: 0 };
    menu.classList.add('hidden');
    menu.style.left = '';
    menu.style.top = '';
    menu.removeAttribute('data-tag-name');
    return;
  }
  const tag = String(options.tag || '');
  if (!tag) return;
  const x = Number(options.x ?? 0) || 0;
  const y = Number(options.y ?? 0) || 0;
  tagContextMenuState = { open: true, tag, x, y };
  menu.setAttribute('data-tag-name', tag);
  menu.classList.remove('hidden');
  positionFloatingMenu(menu, x, y);
}

function openTagContextMenu(tag, { x = 0, y = 0, anchorEl = null } = {}) {
  if (quickFiltersMenuOpen) setQuickFiltersMenuOpen(false);
  const menu = byId('tagContextMenu');
  if (anchorEl && menu) {
    setTagContextMenuOpen(true, { tag: String(tag || ''), x: 0, y: 0 });
    if (positionFloatingMenuByAnchor(menu, anchorEl, { align: 'end', side: 'bottom', gap: 4 })) {
      tagContextMenuState.x = Number.parseFloat(menu.style.left || '0') || 0;
      tagContextMenuState.y = Number.parseFloat(menu.style.top || '0') || 0;
      return;
    }
  }
  setTagContextMenuOpen(true, {
    tag: String(tag || ''),
    x: Number(x || 0),
    y: Number(y || 0)
  });
}

async function runQuickFilterMenuAction(action, { query = '' } = {}) {
  const a = String(action || '');
  const q = String(query || '').trim();
  if (a === 'apply') {
    if (!q) return;
    await applyQuickFilterSearch(q, { toggle: false });
    showToast('快速过滤已应用', { timeoutMs: 2000 });
    return;
  }
  if (a === 'copy') {
    if (!q) return;
    const ok = await copyTextToClipboard(q);
    showToast(ok ? '搜索表达式已复制' : q, { timeoutMs: ok ? 2000 : 5000 });
    return;
  }
  if (a === 'advanced') {
    advancedSearchState.panelOpen = true;
    advancedSearchState.enabled = true;
    syncAdvancedSearchInputs();
    byId('advancedSearchPanel')?.scrollIntoView?.({ block: 'nearest' });
    showToast('已打开高级搜索', { timeoutMs: 1800 });
    return;
  }
  if (a === 'clear') {
    await applySearchQueryValue('', { closeSuggest: true, remember: false });
    showToast('已清除搜索过滤', { timeoutMs: 2000 });
  }
}

async function runTagMenuAction(action, tagName) {
  const actionKey = String(action || '');
  const tag = String(tagName || '').trim();
  if (!tag) return;
  if (actionKey === 'filter') {
    store.setFilter('tags', state.filters.tags === tag ? '' : tag);
    if (state.filters.tags !== tag) advancedSearchState.activeSavedId = '';
    store.setFilter('page', 1);
    store.clearSelection();
    await loadBookmarks();
    renderSidebar();
    return;
  }
  if (actionKey === 'rename') {
    const to = await uiPrompt('输入新的标签名称', {
      title: '重命名标签',
      inputLabel: '标签名称',
      defaultValue: tag,
      required: true,
      requiredMessage: '请输入标签名称'
    });
    if (to === null) return;
    const nextTag = String(to || '').trim();
    if (!nextTag || nextTag === tag) return;
    await api('/api/tags/rename', {
      method: 'POST',
      body: JSON.stringify({ from: tag, to: nextTag })
    });
    if (String(state.filters.tags || '') === tag) store.setFilter('tags', nextTag);
    await refreshAll();
    showToast('标签已重命名', { timeoutMs: 2200 });
    return;
  }
  if (actionKey === 'merge') {
    const target = await uiPrompt(`将标签「${tag}」合并到：`, {
      title: '合并标签',
      inputLabel: '目标标签',
      placeholder: '输入目标标签名',
      required: true,
      requiredMessage: '请输入目标标签名'
    });
    if (target === null) return;
    const nextTarget = String(target || '').trim();
    if (!nextTarget) return;
    await api('/api/tags/merge', {
      method: 'POST',
      body: JSON.stringify({ sources: [tag], target: nextTarget })
    });
    if (String(state.filters.tags || '') === tag) store.setFilter('tags', nextTarget);
    await refreshAll();
    showToast('标签已合并', { timeoutMs: 2200 });
    return;
  }
  if (actionKey === 'manage') {
    renderTagManager();
    byId('tagManagerDialog')?.showModal();
    return;
  }
  if (actionKey === 'remove') {
    const ok = await uiConfirm(`确认从所有书签移除标签「${tag}」？`, {
      title: '移除标签',
      confirmText: '移除',
      danger: true
    });
    if (!ok) return;
    await api('/api/tags/remove', {
      method: 'POST',
      body: JSON.stringify({ tag })
    });
    if (String(state.filters.tags || '') === tag) store.setFilter('tags', '');
    await refreshAll();
    showToast('标签已移除', { timeoutMs: 2200 });
  }
}

async function runSystemViewMenuAction(action, viewKey) {
  const a = String(action || '');
  const view = String(viewKey || '').trim();
  if (!view) return;
  if (a === 'open') {
    await activateSystemView(view);
    return;
  }
  if (a === 'openNew') {
    window.open(window.location.origin + '/', '_blank', 'noopener');
    showToast('已在新标签页打开工作台', { timeoutMs: 1800 });
    return;
  }
  if (a === 'selectPage') {
    await activateSystemView(view);
    byId('viewSelectPageCheckbox')?.click();
    return;
  }
  if (a === 'refresh') {
    if (String(state.filters.folderId || 'all') !== 'all' || String(state.filters.view || 'all') !== view) {
      await activateSystemView(view);
      return;
    }
    await refreshAll();
    return;
  }
}

async function runCollectionsHeaderMenuAction(action) {
  const a = String(action || '');
  if (a === 'new') {
    byId('newCollectionBtn')?.click();
    return;
  }
  if (a === 'expandAll') {
    setTopLevelCollectionsCollapsed(false);
    showToast('已展开全部集合', { timeoutMs: 1800 });
    return;
  }
  if (a === 'collapseAll') {
    setTopLevelCollectionsCollapsed(true);
    showToast('已折叠全部集合', { timeoutMs: 1800 });
    return;
  }
  if (a === 'refresh') {
    renderSidebar();
    showToast('侧栏已刷新', { timeoutMs: 1500 });
  }
}

function renderListColumnsMenu() {
  const btn = byId('listColumnsBtn');
  const menu = byId('listColumnsMenu');
  if (!btn || !menu) return;
  btn.classList.toggle('hidden', bookmarkLayoutMode !== 'list');
  const ids = {
    folder: 'listColFolder',
    type: 'listColType',
    excerpt: 'listColExcerpt',
    tags: 'listColTags',
    time: 'listColTime'
  };
  Object.entries(ids).forEach(([key, id]) => {
    const el = byId(id);
    if (el) el.checked = Boolean(listColumns[key]);
  });
  setListColumnsMenuOpen(listColumnsMenuOpen);
}

function setListColumn(key, value) {
  if (!(key in DEFAULT_LIST_COLUMNS)) return;
  listColumns = { ...listColumns, [key]: Boolean(value) };
  persistListColumns();
  renderListColumnsMenu();
  renderCards();
}

function currentAppPath() {
  const path = `${window.location.pathname || '/'}${window.location.search || ''}${window.location.hash || ''}`;
  return path || '/';
}

function redirectToLoginPage({ next = currentAppPath() } = {}) {
  const target = String(next || '/').startsWith('/') ? String(next || '/') : '/';
  const url = new URL('/login.html', window.location.origin);
  url.searchParams.set('next', target);
  window.location.replace(`${url.pathname}${url.search}${url.hash}`);
}

function setFormBannerError(errorId, message = '') {
  const el = byId(errorId);
  if (!el) return;
  const text = String(message || '').trim();
  el.textContent = text;
  el.classList.toggle('hidden', !text);
}

function clearFormFieldError(input) {
  if (!input) return;
  input.classList.remove('is-invalid');
  input.removeAttribute('aria-invalid');
  const label = input.closest('.form-field');
  if (label && label.dataset && 'error' in label.dataset) {
    delete label.dataset.error;
  }
}

function setFormFieldError(input, message) {
  if (!input) return false;
  const text = String(message || '').trim();
  if (!text) {
    clearFormFieldError(input);
    return true;
  }
  input.classList.add('is-invalid');
  input.setAttribute('aria-invalid', 'true');
  const label = input.closest('.form-field');
  if (label) label.dataset.error = text;
  return false;
}

function clearFormValidation(formId, errorId = null) {
  const form = byId(formId);
  if (form) {
    form.querySelectorAll('.is-invalid').forEach((el) => clearFormFieldError(el));
    form.querySelectorAll('.form-field[data-error]').forEach((el) => {
      delete el.dataset.error;
    });
  }
  if (errorId) setFormBannerError(errorId, '');
}

function bindInlineValidation(formId, { errorId = null } = {}) {
  const form = byId(formId);
  if (!form || form.dataset.inlineValidationBound === '1') return;
  form.dataset.inlineValidationBound = '1';
  const onChange = (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.matches('input, textarea, select')) {
      clearFormFieldError(target);
      if (errorId) setFormBannerError(errorId, '');
    }
  };
  form.addEventListener('input', onChange);
  form.addEventListener('change', onChange);
  form.addEventListener('close', () => clearFormValidation(formId, errorId));
}

function isLikelyHttpUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(url.protocol);
  } catch (_err) {
    return false;
  }
}

function validateBookmarkCreateForm() {
  clearFormValidation('bookmarkForm', 'bookmarkFormError');
  let firstInvalid = null;
  const titleEl = byId('newTitle');
  const urlEl = byId('newUrl');
  if (!String(titleEl?.value || '').trim()) {
    setFormFieldError(titleEl, '请输入标题');
    firstInvalid ||= titleEl;
  }
  const rawUrl = String(urlEl?.value || '').trim();
  if (!rawUrl) {
    setFormFieldError(urlEl, '请输入链接');
    firstInvalid ||= urlEl;
  } else if (!isLikelyHttpUrl(rawUrl)) {
    setFormFieldError(urlEl, '请输入有效 URL（http/https）');
    firstInvalid ||= urlEl;
  }
  if (firstInvalid) {
    setFormBannerError('bookmarkFormError', '请先修正标红字段后再创建书签。');
    firstInvalid.focus();
    return false;
  }
  return true;
}

function validateCollectionCreateForm() {
  clearFormValidation('collectionForm', 'collectionFormError');
  const nameEl = byId('newCollectionName');
  if (!String(nameEl?.value || '').trim()) {
    setFormFieldError(nameEl, '请输入集合名称');
    setFormBannerError('collectionFormError', '集合名称不能为空。');
    nameEl?.focus();
    return false;
  }
  return true;
}

function setPreviewUiState(stateName, message = '') {
  const next = String(stateName || 'idle');
  previewUiState = next;
  const badge = byId('previewStateBadge');
  const note = byId('previewStateNote');
  const loading = byId('previewLoading');
  const surface = byId('previewDialog')?.querySelector('.preview-surface');
  if (badge) {
    badge.dataset.state = next;
    badge.textContent = ({
      idle: '未加载',
      loading: '加载中',
      ready: '已加载',
      fallback: '降级预览',
      error: '加载失败'
    }[next] || '状态未知');
  }
  if (note) note.textContent = String(message || '');
  if (loading) loading.classList.toggle('hidden', next !== 'loading');
  if (surface) surface.classList.toggle('is-loading', next === 'loading');
  if (state.activeId && previewActiveBookmarkId && String(state.activeId) === String(previewActiveBookmarkId)) {
    renderDetail();
  }
}

function hydratePreviewToolbarIcons() {
  const mappings = [
    ['previewRefreshBtn', 'refresh', '刷新预览'],
    ['previewExtractArticleBtn', 'edit', '提取正文'],
    ['previewReaderBtn', 'preview', '阅读模式'],
    ['previewAddHighlightBtn', 'favorite', '高亮选区'],
    ['previewOriginalBtn', 'open', '打开原文'],
    ['previewCloseBtn', 'close', '关闭预览']
  ];
  mappings.forEach(([id, icon, label]) => {
    const btn = byId(id);
    if (!btn || btn.dataset.iconHydrated) return;
    setIconButtonLabel(btn, icon, btn.textContent || label);
    btn.dataset.iconHydrated = '1';
  });
}

function bindActionDialog() {
  const dlg = byId('actionDialog');
  if (!dlg || dlg.dataset.bound === '1') return;
  dlg.dataset.bound = '1';
  const cancelBtn = byId('actionDialogCancelBtn');
  const confirmBtn = byId('actionDialogConfirmBtn');
  const input = byId('actionDialogInput');
  const closeWith = (result) => {
    const session = actionDialogSession;
    if (!session) return;
    actionDialogSession = null;
    try {
      dlg.close();
    } catch (_err) {
      // ignore
    }
    session.resolve(result);
  };
  cancelBtn?.addEventListener('click', () => closeWith({ ok: false, cancelled: true, value: null }));
  confirmBtn?.addEventListener('click', () => {
    const session = actionDialogSession;
    if (!session) return;
    const mode = session.mode;
    const rawValue = String(input?.value ?? '');
    if (mode === 'prompt') {
      const trimmed = session.options?.trim === false ? rawValue : rawValue.trim();
      const required = Boolean(session.options?.required);
      if (required && !trimmed) {
        setFormBannerError('actionDialogError', session.options?.requiredMessage || '请输入内容后再继续。');
        if (input) setFormFieldError(input, session.options?.requiredMessage || '必填');
        input?.focus();
        return;
      }
      if (typeof session.options?.validate === 'function') {
        const errMsg = session.options.validate(trimmed);
        if (errMsg) {
          setFormBannerError('actionDialogError', errMsg);
          if (input) setFormFieldError(input, errMsg);
          input?.focus();
          return;
        }
      }
      closeWith({ ok: true, cancelled: false, value: trimmed });
      return;
    }
    closeWith({ ok: true, cancelled: false, value: true });
  });
  input?.addEventListener('input', () => {
    clearFormFieldError(input);
    setFormBannerError('actionDialogError', '');
  });
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeWith({ ok: false, cancelled: true, value: null });
  });
}

function openActionDialog({
  mode = 'confirm',
  title = '确认操作',
  message = '请确认继续。',
  confirmText = '确定',
  cancelText = '取消',
  danger = false,
  inputLabel = '输入',
  placeholder = '',
  defaultValue = '',
  trim = true,
  required = false,
  requiredMessage = '',
  validate = null
} = {}) {
  bindActionDialog();
  const dlg = byId('actionDialog');
  if (!dlg) return Promise.resolve({ ok: false, cancelled: true, value: null });
  if (actionDialogSession) {
    actionDialogSession.resolve({ ok: false, cancelled: true, value: null });
    actionDialogSession = null;
  }
  if (dlg.open) {
    try {
      dlg.close();
    } catch (_err) {
      // ignore
    }
  }
  const inputWrap = byId('actionDialogInputWrap');
  const input = byId('actionDialogInput');
  const titleEl = byId('actionDialogTitle');
  const msgEl = byId('actionDialogMessage');
  const inputLabelEl = byId('actionDialogInputLabel');
  const confirmBtn = byId('actionDialogConfirmBtn');
  const cancelBtn = byId('actionDialogCancelBtn');
  clearFormValidation('actionDialog', 'actionDialogError');
  if (titleEl) titleEl.textContent = String(title || '确认操作');
  if (msgEl) msgEl.textContent = String(message || '');
  if (confirmBtn) {
    confirmBtn.textContent = String(confirmText || '确定');
    confirmBtn.classList.toggle('danger', Boolean(danger));
  }
  if (cancelBtn) cancelBtn.textContent = String(cancelText || '取消');
  if (inputWrap) inputWrap.classList.toggle('hidden', mode !== 'prompt');
  if (inputLabelEl) inputLabelEl.textContent = String(inputLabel || '输入');
  if (input) {
    input.value = String(defaultValue ?? '');
    input.placeholder = String(placeholder || '');
    clearFormFieldError(input);
  }
  const promise = new Promise((resolve) => {
    actionDialogSession = {
      resolve,
      mode,
      options: { trim, required, requiredMessage, validate }
    };
  });
  if (!dlg.open) dlg.showModal();
  queueMicrotask(() => {
    if (mode === 'prompt') input?.focus();
    else confirmBtn?.focus();
  });
  return promise;
}

async function uiConfirm(message, options = {}) {
  const out = await openActionDialog({ ...options, mode: 'confirm', message });
  return Boolean(out?.ok);
}

async function uiPrompt(message, options = {}) {
  const out = await openActionDialog({ ...options, mode: 'prompt', message });
  if (!out?.ok) return null;
  return out.value;
}

function iconSvg(name, { title = '' } = {}) {
  const n = String(name || '').trim().toLowerCase();
  const common = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  let body = '';
  if (n === 'all') {
    body = `<rect x="4" y="4" width="6" height="6" rx="1"></rect><rect x="14" y="4" width="6" height="6" rx="1"></rect><rect x="4" y="14" width="6" height="6" rx="1"></rect><rect x="14" y="14" width="6" height="6" rx="1"></rect>`;
  } else if (n === 'inbox') {
    body = `<path d="M4 6h16l-2 10H6L4 6z"></path><path d="M9 11a3 3 0 0 0 6 0"></path>`;
  } else if (n === 'star') {
    body = `<path d="M12 3.8l2.5 5 5.5.8-4 3.9.9 5.5L12 16.6 7.1 19l.9-5.5-4-3.9 5.5-.8L12 3.8z"></path>`;
  } else if (n === 'archive') {
    body = `<rect x="4" y="5" width="16" height="5" rx="1"></rect><path d="M6 10h12v9a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-9z"></path><path d="M10 14h4"></path>`;
  } else if (n === 'trash') {
    body = `<path d="M5 7h14"></path><path d="M9 7V5h6v2"></path><path d="M7 7l1 13h8l1-13"></path><path d="M10 11v6M14 11v6"></path>`;
  } else if (n === 'list') {
    body = `<path d="M9 7h11M9 12h11M9 17h11"></path><path d="M5.2 7h.01M5.2 12h.01M5.2 17h.01"></path>`;
  } else if (n === 'grid') {
    body = `<rect x="4" y="4" width="7" height="7" rx="1"></rect><rect x="13" y="4" width="7" height="7" rx="1"></rect><rect x="4" y="13" width="7" height="7" rx="1"></rect><rect x="13" y="13" width="7" height="7" rx="1"></rect>`;
  } else if (n === 'headline') {
    body = `<path d="M5 7h3M10 7h9M5 12h3M10 12h9M5 17h3M10 17h9"></path>`;
  } else if (n === 'board') {
    body = `<rect x="4" y="4" width="16" height="16" rx="2"></rect><path d="M4 14l4-4 4 3 3-2 5 5"></path><path d="M15.5 8.5h.01"></path>`;
  } else if (n === 'refresh') {
    body = `<path d="M20 11a8 8 0 1 0-2.3 5.7"></path><path d="M20 4v7h-7"></path>`;
  } else if (n === 'edit') {
    body = `<path d="M4 20l4.5-1 9-9a2 2 0 0 0-2.8-2.8l-9 9L4 20z"></path><path d="M13.5 6.5l4 4"></path>`;
  } else if (n === 'close') {
    body = `<path d="M6 6l12 12M18 6L6 18"></path>`;
  } else if (n === 'open') {
    body = `<path d="M14 5h6v6"></path><path d="M20 4l-9 9"></path><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"></path>`;
  } else if (n === 'click') {
    body = `<path d="M12 3v18"></path><path d="M3 12h18"></path><path d="M6 6l12 12"></path><path d="M18 6L6 18"></path>`;
  } else if (n === 'web') {
    body = `<rect x="4" y="5" width="16" height="14" rx="2"></rect><path d="M4 9h16"></path><path d="M9 5v14"></path>`;
  } else if (n === 'image') {
    body = `<rect x="4" y="5" width="16" height="14" rx="2"></rect><path d="M4 15l5-5 4 4 3-3 4 4"></path><circle cx="9" cy="10" r="1.2"></circle>`;
  } else if (n === 'file') {
    body = `<path d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"></path><path d="M14 3v5h5"></path>`;
  } else if (n === 'copy') {
    body = `<rect x="9" y="9" width="10" height="10" rx="2"></rect><rect x="5" y="5" width="10" height="10" rx="2"></rect>`;
  } else if (n === 'preview') {
    body = `<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"></path><circle cx="12" cy="12" r="2.8"></circle>`;
  } else if (n === 'search') {
    body = `<circle cx="11" cy="11" r="6"></circle><path d="M20 20l-4.3-4.3"></path>`;
  } else if (n === 'add') {
    body = `<path d="M12 5v14"></path><path d="M5 12h14"></path>`;
  } else if (n === 'tag') {
    body = `<path d="M4 12l8-8h7v7l-8 8-7-7z"></path><circle cx="15.5" cy="8.5" r="1"></circle>`;
  } else if (n === 'note') {
    body = `<path d="M6 4h12a2 2 0 0 1 2 2v12l-5-5H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"></path>`;
  } else if (n === 'highlights') {
    body = `<path d="M8 16l8-8 3 3-8 8H8v-3z"></path><path d="M14 6l2-2 4 4-2 2"></path><path d="M4 21h16"></path>`;
  } else if (n === 'type') {
    body = `<path d="M5 7h14M5 12h10M5 17h6"></path>`;
  } else if (n === 'calendar') {
    body = `<rect x="4" y="5" width="16" height="15" rx="2"></rect><path d="M8 3v4M16 3v4M4 10h16"></path>`;
  } else if (n === 'link') {
    body = `<path d="M10 8H8a4 4 0 0 0 0 8h2"></path><path d="M14 8h2a4 4 0 0 1 0 8h-2"></path><path d="M9 12h6"></path>`;
  } else if (n === 'info') {
    body = `<circle cx="12" cy="12" r="9"></circle><path d="M12 10v6"></path><path d="M12 7h.01"></path>`;
  } else if (n === 'tune') {
    body = `<path d="M5 7h14"></path><path d="M5 17h14"></path><path d="M9 7v6"></path><path d="M15 11v6"></path><circle cx="9" cy="14" r="1.6"></circle><circle cx="15" cy="10" r="1.6"></circle>`;
  } else if (n === 'chevron-down') {
    body = `<path d="M7 10l5 5 5-5"></path>`;
  } else if (n === 'chevron-left') {
    body = `<path d="M15 6l-6 6 6 6"></path>`;
  } else if (n === 'chevron-right') {
    body = `<path d="M9 6l6 6-6 6"></path>`;
  } else if (n === 'more') {
    body = `<circle cx="6" cy="12" r="1.2" fill="currentColor" stroke="none"></circle><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"></circle><circle cx="18" cy="12" r="1.2" fill="currentColor" stroke="none"></circle>`;
  } else if (n === 'article') {
    body = `<rect x="5" y="4" width="14" height="16" rx="2"></rect><path d="M8 9h8M8 12h8M8 15h5"></path>`;
  } else if (n === 'folder') {
    body = `<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-9z"></path>`;
  } else if (n === 'ai') {
    body = `<path d="M12 4l1.7 4.3L18 10l-4.3 1.7L12 16l-1.7-4.3L6 10l4.3-1.7L12 4z"></path><path d="M18.5 4.5v3"></path><path d="M17 6h3"></path>`;
  } else if (n === 'help') {
    body = `<circle cx="12" cy="12" r="9"></circle><path d="M9.8 9.2a2.4 2.4 0 1 1 3.4 2.2c-.9.4-1.2.9-1.2 1.6"></path><path d="M12 17h.01"></path>`;
  } else if (n === 'favorite') {
    body = `<path d="M12 20l-1.2-1.1C6 14.6 3 11.8 3 8.4 3 5.8 5 4 7.5 4c1.6 0 3.1.8 4 2.1C12.4 4.8 13.9 4 15.5 4 18 4 20 5.8 20 8.4c0 3.4-3 6.2-7.8 10.5L12 20z"></path>`;
  } else if (n === 'unfavorite') {
    body = `<path d="M4 4l16 16"></path><path d="M12 20l-1.2-1.1C6 14.6 3 11.8 3 8.4 3 5.8 5 4 7.5 4c1.4 0 2.8.6 3.7 1.7"></path><path d="M15.5 4C18 4 20 5.8 20 8.4c0 1.8-.9 3.5-2.7 5.4"></path>`;
  } else if (n === 'delete') {
    body = `<path d="M5 7h14"></path><path d="M9 7V5h6v2"></path><path d="M7 7l1 13h8l1-13"></path>`;
  } else if (n === 'restore') {
    body = `<path d="M20 11a8 8 0 1 0-2.3 5.7"></path><path d="M20 4v7h-7"></path>`;
  } else {
    body = `<circle cx="12" cy="12" r="8"></circle>`;
  }
  return `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" ${common}>${title ? `<title>${escapeHtml(title)}</title>` : ''}${body}</svg>`;
}

function setIconButtonLabel(btn, iconName, label, { srOnly = false } = {}) {
  if (!btn) return;
  const text = String(label || '').trim();
  btn.innerHTML = `${iconSvg(iconName, { title: text })}${srOnly ? `<span class="sr-only">${escapeHtml(text)}</span>` : `<span>${escapeHtml(text)}</span>`}`;
}

function currentViewHeaderIconName() {
  if (String(state.filters.folderId || 'all') !== 'all') return 'folder';
  return quickViews.find((x) => x.key === String(state.filters.view || 'all'))?.icon || 'all';
}

function menuItemIconName(btn) {
  if (!btn) return '';
  const ds = btn.dataset || {};
  if (ds.addMenuAction) {
    return ({
      bookmark: 'add',
      collection: 'folder',
      upload: 'file',
      io: 'open'
    }[String(ds.addMenuAction)] || 'open');
  }
  if (ds.headerMoreAction) {
    return ({
      export: 'file',
      'ai-folder-summary': 'ai',
      plugin: 'refresh'
    }[String(ds.headerMoreAction)] || 'open');
  }
  if (ds.sortOption) {
    return String(ds.sortOption) === 'title' ? 'type' : 'calendar';
  }
  if (ds.layoutOption) {
    return ({
      list: 'list',
      card: 'grid',
      headline: 'headline',
      moodboard: 'board'
    }[String(ds.layoutOption)] || 'list');
  }
  if (ds.detailPanelMoreAction) {
    return ({
      'open-new': 'open',
      'preview-web': 'web',
      'preview-reader': 'article',
      'copy-link': 'copy',
      'ai-autotag': 'ai',
      'ai-title-clean': 'ai',
      'ai-summary': 'ai',
      'ai-reader-summary': 'article',
      'ai-highlight-digest': 'highlights',
      'ai-folder-recommend': 'folder',
      'ai-qa': 'ai',
      'ai-related': 'ai',
      'toggle-edit': 'edit',
      delete: 'delete',
      restore: 'restore'
    }[String(ds.detailPanelMoreAction)] || 'open');
  }
  if (ds.folderMenuAction) {
    return ({
      openAll: 'open',
      createNested: 'add',
      select: 'click',
      rename: 'edit',
      changeIcon: 'folder',
      share: 'link',
      delete: 'delete'
    }[String(ds.folderMenuAction)] || 'open');
  }
  if (ds.systemViewMenuAction) {
    return ({
      open: 'open',
      openNew: 'open',
      selectPage: 'click',
      refresh: 'refresh'
    }[String(ds.systemViewMenuAction)] || 'open');
  }
  if (ds.collectionsHeaderAction) {
    return ({
      new: 'add',
      expandAll: 'chevron-down',
      collapseAll: 'chevron-right',
      refresh: 'refresh'
    }[String(ds.collectionsHeaderAction)] || 'open');
  }
  if (ds.quickFilterMenuAction) {
    return ({
      apply: 'search',
      copy: 'copy',
      advanced: 'tune',
      clear: 'close'
    }[String(ds.quickFilterMenuAction)] || 'search');
  }
  if (ds.tagMenuAction) {
    return ({
      filter: 'tag',
      rename: 'edit',
      merge: 'tag',
      manage: 'tag',
      remove: 'delete'
    }[String(ds.tagMenuAction)] || 'tag');
  }
  return '';
}

function setMenuItemIconAndLabel(btn, iconName, label) {
  if (!btn) return;
  const text = String(label || '').trim();
  if (!text) return;
  btn.innerHTML = `<span class="menu-item-icon" aria-hidden="true">${iconSvg(iconName || 'open', { title: text })}</span><span class="menu-item-label">${escapeHtml(text)}</span>`;
  btn.dataset.iconHydrated = '1';
}

function hydrateMenuItemIcons() {
  document.querySelectorAll('.header-menu-item, .context-menu-item').forEach((btn) => {
    if (!(btn instanceof HTMLElement)) return;
    const iconName = menuItemIconName(btn);
    const label = btn.querySelector('.menu-item-label')?.textContent || btn.textContent || '';
    if (!iconName || !String(label).trim()) return;
    if (btn.dataset.iconHydrated === '1' && btn.querySelector('.menu-item-icon') && btn.querySelector('.menu-item-label')) return;
    setMenuItemIconAndLabel(btn, iconName, label);
  });
}

function hydrateWorkbenchHeaderIcons() {
  hydrateMenuItemIcons();
  const searchLeading = byId('searchLeadingIcon');
  if (searchLeading && !searchLeading.dataset.iconHydrated) {
    searchLeading.innerHTML = iconSvg('search', { title: '搜索' });
    searchLeading.dataset.iconHydrated = '1';
  }

  const askBtn = byId('askAiBtn');
  if (askBtn && !askBtn.dataset.iconHydrated) {
    setIconButtonLabel(askBtn, 'ai', '询问');
    askBtn.dataset.iconHydrated = '1';
  }

  const addMainBtn = byId('addBookmarkBtn');
  if (addMainBtn && !addMainBtn.dataset.iconHydrated) {
    setIconButtonLabel(addMainBtn, 'add', '添加');
    addMainBtn.dataset.iconHydrated = '1';
  }

  const addCaretBtn = byId('addMenuToggleBtn');
  if (addCaretBtn && !addCaretBtn.dataset.iconHydrated) {
    addCaretBtn.innerHTML = `${iconSvg('chevron-down', { title: '添加菜单' })}<span class="sr-only">打开添加菜单</span>`;
    addCaretBtn.dataset.iconHydrated = '1';
  }

  const openViewBtn = byId('viewOpenBrowserBtn');
  if (openViewBtn && !openViewBtn.dataset.iconHydrated) {
    openViewBtn.innerHTML = `${iconSvg('open', { title: '在新标签页打开当前视图' })}<span class="sr-only">在新标签页打开当前视图</span>`;
    openViewBtn.dataset.iconHydrated = '1';
  }
}

function setSidebarAccountMenuOpen(open) {
  sidebarAccountMenuOpen = Boolean(open);
  const btn = byId('sidebarAccountBtn');
  const menu = byId('sidebarAccountMenu');
  if (btn) btn.setAttribute('aria-expanded', String(sidebarAccountMenuOpen));
  if (menu) menu.classList.toggle('hidden', !sidebarAccountMenuOpen);
}

function renderSidebarAccount() {
  const btn = byId('sidebarAccountBtn');
  const avatar = byId('sidebarAccountAvatar');
  const nameEl = byId('sidebarAccountName');
  const metaEl = byId('sidebarAccountMeta');
  const menuAuth = byId('sidebarAccountMenuAuth');
  const menuSettings = byId('sidebarAccountMenuSettings');
  const menuLogout = byId('sidebarAccountMenuLogout');
  if (!btn || !avatar || !nameEl || !metaEl || !menuAuth || !menuSettings || !menuLogout) return;

  if (!authState.authenticated) {
    nameEl.textContent = authState.loading ? '正在检查会话' : '未登录';
    metaEl.textContent = authState.loading ? '请稍候...' : '点击登录';
    avatar.textContent = authState.loading ? '…' : '登';
    menuAuth.textContent = '登录';
    menuSettings.classList.add('hidden');
    menuLogout.classList.add('hidden');
  } else {
    const displayName = String(authState.user?.displayName || authState.user?.email || '用户').trim();
    const email = String(authState.user?.email || '').trim();
    const avatarLabel = (displayName || email || '用户').slice(0, 1).toUpperCase();
    nameEl.textContent = displayName;
    metaEl.textContent = email || `登录方式：${authState.auth?.method || 'session'}`;
    avatar.textContent = avatarLabel || '用';
    menuAuth.textContent = '账号与 Token';
    menuSettings.classList.remove('hidden');
    menuLogout.classList.remove('hidden');
  }

  setSidebarAccountMenuOpen(sidebarAccountMenuOpen);
}

function renderSidebarStatusCard() {
  const card = byId('sidebarStatusCard');
  const badge = byId('sidebarStatusBadge');
  const meta = byId('sidebarStatusMeta');
  const syncBtn = byId('sidebarStatusSyncBtn');
  if (!card || !badge || !meta || !syncBtn) return;

  if (!authState.authenticated) {
    badge.textContent = authState.loading ? '检查中' : '未登录';
    badge.dataset.tone = authState.loading ? 'neutral' : 'muted';
    meta.textContent = authState.loading ? '正在检查会话状态…' : '登录后可使用同步插件与高级功能。';
    syncBtn.disabled = true;
    return;
  }

  const total = Number(state.stats?.total || state.allBookmarks?.length || 0);
  const folders = Math.max(0, (state.folders || []).filter((f) => String(f.id || '') !== 'root').length);
  const tags = Number((state.tags || []).length || 0);
  badge.textContent = '就绪';
  badge.dataset.tone = 'success';
  meta.textContent = `${total} 条书签 · ${folders} 个集合 · ${tags} 个标签`;
  syncBtn.disabled = false;
}

function renderAuthTokens() {
  const list = byId('authTokensList');
  const out = byId('authTokenOutput');
  if (!list || !out) return;

  out.textContent = authState.latestPlainToken || '尚未创建 Token。';
  if (!authState.authenticated) {
    list.innerHTML = `<div class="muted">登录后可管理 API Token。</div>`;
    return;
  }
  if (!authState.tokens.length) {
    list.innerHTML = `<div class="muted">暂无 API Token。</div>`;
    return;
  }
  list.innerHTML = authState.tokens
    .map((t) => `
      <div class="auth-token-item" data-auth-token-id="${t.id}">
        <div class="auth-token-row">
          <strong>${escapeHtml(t.name || 'API Token')}</strong>
          <span class="muted">${t.revokedAt ? '已吊销' : '有效'}</span>
        </div>
        <div class="muted">${escapeHtml(t.tokenPrefix || '')}</div>
        <div class="muted">创建于：${t.createdAt ? new Date(Number(t.createdAt)).toLocaleString() : '-'}${t.lastUsedAt ? ` · 最近使用：${new Date(Number(t.lastUsedAt)).toLocaleString()}` : ''}</div>
        <div class="auth-token-row">
          <div class="muted">${escapeHtml((t.scopes || []).join(', ') || '*')}</div>
          ${t.revokedAt ? '' : `<button type="button" class="ghost danger" data-auth-token-revoke="${t.id}">吊销</button>`}
        </div>
      </div>
    `)
    .join('');

  list.querySelectorAll('[data-auth-token-revoke]').forEach((el) => {
    el.addEventListener('click', async () => {
      const tokenId = el.dataset.authTokenRevoke;
      if (!tokenId) return;
      if (!(await uiConfirm('确认吊销这个 API Token？此操作不可撤销。', { title: '吊销 API Token', confirmText: '吊销', danger: true }))) return;
      await api(`/api/auth/tokens/${tokenId}`, { method: 'DELETE' });
      await loadAuthTokens();
      showToast('API Token 已吊销', { timeoutMs: 2500 });
    });
  });
}

function renderAuthUi() {
  const authBtn = byId('authBtn');
  const dialogTitle = byId('authDialogTitle');
  const status = byId('authStatusText');
  const guestPanel = byId('authGuestPanel');
  const userPanel = byId('authUserPanel');
  const userName = byId('authUserName');
  const userEmail = byId('authUserEmail');
  const userMeta = byId('authUserMeta');
  const createTokenBtn = byId('authCreateTokenBtn');
  const refreshTokensBtn = byId('authRefreshTokensBtn');

  if (!authBtn || !dialogTitle || !status || !guestPanel || !userPanel) return;

  if (!authState.authenticated) {
    authBtn.textContent = '登录';
    dialogTitle.textContent = '账号登录';
    status.textContent = authState.loading ? '正在检查会话...' : '未登录';
    guestPanel.classList.remove('hidden');
    userPanel.classList.add('hidden');
    if (createTokenBtn) createTokenBtn.disabled = true;
    if (refreshTokensBtn) refreshTokensBtn.disabled = true;
  } else {
    authBtn.textContent = '账号';
    dialogTitle.textContent = '账号';
    status.textContent = `已登录（方式：${authState.auth?.method || 'session'}）`;
    guestPanel.classList.add('hidden');
    userPanel.classList.remove('hidden');
    if (userName) userName.textContent = authState.user?.displayName || '用户';
    if (userEmail) userEmail.textContent = authState.user?.email || '';
    if (userMeta) {
      const parts = [];
      if (authState.user?.createdAt) parts.push(`注册于 ${new Date(Number(authState.user.createdAt)).toLocaleDateString()}`);
      if (authState.user?.lastLoginAt) parts.push(`最近登录 ${new Date(Number(authState.user.lastLoginAt)).toLocaleString()}`);
      userMeta.textContent = parts.join(' · ');
    }
    if (createTokenBtn) createTokenBtn.disabled = false;
    if (refreshTokensBtn) refreshTokensBtn.disabled = false;
  }
  renderSidebarAccount();
  renderSidebarStatusCard();
  renderAuthTokens();
}

async function loadAuthMe() {
  authState.loading = true;
  renderAuthUi();
  try {
    const out = await api('/api/auth/me');
    authState.authenticated = Boolean(out?.authenticated);
    authState.user = out?.user || null;
    authState.auth = out?.auth || null;
    if (!authState.authenticated) {
      authState.tokens = [];
    }
  } finally {
    authState.loading = false;
    renderAuthUi();
  }
  return authState;
}

async function loadAuthTokens() {
  if (!authState.authenticated) {
    authState.tokens = [];
    renderAuthUi();
    return [];
  }
  const out = await api('/api/auth/tokens');
  authState.tokens = Array.isArray(out?.items) ? out.items : [];
  renderAuthUi();
  return authState.tokens;
}

async function runAuthGuardCheck({ force = false } = {}) {
  if (window.location.pathname === '/login.html') return true;
  if (!force && document.hidden) return true;
  const now = Date.now();
  if (!force && now - authGuardLastCheckAt < 5000) return true;
  if (authGuardInFlight) return authGuardInFlight;
  authGuardLastCheckAt = now;
  authGuardInFlight = (async () => {
    try {
      const res = await fetch('/api/auth/me', {
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }
      });
      const payload = res.ok ? await res.json() : { authenticated: false };
      if (!payload?.authenticated) {
        redirectToLoginPage();
        return false;
      }
      return true;
    } catch (_err) {
      return true;
    } finally {
      authGuardInFlight = null;
    }
  })();
  return authGuardInFlight;
}

function advancedFiltersFromState() {
  const sidebarTag = String(state.filters.tags || '').trim();
  const extraTags = String(advancedSearchState.tags || '').trim();
  const mergedTags = [...new Set([sidebarTag, ...extraTags.split(',').map((x) => x.trim()).filter(Boolean)].filter(Boolean))];
  return {
    enabled: Boolean(advancedSearchState.enabled),
    q: String(state.filters.q || '').trim(),
    tags: mergedTags.join(','),
    domain: String(advancedSearchState.domain || '').trim(),
    type: String(advancedSearchState.type || '').trim(),
    favorite: String(advancedSearchState.favorite || '').trim(),
    archived: String(advancedSearchState.archived || '').trim(),
    semanticEnabled: Boolean(advancedSearchState.semanticEnabled),
    semanticMode: String(advancedSearchState.semanticMode || 'hybrid'),
    rerankEnabled: Boolean(advancedSearchState.rerankEnabled),
    rerankTopK: Math.max(5, Math.min(80, Number(advancedSearchState.rerankTopK || 36) || 36))
  };
}

function currentAdvancedSearchQueryPayload() {
  const extra = advancedFiltersFromState();
  return {
    q: extra.q,
    tags: extra.tags,
    domain: extra.domain,
    type: extra.type,
    favorite: extra.favorite,
    archived: extra.archived,
    semantic: extra.semanticEnabled ? 'true' : '',
    semanticMode: extra.semanticMode,
    rerank: extra.rerankEnabled ? 'true' : '',
    rerankTopK: extra.rerankTopK,
    view: state.filters.view,
    folderId: state.filters.folderId,
    sort: state.filters.sort,
    page: state.filters.page,
    pageSize: state.filters.pageSize
  };
}

function currentBookmarksQueryKey() {
  if (isAdvancedSearchActive()) {
    const q = currentAdvancedSearchQueryPayload();
    return JSON.stringify({
      mode: 'advanced',
      q: q.q || '',
      tags: q.tags || '',
      domain: q.domain || '',
      type: q.type || '',
      favorite: q.favorite || '',
      archived: q.archived || '',
      semantic: q.semantic || '',
      semanticMode: q.semanticMode || 'hybrid',
      rerank: q.rerank || '',
      rerankTopK: Number(q.rerankTopK || 36) || 36,
      view: q.view || 'all',
      folderId: q.folderId || 'all',
      sort: q.sort || 'newest',
      pageSize: Number(q.pageSize || state.filters.pageSize || 24)
    });
  }
  return JSON.stringify({
    mode: 'basic',
    view: state.filters.view || 'all',
    folderId: state.filters.folderId || 'all',
    tags: state.filters.tags || '',
    q: state.filters.q || '',
    semantic: false,
    sort: state.filters.sort || 'newest',
    pageSize: Number(state.filters.pageSize || 24)
  });
}

function resetListLoadMoreState() {
  listLoadMoreState = {
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
  listLoadMoreState = {
    key: currentBookmarksQueryKey(),
    basePage: Number(page.page || state.filters.page || 1),
    lastLoadedPage: Number(page.page || state.filters.page || 1),
    total: Number(page.total || state.bookmarks.length || 0),
    hasNext: Boolean(page.hasNext),
    pageSize: Number(page.pageSize || state.filters.pageSize || 24),
    loading: false
  };
}

function isAdvancedSearchActive() {
  return Boolean(advancedSearchState.enabled) && String(state.filters.view || 'all') !== 'trash';
}

function syncAdvancedSearchInputs() {
  const panel = byId('advancedSearchPanel');
  if (!panel) return;
  setSavedSearchesUiVisible(SAVED_SEARCHES_UI_ENABLED);
  panel.classList.toggle('hidden', !advancedSearchState.panelOpen);
  const toggleBtn = byId('advancedSearchToggleBtn');
  if (toggleBtn) {
    if (!toggleBtn.dataset.iconHydrated) {
      toggleBtn.innerHTML = `${iconSvg('tune', { title: '高级搜索' })}<span class="search-inline-tool-caret" aria-hidden="true">▾</span><span class="sr-only">高级搜索</span>`;
      toggleBtn.dataset.iconHydrated = '1';
    }
    toggleBtn.classList.toggle('active', Boolean(advancedSearchState.panelOpen));
    toggleBtn.setAttribute('aria-pressed', String(Boolean(advancedSearchState.panelOpen)));
    toggleBtn.setAttribute('title', advancedSearchState.panelOpen ? '收起高级搜索' : '高级搜索');
  }
  if (byId('advancedSearchEnabled')) byId('advancedSearchEnabled').checked = Boolean(advancedSearchState.enabled);
  if (byId('advancedSearchTags')) byId('advancedSearchTags').value = advancedSearchState.tags || '';
  if (byId('advancedSearchDomain')) byId('advancedSearchDomain').value = advancedSearchState.domain || '';
  if (byId('advancedSearchType')) byId('advancedSearchType').value = advancedSearchState.type || '';
  if (byId('advancedSearchFavorite')) byId('advancedSearchFavorite').value = advancedSearchState.favorite || '';
  if (byId('advancedSearchArchived')) byId('advancedSearchArchived').value = advancedSearchState.archived || '';
  if (byId('advancedSearchSemanticEnabled')) byId('advancedSearchSemanticEnabled').checked = Boolean(advancedSearchState.semanticEnabled);
  if (byId('advancedSearchSemanticMode')) {
    const mode = ['hybrid', 'semantic'].includes(String(advancedSearchState.semanticMode || '')) ? String(advancedSearchState.semanticMode) : 'hybrid';
    byId('advancedSearchSemanticMode').value = mode;
  }
  if (byId('advancedSearchRerankEnabled')) byId('advancedSearchRerankEnabled').checked = Boolean(advancedSearchState.rerankEnabled);
  if (byId('advancedSearchRerankTopK')) {
    const topK = Math.max(5, Math.min(80, Number(advancedSearchState.rerankTopK || 36) || 36));
    const select = byId('advancedSearchRerankTopK');
    if (![...select.options].some((o) => Number(o.value) === topK)) {
      const opt = document.createElement('option');
      opt.value = String(topK);
      opt.textContent = String(topK);
      select.appendChild(opt);
    }
    select.value = String(topK);
  }

  const savedSelect = byId('advancedSearchSavedSelect');
  if (savedSelect) {
    const current = savedSelect.value;
    const options = ['<option value="">已保存查询...</option>']
      .concat((advancedSearchState.saved || []).map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name || '未命名查询')}</option>`));
    savedSelect.innerHTML = options.join('');
    if ([...savedSelect.options].some((o) => o.value === current)) savedSelect.value = current;
  }

  const meta = byId('advancedSearchMeta');
  if (!meta) return;
  if (!advancedSearchState.panelOpen) {
    meta.textContent = '';
    return;
  }
  if (!isAdvancedSearchActive()) {
    if (advancedSearchState.enabled && String(state.filters.view || '') === 'trash') {
      meta.textContent = '回收站视图下禁用高级搜索。请切换到全部/收件箱/收藏/归档后使用。';
    } else {
      meta.textContent = SAVED_SEARCHES_UI_ENABLED
        ? '高级搜索为可选功能。启用后可使用组合筛选和已保存查询。'
        : '高级搜索为可选功能。启用后可使用组合筛选。';
    }
    return;
  }
  const extra = advancedFiltersFromState();
  const chips = [];
  if (extra.tags) chips.push(`tags=${extra.tags}`);
  if (extra.domain) chips.push(`domain=${extra.domain}`);
  if (extra.type) chips.push(`type=${extra.type}`);
  if (extra.favorite) chips.push(`favorite=${extra.favorite}`);
  if (extra.archived) chips.push(`archived=${extra.archived}`);
  const resultBits = [];
  if (advancedSearchState.lastResultMeta) {
    if (advancedSearchState.lastResultMeta.usedFullText) resultBits.push('已使用全文索引');
    if (advancedSearchState.lastResultMeta.usedSemantic) {
      const modeText = String(advancedSearchState.lastResultMeta.semanticMode || 'hybrid') === 'semantic' ? '纯语义' : '混合语义';
      resultBits.push(`已使用语义检索（${modeText}）`);
      if (advancedSearchState.lastResultMeta.semanticProvider?.providerType) {
        const providerType = String(advancedSearchState.lastResultMeta.semanticProvider.providerType);
        const model = String(advancedSearchState.lastResultMeta.semanticProvider.model || '');
        resultBits.push(`向量来源：${providerType}${model ? `/${model}` : ''}`);
      }
      if (advancedSearchState.lastResultMeta.semanticFallbackLocal) resultBits.push('语义向量使用本地回退');
      if (Number(advancedSearchState.lastResultMeta.semanticIndexUpdated || 0) > 0) {
        resultBits.push(`索引更新 ${Number(advancedSearchState.lastResultMeta.semanticIndexUpdated)} 条`);
      }
    }
    if (advancedSearchState.lastResultMeta.usedAiRerank) {
      const applied = Number(advancedSearchState.lastResultMeta.rerankAppliedCount || 0) || 0;
      const topK = Number(advancedSearchState.lastResultMeta.rerankTopK || 0) || 0;
      resultBits.push(`AI 重排：前 ${topK || '-'} 条（实际 ${applied} 条）`);
      if (advancedSearchState.lastResultMeta.rerankProvider?.providerType) {
        const providerType = String(advancedSearchState.lastResultMeta.rerankProvider.providerType);
        const model = String(advancedSearchState.lastResultMeta.rerankProvider.model || '');
        resultBits.push(`重排模型：${providerType}${model ? `/${model}` : ''}`);
      }
      if (advancedSearchState.lastResultMeta.rerankSummary) {
        resultBits.push(String(advancedSearchState.lastResultMeta.rerankSummary).slice(0, 120));
      }
    }
    if (typeof advancedSearchState.lastResultMeta.total === 'number') resultBits.push(`${advancedSearchState.lastResultMeta.total} 条匹配`);
  }
  if (advancedSearchState.lastAiParseMeta?.sourceText) {
    resultBits.push(`AI 解析：${advancedSearchState.lastAiParseMeta.sourceText}`);
    if (advancedSearchState.lastAiParseMeta.reason) resultBits.push(advancedSearchState.lastAiParseMeta.reason);
    if (Array.isArray(advancedSearchState.lastAiParseMeta.unsupported) && advancedSearchState.lastAiParseMeta.unsupported.length) {
      resultBits.push(`未完全支持：${advancedSearchState.lastAiParseMeta.unsupported.join('、')}`);
    }
  }
  meta.textContent = [chips.length ? `筛选条件：${chips.join(' · ')}` : '筛选条件：无', ...resultBits].join(' · ');
}

function pullAdvancedSearchInputs() {
  advancedSearchState.enabled = Boolean(byId('advancedSearchEnabled')?.checked);
  advancedSearchState.tags = String(byId('advancedSearchTags')?.value || '').trim();
  advancedSearchState.domain = String(byId('advancedSearchDomain')?.value || '').trim();
  advancedSearchState.type = String(byId('advancedSearchType')?.value || '').trim();
  advancedSearchState.favorite = String(byId('advancedSearchFavorite')?.value || '').trim();
  advancedSearchState.archived = String(byId('advancedSearchArchived')?.value || '').trim();
  advancedSearchState.semanticEnabled = Boolean(byId('advancedSearchSemanticEnabled')?.checked);
  advancedSearchState.semanticMode = ['hybrid', 'semantic'].includes(String(byId('advancedSearchSemanticMode')?.value || '').trim())
    ? String(byId('advancedSearchSemanticMode')?.value || '').trim()
    : 'hybrid';
  advancedSearchState.rerankEnabled = Boolean(byId('advancedSearchRerankEnabled')?.checked);
  advancedSearchState.rerankTopK = Math.max(5, Math.min(80, Number(byId('advancedSearchRerankTopK')?.value || 36) || 36));
}

async function loadSavedSearches() {
  if (!SAVED_SEARCHES_UI_ENABLED) {
    advancedSearchState.saved = [];
    advancedSearchState.activeSavedId = '';
    syncAdvancedSearchInputs();
    renderSidebar();
    return [];
  }
  if (!authState.authenticated) {
    advancedSearchState.saved = [];
    advancedSearchState.activeSavedId = '';
    syncAdvancedSearchInputs();
    renderSidebar();
    return [];
  }
  const out = await api('/api/product/search/saved');
  advancedSearchState.saved = Array.isArray(out?.items) ? out.items : [];
  if (
    advancedSearchState.activeSavedId
    && !advancedSearchState.saved.some((x) => String(x.id) === String(advancedSearchState.activeSavedId))
  ) {
    advancedSearchState.activeSavedId = '';
  }
  syncAdvancedSearchInputs();
  renderSidebar();
  return advancedSearchState.saved;
}

function applySavedSearchToUi(item = {}) {
  const query = item.query && typeof item.query === 'object' ? item.query : {};
  state.filters.q = String(query.q || '');
  state.filters.page = 1;
  advancedSearchState.enabled = true;
  advancedSearchState.panelOpen = true;
  advancedSearchState.tags = String(query.tags || '').trim();
  advancedSearchState.domain = String(query.domain || '').trim();
  advancedSearchState.type = String(query.type || '').trim();
  advancedSearchState.favorite = String(query.favorite || '').trim();
  advancedSearchState.archived = String(query.archived || '').trim();
  advancedSearchState.semanticEnabled = String(query.semantic || '') === 'true';
  advancedSearchState.semanticMode = ['hybrid', 'semantic'].includes(String(query.semanticMode || '').trim())
    ? String(query.semanticMode || '').trim()
    : 'hybrid';
  advancedSearchState.rerankEnabled = String(query.rerank || '') === 'true';
  advancedSearchState.rerankTopK = Math.max(5, Math.min(80, Number(query.rerankTopK || 36) || 36));
  if (typeof query.view === 'string' && query.view) state.filters.view = query.view;
  if (typeof query.folderId === 'string' && query.folderId) state.filters.folderId = query.folderId;
  if (typeof query.sort === 'string' && query.sort) state.filters.sort = query.sort;
  advancedSearchState.activeSavedId = String(item.id || '');
  advancedSearchState.lastAiParseMeta = null;
  byId('searchInput').value = state.filters.q;
  byId('sortSelect').value = state.filters.sort;
  syncAdvancedSearchInputs();
  renderSidebar();
}

function applyAiSearchParseToUi(result = {}, sourceText = '') {
  const query = result?.query && typeof result.query === 'object' ? result.query : {};
  const validView = ['all', 'inbox', 'favorites', 'archive', 'trash'];
  const validSort = ['newest', 'updated', 'oldest', 'title'];
  const validType = ['', 'web', 'pdf', 'image', 'video'];
  const triBool = new Set(['', 'true', 'false']);

  state.filters.q = String(query.q || '').trim();
  state.filters.page = 1;
  if (validView.includes(String(query.view || ''))) state.filters.view = String(query.view || '') || state.filters.view;
  if (validSort.includes(String(query.sort || ''))) state.filters.sort = String(query.sort || '') || state.filters.sort;
  if (typeof query.folderId === 'string' && query.folderId) state.filters.folderId = query.folderId;

  advancedSearchState.enabled = true;
  advancedSearchState.panelOpen = true;
  advancedSearchState.activeSavedId = '';
  advancedSearchState.tags = Array.isArray(query.tags) ? query.tags.join(',') : String(query.tags || '').trim();
  advancedSearchState.domain = String(query.domain || '').trim();
  advancedSearchState.type = validType.includes(String(query.type || '')) ? String(query.type || '') : '';
  advancedSearchState.favorite = triBool.has(String(query.favorite || '')) ? String(query.favorite || '') : '';
  advancedSearchState.archived = triBool.has(String(query.archived || '')) ? String(query.archived || '') : '';
  advancedSearchState.semanticEnabled = false;
  advancedSearchState.semanticMode = 'hybrid';
  advancedSearchState.rerankEnabled = false;
  advancedSearchState.rerankTopK = 36;
  advancedSearchState.lastAiParseMeta = {
    sourceText: String(sourceText || '').trim().slice(0, 80),
    reason: String(result?.reason || '').trim().slice(0, 180),
    unsupported: Array.isArray(result?.unsupported) ? result.unsupported.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 6) : [],
    confidence: Math.max(0, Math.min(1, Number(result?.confidence) || 0))
  };

  const searchInput = byId('searchInput');
  if (searchInput) searchInput.value = state.filters.q;
  const sortSelect = byId('sortSelect');
  if (sortSelect) sortSelect.value = state.filters.sort || 'newest';
}

async function openAuthDialog() {
  if (!authState.authenticated) {
    setSidebarAccountMenuOpen(false);
    redirectToLoginPage();
    return;
  }
  setSidebarAccountMenuOpen(false);
  renderAuthUi();
  const dlg = byId('authDialog');
  if (!dlg.open) dlg.showModal();
  if (authState.authenticated) {
    try {
      await loadAuthTokens();
    } catch (err) {
      byId('authTokenOutput').textContent = err.message;
    }
  }
}

async function logoutCurrentUser({ next = '/' } = {}) {
  try {
    await api('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) });
  } catch (_err) {
    // ignore
  }
  authState = {
    loading: false,
    authenticated: false,
    user: null,
    auth: null,
    tokens: [],
    latestPlainToken: ''
  };
  setSidebarAccountMenuOpen(false);
  renderAuthUi();
  if (byId('authDialog')?.open) byId('authDialog').close();
  redirectToLoginPage({ next });
}

function inferItemKind(item = {}) {
  const url = String(item.url || '').toLowerCase();
  const contentType = String(item?.metadata?.contentType || item?.article?.contentType || '').toLowerCase();
  if (/youtube\.com|youtu\.be|vimeo\.com/.test(url)) return 'video';
  if (contentType.includes('pdf') || /\.pdf([?#]|$)/.test(url)) return 'pdf';
  if (contentType.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)([?#]|$)/.test(url)) return 'image';
  if (contentType.startsWith('video/') || /\.(mp4|webm|ogg|mov|m4v)([?#]|$)/.test(url)) return 'video';
  if (/\.(txt|md|json|csv)([?#]|$)/.test(url)) return 'file';
  return 'web';
}

function kindLabel(kind) {
  const k = String(kind || 'web');
  if (k === 'pdf') return 'PDF';
  if (k === 'image') return '图片';
  if (k === 'video') return '视频';
  if (k === 'file') return '文件';
  return '网页';
}

function itemExcerpt(item = {}) {
  const articleExcerpt = String(item?.article?.excerpt || '').trim();
  if (articleExcerpt) return articleExcerpt;
  const metaDesc = String(item?.metadata?.description || '').trim();
  if (metaDesc) return metaDesc;
  return String(item.note || '').trim();
}

function reminderInfoText(item = {}) {
  const reminderAt = Number(item.reminderAt || 0) || 0;
  const state = item.reminderState || {};
  const parts = [];
  parts.push(`提醒：${state.status || (reminderAt ? 'scheduled' : 'none')}`);
  if (reminderAt) parts.push(`时间 ${new Date(reminderAt).toLocaleString()}`);
  if (state.lastTriggeredAt) parts.push(`最近触发 ${new Date(Number(state.lastTriggeredAt)).toLocaleTimeString()}`);
  if (state.lastDismissedAt) parts.push(`已忽略 ${new Date(Number(state.lastDismissedAt)).toLocaleTimeString()}`);
  if (state.延后至 && Number(state.snoozedUntil) !== reminderAt) {
    parts.push(`延后至 ${new Date(Number(state.snoozedUntil)).toLocaleTimeString()}`);
  }
  return parts.join(' · ');
}

function folderName(folderId) {
  const folder = state.folders.find((f) => f.id === folderId);
  return folder ? folder.name : '根目录';
}

function folderOptionsHtml(selected = 'root') {
  return state.folders
    .filter((f) => f.id !== 'root')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((f) => `<option value="${f.id}" ${f.id === selected ? 'selected' : ''}>${escapeHtml(f.name)}</option>`)
    .join('');
}

function folderParentOptionsHtml(selected = 'root') {
  return [
    `<option value="root" ${selected === 'root' ? 'selected' : ''}>Root</option>`,
    ...state.folders
      .filter((f) => f.id !== 'root')
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((f) => `<option value="${f.id}" ${f.id === selected ? 'selected' : ''}>${escapeHtml(f.name)}</option>`)
  ].join('');
}

function openCollectionCreateDialog({ parentId = 'root', color = '#8f96a3', title = '新建集合', subtitle = '创建顶级集合或挂到父级集合下。' } = {}) {
  clearFormValidation('collectionForm', 'collectionFormError');
  const dialog = byId('collectionDialog');
  const form = byId('collectionForm');
  if (!dialog || !form) return;
  form.reset();
  byId('newCollectionParent').innerHTML = folderParentOptionsHtml(String(parentId || 'root'));
  byId('newCollectionParent').value = String(parentId || 'root');
  byId('newCollectionColor').value = String(color || '#8f96a3');
  if (byId('collectionDialogTitle')) byId('collectionDialogTitle').textContent = String(title || '新建集合');
  if (byId('collectionDialogSubtitle')) byId('collectionDialogSubtitle').textContent = String(subtitle || '');
  dialog.showModal();
  byId('newCollectionName')?.focus();
}

async function applyFolderFilter(folderId, { selectPageItems = false } = {}) {
  const id = String(folderId || '');
  if (!id) return;
  store.setFilter('folderId', id);
  store.setFilter('view', 'all');
  store.setFilter('page', 1);
  store.clearSelection();
  await loadBookmarks();
  if (selectPageItems) {
    for (const item of state.bookmarks || []) {
      store.setSelected(item.id, true);
    }
    renderHeader();
    renderCards();
  }
  renderSidebar();
}

function folderTreeActionableBookmarks(folderId) {
  const ids = getFolderDescendantIdSet(folderId);
  return (state.allBookmarks || []).filter((b) => !b.deletedAt && ids.has(String(b.folderId || 'root')) && String(b.url || '').trim());
}

function normalizeFolderIconInput(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  return Array.from(text).slice(0, 2).join('');
}

async function copyTextToClipboard(text) {
  const value = String(text || '');
  if (!value) return false;
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch (_err) {
    // fallback below
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return Boolean(ok);
  } catch (_err) {
    return false;
  }
}

async function runCollectionMenuAction(action, folderId) {
  const id = String(folderId || '');
  const folder = getFolderById(id);
  if (!folder) {
    showToast('集合不存在或已删除', { timeoutMs: 3000 });
    return;
  }

  if (action === 'createNested') {
    openCollectionCreateDialog({
      parentId: id,
      color: String(folder.color || '#8f96a3'),
      title: '创建嵌套的集合',
      subtitle: `将在「${folder.name}」下创建子集合。`
    });
    return;
  }

  if (action === 'select') {
    await applyFolderFilter(id, { selectPageItems: true });
    showToast(`已选择当前页「${folder.name}」书签`, { timeoutMs: 2500 });
    return;
  }

  if (action === 'rename') {
    const nextName = await uiPrompt('输入新的集合名称', {
      title: '改名',
      inputLabel: '集合名称',
      defaultValue: String(folder.name || ''),
      required: true,
      requiredMessage: '请输入集合名称'
    });
    if (nextName === null) return;
    const name = String(nextName || '').trim();
    if (!name || name === String(folder.name || '')) return;
    await api(`/api/folders/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ name })
    });
    await refreshAll();
    showToast('集合已改名', { timeoutMs: 2500 });
    return;
  }

  if (action === 'changeIcon') {
    const nextIcon = await uiPrompt('输入 Emoji 作为集合图标（留空可清除）', {
      title: '更改图标',
      inputLabel: '集合图标',
      defaultValue: String(folder.icon || ''),
      placeholder: '例如：📚',
      trim: true
    });
    if (nextIcon === null) return;
    const icon = normalizeFolderIconInput(nextIcon);
    await api(`/api/folders/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ icon })
    });
    await refreshAll();
    showToast(icon ? '集合图标已更新' : '集合图标已清除', { timeoutMs: 2500 });
    return;
  }

  if (action === 'share') {
    const linksResp = await api('/api/collab/public-links');
    const existing = (linksResp?.items || []).find((x) => String(x.folderId || '') === id && x.enabled);
    let item = existing || null;
    if (!item) {
      const out = await api('/api/collab/public-links', {
        method: 'POST',
        body: JSON.stringify({ folderId: id, title: folder.name })
      });
      item = out?.item || null;
    }
    if (!item?.token) throw new Error('公开链接创建失败');
    const link = `${window.location.origin}/public/c/${encodeURIComponent(String(item.token))}`;
    const copied = await copyTextToClipboard(link);
    showToast(copied ? '分享链接已复制到剪贴板' : `分享链接：${link}`, { timeoutMs: copied ? 3000 : 6000 });
    return;
  }

  if (action === 'delete') {
    const ok = await uiConfirm(`确认删除集合「${folder.name}」？其子集合会一并删除，书签将移动到根目录。`, {
      title: '删除集合',
      confirmText: '删除',
      danger: true
    });
    if (!ok) return;
    await api(`/api/folders/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (String(state.filters.folderId || '') === id) store.setFilter('folderId', 'all');
    await refreshAll();
    showToast('集合已删除', { timeoutMs: 2500 });
    return;
  }

  if (action === 'openAll') {
    const items = folderTreeActionableBookmarks(id);
    if (!items.length) {
      showToast('该集合没有可打开的书签', { timeoutMs: 2500 });
      return;
    }
    if (items.length > 12) {
      const ok = await uiConfirm(`将尝试打开 ${items.length} 个书签标签页，浏览器可能拦截部分窗口。是否继续？`, {
        title: '打开所有书签',
        confirmText: '继续打开'
      });
      if (!ok) return;
    }
    let opened = 0;
    for (const item of items) {
      const win = window.open(String(item.url || ''), '_blank', 'noopener');
      if (win) opened += 1;
    }
    showToast(`已尝试打开 ${items.length} 个书签（成功发起 ${opened} 个）`, { timeoutMs: 3500 });
  }
}

async function loadState() {
  const payload = await api('/api/state');
  store.setCollectionsSnapshot(payload);
  renderSidebar();
  renderDetailFolderOptions();
  renderDialogsFolderOptions();
}

async function fetchBookmarksPagePayload({ page = state.filters.page, pageSize = state.filters.pageSize } = {}) {
  if (isAdvancedSearchActive()) {
    const qs = queryString({
      ...currentAdvancedSearchQueryPayload(),
      page: Number(page || 1),
      pageSize: Number(pageSize || state.filters.pageSize || 24)
    });
    const payload = await api(`/api/product/search/query${qs ? `?${qs}` : ''}`);
    advancedSearchState.lastResultMeta = {
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
    };
    return payload;
  }
  const qs = queryString({
    ...state.filters,
    page: Number(page || 1),
    pageSize: Number(pageSize || state.filters.pageSize || 24)
  });
  const payload = await api(`/api/bookmarks${qs ? `?${qs}` : ''}`);
  advancedSearchState.lastResultMeta = null;
  return payload;
}

function renderListLoadMoreBar() {
  const bar = byId('listLoadMoreBar');
  const btn = byId('listLoadMoreBtn');
  const meta = byId('listLoadMoreMeta');
  if (!bar || !btn || !meta) return;

  const page = state.page || {};
  const inList = bookmarkLayoutMode === 'list';
  const sameQuery = listLoadMoreState.key && listLoadMoreState.key === currentBookmarksQueryKey();
  const displayedCount = Number((state.bookmarks || []).length || 0);
  const total = Number((sameQuery ? listLoadMoreState.total : page.total) || page.total || displayedCount || 0);
  const hasNext = Boolean(sameQuery ? listLoadMoreState.hasNext : page.hasNext);
  const loadedPages = sameQuery ? Math.max(1, Number(listLoadMoreState.lastLoadedPage || page.page || 1) - Number(listLoadMoreState.basePage || page.page || 1) + 1) : 1;
  const canShow = inList && displayedCount > 0;

  bar.classList.toggle('hidden', !canShow);
  if (!canShow) return;

  btn.disabled = listLoadMoreState.loading || !hasNext;
  btn.textContent = listLoadMoreState.loading ? '加载中…' : (hasNext ? '更多…' : '已加载全部');
  meta.textContent = hasNext
    ? `已显示 ${displayedCount} / ${total} 条 · 已加载 ${loadedPages} 页`
    : `已显示 ${displayedCount} / ${total} 条`;
}

async function loadBookmarks() {
  bookmarksLoading = true;
  bookmarksLoadError = '';
  renderCards();
  renderPager();
  renderListLoadMoreBar();
  let payload;
  try {
    payload = await fetchBookmarksPagePayload();
  } catch (err) {
    bookmarksLoading = false;
    bookmarksLoadError = err?.message || '加载书签失败';
    resetListLoadMoreState();
    renderCards();
    renderPager();
    renderListLoadMoreBar();
    throw err;
  }
  bookmarksLoading = false;
  store.setBookmarksPage(payload || {});
  syncListLoadMoreBaselineFromPage();

  for (const id of [...state.selected]) {
    if (!state.bookmarks.some((x) => x.id === id)) {
      store.setSelected(id, false);
    }
  }

  if (state.activeId && !state.bookmarks.some((x) => x.id === state.activeId)) {
    store.setActiveId(null);
  }

  renderHeader();
  renderCards();
  renderPager();
  renderListLoadMoreBar();
  renderDetail();
  syncAdvancedSearchInputs();
}

async function loadMoreListPage() {
  if (bookmarkLayoutMode !== 'list') return;
  if (bookmarksLoading || listLoadMoreState.loading) return;
  const queryKey = currentBookmarksQueryKey();
  const page = state.page || {};
  if (!listLoadMoreState.key || listLoadMoreState.key !== queryKey) {
    syncListLoadMoreBaselineFromPage();
  }
  if (!listLoadMoreState.hasNext) return;

  const nextPage = Number(listLoadMoreState.lastLoadedPage || page.page || 1) + 1;
  listLoadMoreState = { ...listLoadMoreState, loading: true };
  renderListLoadMoreBar();

  let payload;
  try {
    payload = await fetchBookmarksPagePayload({
      page: nextPage,
      pageSize: listLoadMoreState.pageSize || page.pageSize || state.filters.pageSize
    });
  } catch (err) {
    listLoadMoreState = { ...listLoadMoreState, loading: false };
    renderListLoadMoreBar();
    throw err;
  }

  const existing = Array.isArray(state.bookmarks) ? state.bookmarks : [];
  const incoming = Array.isArray(payload?.items) ? payload.items : [];
  state.bookmarks = [...existing, ...incoming.filter((x) => !existing.some((e) => String(e.id) === String(x.id)))];

  listLoadMoreState = {
    ...listLoadMoreState,
    key: queryKey,
    total: Number(payload?.total || listLoadMoreState.total || state.bookmarks.length),
    hasNext: Boolean(payload?.hasNext),
    lastLoadedPage: Number(payload?.page || nextPage),
    pageSize: Number(payload?.pageSize || listLoadMoreState.pageSize || state.filters.pageSize || 24),
    loading: false
  };

  renderHeader();
  renderCards();
  renderPager();
  renderListLoadMoreBar();
  renderDetail();
}

function inferredBookmarkKindForStats(item) {
  const kind = String(item?.type || item?.kind || '').trim().toLowerCase();
  if (kind) return kind;
  const url = String(item?.url || '').toLowerCase();
  if (url.endsWith('.pdf')) return 'pdf';
  if (/\.(png|jpe?g|gif|webp|svg)([?#]|$)/.test(url)) return 'image';
  if (/youtube\.com|youtu\.be|vimeo\.com/.test(url)) return 'video';
  return 'web';
}

function buildSidebarQuickFilters() {
  const items = (state.allBookmarks || []).filter((b) => !b.deletedAt);
  const countBy = {
    note: 0,
    highlights: 0,
    web: 0,
    pdf: 0,
    image: 0,
    notag: 0
  };
  for (const item of items) {
    if (String(item.note || '').trim()) countBy.note += 1;
    if (Array.isArray(item.highlights) && item.highlights.length) countBy.highlights += 1;
    if (!Array.isArray(item.tags) || item.tags.length === 0) countBy.notag += 1;
    const kind = inferredBookmarkKindForStats(item);
    if (kind in countBy) countBy[kind] += 1;
  }
  return [
    { id: 'note', label: '备注', icon: 'note', query: 'note:true', count: countBy.note },
    { id: 'highlights', label: '高亮', icon: 'highlights', query: 'highlights:true', count: countBy.highlights },
    { id: 'type-web', label: '网页', icon: 'link', query: 'type:web', count: countBy.web },
    { id: 'type-pdf', label: 'PDF', icon: 'type', query: 'type:pdf', count: countBy.pdf },
    { id: 'type-image', label: '图片', icon: 'type', query: 'type:image', count: countBy.image },
    { id: 'notag', label: '没有标签', icon: 'tag', query: 'notag:true', count: countBy.notag }
  ];
}

function isQuickFilterActiveQuery(query) {
  return String(state.filters.q || '').trim() === String(query || '').trim();
}

async function applyQuickFilterSearch(query, { toggle = true } = {}) {
  const q = String(query || '').trim();
  const next = toggle && isQuickFilterActiveQuery(q) ? '' : q;
  const input = byId('searchInput');
  if (input) input.value = next;
  advancedSearchState.enabled = true;
  advancedSearchState.activeSavedId = '';
  store.setFilter('q', next);
  store.setFilter('page', 1);
  store.clearSelection();
  await loadBookmarks();
  renderSidebar();
  if (next) rememberRecentSearch(next, { immediate: true });
}

function renderSidebar() {
  if (collectionContextMenuState.open) setCollectionContextMenuOpen(false);
  if (systemViewContextMenuState.open) setSystemViewContextMenuOpen(false);
  if (collectionsHeaderMenuState.open) setCollectionsHeaderMenuOpen(false);
  if (quickFiltersMenuOpen) setQuickFiltersMenuOpen(false);
  if (quickFilterContextMenuState.open) setQuickFilterContextMenuOpen(false);
  if (tagContextMenuState.open) setTagContextMenuOpen(false);
  setSavedSearchesUiVisible(SAVED_SEARCHES_UI_ENABLED);
  renderSidebarStatusCard();
  setCollectionsSectionDragState(Boolean(draggedFolderId));
  const nav = byId('quickNav');
  nav?.classList.add('sidebar-system-list');
  const folderIsAll = String(state.filters.folderId || 'all') === 'all';
  nav.innerHTML = quickViews
    .map((item) => {
      const active = folderIsAll && state.filters.view === item.key ? 'active' : '';
      let count = state.stats.total || 0;
      if (item.key === 'favorites') count = state.stats.favorites || 0;
      if (item.key === 'archive') count = state.stats.archive || 0;
      if (item.key === 'trash') count = state.stats.trash || 0;
      if (item.key === 'inbox') count = (state.stats.total || 0) - (state.stats.archive || 0);
      return `<div class="sidebar-system-row ${active}" data-system-view-row="${escapeHtml(item.key)}">
        <span class="tree-expander tree-expander-spacer sidebar-system-expander" aria-hidden="true"></span>
        <button type="button" class="sidebar-row-main system-row-main" data-system-view="${escapeHtml(item.key)}">
          <span class="sidebar-row-icon" aria-hidden="true">${iconSvg(item.icon || 'all')}</span>
          <span class="sidebar-row-title">${escapeHtml(item.label)}</span>
          <span class="sidebar-row-count muted">${count}</span>
        </button>
        <button type="button" class="sidebar-row-more ghost" data-system-view-menu="${escapeHtml(item.key)}" title="更多" aria-label="更多">…</button>
      </div>`;
    })
    .join('');

  nav.querySelectorAll('[data-system-view]').forEach((el) => {
    el.addEventListener('click', async () => {
      await activateSystemView(el.dataset.systemView);
    });
  });
  nav.querySelectorAll('[data-system-view-menu]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const view = String(el.dataset.systemViewMenu || '');
      if (!view) return;
      openSystemViewContextMenu(view, { anchorEl: el });
    });
  });
  nav.querySelectorAll('[data-system-view-row]').forEach((row) => {
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const view = String(row.getAttribute('data-system-view-row') || '');
      if (!view) return;
      openSystemViewContextMenu(view, { x: e.clientX, y: e.clientY });
    });
  });

  const savedNav = byId('savedQueriesSidebar');
  const savedMeta = byId('savedQueriesSidebarMeta');
  if (SAVED_SEARCHES_UI_ENABLED && savedNav && savedMeta) {
    const savedItems = Array.isArray(advancedSearchState.saved) ? advancedSearchState.saved : [];
    if (!authState.authenticated) {
      savedMeta.textContent = '登录后可使用已保存查询';
      savedNav.innerHTML = `<div class="sidebar-empty muted">未登录</div>`;
    } else if (!savedItems.length) {
      savedMeta.textContent = isAdvancedSearchActive() ? '可在高级搜索面板保存当前查询' : '暂无已保存查询';
      savedNav.innerHTML = `<div class="sidebar-empty muted">暂无已保存查询</div>`;
    } else {
      savedMeta.textContent = `${savedItems.length} 条${advancedSearchState.activeSavedId ? ' · 已应用 1 条' : ''}`;
      savedNav.innerHTML = savedItems
        .slice(0, 12)
        .map((item) => {
          const active = String(advancedSearchState.activeSavedId || '') === String(item.id || '') ? 'active' : '';
          const q = item?.query && typeof item.query === 'object' ? item.query : {};
          const meta = [q.view, q.folderId && q.folderId !== 'all' ? folderName(q.folderId) : '', q.tags ? `#${q.tags}` : '']
            .filter(Boolean)
            .join(' · ');
          return `<button type="button" class="nav-item saved-query-item ${active}" data-saved-query-id="${escapeHtml(String(item.id || ''))}">
            <span class="nav-item-inner">
              <span class="nav-item-icon" aria-hidden="true">${iconSvg('search')}</span>
              <span class="nav-item-label">
                <span class="saved-query-name">${escapeHtml(item.name || '未命名查询')}</span>
                ${meta ? `<small class="saved-query-meta">${escapeHtml(meta)}</small>` : ''}
              </span>
              <span class="nav-item-count muted">保存</span>
            </span>
          </button>`;
        })
        .join('');
    }
    savedNav.querySelectorAll('[data-saved-query-id]').forEach((el) => {
      el.addEventListener('click', async () => {
        const id = String(el.dataset.savedQueryId || '');
        const item = (advancedSearchState.saved || []).find((s) => String(s.id) === id);
        if (!item) return;
        applySavedSearchToUi(item);
        store.clearSelection();
        await loadBookmarks();
        renderSidebar();
      });
    });
  } else if (savedNav && savedMeta) {
    savedMeta.textContent = '';
    savedNav.innerHTML = '';
  }

  renderCollectionsTreeSection();

  const quickFiltersList = byId('quickFiltersList');
  const quickFilterItems = buildSidebarQuickFilters().filter((x) => Number(x.count || 0) > 0);
  if (quickFiltersList) {
    quickFiltersList.innerHTML = quickFilterItems.length
      ? quickFilterItems.map((item) => {
        const active = isQuickFilterActiveQuery(item.query) ? 'active' : '';
        return `<div class="sidebar-row sidebar-filter-row ${active}" data-quick-filter-row="${escapeHtml(item.id)}" data-quick-filter-query="${escapeHtml(item.query)}">
            <button type="button" class="sidebar-row-main" data-quick-filter="${escapeHtml(item.id)}">
              <span class="sidebar-row-icon" aria-hidden="true">${iconSvg(item.icon || 'search')}</span>
              <span class="sidebar-row-title">${escapeHtml(item.label)}</span>
              <span class="sidebar-row-count muted">${Number(item.count || 0)}</span>
            </button>
            <button type="button" class="sidebar-row-more ghost" data-quick-filter-menu="${escapeHtml(item.id)}" title="更多" aria-label="更多">…</button>
          </div>`;
      }).join('')
      : `<div class="sidebar-empty muted">暂无快速过滤</div>`;

    quickFiltersList.querySelectorAll('[data-quick-filter]').forEach((el) => {
      el.addEventListener('click', async (e) => {
        e.preventDefault();
        const row = el.closest('[data-quick-filter-row]');
        const query = row?.getAttribute('data-quick-filter-query') || '';
        if (!query) return;
        await applyQuickFilterSearch(query, { toggle: true });
      });
    });
    quickFiltersList.querySelectorAll('[data-quick-filter-menu]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const row = el.closest('[data-quick-filter-row]');
        if (!row) return;
        openQuickFilterContextMenu({
          id: String(row.getAttribute('data-quick-filter-row') || ''),
          query: String(row.getAttribute('data-quick-filter-query') || '')
        }, { anchorEl: el });
      });
    });
    quickFiltersList.querySelectorAll('[data-quick-filter-row]').forEach((row) => {
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openQuickFilterContextMenu({
          id: String(row.getAttribute('data-quick-filter-row') || ''),
          query: String(row.getAttribute('data-quick-filter-query') || '')
        }, { x: e.clientX, y: e.clientY });
      });
    });
  }

  const tagsList = byId('tagsList');
  const tagsMeta = byId('tagsMeta');
  const tagsSectionTitle = byId('tagsSectionTitle');
  const tagsSortBtn = byId('tagsSortToggleBtn');
  const tagsExpandBtn = byId('tagsExpandToggleBtn');
  const tagItems = [...(state.tags || [])].sort((a, b) => (
    sidebarTagsUi.sort === 'name'
      ? String(a.name || '').localeCompare(String(b.name || ''))
      : Number(b.count || 0) - Number(a.count || 0) || String(a.name || '').localeCompare(String(b.name || ''))
  ));
  const activeTag = String(state.filters.tags || '');
  const visibleLimit = sidebarTagsUi.expanded ? 999 : 12;
  const visibleTags = tagItems
    .filter((t, idx) => idx < visibleLimit || String(t.name || '') === activeTag)
    .reduce((acc, t) => {
      if (!acc.some((x) => String(x.name) === String(t.name))) acc.push(t);
      return acc;
    }, []);
  if (tagsSectionTitle) {
    tagsSectionTitle.textContent = `标签${tagItems.length ? ` (${tagItems.length})` : ''}`;
  }
  tagsList.innerHTML = visibleTags
    .map((t) => {
      const active = state.filters.tags === t.name ? 'active' : '';
      return `<div class="sidebar-row tag-row ${active}" data-tag-row="${escapeHtml(t.name)}">
        <button type="button" class="sidebar-row-main tag-row-main" data-tag="${escapeHtml(t.name)}">
          <span class="sidebar-row-icon tag-row-icon" aria-hidden="true">${iconSvg('tag')}</span>
          <span class="sidebar-row-title">${escapeHtml(t.name)}</span>
          <span class="sidebar-row-count muted">${Number(t.count || 0)}</span>
        </button>
        <button type="button" class="sidebar-row-more ghost" data-tag-menu="${escapeHtml(t.name)}" title="标签菜单" aria-label="标签菜单">…</button>
      </div>`;
    })
    .join('');
  if (tagsMeta) {
    tagsMeta.textContent = `${tagItems.length} 个标签 · ${sidebarTagsUi.sort === 'name' ? '按名称' : '按数量'}${activeTag ? ` · 当前 #${activeTag}` : ''}`;
  }
  if (tagsSortBtn) {
    tagsSortBtn.textContent = sidebarTagsUi.sort === 'name' ? 'A' : '#';
    tagsSortBtn.title = sidebarTagsUi.sort === 'name' ? '当前按名称排序' : '当前按数量排序';
  }
  if (tagsExpandBtn) {
    const hiddenCount = Math.max(0, tagItems.length - visibleTags.length);
    tagsExpandBtn.textContent = sidebarTagsUi.expanded ? '−' : '+';
    tagsExpandBtn.title = sidebarTagsUi.expanded ? '收起标签' : `展开更多标签${hiddenCount ? `（+${hiddenCount}）` : ''}`;
    tagsExpandBtn.classList.toggle('hidden', !tagItems.length);
  }
  tagsList.classList.toggle('collapsed', !sidebarTagsUi.expanded);

  tagsList.querySelectorAll('[data-tag]').forEach((el) => {
    el.addEventListener('click', async () => {
      const next = el.dataset.tag;
      store.setFilter('tags', state.filters.tags === next ? '' : next);
      if (state.filters.tags !== next) advancedSearchState.activeSavedId = '';
      store.setFilter('page', 1);
      store.clearSelection();
      await loadBookmarks();
      renderSidebar();
    });
  });
  tagsList.querySelectorAll('[data-tag-menu]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const tag = String(el.dataset.tagMenu || '');
      if (!tag) return;
      openTagContextMenu(tag, { anchorEl: el });
    });
  });
  tagsList.querySelectorAll('[data-tag-row]').forEach((el) => {
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const tag = String(el.getAttribute('data-tag-row') || '');
      if (!tag) return;
      openTagContextMenu(tag, { x: e.clientX, y: e.clientY });
    });
  });

  const bulkMove = byId('bulkMoveSelect');
  bulkMove.innerHTML = `<option value="">Move To...</option>${folderOptionsHtml('')}`;

  renderTagManager();
}

function renderTagManager() {
  const list = byId('tagManagerList');
  const renameFrom = byId('tagRenameFrom');
  if (!list || !renameFrom) return;

  const previousSource = renameFrom.value;
  list.innerHTML = state.tags.length
    ? state.tags
      .map(
        (t) => `<button type="button" class="tag-admin-row ghost" data-tag-pick="${escapeHtml(t.name)}">
            <span>#${escapeHtml(t.name)}</span>
            <span class="muted">${t.count}</span>
          </button>`
      )
      .join('')
    : `<div class="muted">暂无标签。</div>`;

  renameFrom.innerHTML = state.tags.length
    ? state.tags
      .map((t) => `<option value="${escapeHtml(t.name)}">${escapeHtml(t.name)} (${t.count})</option>`)
      .join('')
    : '<option value="">暂无标签</option>';

  if (previousSource && [...renameFrom.options].some((opt) => opt.value === previousSource)) {
    renameFrom.value = previousSource;
  }

  list.querySelectorAll('[data-tag-pick]').forEach((el) => {
    el.addEventListener('click', () => {
      const tag = el.dataset.tagPick;
      renameFrom.value = tag;
      if (!byId('tagRenameTo').value) byId('tagRenameTo').value = tag;
    });
  });
}

function renderHeader() {
  hydrateWorkbenchHeaderIcons();
  const viewName = quickViews.find((x) => x.key === state.filters.view)?.label || '书签';
  const folderLabel = state.filters.folderId === 'all' ? '' : ` · ${folderName(state.filters.folderId)}`;
  const advLabel = isAdvancedSearchActive() ? ' · 高级搜索' : '';
  byId('viewTitle').textContent = `${viewName}${folderLabel}${advLabel}`;
  const titleIcon = byId('viewTitleIcon');
  if (titleIcon) titleIcon.innerHTML = iconSvg(currentViewHeaderIconName(), { title: viewName });
  const openViewBtn = byId('viewOpenBrowserBtn');
  if (openViewBtn) {
    openViewBtn.classList.toggle('hidden', false);
  }
  const pageCheckbox = byId('viewSelectPageCheckbox');
  if (pageCheckbox) {
    const visibleIds = (state.bookmarks || []).map((x) => String(x.id));
    const selectedVisibleCount = visibleIds.reduce((n, id) => n + (state.selected.has(id) ? 1 : 0), 0);
    pageCheckbox.disabled = visibleIds.length === 0;
    pageCheckbox.checked = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
    pageCheckbox.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length;
    pageCheckbox.setAttribute('aria-label', pageCheckbox.checked ? '取消选择当前页' : '选择当前页');
    pageCheckbox.title = pageCheckbox.checked ? '取消选择当前页' : '选择当前页';
  }
  const selectedCount = state.selected.size;
  const parts = [`${state.page?.total ?? state.bookmarks.length} 条`, `已选 ${selectedCount}`];
  if (isAdvancedSearchActive() && advancedSearchState.lastResultMeta?.usedFullText) parts.push('全文索引');
  byId('viewMeta').textContent = parts.join(' · ');
  const bulkBar = byId('bulkActionsBar');
  const bulkCount = byId('bulkSelectionCount');
  if (bulkBar) bulkBar.classList.toggle('hidden', selectedCount <= 0);
  if (bulkCount) bulkCount.textContent = `已选 ${selectedCount} 项`;
  renderBookmarkLayoutSwitch();
  renderListColumnsMenu();
  renderHeaderMenuControls();
  renderAiFolderSummaryDialogUi();
}

function renderBookmarkLayoutSwitch() {
  const root = byId('bookmarkLayoutSwitch');
  if (!root) return;
  const iconByMode = {
    list: 'list',
    card: 'grid',
    headline: 'headline',
    moodboard: 'board'
  };
  root.querySelectorAll('[data-layout-mode]').forEach((el) => {
    const mode = String(el.dataset.layoutMode || '');
    const label = String(el.dataset.layoutLabel || el.textContent || '').trim();
    if (!el.dataset.iconHydrated) {
      el.dataset.layoutLabel = label;
      el.innerHTML = `${iconSvg(iconByMode[mode] || 'grid')}<span class="sr-only">${escapeHtml(label)}</span>`;
      el.setAttribute('title', label);
      el.setAttribute('aria-label', label);
      el.dataset.iconHydrated = '1';
    }
    const active = String(el.dataset.layoutMode || '') === bookmarkLayoutMode;
    el.classList.toggle('active', active);
    el.setAttribute('aria-pressed', String(active));
  });
}

function renderPager() {
  const page = state.page || { page: 1, totalPages: 1, total: state.bookmarks.length, hasPrev: false, hasNext: false, pageSize: 24 };
  byId('pagerMeta').textContent = `${page.total || 0} 条`;
  byId('pageLabel').textContent = `第 ${page.page || 1} / ${page.totalPages || 1} 页`;
  byId('prevPageBtn').disabled = !page.hasPrev;
  byId('nextPageBtn').disabled = !page.hasNext;
  byId('pageSizeSelect').value = String(page.pageSize || state.filters.pageSize || 24);
}

function cardMetadataStatusHtml(item) {
  const meta = item?.metadata || {};
  const raw = String(meta.status || '').trim();
  if (!raw) return '';

  let label = raw;
  let tone = 'neutral';
  if (raw === 'success') {
    label = '元数据成功';
    tone = 'success';
  } else if (raw === 'failed') {
    label = '元数据失败';
    tone = 'danger';
  } else if (raw === 'fetching') {
    label = '抓取元数据中';
    tone = 'info';
  } else if (raw === 'queued') {
    label = '元数据排队中';
    tone = 'neutral';
  } else if (raw === 'retry_scheduled') {
    label = '元数据重试';
    tone = 'warn';
  }

  let detail = '';
  if (raw === 'retry_scheduled' && meta.nextRetryAt) {
    detail = `下次 ${new Date(Number(meta.nextRetryAt)).toLocaleTimeString()}`;
  } else if (raw === 'failed' && meta.error) {
    detail = String(meta.error);
  } else if (raw === 'success' && meta.fetchedAt) {
    detail = new Date(Number(meta.fetchedAt)).toLocaleTimeString();
  }

  return `<div class="card-meta">
    <span class="meta-chip type">${escapeHtml(kindLabel(inferItemKind(item)))}</span>
    <span class="meta-chip ${tone}">${escapeHtml(label)}</span>
    ${detail ? `<span class="muted">${escapeHtml(detail)}</span>` : ''}
  </div>`;
}

function bookmarkFaviconUrl(item) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostFromUrl(item.url))}&sz=64`;
}

function bookmarkCoverUrl(item) {
  return String(item.cover || item?.metadata?.image || '').trim();
}

function bookmarkFlagsText(item) {
  return `${item.favorite ? '★' : ''}${item.archived ? '📦' : ''}${item.read ? '' : '🟢'}`;
}

function bookmarkTimeText(item) {
  const ts = Number(item.updatedAt || item.createdAt || 0) || 0;
  return ts ? new Date(ts).toLocaleString() : '';
}

function bookmarkListDateText(item) {
  const ts = Number(item.updatedAt || item.createdAt || 0) || 0;
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }).replace(/\s+/g, '');
  } catch (_err) {
    return new Date(ts).toLocaleDateString();
  }
}

function bookmarkTagsHtml(item, { max = 4, className = 'card-tag' } = {}) {
  return (item.tags || [])
    .slice(0, max)
    .map((t) => `<span class="${className}">#${escapeHtml(t)}</span>`)
    .join('');
}

function bookmarkActionButtonHtml({ dataAttr, id, label, icon, iconOnly = false, className = 'ghost', hidden = false }) {
  const attrs = [`type="button"`, `class="${className}${hidden ? ' hidden' : ''}"`, `${dataAttr}="${escapeHtml(String(id || ''))}"`];
  if (iconOnly) attrs.push(`title="${escapeHtml(label)}"`, `aria-label="${escapeHtml(label)}"`);
  const content = iconOnly
    ? `${iconSvg(icon, { title: label })}<span class="sr-only">${escapeHtml(label)}</span>`
    : escapeHtml(label);
  return `<button ${attrs.join(' ')}>${content}</button>`;
}

function bookmarkActionButtonsHtml(item, { compact = false, iconOnly = false } = {}) {
  const btnClass = `ghost${iconOnly ? ' icon-action-btn' : ''}`;
  const out = [];
  if (!compact) {
    out.push(bookmarkActionButtonHtml({ dataAttr: 'data-open-current', id: item.id, label: '直接打开', icon: 'click', iconOnly, className: btnClass }));
    out.push(bookmarkActionButtonHtml({ dataAttr: 'data-open', id: item.id, label: '新标签页打开', icon: 'open', iconOnly, className: btnClass }));
    out.push(bookmarkActionButtonHtml({ dataAttr: 'data-preview-card', id: item.id, label: '预览模式', icon: 'preview', iconOnly, className: btnClass }));
    out.push(bookmarkActionButtonHtml({ dataAttr: 'data-preview-web', id: item.id, label: 'Web 预览', icon: 'web', iconOnly, className: btnClass }));
    out.push(bookmarkActionButtonHtml({ dataAttr: 'data-copy-link', id: item.id, label: '复制链接', icon: 'copy', iconOnly, className: btnClass }));
    out.push(bookmarkActionButtonHtml({ dataAttr: 'data-ask-item', id: item.id, label: '询问', icon: 'ai', iconOnly, className: btnClass }));
  }
  out.push(bookmarkActionButtonHtml({ dataAttr: 'data-favorite', id: item.id, label: item.favorite ? '取消收藏' : '收藏', icon: item.favorite ? 'unfavorite' : 'favorite', iconOnly, className: btnClass }));
  if (!compact) {
    out.push(bookmarkActionButtonHtml({ dataAttr: 'data-edit-tags', id: item.id, label: '标签', icon: 'tag', iconOnly, className: btnClass }));
    out.push(bookmarkActionButtonHtml({ dataAttr: 'data-edit-item', id: item.id, label: '编辑', icon: 'edit', iconOnly, className: btnClass }));
  }
  out.push(bookmarkActionButtonHtml({ dataAttr: 'data-delete', id: item.id, label: '删除', icon: 'delete', iconOnly, className: `ghost${iconOnly ? ' icon-action-btn danger' : 'ghost danger'}`, hidden: Boolean(item.deletedAt) }));
  out.push(bookmarkActionButtonHtml({ dataAttr: 'data-restore', id: item.id, label: '恢复', icon: 'restore', iconOnly, className: btnClass, hidden: !item.deletedAt }));
  return out.join('');
}

function moodboardSizeClass(item) {
  const coverUrl = bookmarkCoverUrl(item);
  const excerptLen = String(itemExcerpt(item) || '').length;
  if (!coverUrl) return excerptLen > 120 ? 'board-no-cover-tall' : 'board-no-cover';
  if (excerptLen > 180) return 'board-cover-tall';
  if (excerptLen > 80) return 'board-cover-medium';
  return 'board-cover';
}

function cardHtml(item) {
  const active = state.activeId === item.id ? 'active' : '';
  const selected = state.selected.has(item.id) ? 'checked' : '';
  const selectedClass = state.selected.has(item.id) ? 'selected' : '';
  const tags = bookmarkTagsHtml(item);
  const excerpt = itemExcerpt(item);
  const note = excerpt ? `<div class="card-note">${escapeHtml(excerpt)}</div>` : '';
  const favicon = bookmarkFaviconUrl(item);
  const metaStatus = cardMetadataStatusHtml(item);
  const coverUrl = bookmarkCoverUrl(item);
  const cover = coverUrl
    ? `<button type="button" class="card-cover" data-preview-card="${item.id}" title="预览">
        <img src="${escapeHtml(coverUrl)}" alt="cover" loading="lazy" />
      </button>`
    : '';
  const previewTitle = `<button type="button" class="card-title-link" data-preview-card="${item.id}" title="打开预览">${escapeHtml(item.title)}</button>`;
  const timeText = bookmarkTimeText(item);

  return `<article class="card ${active} ${selectedClass}" data-id="${item.id}">
    ${cover}
    <div class="card-top">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <label><input type="checkbox" data-select="${item.id}" ${selected}/> 选择</label>
        <span>${bookmarkFlagsText(item)}</span>
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-top:8px">
        <img alt="icon" src="${favicon}" width="18" height="18" />
        <span class="host">${escapeHtml(hostFromUrl(item.url))}</span>
        ${timeText ? `<span class="muted">${escapeHtml(timeText)}</span>` : ''}
      </div>
    </div>
    <div class="card-body">
      <div class="card-title">${previewTitle}</div>
      ${note}
      ${metaStatus}
      <div class="card-tags">${tags}</div>
      <div class="card-actions">
        <div class="card-actions-inline">
          ${bookmarkActionButtonHtml({ dataAttr: 'data-preview-card', id: item.id, label: '预览', icon: 'preview', iconOnly: true, className: 'ghost icon-action-btn' })}
          ${bookmarkActionButtonsHtml(item, { compact: true, iconOnly: true })}
        </div>
      </div>
    </div>
  </article>`;
}

function listRowHtml(item) {
  const active = state.activeId === item.id ? 'active' : '';
  const selected = state.selected.has(item.id) ? 'checked' : '';
  const selectedClass = state.selected.has(item.id) ? 'selected' : '';
  const excerpt = itemExcerpt(item);
  const tags = bookmarkTagsHtml(item, { max: 3, className: 'row-tag' });
  const coverUrl = bookmarkCoverUrl(item);
  const host = hostFromUrl(item.url);
  const metaStatus = cardMetadataStatusHtml(item);
  const timeText = bookmarkListDateText(item);
  const folderLabel = folderName(item.folderId || 'root');
  const kind = kindLabel(inferItemKind(item));
  const showFolder = Boolean(listColumns.folder);
  const showType = Boolean(listColumns.type);
  const showExcerpt = Boolean(listColumns.excerpt);
  const showTags = Boolean(listColumns.tags);
  const showTime = Boolean(listColumns.time);
  const rowFlags = `${item.favorite ? '★' : ''}${item.archived ? '📦' : ''}`;
  const folderPart = showFolder
    ? `<span class="subline-part subline-folder"><span class="subline-icon" aria-hidden="true">${iconSvg(item.folderId === 'root' ? 'folder' : 'folder')}</span><span class="muted">${escapeHtml(folderLabel)}</span></span>`
    : '';
  const hostPart = `<span class="subline-part subline-host"><span class="host">${escapeHtml(host)}</span></span>`;
  const timePart = showTime && timeText
    ? `<span class="subline-part subline-time"><span class="muted">${escapeHtml(timeText)}</span></span>`
    : '';
  const typePart = showType
    ? `<span class="subline-part subline-type"><span class="muted">${escapeHtml(kind)}</span></span>`
    : '';
  const subParts = [folderPart, hostPart, timePart, typePart].filter(Boolean);
  const sublineHtml = subParts
    .map((part, idx) => (idx === 0 ? part : `<span class="bookmark-row-sep">•</span>${part}`))
    .join('');
  const kindIcon = inferItemKind(item) === 'pdf'
    ? 'type'
    : inferItemKind(item) === 'image'
      ? 'image'
      : inferItemKind(item) === 'video'
        ? 'preview'
        : 'web';
  const thumbInner = coverUrl
    ? `<span class="bookmark-row-thumb-placeholder" aria-hidden="true">${iconSvg(kindIcon)}</span>
       <img data-row-thumb-img="${item.id}" src="${escapeHtml(coverUrl)}" alt="cover" loading="lazy" />`
    : `<span class="bookmark-row-thumb-fallback" aria-hidden="true">
         <span class="bookmark-row-thumb-fallback-icon">${iconSvg(kindIcon)}</span>
         <img class="bookmark-row-thumb-favicon" alt="" src="${bookmarkFaviconUrl(item)}" width="16" height="16" loading="lazy" />
       </span>`;
  return `<article class="bookmark-row ${active} ${selectedClass}" data-id="${item.id}">
    <label class="bookmark-row-select"><input type="checkbox" data-select="${item.id}" ${selected}/> <span>选择</span></label>
    <button type="button" class="bookmark-row-thumb ${coverUrl ? 'has-cover is-loading' : 'no-cover'}" data-preview-card="${item.id}" title="打开预览" data-thumb-kind="${escapeHtml(inferItemKind(item))}">
      ${thumbInner}
    </button>
    <div class="bookmark-row-main">
      <div class="bookmark-row-titleline">
        <button type="button" class="row-title-link" data-preview-card="${item.id}" title="打开预览">${escapeHtml(item.title)}</button>
        ${rowFlags ? `<span class="row-flags">${escapeHtml(rowFlags)}</span>` : ''}
      </div>
      <div class="bookmark-row-subline">${sublineHtml}</div>
      ${showExcerpt && excerpt ? `<div class="bookmark-row-excerpt">${escapeHtml(excerpt)}</div>` : ''}
      <div class="bookmark-row-bottom">
        ${metaStatus}
      </div>
    </div>
    <div class="bookmark-row-side">
      ${showTags && tags ? `<div class="bookmark-row-tags">${tags}</div>` : '<div class="bookmark-row-tags empty"></div>'}
      <div class="bookmark-row-time muted"></div>
      <div class="bookmark-row-actions">${bookmarkActionButtonsHtml(item, { iconOnly: true })}</div>
    </div>
    <div class="bookmark-row-mobile-bottom">
      ${showTags && tags ? `<div class="bookmark-row-tags">${tags}</div>` : ''}
      <div class="bookmark-row-actions">${bookmarkActionButtonsHtml(item, { compact: true })}</div>
    </div>
  </article>`;
}

function headlineHtml(item) {
  const active = state.activeId === item.id ? 'active' : '';
  const selected = state.selected.has(item.id) ? 'checked' : '';
  const selectedClass = state.selected.has(item.id) ? 'selected' : '';
  const host = hostFromUrl(item.url);
  const timeText = bookmarkTimeText(item);
  const kind = kindLabel(inferItemKind(item));
  const folderLabel = folderName(item.folderId || 'root');
  return `<article class="bookmark-headline ${active} ${selectedClass}" data-id="${item.id}">
    <label class="bookmark-headline-select"><input type="checkbox" data-select="${item.id}" ${selected}/></label>
    <img alt="icon" src="${bookmarkFaviconUrl(item)}" width="16" height="16" />
    <button type="button" class="bookmark-headline-title" data-preview-card="${item.id}" title="打开预览">${escapeHtml(item.title)}</button>
    <div class="bookmark-headline-meta muted">
      <span>${escapeHtml(host)}</span>
      <span>${escapeHtml(folderLabel)}</span>
      <span>${escapeHtml(kind)}</span>
      ${timeText ? `<span>${escapeHtml(timeText)}</span>` : ''}
      ${item.favorite ? '<span>★</span>' : ''}
      ${item.archived ? '<span>📦</span>' : ''}
    </div>
    <div class="bookmark-headline-actions">${bookmarkActionButtonsHtml(item, { compact: true, iconOnly: true })}</div>
  </article>`;
}

function moodboardFetchLabel(item) {
  const status = String(item?.metadata?.status || '').trim();
  if (status === 'queued' || status === 'fetching' || status === 'retry_scheduled') return '首页预览抓取中';
  if (status === 'failed') return '重试首页预览';
  return '拉取首页预览';
}

function moodboardHtml(item) {
  const active = state.activeId === item.id ? 'active' : '';
  const selected = state.selected.has(item.id) ? 'checked' : '';
  const selectedClass = state.selected.has(item.id) ? 'selected' : '';
  const coverUrl = bookmarkCoverUrl(item);
  const host = hostFromUrl(item.url);
  const excerpt = itemExcerpt(item);
  const title = escapeHtml(item.title || host || '未命名');
  const bg = coverUrl
    ? `<img src="${escapeHtml(coverUrl)}" alt="cover" loading="lazy" />`
    : `<div class="bookmark-board-fallback">
        <img alt="icon" src="${bookmarkFaviconUrl(item)}" width="28" height="28" />
        <div>${escapeHtml(host || '网页')}</div>
      </div>`;
  return `<article class="bookmark-board ${moodboardSizeClass(item)} ${active} ${selectedClass}" data-id="${item.id}">
    <button type="button" class="bookmark-board-media" data-preview-card="${item.id}" title="打开预览">${bg}</button>
    <div class="bookmark-board-overlay">
      <div class="bookmark-board-top">
        <label><input type="checkbox" data-select="${item.id}" ${selected}/> 选择</label>
        <span>${escapeHtml(bookmarkFlagsText(item))}</span>
      </div>
      <button type="button" class="bookmark-board-title" data-preview-card="${item.id}">${title}</button>
      <div class="bookmark-board-meta">
        <span>${escapeHtml(host)}</span>
        <span>${escapeHtml(kindLabel(inferItemKind(item)))}</span>
      </div>
      ${excerpt ? `<div class="bookmark-board-excerpt">${escapeHtml(excerpt)}</div>` : ''}
      <div class="bookmark-board-actions">
        ${coverUrl ? `<button class="ghost" data-preview-card="${item.id}">预览</button>` : `<button class="ghost" data-fetch-home-preview="${item.id}">${escapeHtml(moodboardFetchLabel(item))}</button>`}
        <button class="ghost" data-open="${item.id}">打开</button>
        <button class="ghost" data-favorite="${item.id}">${item.favorite ? '取消收藏' : '收藏'}</button>
      </div>
    </div>
  </article>`;
}

function bookmarkItemHtml(item) {
  if (bookmarkLayoutMode === 'card') return cardHtml(item);
  if (bookmarkLayoutMode === 'headline') return headlineHtml(item);
  if (bookmarkLayoutMode === 'moodboard') return moodboardHtml(item);
  return listRowHtml(item);
}

function isTypingContext(target) {
  const el = target instanceof HTMLElement ? target : document.activeElement;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = String(el.tagName || '').toLowerCase();
  return ['input', 'textarea', 'select'].includes(tag);
}

function hasModalOpen() {
  return Boolean(document.querySelector('dialog[open]'));
}

function isVisibleFocusable(el) {
  if (!(el instanceof HTMLElement)) return false;
  if (el.hidden) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  if (el.matches('[disabled], [inert]')) return false;
  if (el.closest('.hidden')) return false;
  return el.getClientRects().length > 0;
}

function focusableElementsWithin(root) {
  if (!(root instanceof HTMLElement)) return [];
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');
  return Array.from(root.querySelectorAll(selector)).filter(isVisibleFocusable);
}

function isDetailDrawerFocusTrapActive() {
  if (!state.activeId) return false;
  if (hasModalOpen()) return false;
  if (window.innerWidth < 1281) return false;
  const shell = document.querySelector('.shell');
  return Boolean(shell?.classList.contains('detail-panel-open'));
}

function trapDetailDrawerTabFocus(e) {
  if (e.key !== 'Tab' || e.defaultPrevented) return false;
  if (!isDetailDrawerFocusTrapActive()) return false;
  const drawer = document.querySelector('.shell .detail');
  if (!(drawer instanceof HTMLElement)) return false;
  const focusables = focusableElementsWithin(drawer);
  if (!focusables.length) return false;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const activeEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const targetEl = e.target instanceof HTMLElement ? e.target : activeEl;
  const inside = Boolean(targetEl && drawer.contains(targetEl));

  if (!inside) {
    e.preventDefault();
    (e.shiftKey ? last : first)?.focus();
    return true;
  }

  if (!e.shiftKey && activeEl === last) {
    e.preventDefault();
    first?.focus();
    return true;
  }
  if (e.shiftKey && activeEl === first) {
    e.preventDefault();
    last?.focus();
    return true;
  }
  return false;
}

function menuItemsWithin(menu) {
  if (!(menu instanceof HTMLElement)) return [];
  return Array.from(menu.querySelectorAll('[role="menuitem"]')).filter(isVisibleFocusable);
}

function handleMenuArrowNavigation(e) {
  if (e.defaultPrevented) return false;
  const target = e.target instanceof HTMLElement ? e.target : null;
  if (!target) return false;
  const item = target.closest('[role="menuitem"]');
  const menu = item?.closest?.('[role="menu"]');
  if (!(item instanceof HTMLElement) || !(menu instanceof HTMLElement)) return false;
  const items = menuItemsWithin(menu);
  if (!items.length) return false;
  const currentIndex = Math.max(0, items.indexOf(item));
  let nextIndex = -1;
  if (e.key === 'ArrowDown') nextIndex = (currentIndex + 1) % items.length;
  if (e.key === 'ArrowUp') nextIndex = (currentIndex - 1 + items.length) % items.length;
  if (e.key === 'Home') nextIndex = 0;
  if (e.key === 'End') nextIndex = items.length - 1;
  if (nextIndex < 0) return false;
  e.preventDefault();
  items[nextIndex]?.focus();
  return true;
}

function visibleBookmarkIds() {
  return (state.bookmarks || []).map((x) => String(x.id));
}

function moveActiveBookmark(step = 1) {
  const ids = visibleBookmarkIds();
  if (!ids.length) return;
  const current = String(state.activeId || '');
  const idx = Math.max(0, ids.indexOf(current));
  const nextIdx = current ? Math.min(ids.length - 1, Math.max(0, idx + step)) : 0;
  const nextId = ids[nextIdx];
  store.setActiveId(nextId);
  renderCards();
  renderDetail();
  const activeEl = document.querySelector(`[data-id="${CSS.escape(String(nextId))}"]`);
  activeEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

async function toggleFavoriteForActiveBookmark() {
  if (!state.activeId) return;
  const item = state.bookmarks.find((x) => x.id === state.activeId) || state.allBookmarks.find((x) => x.id === state.activeId);
  if (!item || item.deletedAt) return;
  await api(`/api/bookmarks/${item.id}`, {
    method: 'PUT',
    body: JSON.stringify({ favorite: !Boolean(item.favorite) })
  });
  await refreshAll();
  showToast(item.favorite ? '已取消收藏' : '已加入收藏', { timeoutMs: 2200 });
}

function showShortcutHelp() {
  showToast('快捷键：/ 或 Cmd/Ctrl+K 搜索 · j/k 切换 · o/p 预览 · e 编辑 · f 收藏 · a 新建书签 · Shift+A 新建集合 · r 刷新 · Delete 删除 · Esc 关闭', { timeoutMs: 6200 });
}

function clearSearchInputApplyTimer() {
  if (searchInputApplyTimer) {
    clearTimeout(searchInputApplyTimer);
    searchInputApplyTimer = null;
  }
}

async function applySearchInputFilterNow({ remember = false, force = false } = {}) {
  clearSearchInputApplyTimer();
  const input = byId('searchInput');
  const next = String(input?.value || '').trim();
  const prev = String(state.filters.q || '').trim();
  const changed = next !== prev;
  if (changed) {
    store.setFilter('q', next);
    advancedSearchState.activeSavedId = '';
    store.setFilter('page', 1);
  }
  if (remember) rememberRecentSearch(next);
  if (!changed && !force) {
    if (document.activeElement === input) setSearchSuggestOpen(true);
    return;
  }
  try {
    await loadBookmarks();
    renderSidebar();
  } catch (err) {
    showToast(err?.message || '搜索失败', { timeoutMs: 3000 });
  }
  if (document.activeElement === input) setSearchSuggestOpen(true);
}

function scheduleSearchInputFilterApply() {
  clearSearchInputApplyTimer();
  searchInputApplyTimer = setTimeout(() => {
    void applySearchInputFilterNow();
  }, SEARCH_INPUT_DEBOUNCE_MS);
}

function skeletonCardsHtml() {
  const count = bookmarkLayoutMode === 'headline' ? 10 : bookmarkLayoutMode === 'list' ? 8 : 6;
  if (bookmarkLayoutMode === 'list') {
    return new Array(count).fill(0).map(() => `
      <div class="bookmark-row skeleton-row" aria-hidden="true">
        <div class="skeleton skeleton-check"></div>
        <div class="skeleton skeleton-thumb"></div>
        <div class="skeleton-row-main">
          <div class="skeleton skeleton-line w-70"></div>
          <div class="skeleton skeleton-line w-50"></div>
          <div class="skeleton skeleton-line w-90"></div>
        </div>
        <div class="skeleton-row-side">
          <div class="skeleton skeleton-line w-40"></div>
          <div class="skeleton skeleton-line w-30"></div>
        </div>
      </div>`).join('');
  }
  if (bookmarkLayoutMode === 'headline') {
    return new Array(count).fill(0).map(() => `
      <div class="bookmark-headline skeleton-headline" aria-hidden="true">
        <div class="skeleton skeleton-check"></div>
        <div class="skeleton skeleton-dot"></div>
        <div class="skeleton skeleton-line w-60"></div>
        <div class="skeleton skeleton-line w-35"></div>
        <div class="skeleton skeleton-line w-20"></div>
      </div>`).join('');
  }
  return new Array(count).fill(0).map(() => `
    <article class="${bookmarkLayoutMode === 'moodboard' ? 'bookmark-board board-no-cover skeleton-board' : 'card skeleton-card'}" aria-hidden="true">
      <div class="skeleton skeleton-cover"></div>
      <div class="skeleton-card-body">
        <div class="skeleton skeleton-line w-75"></div>
        <div class="skeleton skeleton-line w-45"></div>
        <div class="skeleton skeleton-line w-90"></div>
      </div>
    </article>`).join('');
}

function emptyCardsStateHtml() {
  if (bookmarksLoadError) {
    return `<div class="empty-state error">
      <div class="empty-state-title">加载书签失败</div>
      <div class="muted">${escapeHtml(bookmarksLoadError)}</div>
      <div class="empty-state-actions"><button type="button" class="ghost" id="cardsRetryBtn">重试</button></div>
    </div>`;
  }
  return `<div class="empty-state">
    <div class="empty-state-title">当前视图暂无书签</div>
    <div class="muted">你可以切换筛选、切换集合，或新建书签。</div>
  </div>`;
}

function canUseListVirtualization(root = byId('cards')) {
  if (!root) return false;
  if (bookmarkLayoutMode !== 'list') return false;
  if (bookmarksLoading || bookmarksLoadError) return false;
  if (window.innerWidth <= 920) return false;
  return (state.bookmarks || []).length >= LIST_VIRTUAL_THRESHOLD;
}

function listVirtualWindow(root, totalItems) {
  const count = Math.max(0, Number(totalItems || 0));
  if (!count) return { start: 0, end: 0, topPad: 0, bottomPad: 0 };
  const rect = root.getBoundingClientRect();
  const rootTop = rect.top + window.scrollY;
  const viewportTop = window.scrollY;
  const viewportBottom = viewportTop + window.innerHeight;
  const visibleTop = Math.max(0, viewportTop - rootTop);
  const visibleBottom = Math.max(0, viewportBottom - rootTop);
  const start = Math.max(0, Math.floor(visibleTop / LIST_VIRTUAL_ROW_HEIGHT) - LIST_VIRTUAL_OVERSCAN);
  const end = Math.min(count, Math.ceil(visibleBottom / LIST_VIRTUAL_ROW_HEIGHT) + LIST_VIRTUAL_OVERSCAN);
  const safeEnd = Math.max(start + 1, end);
  const topPad = start * LIST_VIRTUAL_ROW_HEIGHT;
  const bottomPad = Math.max(0, (count - safeEnd) * LIST_VIRTUAL_ROW_HEIGHT);
  return { start, end: safeEnd, topPad, bottomPad };
}

function renderCardsHtml(root) {
  if (!canUseListVirtualization(root)) {
    root.classList.remove('is-virtualized');
    delete root.dataset.virtualCount;
    delete root.dataset.virtualStart;
    delete root.dataset.virtualEnd;
    return (state.bookmarks || []).map(bookmarkItemHtml).join('');
  }
  root.classList.add('is-virtualized');
  const items = state.bookmarks || [];
  const win = listVirtualWindow(root, items.length);
  root.dataset.virtualCount = String(items.length);
  const visible = items.slice(win.start, win.end).map(bookmarkItemHtml).join('');
  root.dataset.virtualStart = String(win.start);
  root.dataset.virtualEnd = String(win.end);
  return `${win.topPad ? `<div class="list-virtual-spacer" style="height:${win.topPad}px" aria-hidden="true"></div>` : ''}${visible}${win.bottomPad ? `<div class="list-virtual-spacer" style="height:${win.bottomPad}px" aria-hidden="true"></div>` : ''}`;
}

function scheduleListVirtualRender() {
  if (listVirtualRenderRaf) return;
  listVirtualRenderRaf = window.requestAnimationFrame(() => {
    listVirtualRenderRaf = 0;
    const root = byId('cards');
    if (!canUseListVirtualization(root)) return;
    const total = (state.bookmarks || []).length;
    const win = listVirtualWindow(root, total);
    if (
      String(root.dataset.virtualCount || '') === String(total)
      && String(root.dataset.virtualStart || '') === String(win.start)
      && String(root.dataset.virtualEnd || '') === String(win.end)
    ) return;
    renderCards();
  });
}

function scheduleCollectionsTreeVirtualRender() {
  if (collectionsTreeVirtualRenderRaf) return;
  collectionsTreeVirtualRenderRaf = window.requestAnimationFrame(() => {
    collectionsTreeVirtualRenderRaf = 0;
    if (draggedFolderId) return;
    const tree = byId('collectionsTree');
    if (!tree) return;
    const maybeLarge = (state.folders || []).length >= COLLECTIONS_TREE_VIRTUAL_THRESHOLD;
    if (!maybeLarge && !tree.classList.contains('is-virtualized')) return;
    if (tree.classList.contains('is-virtualized')) {
      const total = Number(tree.dataset.virtualCount || 0);
      if (total > 0) {
        const win = collectionsTreeVirtualWindow(tree, total);
        if (
          String(tree.dataset.virtualStart || '') === String(win.start)
          && String(tree.dataset.virtualEnd || '') === String(win.end)
        ) return;
      }
    }
    renderCollectionsTreeSection();
  });
}

function renderCards() {
  const root = byId('cards');
  if (!root) return;
  root.className = `cards layout-${bookmarkLayoutMode}`;
  root.classList.toggle('is-loading', bookmarksLoading);
  if (bookmarksLoading) {
    root.innerHTML = skeletonCardsHtml();
    return;
  }
  if (!state.bookmarks.length) {
    root.innerHTML = emptyCardsStateHtml();
    byId('cardsRetryBtn')?.addEventListener('click', async () => {
      await loadBookmarks();
    });
    return;
  }
  root.innerHTML = renderCardsHtml(root);

  root.querySelectorAll('[data-id]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.closest('input[type="checkbox"]')) return;
      store.setActiveId(el.dataset.id);
      renderCards();
      renderDetail();
    });
  });

  root.querySelectorAll('[data-preview-card]').forEach((el) => {
    el.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = el.dataset.previewCard;
      if (!id) return;
      store.setActiveId(id);
      renderCards();
      renderDetail();
      await open预览Dialog(id, { preferredMode: 'auto' });
    });
  });

  root.querySelectorAll('img[data-row-thumb-img]').forEach((img) => {
    const thumbBtn = img.closest('.bookmark-row-thumb');
    if (!thumbBtn) return;
    const markLoaded = () => {
      thumbBtn.classList.remove('is-loading', 'is-error');
      thumbBtn.classList.add('is-loaded');
    };
    const markError = () => {
      thumbBtn.classList.remove('is-loading');
      thumbBtn.classList.add('is-error');
      img.removeAttribute('src');
    };
    if (img.complete && img.naturalWidth > 0) {
      markLoaded();
    } else if (img.complete && img.naturalWidth === 0) {
      markError();
    } else {
      img.addEventListener('load', markLoaded, { once: true });
      img.addEventListener('error', markError, { once: true });
    }
  });

  root.querySelectorAll('[data-fetch-home-preview]').forEach((el) => {
    el.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = el.dataset.fetchHomePreview;
      if (!id) return;
      try {
        await api(`/api/bookmarks/${id}/metadata/fetch`, { method: 'POST' });
        showToast('已加入首页预览抓取队列', { timeoutMs: 2500 });
        await loadBookmarks();
      } catch (err) {
        showToast(err.message || '拉取首页预览失败', { timeoutMs: 4000 });
      }
    });
  });

  root.querySelectorAll('[data-select]').forEach((el) => {
    el.addEventListener('change', () => {
      const id = el.dataset.select;
      store.setSelected(id, el.checked);
      renderHeader();
      renderCards();
    });
  });

  root.querySelectorAll('[data-open]').forEach((el) => {
    el.addEventListener('click', async () => {
      const id = el.dataset.open;
      const bm = state.bookmarks.find((x) => x.id === id) || state.allBookmarks.find((x) => x.id === id);
      if (!bm) return;
      window.open(bm.url, '_blank', 'noopener');
      await api(`/api/bookmarks/${id}/opened`, { method: 'POST' });
      await refreshAll();
    });
  });

  root.querySelectorAll('[data-open-current]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.dataset.openCurrent;
      const bm = state.bookmarks.find((x) => x.id === id) || state.allBookmarks.find((x) => x.id === id);
      if (!bm) return;
      window.location.assign(String(bm.url || ''));
    });
  });

  root.querySelectorAll('[data-preview-web]').forEach((el) => {
    el.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = el.dataset.previewWeb;
      if (!id) return;
      store.setActiveId(id);
      renderCards();
      renderDetail();
      await open预览Dialog(id, { preferredMode: 'web' });
    });
  });

  root.querySelectorAll('[data-copy-link]').forEach((el) => {
    el.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = el.dataset.copyLink;
      const bm = state.bookmarks.find((x) => x.id === id) || state.allBookmarks.find((x) => x.id === id);
      if (!bm?.url) return;
      const ok = await copyTextToClipboard(String(bm.url));
      showToast(ok ? '链接已复制' : String(bm.url), { timeoutMs: ok ? 1800 : 4000 });
    });
  });

  root.querySelectorAll('[data-ask-item]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = String(el.dataset.askItem || '');
      if (!id) return;
      store.setActiveId(id);
      renderCards();
      renderDetail();
      openAiQaDialog({ bookmarkId: id, scope: 'auto' });
    });
  });

  root.querySelectorAll('[data-edit-item]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = String(el.dataset.editItem || '');
      if (!id) return;
      store.setActiveId(id);
      renderCards();
      renderDetail();
      setDetailEditMode(true);
      queueMicrotask(() => byId('detailTitle')?.focus?.());
    });
  });

  root.querySelectorAll('[data-edit-tags]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = String(el.dataset.editTags || '');
      if (!id) return;
      store.setActiveId(id);
      renderCards();
      renderDetail();
      setDetailEditMode(true);
      queueMicrotask(() => byId('detailTags')?.focus?.());
    });
  });

  root.querySelectorAll('[data-favorite]').forEach((el) => {
    el.addEventListener('click', async () => {
      const id = el.dataset.favorite;
      const bm = state.bookmarks.find((x) => x.id === id);
      if (!bm) return;
      await api(`/api/bookmarks/${id}`, { method: 'PUT', body: JSON.stringify({ favorite: !bm.favorite }) });
      await refreshAll();
    });
  });

  root.querySelectorAll('[data-delete]').forEach((el) => {
    el.addEventListener('click', async () => {
      await api(`/api/bookmarks/${el.dataset.delete}`, { method: 'DELETE' });
      await refreshAll();
    });
  });

  root.querySelectorAll('[data-restore]').forEach((el) => {
    el.addEventListener('click', async () => {
      await api(`/api/bookmarks/${el.dataset.restore}/restore`, { method: 'POST' });
      await refreshAll();
    });
  });
}

function renderDetailFolderOptions() {
  const select = byId('detailFolder');
  select.innerHTML = folderOptionsHtml('root');
}

function renderDialogsFolderOptions() {
  byId('newFolder').innerHTML = folderOptionsHtml('root');
  byId('newCollectionParent').innerHTML = folderParentOptionsHtml('root');
  populateIoFolderSelects();
}

function stopMetadataTaskPoll() {
  if (metadataTaskPollTimer) {
    clearInterval(metadataTaskPollTimer);
    metadataTaskPollTimer = null;
  }
}

function isMetadataTaskTerminal(status) {
  return ['succeeded', 'failed'].includes(String(status || ''));
}

function formatMetadataTaskInfo(task) {
  if (!task) return '元数据任务：无';
  const parts = [`元数据任务：${task.status || 'unknown'}`];
  if (task.attempt) parts.push(`尝试 ${task.attempt}/${task.maxAttempts || '?'}`);
  if (task.nextRunAt && String(task.status) === 'retry_scheduled') {
    parts.push(`下次重试：${new Date(Number(task.nextRunAt)).toLocaleTimeString()}`);
  }
  if (task.updatedAt) parts.push(`更新于：${new Date(Number(task.updatedAt)).toLocaleTimeString()}`);
  const msg = task.error?.message || task.lastError?.message || '';
  if (msg) parts.push(`错误：${msg}`);
  return parts.join(' · ');
}

function renderDetailFetchStatusSummary({ item = null, task = null } = {}) {
  const chipsEl = byId('detailFetchSummaryChips');
  const detailsEl = byId('detailFetchDetails');
  if (!chipsEl) return;
  if (!item) {
    chipsEl.innerHTML = '';
    if (detailsEl) detailsEl.open = false;
    return;
  }
  const chips = [];
  const metaStatus = String(item?.metadata?.status || '').trim();
  const articleStatus = String(item?.article?.status || '').trim();
  const taskStatus = String(task?.status || '').trim();
  if (metaStatus === 'success') chips.push('<span class="meta-chip success">元数据已抓取</span>');
  else if (metaStatus === 'failed') chips.push('<span class="meta-chip danger">元数据失败</span>');
  else if (metaStatus === 'fetching') chips.push('<span class="meta-chip info">元数据抓取中</span>');
  else if (metaStatus === 'queued') chips.push('<span class="meta-chip">元数据排队中</span>');
  if (taskStatus === 'retry_scheduled') chips.push('<span class="meta-chip warn">重试已排程</span>');

  if (articleStatus === 'success') chips.push('<span class="meta-chip success">正文已提取</span>');
  else if (articleStatus === 'failed') chips.push('<span class="meta-chip danger">正文提取失败</span>');
  else if (articleStatus === 'extracting') chips.push('<span class="meta-chip info">正文提取中</span>');
  else if (!articleStatus && String(item?.url || '').trim()) chips.push('<span class="meta-chip type">可提取正文</span>');
  if (item?.aiSuggestions?.readerSummary?.shortSummary) chips.push('<span class="meta-chip info">阅读摘要已生成</span>');

  if (previewActiveBookmarkId && String(previewActiveBookmarkId) === String(item.id || '')) {
    if (previewUiState === 'ready' && previewMode === 'reader') chips.push('<span class="meta-chip info">预览阅读模式中</span>');
    else if (previewUiState === 'ready') chips.push('<span class="meta-chip success">预览窗口已打开</span>');
  }

  chipsEl.innerHTML = chips.join('');
  if (detailsEl) {
    const hasError = [metaStatus, articleStatus, taskStatus].some((s) => ['failed', 'retry_scheduled'].includes(String(s || '')));
    if (hasError) detailsEl.open = true;
  }
}

function renderDetailReaderSummaryUi(item = null) {
  const infoEl = byId('detailReaderSummaryInfo');
  const boxEl = byId('detailReaderSummaryBox');
  const btn = byId('generateReaderSummaryBtn');
  if (!infoEl || !boxEl) return;
  if (!item) {
    infoEl.textContent = '';
    boxEl.classList.add('hidden');
    boxEl.innerHTML = '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'AI 阅读摘要';
    }
    return;
  }
  const articleStatus = String(item?.article?.status || '');
  const hasArticle = articleStatus === 'success' && String(item?.article?.textContent || '').trim();
  const summary = item?.aiSuggestions?.readerSummary && typeof item.aiSuggestions.readerSummary === 'object'
    ? item.aiSuggestions.readerSummary
    : null;
  const generatedAt = Number(summary?.generatedAt || item?.aiSuggestions?.readerSummaryGeneratedAt || 0) || 0;
  const provider = summary?.provider && typeof summary.provider === 'object' ? summary.provider : null;
  const providerText = provider?.providerType ? `${provider.providerType}${provider.model ? `/${provider.model}` : ''}` : '';
  const parts = [];
  if (hasArticle) parts.push('阅读摘要：可生成');
  else parts.push('阅读摘要：需先提取正文');
  if (generatedAt) parts.push(`生成于：${new Date(generatedAt).toLocaleString()}`);
  if (providerText) parts.push(`模型：${providerText}`);
  infoEl.textContent = parts.join(' · ');

  if (btn) {
    btn.disabled = !hasArticle || detailAiOperationBusy() || Boolean(item?.deletedAt);
    btn.textContent = detailAiReaderSummaryRunning ? 'AI 摘要生成中…' : 'AI 阅读摘要';
    btn.setAttribute('aria-busy', String(Boolean(detailAiReaderSummaryRunning)));
  }

  const shortSummary = String(summary?.shortSummary || '').trim();
  const whySave = String(summary?.whySave || '').trim();
  const keyPoints = Array.isArray(summary?.keyPoints) ? summary.keyPoints.map((x) => String(x || '').trim()).filter(Boolean) : [];
  if (!shortSummary && !whySave && !keyPoints.length) {
    boxEl.classList.add('hidden');
    boxEl.innerHTML = '';
    return;
  }
  boxEl.classList.remove('hidden');
  boxEl.innerHTML = `
    ${shortSummary ? `<div class="detail-ai-reader-summary-block"><div class="detail-ai-reader-summary-label">短摘要</div><div class="detail-ai-reader-summary-text">${escapeHtml(shortSummary)}</div></div>` : ''}
    ${keyPoints.length ? `<div class="detail-ai-reader-summary-block"><div class="detail-ai-reader-summary-label">关键要点</div><ul class="detail-ai-reader-summary-points">${keyPoints.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul></div>` : ''}
    ${whySave ? `<div class="detail-ai-reader-summary-block"><div class="detail-ai-reader-summary-label">适合收藏理由</div><div class="detail-ai-reader-summary-text">${escapeHtml(whySave)}</div></div>` : ''}
  `;
}

function setDetailPanelMoreMenuOpen(open) {
  detailPanelMoreMenuOpen = Boolean(open);
  const btn = byId('detailPanelMoreBtn');
  const menu = byId('detailPanelMoreMenu');
  if (btn) btn.setAttribute('aria-expanded', String(detailPanelMoreMenuOpen));
  if (menu) menu.classList.toggle('hidden', !detailPanelMoreMenuOpen);
}

function applyDetailSectionUi() {
  const form = byId('detailForm');
  if (!form) return;
  form.querySelectorAll('[data-detail-section-key]').forEach((section) => {
    const key = String(section.getAttribute('data-detail-section-key') || '');
    if (!key) return;
    const collapsed = Boolean(detailSectionsUi?.[key]);
    section.classList.toggle('collapsed', collapsed);
    section.setAttribute('data-collapsed', collapsed ? 'true' : 'false');
    const btn = section.querySelector(`[data-detail-section-toggle="${CSS.escape(key)}"]`);
    if (btn) {
      btn.setAttribute('aria-expanded', String(!collapsed));
      btn.title = collapsed ? '展开分区' : '折叠分区';
    }
    const caret = section.querySelector('.detail-section-caret');
    if (caret) caret.textContent = collapsed ? '▸' : '▾';
  });
}

function setDetailSectionCollapsed(key, collapsed) {
  const k = String(key || '').trim();
  if (!k) return;
  detailSectionsUi = { ...detailSectionsUi, [k]: Boolean(collapsed) };
  persistDetailSectionsUi();
  applyDetailSectionUi();
}

function toggleDetailSectionCollapsed(key) {
  const k = String(key || '').trim();
  if (!k) return;
  setDetailSectionCollapsed(k, !Boolean(detailSectionsUi?.[k]));
}

function detailPanelVisibleItems() {
  return state.bookmarks || [];
}

function detailPanelActiveIndex() {
  const ids = detailPanelVisibleItems().map((x) => String(x.id));
  const current = String(state.activeId || '');
  return ids.indexOf(current);
}

function updateDetailPanelHeadUi(item = null) {
  const modeBadge = byId('detailPanelModeBadge');
  const viewBtn = byId('detailPanelViewModeBtn');
  const editBtn = byId('detailPanelEditModeBtn');
  const prevBtn = byId('detailPrevBtn');
  const nextBtn = byId('detailNextBtn');
  const webBtn = byId('detailPanelWebBtn');
  const readerBtn = byId('detailPanelReaderBtn');
  const aiTagBtn = byId('detailHeaderAiTagBtn');
  const moreBtn = byId('detailPanelMoreBtn');
  const moreMenu = byId('detailPanelMoreMenu');
  const ids = detailPanelVisibleItems().map((x) => String(x.id));
  const idx = detailPanelActiveIndex();
  const hasItem = Boolean(item);
  const previewOpenForActive = Boolean(byId('previewDialog')?.open && previewActiveBookmarkId && String(previewActiveBookmarkId) === String(item?.id || ''));
  const aiBusy = detailAiOperationBusy();

  if (modeBadge) modeBadge.textContent = hasItem ? (detailEditMode ? '编辑模式' : '查看模式') : '未选择';
  if (viewBtn) {
    viewBtn.disabled = !hasItem;
    viewBtn.classList.toggle('active', hasItem && !detailEditMode);
    viewBtn.setAttribute('aria-pressed', String(Boolean(hasItem && !detailEditMode)));
    viewBtn.setAttribute('aria-selected', String(Boolean(hasItem && !detailEditMode)));
  }
  if (editBtn) {
    editBtn.disabled = !hasItem;
    editBtn.classList.toggle('active', hasItem && detailEditMode);
    editBtn.setAttribute('aria-pressed', String(Boolean(hasItem && detailEditMode)));
    editBtn.setAttribute('aria-selected', String(Boolean(hasItem && detailEditMode)));
  }
  if (prevBtn) prevBtn.disabled = !hasItem || idx <= 0;
  if (nextBtn) nextBtn.disabled = !hasItem || idx < 0 || idx >= ids.length - 1;
  if (webBtn) {
    webBtn.disabled = !hasItem;
    webBtn.classList.toggle('active', hasItem && previewOpenForActive && previewMode !== 'reader');
    webBtn.setAttribute('aria-pressed', String(Boolean(hasItem && previewOpenForActive && previewMode !== 'reader')));
  }
  if (readerBtn) {
    readerBtn.disabled = !hasItem;
    readerBtn.classList.toggle('active', hasItem && previewOpenForActive && previewMode === 'reader');
    readerBtn.setAttribute('aria-pressed', String(Boolean(hasItem && previewOpenForActive && previewMode === 'reader')));
  }
  if (aiTagBtn) {
    const canRun = hasItem && !Boolean(item?.deletedAt) && !aiBusy;
    aiTagBtn.disabled = !canRun;
    aiTagBtn.classList.toggle('active', Boolean(hasItem && detailAiAutoTagRunning));
    aiTagBtn.setAttribute('aria-busy', String(Boolean(detailAiAutoTagRunning)));
    aiTagBtn.title = detailAiAutoTagRunning ? 'AI 打标签进行中…' : (aiBusy ? 'AI 任务进行中…' : 'AI 自动打标签');
    aiTagBtn.setAttribute('aria-label', detailAiAutoTagRunning ? 'AI 打标签进行中' : (aiBusy ? 'AI 任务进行中' : 'AI 自动打标签'));
  }
  if (moreBtn) {
    moreBtn.disabled = !hasItem;
    moreBtn.classList.toggle('hidden', !hasItem);
  }
  if (moreMenu) {
    moreMenu.setAttribute('data-detail-item-id', hasItem ? String(item.id) : '');
    const editAction = moreMenu.querySelector('[data-detail-panel-more-action="toggle-edit"]');
    if (editAction) {
      setMenuItemIconAndLabel(editAction, 'edit', detailEditMode ? '切换到查看模式' : '进入编辑模式');
    }
    const deleteAction = moreMenu.querySelector('[data-detail-panel-more-action="delete"]');
    const restoreAction = moreMenu.querySelector('[data-detail-panel-more-action="restore"]');
    const aiAction = moreMenu.querySelector('[data-detail-panel-more-action="ai-autotag"]');
    const aiTitleAction = moreMenu.querySelector('[data-detail-panel-more-action="ai-title-clean"]');
    const aiSummaryAction = moreMenu.querySelector('[data-detail-panel-more-action="ai-summary"]');
    const aiReaderSummaryAction = moreMenu.querySelector('[data-detail-panel-more-action="ai-reader-summary"]');
    const aiHighlightDigestAction = moreMenu.querySelector('[data-detail-panel-more-action="ai-highlight-digest"]');
    const aiFolderAction = moreMenu.querySelector('[data-detail-panel-more-action="ai-folder-recommend"]');
    const aiQaAction = moreMenu.querySelector('[data-detail-panel-more-action="ai-qa"]');
    const aiRelatedAction = moreMenu.querySelector('[data-detail-panel-more-action="ai-related"]');
    if (deleteAction) deleteAction.classList.toggle('hidden', !hasItem || Boolean(item?.deletedAt));
    if (restoreAction) restoreAction.classList.toggle('hidden', !hasItem || !Boolean(item?.deletedAt));
    if (aiAction) aiAction.disabled = !hasItem || Boolean(item?.deletedAt) || aiBusy;
    if (aiTitleAction) aiTitleAction.disabled = !hasItem || Boolean(item?.deletedAt) || aiBusy;
    if (aiSummaryAction) aiSummaryAction.disabled = !hasItem || Boolean(item?.deletedAt) || aiBusy;
    if (aiReaderSummaryAction) aiReaderSummaryAction.disabled = !hasItem || Boolean(item?.deletedAt) || aiBusy;
    if (aiHighlightDigestAction) aiHighlightDigestAction.disabled = !hasItem || Boolean(item?.deletedAt) || aiBusy;
    if (aiFolderAction) aiFolderAction.disabled = !hasItem || Boolean(item?.deletedAt) || aiBusy;
    if (aiQaAction) aiQaAction.disabled = !hasItem || Boolean(item?.deletedAt) || aiBusy;
    if (aiRelatedAction) aiRelatedAction.disabled = !hasItem || Boolean(item?.deletedAt) || aiBusy;
  }
  hydrateMenuItemIcons();
}

function detailAiOperationBusy() {
  return Boolean(
    detailAiAutoTagRunning
    || detailAiTitleCleanRunning
    || detailAiSummaryRunning
    || detailAiReaderSummaryRunning
    || detailAiHighlightCandidatesRunning
    || detailAiHighlightDigestRunning
    || detailAiFolderRecommendRunning
    || detailAiRelatedRunning
    || detailAiQaRunning
  );
}

async function runAiAutoTagForActiveBookmark() {
  const item = state.bookmarks.find((x) => x.id === state.activeId) || state.allBookmarks.find((x) => x.id === state.activeId);
  if (!item || item.deletedAt) return;
  if (detailAiOperationBusy()) return;

  if (detailEditMode) {
    const ok = await uiConfirm('当前处于编辑模式，AI 打标签会刷新当前条目并覆盖未保存改动。是否继续？', {
      title: 'AI 自动打标签',
      confirmText: '继续',
      cancelText: '取消'
    });
    if (!ok) return;
  }

  detailAiAutoTagRunning = true;
  updateDetailPanelHeadUi(item);
  try {
    const out = await api(`/api/product/ai/autotag/${encodeURIComponent(String(item.id))}`, {
      method: 'POST',
      body: JSON.stringify({ apply: true })
    });
    const finalTags = Array.isArray(out?.bookmark?.tags) ? out.bookmark.tags : [];
    const suggested = Array.isArray(out?.job?.result?.suggestedTags) ? out.job.result.suggestedTags : [];
    if (finalTags.length) {
      const preview = finalTags.slice(0, 4).join(', ');
      const more = finalTags.length > 4 ? ` 等 ${finalTags.length} 个标签` : '';
      showToast(`AI 已自动打标签：${preview}${more}`, { timeoutMs: 3200 });
    } else if (suggested.length) {
      showToast(`AI 已生成建议标签：${suggested.join(', ')}`, { timeoutMs: 3200 });
    } else {
      showToast('AI 已执行，但未生成可用标签', { timeoutMs: 3200 });
    }
    await refreshAll();
  } catch (err) {
    showToast(err.message || 'AI 自动打标签失败', { timeoutMs: 4200 });
  } finally {
    detailAiAutoTagRunning = false;
    const latest = state.bookmarks.find((x) => x.id === state.activeId) || state.allBookmarks.find((x) => x.id === state.activeId) || null;
    updateDetailPanelHeadUi(latest);
  }
}

function isAiBatchTaskTerminalStatus(status) {
  return new Set(['succeeded', 'failed', 'partial', 'cancelled']).has(String(status || ''));
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms || 0) || 0)));
}

async function pollAiBatchAutoTagTaskUntilTerminal(taskId, { timeoutMs = 10 * 60 * 1000, intervalMs = 900 } = {}) {
  const startedAt = Date.now();
  const tid = String(taskId || '').trim();
  if (!tid) throw new Error('任务 ID 为空');
  for (; ;) {
    const out = await api(`/api/product/ai/batch/autotag/tasks/${encodeURIComponent(tid)}`);
    const task = out?.task || null;
    if (!task) throw new Error('批量 AI 任务不存在');
    if (isAiBatchTaskTerminalStatus(task.status)) return task;
    if (Date.now() - startedAt > timeoutMs) throw new Error('批量 AI 任务等待超时');
    await waitMs(intervalMs);
  }
}

async function runBulkAiAutoTagForSelection() {
  if (bulkAiAutoTagRunning) return;
  const selectedIds = [...state.selected].map(String).filter(Boolean);
  if (!selectedIds.length) {
    showToast('未选择任何条目', { timeoutMs: 2200 });
    return;
  }
  const ok = await uiConfirm(`对已选 ${selectedIds.length} 条书签执行 AI 自动打标签？任务将在后台分批执行。`, {
    title: '批量 AI 自动打标签',
    confirmText: '开始',
    cancelText: '取消'
  });
  if (!ok) return;

  const btn = byId('bulkAiTagBtn');
  bulkAiAutoTagRunning = true;
  if (btn) {
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.textContent = 'AI 打标签中…';
  }

  try {
    const createOut = await api('/api/product/ai/batch/autotag/tasks', {
      method: 'POST',
      body: JSON.stringify({ bookmarkIds: selectedIds })
    });
    const task = createOut?.task || null;
    const meta = createOut?.meta || {};
    if (!task?.id) throw new Error('批量 AI 任务创建失败');

    store.clearSelection();
    renderHeader();

    const queued = Number(meta.queued || task?.progress?.total || 0) || 0;
    const skippedDeleted = Number(meta.skippedDeleted || 0) || 0;
    const missing = Number(meta.missing || 0) || 0;
    const skipText = [skippedDeleted ? `已跳过删除项 ${skippedDeleted}` : '', missing ? `缺失 ${missing}` : '']
      .filter(Boolean)
      .join('，');
    showToast(
      skipText ? `AI 批量打标签任务已启动（${queued} 条，${skipText}）` : `AI 批量打标签任务已启动（${queued} 条）`,
      { timeoutMs: 2800 }
    );

    const finalTask = await pollAiBatchAutoTagTaskUntilTerminal(task.id);
    const result = finalTask?.result || {};
    const succeeded = Number(result.succeeded || 0) || 0;
    const failed = Number(result.failed || 0) || 0;
    const processed = Number(result.processed || 0) || 0;

    await refreshAll();

    if (String(finalTask.status) === 'succeeded') {
      showToast(`AI 批量打标签完成：${succeeded}/${processed} 条成功`, { timeoutMs: 3200 });
    } else if (String(finalTask.status) === 'partial') {
      showToast(`AI 批量打标签部分完成：成功 ${succeeded}，失败 ${failed}`, { timeoutMs: 4200 });
    } else {
      const msg = finalTask?.error?.message || '批量 AI 打标签失败';
      showToast(`AI 批量打标签失败：${msg}`, { timeoutMs: 5000 });
    }
  } catch (err) {
    showToast(err.message || 'AI 批量打标签失败', { timeoutMs: 5000 });
  } finally {
    bulkAiAutoTagRunning = false;
    if (btn) {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      btn.textContent = 'AI 打标签';
    }
  }
}

async function runAiTitleCleanForActiveBookmark() {
  const item = state.bookmarks.find((x) => x.id === state.activeId) || state.allBookmarks.find((x) => x.id === state.activeId);
  if (!item || item.deletedAt) return;
  if (detailAiOperationBusy()) return;

  if (detailEditMode) {
    const ok = await uiConfirm('当前处于编辑模式，AI 标题清洗会刷新当前条目并覆盖未保存改动。是否继续？', {
      title: 'AI 标题清洗',
      confirmText: '继续',
      cancelText: '取消'
    });
    if (!ok) return;
  }

  detailAiTitleCleanRunning = true;
  updateDetailPanelHeadUi(item);
  try {
    const out = await api(`/api/product/ai/title-clean/${encodeURIComponent(String(item.id))}`, {
      method: 'POST',
      body: JSON.stringify({ apply: true })
    });
    const finalTitle = String(out?.bookmark?.title || '');
    const suggestedTitle = String(out?.job?.result?.suggestedTitle || '');
    const applied = Boolean(out?.job?.result?.applied);
    const originalTitle = String(out?.job?.result?.originalTitle || item.title || '');
    if (applied) {
      showToast(`AI 标题已清洗：${finalTitle || suggestedTitle}`, { timeoutMs: 3200 });
    } else if (suggestedTitle && suggestedTitle !== originalTitle) {
      showToast(`AI 标题建议：${suggestedTitle}`, { timeoutMs: 3600 });
    } else {
      showToast('AI 未给出更合适的标题', { timeoutMs: 2600 });
    }
    await refreshAll();
  } catch (err) {
    showToast(err.message || 'AI 标题清洗失败', { timeoutMs: 4200 });
  } finally {
    detailAiTitleCleanRunning = false;
    const latest = state.bookmarks.find((x) => x.id === state.activeId) || state.allBookmarks.find((x) => x.id === state.activeId) || null;
    updateDetailPanelHeadUi(latest);
  }
}

async function runAiSummaryForActiveBookmark() {
  const item = state.bookmarks.find((x) => x.id === state.activeId) || state.allBookmarks.find((x) => x.id === state.activeId);
  if (!item || item.deletedAt) return;
  if (detailAiOperationBusy()) return;

  if (detailEditMode) {
    const ok = await uiConfirm('当前处于编辑模式，AI 生成摘要会刷新当前条目并覆盖未保存改动。是否继续？', {
      title: 'AI 生成摘要',
      confirmText: '继续',
      cancelText: '取消'
    });
    if (!ok) return;
  }

  let noteMode = 'if_empty';
  if (String(item.note || '').trim()) {
    const replace = await uiConfirm('当前已有备注。是否用 AI 摘要替换现有备注？选择“取消”则仅在备注为空时写入（本次不会覆盖）。', {
      title: 'AI 生成摘要',
      confirmText: '替换备注',
      cancelText: '仅空备注写入'
    });
    noteMode = replace ? 'replace' : 'if_empty';
  }

  detailAiSummaryRunning = true;
  updateDetailPanelHeadUi(item);
  try {
    const out = await api(`/api/product/ai/summary/${encodeURIComponent(String(item.id))}`, {
      method: 'POST',
      body: JSON.stringify({ apply: true, noteMode })
    });
    const result = out?.job?.result || {};
    const applied = Boolean(result.applied);
    const blockedReason = String(result.blockedReason || '');
    const suggestedSummary = String(result.suggestedSummary || out?.suggestedSummary || '');
    if (applied) {
      showToast('AI 摘要已写入备注', { timeoutMs: 3000 });
    } else if (blockedReason === 'note_exists') {
      showToast('已有备注，未覆盖（按当前模式仅为空时写入）', { timeoutMs: 3800 });
    } else if (suggestedSummary) {
      showToast(`AI 摘要建议：${suggestedSummary.slice(0, 80)}${suggestedSummary.length > 80 ? '…' : ''}`, { timeoutMs: 4200 });
    } else {
      showToast('AI 未生成可用摘要', { timeoutMs: 2800 });
    }
    await refreshAll();
  } catch (err) {
    showToast(err.message || 'AI 生成摘要失败', { timeoutMs: 4200 });
  } finally {
    detailAiSummaryRunning = false;
    const latest = state.bookmarks.find((x) => x.id === state.activeId) || state.allBookmarks.find((x) => x.id === state.activeId) || null;
    updateDetailPanelHeadUi(latest);
  }
}

async function runAiReaderSummaryForActiveBookmark() {
  const item = state.bookmarks.find((x) => x.id === state.activeId) || state.allBookmarks.find((x) => x.id === state.activeId);
  if (!item || item.deletedAt) return;
  if (detailAiOperationBusy()) return;
  if (String(item?.article?.status || '') !== 'success' || !String(item?.article?.textContent || '').trim()) {
    showToast('请先提取正文，再执行 AI 阅读摘要', { timeoutMs: 3200 });
    return;
  }

  if (detailEditMode) {
    const ok = await uiConfirm('当前处于编辑模式，AI 阅读摘要会刷新当前条目并覆盖未保存改动。是否继续？', {
      title: 'AI 阅读摘要',
      confirmText: '继续',
      cancelText: '取消'
    });
    if (!ok) return;
  }

  detailAiReaderSummaryRunning = true;
  renderDetailReaderSummaryUi(item);
  updateDetailPanelHeadUi(item);
  try {
    const out = await api(`/api/product/ai/reader-summary/${encodeURIComponent(String(item.id))}`, {
      method: 'POST',
      body: JSON.stringify({ apply: true })
    });
    const rs = out?.readerSummary || out?.bookmark?.aiSuggestions?.readerSummary || {};
    const shortSummary = String(rs.shortSummary || '').trim();
    showToast(shortSummary ? `AI 阅读摘要已生成：${shortSummary.slice(0, 60)}${shortSummary.length > 60 ? '…' : ''}` : 'AI 阅读摘要已生成', { timeoutMs: 3800 });
    await refreshAll();
  } catch (err) {
    showToast(err.message || 'AI 阅读摘要失败', { timeoutMs: 4200 });
  } finally {
    detailAiReaderSummaryRunning = false;
    const latest = state.bookmarks.find((x) => x.id === state.activeId) || state.allBookmarks.find((x) => x.id === state.activeId) || null;
    renderDetailReaderSummaryUi(latest);
    updateDetailPanelHeadUi(latest);
  }
}

async function runAiFolderRecommendForActiveBookmark() {
  const item = state.bookmarks.find((x) => x.id === state.activeId) || state.allBookmarks.find((x) => x.id === state.activeId);
  if (!item || item.deletedAt) return;
  if (detailAiOperationBusy()) return;

  if (detailEditMode) {
    const ok = await uiConfirm('当前处于编辑模式，AI 推荐集合可能会刷新当前条目并覆盖未保存改动。是否继续？', {
      title: 'AI 推荐集合',
      confirmText: '继续',
      cancelText: '取消'
    });
    if (!ok) return;
  }

  detailAiFolderRecommendRunning = true;
  updateDetailPanelHeadUi(item);
  try {
    const suggestOut = await api(`/api/product/ai/folder-recommend/${encodeURIComponent(String(item.id))}`, {
      method: 'POST',
      body: JSON.stringify({ apply: false })
    });
    const recommendation = suggestOut?.recommendation || {};
    const folderId = String(recommendation.folderId || '');
    const folderName = String(recommendation.folderName || '');
    const folderPath = String(recommendation.folderPath || '');
    const reason = String(suggestOut?.reason || '');
    const currentFolderId = String(item.folderId || 'root');
    if (!folderId) {
      showToast(reason ? `AI 未给出明确集合：${reason}` : 'AI 未给出明确集合推荐', { timeoutMs: 4200 });
      return;
    }
    if (folderId === currentFolderId) {
      showToast(`AI 推荐当前集合：${folderPath || folderName || '当前集合'}`, { timeoutMs: 3000 });
      return;
    }

    const ok = await uiConfirm(
      `AI 推荐移动到「${folderPath || folderName || folderId}」${reason ? `\n\n原因：${reason}` : ''}\n\n是否应用？`,
      {
        title: 'AI 推荐集合',
        confirmText: '应用',
        cancelText: '仅查看建议'
      }
    );
    if (!ok) {
      showToast(`AI 推荐集合：${folderPath || folderName || folderId}`, { timeoutMs: 3500 });
      return;
    }

    const applyOut = await api(`/api/product/ai/folder-recommend/${encodeURIComponent(String(item.id))}`, {
      method: 'POST',
      body: JSON.stringify({ apply: true, recommendation })
    });
    const finalRec = applyOut?.recommendation || recommendation;
    showToast(`已移动到 AI 推荐集合：${finalRec.folderPath || finalRec.folderName || finalRec.folderId || folderId}`, { timeoutMs: 3500 });
    await refreshAll();
  } catch (err) {
    showToast(err.message || 'AI 推荐集合失败', { timeoutMs: 4200 });
  } finally {
    detailAiFolderRecommendRunning = false;
    const latest = state.bookmarks.find((x) => x.id === state.activeId) || state.allBookmarks.find((x) => x.id === state.activeId) || null;
    updateDetailPanelHeadUi(latest);
  }
}

async function maybeRunAiAutoClassifyForCreatedBookmark(createdBookmark) {
  const bookmarkId = String(createdBookmark?.id || '').trim();
  if (!bookmarkId) return { ran: false };

  let config;
  try {
    const out = await api('/api/product/ai/config');
    config = out?.config || {};
  } catch (err) {
    return { ran: false, error: err };
  }

  const rules = config?.autoClassifyOnCreate || {};
  if (!config?.enabled || !rules?.enabled) return { ran: false };

  const doAutoTag = Boolean(rules.autoTag);
  const doRecommendFolder = Boolean(rules.recommendFolder);
  if (!doAutoTag && !doRecommendFolder) return { ran: false };

  const actionLabels = [];
  if (doAutoTag) actionLabels.push('自动打标签');
  if (doRecommendFolder) actionLabels.push(rules.autoMoveRecommendedFolder ? '推荐并自动移动集合' : '推荐集合');

  if (rules.requireConfirm !== false) {
    const ok = await uiConfirm(`新书签已创建。是否执行 AI 自动分类（${actionLabels.join(' + ')}）？`, {
      title: 'AI 自动分类（新书签）',
      confirmText: '执行',
      cancelText: '跳过'
    });
    if (!ok) return { ran: false, skipped: true };
  }

  const summary = [];
  const errors = [];
  let changed = false;

  if (doAutoTag) {
    try {
      const out = await api(`/api/product/ai/autotag/${encodeURIComponent(bookmarkId)}`, {
        method: 'POST',
        body: JSON.stringify({ apply: true })
      });
      const finalTags = Array.isArray(out?.bookmark?.tags) ? out.bookmark.tags : [];
      if (finalTags.length) {
        summary.push(`标签 ${finalTags.slice(0, 3).join(', ')}${finalTags.length > 3 ? '…' : ''}`);
        changed = true;
      } else {
        summary.push('未生成可用标签');
      }
    } catch (err) {
      errors.push(`自动打标签失败：${err.message || err}`);
    }
  }

  if (doRecommendFolder) {
    try {
      const suggestOut = await api(`/api/product/ai/folder-recommend/${encodeURIComponent(bookmarkId)}`, {
        method: 'POST',
        body: JSON.stringify({ apply: false })
      });
      const recommendation = suggestOut?.recommendation || {};
      const folderId = String(recommendation.folderId || '');
      const folderText = recommendation.folderPath || recommendation.folderName || folderId;
      if (!folderId) {
        summary.push('未推荐集合');
      } else if (rules.autoMoveRecommendedFolder) {
        const applyOut = await api(`/api/product/ai/folder-recommend/${encodeURIComponent(bookmarkId)}`, {
          method: 'POST',
          body: JSON.stringify({ apply: true, recommendation })
        });
        const finalRec = applyOut?.recommendation || recommendation;
        summary.push(`已移动到「${finalRec.folderPath || finalRec.folderName || finalRec.folderId || folderText}」`);
        changed = true;
      } else {
        summary.push(`推荐集合：${folderText}`);
      }
    } catch (err) {
      errors.push(`集合推荐失败：${err.message || err}`);
    }
  }

  return { ran: true, changed, summary, errors };
}

async function runDetailPanelMoreAction(action) {
  const item = state.bookmarks.find((x) => x.id === state.activeId) || state.allBookmarks.find((x) => x.id === state.activeId);
  if (!item) return;
  const act = String(action || '');
  if (act === 'open-current') {
    window.open(item.url, '_self');
    return;
  }
  if (act === 'open-new') {
    window.open(item.url, '_blank', 'noopener');
    return;
  }
  if (act === 'copy-link') {
    try {
      await navigator.clipboard.writeText(String(item.url || ''));
      showToast('链接已复制', { timeoutMs: 2000 });
    } catch (_err) {
      showToast('复制失败', { timeoutMs: 2500 });
    }
    return;
  }
  if (act === 'ai-autotag') {
    await runAiAutoTagForActiveBookmark();
    return;
  }
  if (act === 'ai-title-clean') {
    await runAiTitleCleanForActiveBookmark();
    return;
  }
  if (act === 'ai-summary') {
    await runAiSummaryForActiveBookmark();
    return;
  }
  if (act === 'ai-reader-summary') {
    await runAiReaderSummaryForActiveBookmark();
    return;
  }
  if (act === 'ai-highlight-digest') {
    await runAiHighlightDigestForActiveBookmark();
    return;
  }
  if (act === 'ai-folder-recommend') {
    await runAiFolderRecommendForActiveBookmark();
    return;
  }
  if (act === 'ai-qa') {
    openAiQaDialog({ bookmarkId: item.id, scope: 'auto' });
    return;
  }
  if (act === 'ai-related') {
    await runAiRelatedBookmarksForActiveBookmark();
    return;
  }
  if (act === 'preview-web') {
    await open预览Dialog(item.id, { preferredMode: 'auto' });
    return;
  }
  if (act === 'preview-reader') {
    await open预览Dialog(item.id, { preferredMode: 'reader' });
    return;
  }
  if (act === 'toggle-edit') {
    setDetailEditMode(!detailEditMode);
    return;
  }
  if (act === 'delete') {
    byId('detailHeaderDeleteBtn')?.click();
    return;
  }
  if (act === 'restore') {
    byId('detailHeaderRestoreBtn')?.click();
    return;
  }
}

function renderMetadataTaskUi(task, { bookmarkId = null } = {}) {
  const infoEl = byId('detailMetaTaskInfo');
  const retryBtn = byId('retryMetaTaskBtn');
  if (!infoEl || !retryBtn) return;
  const activeBookmarkId = state.activeId ? String(state.activeId) : '';
  if (bookmarkId && activeBookmarkId && String(bookmarkId) !== activeBookmarkId) return;

  detailMetadataTaskLatestId = task ? String(task.id || '') : null;
  if (bookmarkId) detailMetadataTaskBookmarkId = String(bookmarkId);
  infoEl.textContent = formatMetadataTaskInfo(task);
  retryBtn.classList.toggle('hidden', !(task && String(task.status) === 'failed'));
  const item = state.bookmarks.find((x) => x.id === activeBookmarkId) || state.allBookmarks.find((x) => x.id === activeBookmarkId) || null;
  renderDetailFetchStatusSummary({ item, task });
}

function renderMetadataTaskHistory(tasks = [], { bookmarkId = null } = {}) {
  const el = byId('detailFetchHistory');
  if (!el) return;
  const activeBookmarkId = state.activeId ? String(state.activeId) : '';
  if (bookmarkId && activeBookmarkId && String(bookmarkId) !== activeBookmarkId) return;
  if (!tasks.length) {
    el.textContent = '抓取历史：无';
    const detailsEl = byId('detailFetchDetails');
    if (detailsEl && !String(byId('detailMetaTaskInfo')?.textContent || '').includes('错误')) detailsEl.open = false;
    return;
  }
  const rows = tasks.slice(0, 5).map((t) => {
    const status = String(t.status || 'unknown');
    const attempt = `${Number(t.attempt || 0)}/${Number(t.maxAttempts || 0) || '?'}`;
    const ts = Number(t.updatedAt || t.createdAt || 0);
    const msg = String(t.error?.message || t.lastError?.message || '');
    return `${status} (尝试 ${attempt}) @ ${ts ? new Date(ts).toLocaleTimeString() : '-'}${msg ? ` · ${msg}` : ''}`;
  });
  el.textContent = `抓取历史：\n${rows.join('\n')}`;
}

function highlightColorLabel(color = '') {
  const v = String(color || '').toLowerCase();
  if (!v) return '黄色';
  return v;
}

function renderHighlightsList(highlights = [], { bookmarkId = null } = {}) {
  const activeBookmarkId = state.activeId ? String(state.activeId) : '';
  const bid = String(bookmarkId || activeBookmarkId || '');
  if (!bid) return;
  if (activeBookmarkId && bid !== activeBookmarkId) return;

  const listEl = byId('detailHighlightsList');
  const infoEl = byId('detailHighlightsInfo');
  if (!listEl || !infoEl) return;

  const rows = Array.isArray(highlights) ? highlights : [];
  const totalAnnotations = rows.reduce((sum, h) => sum + (Array.isArray(h.annotations) ? h.annotations.length : 0), 0);
  infoEl.textContent = `${rows.length} 条高亮 · ${totalAnnotations} 条注释`;
  if (!rows.length) {
    listEl.innerHTML = `<div class="muted">暂无高亮。可使用“阅读模式 + 高亮选区”或手动新增高亮。</div>`;
    return;
  }

  listEl.innerHTML = rows
    .map((h) => {
      const 条注释 = Array.isArray(h.annotations) ? h.annotations : [];
      const quotePreview = escapeHtml((h.quote || h.text || '').slice(0, 120) || '（无文本）');
      const updatedLabel = h.updatedAt ? new Date(Number(h.updatedAt)).toLocaleString() : '';
      return `<div class="highlight-item" data-highlight-id="${h.id}">
        <details class="highlight-card" ${条注释.length || h.note ? 'open' : ''}>
          <summary class="highlight-summary">
            <span class="highlight-summary-main">
              <span class="meta-chip type">${escapeHtml(highlightColorLabel(h.color || 'yellow'))}</span>
              <span class="highlight-summary-quote">${quotePreview}</span>
            </span>
            <span class="highlight-summary-meta muted">${updatedLabel}${条注释.length ? ` · ${条注释.length} 注释` : ''}</span>
          </summary>
          <div class="highlight-card-body">
            <div class="highlight-quote">${escapeHtml(h.quote || h.text || '')}</div>
            ${h.note ? `<div class="highlight-note">${escapeHtml(h.note)}</div>` : ''}
            <div class="highlight-actions">
              <button type="button" class="ghost" data-hl-edit="${h.id}">编辑高亮</button>
              <button type="button" class="ghost" data-hl-annotate="${h.id}">新增注释</button>
              <button type="button" class="ghost danger" data-hl-delete="${h.id}">删除</button>
            </div>
            <div class="annotation-list">
          ${条注释.length
          ? 条注释
            .map(
              (a) => `<div class="annotation-item" data-annotation-id="${a.id}">
                        <div>${escapeHtml(a.text || '')}</div>
                        <div class="muted">${a.updatedAt ? new Date(Number(a.updatedAt)).toLocaleString() : ''}</div>
                        <div class="annotation-actions">
                          <button type="button" class="ghost" data-ann-edit="${h.id}:${a.id}">编辑</button>
                          <button type="button" class="ghost danger" data-ann-delete="${h.id}:${a.id}">删除</button>
                        </div>
                      </div>`
            )
            .join('')
          : `<div class="muted">暂无注释。</div>`
        }
            </div>
          </div>
        </details>
      </div>`;
    })
    .join('');

  listEl.querySelectorAll('[data-hl-edit]').forEach((el) => {
    el.addEventListener('click', async () => {
      const highlightId = el.dataset.hlEdit;
      const hl = rows.find((x) => x.id === highlightId);
      if (!hl) return;
      const quote = await uiPrompt('编辑高亮文本/引用', {
        title: '编辑高亮',
        inputLabel: '高亮文本',
        defaultValue: hl.quote || hl.text || '',
        required: true,
        requiredMessage: '请输入高亮文本'
      });
      if (quote === null) return;
      const note = await uiPrompt('编辑高亮备注（可选）', {
        title: '编辑高亮备注',
        inputLabel: '备注',
        defaultValue: hl.note || '',
        placeholder: '可选',
        required: false
      });
      if (note === null) return;
      await api(`/api/bookmarks/${bid}/highlights/${highlightId}`, {
        method: 'PUT',
        body: JSON.stringify({ quote, text: quote, note })
      });
      await refreshAll();
      showToast('高亮已更新', { timeoutMs: 2500 });
    });
  });

  listEl.querySelectorAll('[data-hl-delete]').forEach((el) => {
    el.addEventListener('click', async () => {
      const highlightId = el.dataset.hlDelete;
      if (!(await uiConfirm('确认删除这条高亮？', { title: '删除高亮', confirmText: '删除', danger: true }))) return;
      await api(`/api/bookmarks/${bid}/highlights/${highlightId}`, { method: 'DELETE' });
      await refreshAll();
      showToast('高亮已删除', { timeoutMs: 2500 });
    });
  });

  listEl.querySelectorAll('[data-hl-annotate]').forEach((el) => {
    el.addEventListener('click', async () => {
      const highlightId = el.dataset.hlAnnotate;
      const text = await uiPrompt('新增注释内容', {
        title: '新增注释',
        inputLabel: '注释内容',
        required: true,
        requiredMessage: '请输入注释内容'
      });
      if (text === null) return;
      if (!String(text).trim()) return showToast('请输入注释内容');
      await api(`/api/bookmarks/${bid}/highlights/${highlightId}/annotations`, {
        method: 'POST',
        body: JSON.stringify({ text })
      });
      await refreshAll();
      showToast('注释已添加', { timeoutMs: 2500 });
    });
  });

  listEl.querySelectorAll('[data-ann-edit]').forEach((el) => {
    el.addEventListener('click', async () => {
      const [highlightId, annotationId] = String(el.dataset.annEdit || '').split(':');
      const hl = rows.find((x) => x.id === highlightId);
      const ann = (hl?.annotations || []).find((x) => x.id === annotationId);
      if (!hl || !ann) return;
      const text = await uiPrompt('编辑注释', {
        title: '编辑注释',
        inputLabel: '注释内容',
        defaultValue: ann.text || '',
        required: true,
        requiredMessage: '请输入注释内容'
      });
      if (text === null) return;
      await api(`/api/bookmarks/${bid}/highlights/${highlightId}/annotations/${annotationId}`, {
        method: 'PUT',
        body: JSON.stringify({ text })
      });
      await refreshAll();
      showToast('注释已更新', { timeoutMs: 2500 });
    });
  });

  listEl.querySelectorAll('[data-ann-delete]').forEach((el) => {
    el.addEventListener('click', async () => {
      const [highlightId, annotationId] = String(el.dataset.annDelete || '').split(':');
      if (!highlightId || !annotationId) return;
      if (!(await uiConfirm('确认删除这条注释？', { title: '删除注释', confirmText: '删除', danger: true }))) return;
      await api(`/api/bookmarks/${bid}/highlights/${highlightId}/annotations/${annotationId}`, { method: 'DELETE' });
      await refreshAll();
      showToast('注释已删除', { timeoutMs: 2500 });
    });
  });
}

function renderDetailHighlightCandidatesUi(item = null) {
  const infoEl = byId('detailHighlightCandidatesInfo');
  const listEl = byId('detailHighlightCandidatesList');
  const btn = byId('aiHighlightSuggestBtn');
  if (!infoEl || !listEl) return;

  const hasItem = Boolean(item && item.id);
  const canRun = hasItem
    && !Boolean(item?.deletedAt)
    && String(item?.article?.status || '') === 'success'
    && Boolean(String(item?.article?.textContent || '').trim());

  if (btn) {
    btn.disabled = !canRun || detailAiOperationBusy();
    btn.textContent = detailAiHighlightCandidatesRunning ? 'AI 分析中…' : 'AI 推荐片段';
    btn.setAttribute('aria-busy', String(Boolean(detailAiHighlightCandidatesRunning)));
  }

  if (!hasItem) {
    infoEl.textContent = '';
    listEl.classList.add('hidden');
    listEl.innerHTML = '';
    return;
  }

  const saved = item?.aiSuggestions?.highlightCandidates && typeof item.aiSuggestions.highlightCandidates === 'object'
    ? item.aiSuggestions.highlightCandidates
    : null;
  const items = Array.isArray(saved?.items)
    ? saved.items
      .map((x) => ({
        quote: String(x?.quote || '').trim(),
        reason: String(x?.reason || '').trim(),
        score: Math.max(0, Math.min(1, Number(x?.score) || 0))
      }))
      .filter((x) => x.quote)
    : [];
  const generatedAt = Number(saved?.generatedAt || 0) || 0;
  const provider = saved?.provider && typeof saved.provider === 'object' ? saved.provider : null;
  const providerText = provider?.providerType ? `${provider.providerType}${provider.model ? `/${provider.model}` : ''}` : '';

  if (!canRun) {
    infoEl.textContent = '需先提取正文，才能生成 AI 高亮候选。';
  } else if (detailAiHighlightCandidatesRunning) {
    infoEl.textContent = 'AI 正在从正文中挑选适合高亮的关键片段...';
  } else if (items.length) {
    const bits = [`AI 候选 ${items.length} 条`];
    if (saved?.summary) bits.push(String(saved.summary).slice(0, 120));
    if (generatedAt) bits.push(`生成于：${new Date(generatedAt).toLocaleString()}`);
    if (providerText) bits.push(`模型：${providerText}`);
    infoEl.textContent = bits.join(' · ');
  } else {
    infoEl.textContent = '点击“AI 推荐片段”生成高亮候选。';
  }

  if (!items.length) {
    listEl.classList.add('hidden');
    listEl.innerHTML = '';
    return;
  }

  listEl.classList.remove('hidden');
  listEl.innerHTML = `
    <div class="detail-highlight-candidates-head">
      <button type="button" class="ghost" data-ai-hl-apply-all>全部加入高亮</button>
    </div>
    <div class="detail-highlight-candidates-items">
      ${items.map((row, idx) => `
        <div class="detail-highlight-candidate">
          <div class="detail-highlight-candidate-quote">${escapeHtml(row.quote)}</div>
          <div class="detail-highlight-candidate-meta muted">
            ${row.reason ? escapeHtml(row.reason) : 'AI 候选片段'}${Number.isFinite(row.score) && row.score > 0 ? ` · ${(row.score * 100).toFixed(0)}%` : ''}
          </div>
          <div class="detail-highlight-candidate-actions">
            <button type="button" class="ghost" data-ai-hl-apply-one="${idx}">加入高亮</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  const bookmarkId = String(item.id || '');
  const applyCandidate = async (candidate) => {
    if (!bookmarkId || !candidate?.quote) return;
    await api(`/api/bookmarks/${encodeURIComponent(bookmarkId)}/highlights`, {
      method: 'POST',
      body: JSON.stringify({
        quote: String(candidate.quote || ''),
        text: String(candidate.quote || ''),
        note: candidate.reason ? `AI 候选：${String(candidate.reason || '').slice(0, 180)}` : ''
      })
    });
  };

  listEl.querySelectorAll('[data-ai-hl-apply-one]').forEach((el) => {
    el.addEventListener('click', async () => {
      const idx = Number(el.getAttribute('data-ai-hl-apply-one'));
      const candidate = items[idx];
      if (!candidate) return;
      try {
        el.disabled = true;
        await applyCandidate(candidate);
        await refreshAll();
        showToast('已加入高亮', { timeoutMs: 2200 });
      } catch (err) {
        showToast(err.message || '加入高亮失败', { timeoutMs: 4200 });
      } finally {
        el.disabled = false;
      }
    });
  });

  listEl.querySelector('[data-ai-hl-apply-all]')?.addEventListener('click', async (e) => {
    if (!items.length) return;
    const ok = await uiConfirm(`将 ${items.length} 条 AI 候选加入高亮？`, {
      title: '应用 AI 高亮候选',
      confirmText: '加入',
      cancelText: '取消'
    });
    if (!ok) return;
    try {
      e.currentTarget.disabled = true;
      for (const candidate of items) await applyCandidate(candidate);
      await refreshAll();
      showToast(`已加入 ${items.length} 条高亮`, { timeoutMs: 2600 });
    } catch (err) {
      showToast(err.message || '批量加入高亮失败', { timeoutMs: 4200 });
    } finally {
      e.currentTarget.disabled = false;
    }
  });
}

function renderDetailHighlightDigestUi(item = null) {
  const infoEl = byId('detailHighlightDigestInfo');
  const boxEl = byId('detailHighlightDigestBox');
  const btn = byId('aiHighlightDigestBtn');
  if (!infoEl || !boxEl) return;

  if (!item) {
    infoEl.textContent = '';
    boxEl.classList.add('hidden');
    boxEl.innerHTML = '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'AI 高亮总结';
      btn.removeAttribute('aria-busy');
    }
    return;
  }

  const highlights = Array.isArray(item.highlights) ? item.highlights : [];
  const annotationsCount = highlights.reduce((sum, h) => sum + (Array.isArray(h?.annotations) ? h.annotations.length : 0), 0);
  const canRun = highlights.length > 0 && !Boolean(item?.deletedAt);
  const digest = item?.aiSuggestions?.highlightDigest && typeof item.aiSuggestions.highlightDigest === 'object'
    ? item.aiSuggestions.highlightDigest
    : null;
  const generatedAt = Number(digest?.generatedAt || item?.aiSuggestions?.highlightDigestGeneratedAt || 0) || 0;
  const provider = digest?.provider && typeof digest.provider === 'object' ? digest.provider : null;
  const providerText = provider?.providerType ? `${provider.providerType}${provider.model ? `/${provider.model}` : ''}` : '';

  if (btn) {
    btn.disabled = !canRun || detailAiOperationBusy();
    btn.textContent = detailAiHighlightDigestRunning ? 'AI 总结生成中…' : 'AI 高亮总结';
    btn.setAttribute('aria-busy', String(Boolean(detailAiHighlightDigestRunning)));
  }

  const infoParts = [];
  infoParts.push(canRun ? `高亮总结：可生成（${highlights.length} 条高亮 / ${annotationsCount} 条注释）` : '高亮总结：需先创建高亮');
  if (generatedAt) infoParts.push(`生成于：${new Date(generatedAt).toLocaleString()}`);
  if (providerText) infoParts.push(`模型：${providerText}`);
  infoEl.textContent = infoParts.join(' · ');

  const summary = String(digest?.summary || '').trim();
  const themes = Array.isArray(digest?.themes) ? digest.themes.map((x) => String(x || '').trim()).filter(Boolean) : [];
  const keyInsights = Array.isArray(digest?.keyInsights) ? digest.keyInsights.map((x) => String(x || '').trim()).filter(Boolean) : [];
  const actionItems = Array.isArray(digest?.actionItems) ? digest.actionItems.map((x) => String(x || '').trim()).filter(Boolean) : [];
  const openQuestions = Array.isArray(digest?.openQuestions) ? digest.openQuestions.map((x) => String(x || '').trim()).filter(Boolean) : [];
  if (!summary && !themes.length && !keyInsights.length && !actionItems.length && !openQuestions.length) {
    boxEl.classList.add('hidden');
    boxEl.innerHTML = '';
    return;
  }

  boxEl.classList.remove('hidden');
  boxEl.innerHTML = `
    ${summary ? `<div class="detail-ai-reader-summary-block"><div class="detail-ai-reader-summary-label">知识卡片摘要</div><div class="detail-ai-reader-summary-text">${escapeHtml(summary)}</div></div>` : ''}
    ${themes.length ? `<div class="detail-ai-reader-summary-block"><div class="detail-ai-reader-summary-label">主题</div><div class="tag-list">${themes.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div></div>` : ''}
    ${keyInsights.length ? `<div class="detail-ai-reader-summary-block"><div class="detail-ai-reader-summary-label">关键洞见</div><ul class="detail-ai-reader-summary-points">${keyInsights.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul></div>` : ''}
    ${actionItems.length ? `<div class="detail-ai-reader-summary-block"><div class="detail-ai-reader-summary-label">行动项</div><ul class="detail-ai-reader-summary-points">${actionItems.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul></div>` : ''}
    ${openQuestions.length ? `<div class="detail-ai-reader-summary-block"><div class="detail-ai-reader-summary-label">待追问问题</div><ul class="detail-ai-reader-summary-points">${openQuestions.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul></div>` : ''}
  `;
}

function renderDetailRelatedBookmarksUi(item = null) {
  const infoEl = byId('detailRelatedBookmarksInfo');
  const listEl = byId('detailRelatedBookmarksList');
  const btn = byId('refreshRelatedBookmarksBtn');
  if (!infoEl || !listEl) return;

  const hasItem = Boolean(item && item.id);
  if (btn) {
    btn.disabled = !hasItem || Boolean(item?.deletedAt) || detailAiOperationBusy();
    btn.setAttribute('aria-busy', String(Boolean(detailAiRelatedRunning)));
    btn.textContent = detailAiRelatedRunning ? 'AI 推荐中…' : 'AI 推荐';
  }

  if (!hasItem) {
    infoEl.textContent = '';
    listEl.innerHTML = '';
    return;
  }

  const targetId = String(item.id);
  if (String(detailRelatedBookmarksState.bookmarkId || '') !== targetId) {
    infoEl.textContent = '点击“AI 推荐”生成相关书签。';
    listEl.innerHTML = '<div class="muted">暂无推荐结果。</div>';
    return;
  }

  if (detailRelatedBookmarksState.loading || detailAiRelatedRunning) {
    infoEl.textContent = 'AI 正在分析当前书签并生成相关推荐...';
    listEl.innerHTML = '<div class="muted">生成中，请稍候…</div>';
    return;
  }

  if (detailRelatedBookmarksState.error) {
    infoEl.textContent = `AI 推荐失败：${detailRelatedBookmarksState.error}`;
    listEl.innerHTML = '<div class="muted">可点击“AI 推荐”重试。</div>';
    return;
  }

  const rows = Array.isArray(detailRelatedBookmarksState.items) ? detailRelatedBookmarksState.items : [];
  const summary = String(detailRelatedBookmarksState.summary || '').trim();
  const confidence = Number(detailRelatedBookmarksState.confidence || 0);
  const bits = [];
  if (rows.length) bits.push(`${rows.length} 条推荐`);
  if (summary) bits.push(summary);
  if (confidence > 0) bits.push(`置信度 ${(confidence * 100).toFixed(0)}%`);
  infoEl.textContent = bits.join(' · ') || '暂无推荐结果';

  if (!rows.length) {
    listEl.innerHTML = '<div class="muted">AI 未找到明显相关的书签。</div>';
    return;
  }

  listEl.innerHTML = rows.map((r) => {
    const score = Number(r.score || 0);
    const host = String(r.host || hostFromUrl(r.url || '') || '');
    const timeText = (() => {
      const bm = state.bookmarks.find((x) => String(x.id) === String(r.id)) || state.allBookmarks.find((x) => String(x.id) === String(r.id));
      return bm ? bookmarkTimeText(bm) : '';
    })();
    const meta = [r.folderPath, host, timeText].filter(Boolean).join(' · ');
    return `<button type="button" class="detail-related-item" data-related-bookmark-open="${escapeHtml(String(r.id))}">
      <div class="detail-related-item-title-row">
        <span class="detail-related-item-title">${escapeHtml(r.title || '(untitled)')}</span>
        ${score > 0 ? `<span class="meta-chip info">${Math.round(score * 100)}%</span>` : ''}
      </div>
      <div class="detail-related-item-meta muted">${escapeHtml(meta)}</div>
      ${r.reason ? `<div class="detail-related-item-reason">${escapeHtml(r.reason)}</div>` : ''}
    </button>`;
  }).join('');

  listEl.querySelectorAll('[data-related-bookmark-open]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = String(el.dataset.relatedBookmarkOpen || '');
      if (!id) return;
      store.setActiveId(id);
      renderCards();
      renderDetail();
    });
  });
}

async function runAiRelatedBookmarksForActiveBookmark() {
  const item = state.bookmarks.find((x) => x.id === state.activeId) || state.allBookmarks.find((x) => x.id === state.activeId);
  if (!item || item.deletedAt) return;
  if (detailAiOperationBusy()) return;

  if (detailEditMode) {
    const ok = await uiConfirm('当前处于编辑模式，AI 相关推荐会刷新详情区域状态。是否继续？', {
      title: 'AI 相关书签推荐',
      confirmText: '继续',
      cancelText: '取消'
    });
    if (!ok) return;
  }

  detailAiRelatedRunning = true;
  detailRelatedBookmarksState = {
    bookmarkId: String(item.id),
    loading: true,
    items: [],
    summary: '',
    confidence: 0,
    error: ''
  };
  updateDetailPanelHeadUi(item);
  renderDetailRelatedBookmarksUi(item);
  try {
    const out = await api(`/api/product/ai/related/${encodeURIComponent(String(item.id))}`, {
      method: 'POST',
      body: JSON.stringify({ limit: 8 })
    });
    detailRelatedBookmarksState = {
      bookmarkId: String(item.id),
      loading: false,
      items: Array.isArray(out?.items) ? out.items : [],
      summary: String(out?.summary || ''),
      confidence: Math.max(0, Math.min(1, Number(out?.confidence) || 0)),
      error: ''
    };
    renderDetailRelatedBookmarksUi(item);
    const count = Array.isArray(out?.items) ? out.items.length : 0;
    showToast(count ? `AI 已生成 ${count} 条相关书签推荐` : 'AI 未找到明显相关的书签', { timeoutMs: 3400 });
  } catch (err) {
    detailRelatedBookmarksState = {
      bookmarkId: String(item.id),
      loading: false,
      items: [],
      summary: '',
      confidence: 0,
      error: String(err.message || err)
    };
    renderDetailRelatedBookmarksUi(item);
    showToast(err.message || 'AI 相关书签推荐失败', { timeoutMs: 4200 });
  } finally {
    detailAiRelatedRunning = false;
    const latest = state.bookmarks.find((x) => x.id === state.activeId) || state.allBookmarks.find((x) => x.id === state.activeId) || null;
    updateDetailPanelHeadUi(latest);
    if (latest) renderDetailRelatedBookmarksUi(latest);
  }
}

async function runAiHighlightCandidatesForActiveBookmark() {
  const item = state.bookmarks.find((x) => x.id === state.activeId) || state.allBookmarks.find((x) => x.id === state.activeId);
  if (!item || item.deletedAt) return;
  if (detailAiOperationBusy()) return;
  if (String(item?.article?.status || '') !== 'success' || !String(item?.article?.textContent || '').trim()) {
    showToast('请先提取正文，再生成高亮候选', { timeoutMs: 3200 });
    return;
  }
  if (detailEditMode) {
    const ok = await uiConfirm('当前处于编辑模式，AI 高亮候选会刷新当前条目并覆盖未保存改动。是否继续？', {
      title: 'AI 高亮候选',
      confirmText: '继续',
      cancelText: '取消'
    });
    if (!ok) return;
  }

  detailAiHighlightCandidatesRunning = true;
  renderDetailHighlightCandidatesUi(item);
  updateDetailPanelHeadUi(item);
  try {
    const out = await api(`/api/product/ai/highlight-candidates/${encodeURIComponent(String(item.id))}`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    const count = Array.isArray(out?.candidates) ? out.candidates.length : 0;
    showToast(count ? `AI 已生成 ${count} 条高亮候选` : 'AI 未找到明显可高亮片段', { timeoutMs: 3400 });
    await refreshAll();
  } catch (err) {
    showToast(err.message || 'AI 高亮候选生成失败', { timeoutMs: 4200 });
  } finally {
    detailAiHighlightCandidatesRunning = false;
    const latest = state.bookmarks.find((x) => x.id === state.activeId) || state.allBookmarks.find((x) => x.id === state.activeId) || null;
    if (latest) renderDetailHighlightCandidatesUi(latest);
    updateDetailPanelHeadUi(latest);
  }
}

async function runAiHighlightDigestForActiveBookmark() {
  const item = state.bookmarks.find((x) => x.id === state.activeId) || state.allBookmarks.find((x) => x.id === state.activeId);
  if (!item || item.deletedAt) return;
  if (detailAiOperationBusy()) return;
  const highlights = Array.isArray(item.highlights) ? item.highlights : [];
  if (!highlights.length) {
    showToast('请先创建高亮，再生成 AI 高亮总结', { timeoutMs: 3200 });
    return;
  }

  if (detailEditMode) {
    const ok = await uiConfirm('当前处于编辑模式，AI 高亮总结会刷新当前条目并覆盖未保存改动。是否继续？', {
      title: 'AI 高亮总结',
      confirmText: '继续',
      cancelText: '取消'
    });
    if (!ok) return;
  }

  detailAiHighlightDigestRunning = true;
  renderDetailHighlightDigestUi(item);
  updateDetailPanelHeadUi(item);
  try {
    const out = await api(`/api/product/ai/highlight-digest/${encodeURIComponent(String(item.id))}`, {
      method: 'POST',
      body: JSON.stringify({ apply: true })
    });
    const digest = out?.highlightDigest || out?.bookmark?.aiSuggestions?.highlightDigest || {};
    const summary = String(digest.summary || '').trim();
    showToast(summary ? `AI 高亮总结已生成：${summary.slice(0, 60)}${summary.length > 60 ? '…' : ''}` : 'AI 高亮总结已生成', { timeoutMs: 3800 });
    await refreshAll();
  } catch (err) {
    showToast(err.message || 'AI 高亮总结失败', { timeoutMs: 4200 });
  } finally {
    detailAiHighlightDigestRunning = false;
    const latest = state.bookmarks.find((x) => x.id === state.activeId) || state.allBookmarks.find((x) => x.id === state.activeId) || null;
    if (latest) renderDetailHighlightDigestUi(latest);
    updateDetailPanelHeadUi(latest);
  }
}

function currentCollectionForAiSummary() {
  const folderId = String(state.filters.folderId || 'all');
  if (!folderId || folderId === 'all') return null;
  return getFolderById(folderId);
}

function formatAiFolderSummaryText(result = null) {
  const summary = result && typeof result === 'object' ? result : null;
  if (!summary) return '';
  const lines = [];
  if (summary.folderPath || summary.folderName) lines.push(`集合：${summary.folderPath || summary.folderName}`);
  if (summary.summary) {
    lines.push('');
    lines.push('摘要');
    lines.push(String(summary.summary));
  }
  if (Array.isArray(summary.themes) && summary.themes.length) {
    lines.push('');
    lines.push(`主题：${summary.themes.join(' / ')}`);
  }
  if (Array.isArray(summary.commonTags) && summary.commonTags.length) {
    lines.push(`常见标签：${summary.commonTags.join(', ')}`);
  }
  if (Array.isArray(summary.representativeSources) && summary.representativeSources.length) {
    lines.push(`代表来源：${summary.representativeSources.join(', ')}`);
  }
  if (Array.isArray(summary.keyInsights) && summary.keyInsights.length) {
    lines.push('');
    lines.push('关键洞见');
    summary.keyInsights.forEach((x) => lines.push(`- ${x}`));
  }
  if (Array.isArray(summary.notableBookmarks) && summary.notableBookmarks.length) {
    lines.push('');
    lines.push('代表书签');
    summary.notableBookmarks.forEach((x) => lines.push(`- ${x.title || x.bookmarkId}${x.reason ? `：${x.reason}` : ''}`));
  }
  return lines.join('\n').trim();
}

function renderAiFolderSummaryDialogUi() {
  const dialog = byId('aiFolderSummaryDialog');
  if (!dialog) return;
  const subtitleEl = byId('aiFolderSummarySubtitle');
  const metaEl = byId('aiFolderSummaryMeta');
  const contentEl = byId('aiFolderSummaryContent');
  const runBtn = byId('aiFolderSummaryRunBtn');
  const copyBtn = byId('aiFolderSummaryCopyBtn');
  const clearBtn = byId('aiFolderSummaryClearBtn');
  if (!subtitleEl || !metaEl || !contentEl || !runBtn || !copyBtn || !clearBtn) return;

  const folder = currentCollectionForAiSummary();
  const folderId = String(folder?.id || aiFolderSummaryDialogState.folderId || '');
  const folderPath = folder?.path || folderName(folderId) || String(folder?.name || '');
  const persisted = folder?.aiSuggestions?.collectionSummary && typeof folder.aiSuggestions.collectionSummary === 'object'
    ? folder.aiSuggestions.collectionSummary
    : null;
  const result = aiFolderSummaryDialogState.result && String(aiFolderSummaryDialogState.folderId || '') === String(folderId)
    ? aiFolderSummaryDialogState.result
    : (aiFolderSummaryDialogState.suppressPersisted ? null : persisted);
  const loading = Boolean(aiFolderSummaryDialogState.loading);
  const error = String(aiFolderSummaryDialogState.error || '');
  const hasFolder = Boolean(folder && folderId);

  subtitleEl.textContent = hasFolder
    ? `对集合「${folderPath || folder.name || folderId}」生成主题总结、常见标签与代表来源。`
    : '请先在左侧选择一个集合，然后点击生成。';

  const metaBits = [];
  if (loading) metaBits.push('AI 正在分析集合内容...');
  if (hasFolder) metaBits.push(`集合：${folderPath || folder.name || folderId}`);
  if (result?.bookmarkCount) metaBits.push(`${Number(result.bookmarkCount)} 条书签`);
  if (result?.descendantFolderCount) metaBits.push(`${Number(result.descendantFolderCount)} 个子集合`);
  if (result?.generatedAt) metaBits.push(`生成于：${new Date(Number(result.generatedAt)).toLocaleString()}`);
  if (result?.provider?.providerType) {
    metaBits.push(`模型：${result.provider.providerType}${result.provider.model ? `/${result.provider.model}` : ''}`);
  }
  if (error) metaBits.unshift(`失败：${error}`);
  metaEl.textContent = metaBits.join(' · ') || '暂无结果。';

  runBtn.disabled = !hasFolder || loading;
  runBtn.textContent = loading ? '生成中…' : '生成摘要';
  runBtn.setAttribute('aria-busy', String(loading));
  copyBtn.disabled = !String(formatAiFolderSummaryText(result)).trim();
  clearBtn.disabled = loading && !result;

  if (loading && !result) {
    contentEl.innerHTML = `<div class="muted">AI 正在整理该集合的主题与来源结构，请稍候…</div>`;
    return;
  }
  if (error && !result) {
    contentEl.innerHTML = `<div class="muted">生成失败：${escapeHtml(error)}</div>`;
    return;
  }
  if (!result) {
    contentEl.innerHTML = `<div class="muted">暂无结果。</div>`;
    return;
  }

  const themes = Array.isArray(result.themes) ? result.themes : [];
  const commonTags = Array.isArray(result.commonTags) ? result.commonTags : [];
  const sources = Array.isArray(result.representativeSources) ? result.representativeSources : [];
  const notable = Array.isArray(result.notableBookmarks) ? result.notableBookmarks : [];
  const topTags = Array.isArray(result.topTags) ? result.topTags : [];
  const topHosts = Array.isArray(result.topHosts) ? result.topHosts : [];

  contentEl.innerHTML = `
    <section class="ai-folder-summary-panel">
      <div class="ai-folder-summary-panel-title">主题摘要</div>
      <div class="ai-folder-summary-text">${escapeHtml(String(result.summary || '暂无摘要'))}</div>
    </section>
    ${themes.length ? `<section class="ai-folder-summary-panel"><div class="ai-folder-summary-panel-title">主题</div><div class="tag-list">${themes.map((x) => `<span class="tag">${escapeHtml(String(x))}</span>`).join('')}</div></section>` : ''}
    ${commonTags.length ? `<section class="ai-folder-summary-panel"><div class="ai-folder-summary-panel-title">常见标签</div><div class="tag-list">${commonTags.map((x) => `<span class="tag">${escapeHtml(String(x))}</span>`).join('')}</div></section>` : ''}
    ${sources.length ? `<section class="ai-folder-summary-panel"><div class="ai-folder-summary-panel-title">代表来源</div><div class="ai-folder-summary-chip-list">${sources.map((x) => `<span class="meta-chip type">${escapeHtml(String(x))}</span>`).join('')}</div></section>` : ''}
    ${notable.length ? `<section class="ai-folder-summary-panel"><div class="ai-folder-summary-panel-title">代表书签</div><div class="ai-folder-summary-list">${notable.map((x) => `<button type="button" class="ai-folder-summary-item" data-ai-folder-summary-open="${escapeHtml(String(x.bookmarkId || ''))}"><div class="ai-folder-summary-item-title">${escapeHtml(String(x.title || x.bookmarkId || ''))}</div>${x.reason ? `<div class="ai-folder-summary-item-reason muted">${escapeHtml(String(x.reason))}</div>` : ''}</button>`).join('')}</div></section>` : ''}
    ${(topTags.length || topHosts.length) ? `<section class="ai-folder-summary-panel"><div class="ai-folder-summary-panel-title">统计参考</div>
      ${topTags.length ? `<div class="ai-folder-summary-stat-block"><div class="muted">Top 标签</div><div class="ai-folder-summary-chip-list">${topTags.slice(0, 8).map((x) => `<span class="meta-chip">${escapeHtml(String(x.tag || ''))} · ${Number(x.count || 0)}</span>`).join('')}</div></div>` : ''}
      ${topHosts.length ? `<div class="ai-folder-summary-stat-block"><div class="muted">Top 来源</div><div class="ai-folder-summary-chip-list">${topHosts.slice(0, 8).map((x) => `<span class="meta-chip">${escapeHtml(String(x.host || ''))} · ${Number(x.count || 0)}</span>`).join('')}</div></div>` : ''}
    </section>` : ''}
  `;

  contentEl.querySelectorAll('[data-ai-folder-summary-open]').forEach((el) => {
    el.addEventListener('click', () => {
      const bookmarkId = String(el.getAttribute('data-ai-folder-summary-open') || '').trim();
      if (!bookmarkId) return;
      store.setActiveId(bookmarkId);
      renderCards();
      renderDetail();
      showToast('已定位到代表书签', { timeoutMs: 1800 });
    });
  });
}

function openAiFolderSummaryDialog() {
  const dialog = byId('aiFolderSummaryDialog');
  if (!dialog) return;
  const folder = currentCollectionForAiSummary();
  aiFolderSummaryDialogState = {
    ...aiFolderSummaryDialogState,
    folderId: String(folder?.id || ''),
    error: '',
    suppressPersisted: false,
    result: (folder?.aiSuggestions?.collectionSummary && typeof folder.aiSuggestions.collectionSummary === 'object')
      ? folder.aiSuggestions.collectionSummary
      : null
  };
  renderAiFolderSummaryDialogUi();
  if (!dialog.open) dialog.showModal();
  if (folder && !aiFolderSummaryDialogState.result) {
    void runAiFolderSummaryForCurrentCollection();
  }
}

function closeAiFolderSummaryDialog() {
  const dialog = byId('aiFolderSummaryDialog');
  if (dialog?.open) dialog.close();
}

function clearAiFolderSummaryDialogResult() {
  aiFolderSummaryDialogState = {
    ...aiFolderSummaryDialogState,
    loading: false,
    result: null,
    error: '',
    suppressPersisted: true
  };
  renderAiFolderSummaryDialogUi();
}

async function runAiFolderSummaryForCurrentCollection() {
  const folder = currentCollectionForAiSummary();
  if (!folder) {
    showToast('请先在左侧选择一个集合', { timeoutMs: 2600 });
    return;
  }
  if (aiFolderSummaryDialogState.loading) return;
  aiFolderSummaryDialogState = {
    ...aiFolderSummaryDialogState,
    folderId: String(folder.id),
    loading: true,
    error: '',
    suppressPersisted: false
  };
  renderAiFolderSummaryDialogUi();
  try {
    const out = await api(`/api/product/ai/folder-summary/${encodeURIComponent(String(folder.id))}`, {
      method: 'POST',
      body: JSON.stringify({ apply: true })
    });
    aiFolderSummaryDialogState = {
      ...aiFolderSummaryDialogState,
      loading: false,
      folderId: String(folder.id),
      result: out?.collectionSummary || out?.folder?.aiSuggestions?.collectionSummary || null,
      error: ''
    };
    renderAiFolderSummaryDialogUi();
    await refreshAll();
    const summary = String(aiFolderSummaryDialogState.result?.summary || '').trim();
    showToast(summary ? `AI 集合摘要已生成：${summary.slice(0, 60)}${summary.length > 60 ? '…' : ''}` : 'AI 集合摘要已生成', { timeoutMs: 3800 });
  } catch (err) {
    aiFolderSummaryDialogState = {
      ...aiFolderSummaryDialogState,
      loading: false,
      error: String(err.message || err)
    };
    renderAiFolderSummaryDialogUi();
    showToast(err.message || 'AI 集合知识摘要失败', { timeoutMs: 4200 });
  }
}

function getAiQaContextBookmark() {
  const scope = String(aiQaDialogState.scope || 'auto');
  if (scope === 'all') return null;
  const preferredId = String(aiQaDialogState.bookmarkId || state.activeId || '').trim();
  if (!preferredId) return null;
  return state.bookmarks.find((x) => String(x.id) === preferredId)
    || state.allBookmarks.find((x) => String(x.id) === preferredId)
    || null;
}

function renderAiQaDialogUi() {
  const dialog = byId('aiQaDialog');
  if (!dialog) return;
  const questionEl = byId('aiQaQuestion');
  const scopeEl = byId('aiQaScope');
  const limitEl = byId('aiQaLimit');
  const askBtn = byId('aiQaAskBtn');
  const copyBtn = byId('aiQaCopyAnswerBtn');
  const clearBtn = byId('aiQaClearBtn');
  const metaEl = byId('aiQaMeta');
  const answerEl = byId('aiQaAnswer');
  const sourcesEl = byId('aiQaSources');
  if (!questionEl || !scopeEl || !limitEl || !askBtn || !copyBtn || !clearBtn || !metaEl || !answerEl || !sourcesEl) return;

  if (questionEl.value !== String(aiQaDialogState.question || '')) {
    questionEl.value = String(aiQaDialogState.question || '');
  }
  scopeEl.value = ['auto', 'all', 'current_only'].includes(String(aiQaDialogState.scope || 'auto'))
    ? String(aiQaDialogState.scope || 'auto')
    : 'auto';
  limitEl.value = String(Math.max(1, Math.min(10, Number(aiQaDialogState.limit) || 6)));

  const ctx = getAiQaContextBookmark();
  const scope = String(aiQaDialogState.scope || 'auto');
  const loading = Boolean(aiQaDialogState.loading);
  const canAsk = !loading && !detailAiOperationBusy() && String(questionEl.value || '').trim().length > 0;
  askBtn.disabled = !canAsk;
  askBtn.setAttribute('aria-busy', String(loading));
  askBtn.textContent = loading ? '问答中…' : '开始问答';
  copyBtn.disabled = !String(aiQaDialogState.answer || '').trim();
  clearBtn.disabled = loading && !String(aiQaDialogState.answer || '').trim();

  const metaBits = [];
  if (scope === 'all') metaBits.push('范围：全部书签');
  else if (scope === 'current_only') metaBits.push(ctx ? `范围：仅当前书签（${ctx.title || ctx.id}）` : '范围：仅当前书签（未选中）');
  else metaBits.push(ctx ? `范围：当前书签优先（${ctx.title || ctx.id}）` : '范围：全部书签（当前未选中书签）');
  if (Number(aiQaDialogState.confidence || 0) > 0) metaBits.push(`置信度 ${(Number(aiQaDialogState.confidence) * 100).toFixed(0)}%`);
  if (aiQaDialogState.insufficient) metaBits.push('信息可能不足');
  if (loading) metaBits.unshift('AI 正在分析书签内容...');
  else if (aiQaDialogState.error) metaBits.unshift(`失败：${aiQaDialogState.error}`);
  metaEl.textContent = metaBits.filter(Boolean).join(' · ') || '输入问题后点击“开始问答”。';

  if (aiQaDialogState.answer) {
    answerEl.textContent = String(aiQaDialogState.answer || '');
    answerEl.classList.remove('muted');
  } else if (loading) {
    answerEl.textContent = '正在生成回答，请稍候…';
    answerEl.classList.add('muted');
  } else if (aiQaDialogState.error) {
    answerEl.textContent = `问答失败：${aiQaDialogState.error}`;
    answerEl.classList.add('muted');
  } else {
    answerEl.textContent = '暂无回答。';
    answerEl.classList.add('muted');
  }

  const sources = Array.isArray(aiQaDialogState.sources) ? aiQaDialogState.sources : [];
  if (!sources.length) {
    sourcesEl.innerHTML = `<div class="muted">${loading ? '等待 AI 返回出处…' : '暂无出处。'}</div>`;
    return;
  }
  sourcesEl.innerHTML = sources.map((src, idx) => {
    const id = String(src?.id || '');
    const title = String(src?.title || '(untitled)');
    const host = String(src?.host || hostFromUrl(src?.url || '') || '');
    const folderPath = String(src?.folderPath || '');
    const score = Math.max(0, Math.min(1, Number(src?.score) || 0));
    const reason = String(src?.reason || '');
    const excerpt = String(src?.excerpt || '').trim();
    const meta = [folderPath, host].filter(Boolean).join(' · ');
    return `<button type="button" class="ai-qa-source-item" data-ai-qa-source-open="${escapeHtml(id)}">
      <div class="ai-qa-source-row">
        <span class="ai-qa-source-index">${idx + 1}</span>
        <span class="ai-qa-source-title">${escapeHtml(title)}</span>
        ${score > 0 ? `<span class="meta-chip info">${Math.round(score * 100)}%</span>` : ''}
      </div>
      ${meta ? `<div class="ai-qa-source-meta muted">${escapeHtml(meta)}</div>` : ''}
      ${reason ? `<div class="ai-qa-source-reason">${escapeHtml(reason)}</div>` : ''}
      ${excerpt ? `<div class="ai-qa-source-excerpt">${escapeHtml(excerpt)}</div>` : ''}
    </button>`;
  }).join('');

  sourcesEl.querySelectorAll('[data-ai-qa-source-open]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = String(el.dataset.aiQaSourceOpen || '').trim();
      if (!id) return;
      store.setActiveId(id);
      aiQaDialogState.bookmarkId = id;
      renderCards();
      renderDetail();
      renderAiQaDialogUi();
    });
  });
}

function openAiQaDialog({ bookmarkId = null, question = '', scope = null } = {}) {
  const dialog = byId('aiQaDialog');
  if (!dialog) return;
  const prevBookmarkId = String(aiQaDialogState.bookmarkId || '');
  const prevScope = String(aiQaDialogState.scope || 'auto');
  const incomingBookmarkId = String(bookmarkId || state.activeId || '').trim();
  if (incomingBookmarkId) aiQaDialogState.bookmarkId = incomingBookmarkId;
  if (typeof question === 'string' && question) aiQaDialogState.question = question;
  if (scope) aiQaDialogState.scope = String(scope);
  if (!String(aiQaDialogState.scope || '').trim()) aiQaDialogState.scope = 'auto';
  const currentBookmarkId = String(aiQaDialogState.bookmarkId || '');
  const currentScope = String(aiQaDialogState.scope || 'auto');
  if (currentBookmarkId !== prevBookmarkId || currentScope !== prevScope) {
    aiQaDialogState = {
      ...aiQaDialogState,
      answer: '',
      sources: [],
      insufficient: false,
      confidence: 0,
      error: ''
    };
  }
  renderAiQaDialogUi();
  if (!dialog.open) dialog.showModal();
  queueMicrotask(() => byId('aiQaQuestion')?.focus?.());
}

function closeAiQaDialog() {
  const dialog = byId('aiQaDialog');
  if (dialog?.open) dialog.close();
}

function clearAiQaDialogResult({ preserveQuestion = true } = {}) {
  aiQaDialogState = {
    ...aiQaDialogState,
    loading: false,
    question: preserveQuestion ? String(aiQaDialogState.question || '') : '',
    answer: '',
    sources: [],
    insufficient: false,
    confidence: 0,
    error: ''
  };
  renderAiQaDialogUi();
}

async function runAiQaFromDialog() {
  if (detailAiOperationBusy()) return;
  const question = String(byId('aiQaQuestion')?.value || '').trim();
  if (!question) {
    showToast('请输入问题', { timeoutMs: 2500 });
    byId('aiQaQuestion')?.focus?.();
    return;
  }
  const scope = String(byId('aiQaScope')?.value || 'auto');
  const limit = Math.max(1, Math.min(10, Number(byId('aiQaLimit')?.value || 6) || 6));
  const currentCtxId = String(aiQaDialogState.bookmarkId || state.activeId || '').trim();
  if (scope === 'current_only' && !currentCtxId) {
    showToast('“仅当前书签”需要先选中一条书签', { timeoutMs: 3000 });
    return;
  }

  aiQaDialogState = {
    ...aiQaDialogState,
    loading: true,
    question,
    scope,
    limit,
    error: '',
    answer: '',
    sources: [],
    insufficient: false,
    confidence: 0,
    bookmarkId: currentCtxId || aiQaDialogState.bookmarkId || ''
  };
  detailAiQaRunning = true;
  renderAiQaDialogUi();
  updateDetailPanelHeadUi(state.bookmarks.find((x) => x.id === state.activeId) || state.allBookmarks.find((x) => x.id === state.activeId) || null);

  try {
    const body = {
      question,
      scope,
      limit
    };
    if (scope === 'current_only' && currentCtxId) {
      body.bookmarkId = currentCtxId;
      body.bookmarkIds = [currentCtxId];
    } else if (scope === 'auto' && currentCtxId) {
      body.bookmarkId = currentCtxId;
    }
    const out = await api('/api/product/ai/qa', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    aiQaDialogState = {
      ...aiQaDialogState,
      loading: false,
      answer: String(out?.answer || ''),
      sources: Array.isArray(out?.sources) ? out.sources : [],
      insufficient: Boolean(out?.insufficient),
      confidence: Math.max(0, Math.min(1, Number(out?.confidence) || 0)),
      error: ''
    };
    renderAiQaDialogUi();
    const sourcesCount = Array.isArray(out?.sources) ? out.sources.length : 0;
    showToast(sourcesCount ? `AI 已生成回答（引用 ${sourcesCount} 条出处）` : 'AI 已生成回答', { timeoutMs: 3400 });
  } catch (err) {
    aiQaDialogState = {
      ...aiQaDialogState,
      loading: false,
      error: String(err.message || err),
      answer: '',
      sources: [],
      insufficient: false,
      confidence: 0
    };
    renderAiQaDialogUi();
    showToast(err.message || 'AI 书签问答失败', { timeoutMs: 4200 });
  } finally {
    detailAiQaRunning = false;
    const latest = state.bookmarks.find((x) => x.id === state.activeId) || state.allBookmarks.find((x) => x.id === state.activeId) || null;
    updateDetailPanelHeadUi(latest);
    renderDetailRelatedBookmarksUi(latest);
  }
}

async function loadHighlightsForBookmark(bookmarkId, { force = false } = {}) {
  const bid = String(bookmarkId || state.activeId || '');
  if (!bid) {
    renderHighlightsList([], { bookmarkId: '' });
    return [];
  }
  if (!force && detailHighlightsBookmarkId === bid) return [];
  const seq = ++detailHighlightsLoadSeq;
  const out = await api(`/api/bookmarks/${bid}/highlights`);
  if (seq !== detailHighlightsLoadSeq) return [];
  const highlights = Array.isArray(out?.highlights) ? out.highlights : [];
  detailHighlightsBookmarkId = bid;
  renderHighlightsList(highlights, { bookmarkId: bid });
  return highlights;
}

async function loadLatestMetadataTaskForBookmark(bookmarkId, { force = false } = {}) {
  const activeBookmarkId = state.activeId ? String(state.activeId) : '';
  const targetBookmarkId = String(bookmarkId || activeBookmarkId || '');
  if (!targetBookmarkId) {
    renderMetadataTaskUi(null);
    return null;
  }

  if (!force && detailMetadataTaskBookmarkId === targetBookmarkId && detailMetadataTaskLatestId) {
    return null;
  }

  const seq = ++metadataTaskLoadSeq;
  const out = await api(`/api/bookmarks/${targetBookmarkId}/metadata/tasks?limit=1`);
  if (seq !== metadataTaskLoadSeq) return null;
  const task = Array.isArray(out?.tasks) ? out.tasks[0] : null;
  renderMetadataTaskUi(task, { bookmarkId: targetBookmarkId });
  if (task && !isMetadataTaskTerminal(task.status)) {
    startMetadataTaskPoll(task.id, targetBookmarkId);
  } else if (task) {
    stopMetadataTaskPoll();
  }
  return task;
}

async function loadMetadataTaskHistoryForBookmark(bookmarkId) {
  const targetBookmarkId = String(bookmarkId || state.activeId || '');
  if (!targetBookmarkId) {
    renderMetadataTaskHistory([]);
    return [];
  }
  const out = await api(`/api/bookmarks/${targetBookmarkId}/metadata/tasks?limit=5`);
  const tasks = Array.isArray(out?.tasks) ? out.tasks : [];
  renderMetadataTaskHistory(tasks, { bookmarkId: targetBookmarkId });
  return tasks;
}

function startMetadataTaskPoll(taskId, bookmarkId) {
  stopMetadataTaskPoll();
  const targetTaskId = String(taskId || '');
  const targetBookmarkId = String(bookmarkId || state.activeId || '');
  if (!targetTaskId || !targetBookmarkId) return;
  metadataTaskPollTimer = setInterval(async () => {
    try {
      if (!state.activeId || String(state.activeId) !== targetBookmarkId) {
        stopMetadataTaskPoll();
        return;
      }
      const out = await api(`/api/metadata/tasks/${targetTaskId}`);
      const task = out?.task || null;
      renderMetadataTaskUi(task, { bookmarkId: targetBookmarkId });
      if (!task || isMetadataTaskTerminal(task.status)) {
        stopMetadataTaskPoll();
        await loadMetadataTaskHistoryForBookmark(targetBookmarkId);
        await refreshAll();
      }
    } catch (_err) {
      stopMetadataTaskPoll();
    }
  }, 1500);
}

function renderDetail() {
  const item = state.bookmarks.find((x) => x.id === state.activeId) || state.allBookmarks.find((x) => x.id === state.activeId);
  const form = byId('detailForm');
  const empty = byId('emptyDetail');
  const shell = document.querySelector('.shell');
  const closeBtn = byId('detailCloseBtn');
  const backdrop = byId('detailPanelBackdrop');
  if (shell) shell.classList.toggle('detail-panel-open', Boolean(item));
  if (closeBtn) closeBtn.classList.toggle('hidden', !item);
  if (backdrop) backdrop.classList.toggle('hidden', !item);
  if (!item) setDetailPanelMoreMenuOpen(false);

  if (!item) {
    form.classList.add('hidden');
    empty.classList.remove('hidden');
    byId('detailMetaInfo').textContent = '';
    renderMetadataTaskUi(null);
    renderMetadataTaskHistory([]);
    stopMetadataTaskPoll();
    detailMetadataTaskBookmarkId = null;
    detailMetadataTaskLatestId = null;
    detailHighlightsBookmarkId = null;
    byId('detailArticleInfo').textContent = '';
    byId('detailReaderSummaryInfo').textContent = '';
    byId('detailReaderSummaryBox').classList.add('hidden');
    byId('detailReaderSummaryBox').innerHTML = '';
    byId('detailHighlightsInfo').textContent = '';
    byId('detailHighlightCandidatesInfo').textContent = '';
    byId('detailHighlightCandidatesList').classList.add('hidden');
    byId('detailHighlightCandidatesList').innerHTML = '';
    byId('detailHighlightDigestInfo').textContent = '';
    byId('detailHighlightDigestBox').classList.add('hidden');
    byId('detailHighlightDigestBox').innerHTML = '';
    byId('detailHighlightsList').innerHTML = '';
    byId('detailRelatedBookmarksInfo').textContent = '';
    byId('detailRelatedBookmarksList').innerHTML = '';
    detailRelatedBookmarksState = {
      bookmarkId: '',
      loading: false,
      items: [],
      summary: '',
      confidence: 0,
      error: ''
    };
    byId('detailReminderInfo').textContent = '';
    renderDetailFetchStatusSummary({ item: null });
    if (byId('detailSummaryKind')) byId('detailSummaryKind').textContent = '未选择';
    if (byId('detailSummaryTitle')) byId('detailSummaryTitle').textContent = '选择一个书签';
    if (byId('detailSummaryHost')) byId('detailSummaryHost').textContent = '';
    if (byId('detailSummaryChips')) byId('detailSummaryChips').innerHTML = '';
    detailEditMode = false;
    detailEditBookmarkId = null;
    updateDetailPanelHeadUi(null);
    renderDetailEditUi(null);
    applyDetailSectionUi();
    renderAiQaDialogUi();
    return;
  }

  empty.classList.add('hidden');
  form.classList.remove('hidden');
  if (detailEditBookmarkId !== String(item.id)) {
    detailEditBookmarkId = String(item.id);
    detailEditMode = false;
  }

  byId('detailTitle').value = item.title || '';
  byId('detailUrl').value = item.url || '';
  byId('detailFolder').innerHTML = folderOptionsHtml(item.folderId || 'root');
  byId('detailTags').value = (item.tags || []).join(', ');
  byId('detailNote').value = item.note || '';
  byId('detailReminder').value = item.reminderAt || '';
  byId('detailReminderInfo').textContent = reminderInfoText(item);
  byId('detailFavorite').checked = Boolean(item.favorite);
  byId('detailArchived').checked = Boolean(item.archived);
  byId('detailRead').checked = Boolean(item.read);
  if (byId('detailSummaryKind')) byId('detailSummaryKind').textContent = kindLabel(inferItemKind(item));
  if (byId('detailSummaryTitle')) byId('detailSummaryTitle').textContent = item.title || '(untitled)';
  if (byId('detailSummaryHost')) {
    const host = hostFromUrl(item.url || '');
    const ts = bookmarkTimeText(item);
    byId('detailSummaryHost').textContent = [host || '', ts || ''].filter(Boolean).join(' · ');
  }
  if (byId('detailSummaryChips')) {
    const chips = [];
    if (item.favorite) chips.push('<span class="meta-chip type">收藏</span>');
    if (item.archived) chips.push('<span class="meta-chip type">归档</span>');
    if (!item.read) chips.push('<span class="meta-chip info">未读</span>');
    const metaStatus = String(item?.metadata?.status || '').trim();
    if (metaStatus === 'success') chips.push('<span class="meta-chip success">元数据成功</span>');
    else if (metaStatus === 'failed') chips.push('<span class="meta-chip danger">元数据失败</span>');
    else if (metaStatus === 'fetching') chips.push('<span class="meta-chip info">抓取中</span>');
    else if (metaStatus === 'queued') chips.push('<span class="meta-chip">排队中</span>');
    const previewOpen = Boolean(byId('previewDialog')?.open && String(previewActiveBookmarkId || '') === String(item.id));
    if (previewOpen) {
      if (previewUiState === 'loading') chips.push('<span class="meta-chip info">预览加载中</span>');
      else if (previewUiState === 'ready') chips.push('<span class="meta-chip success">预览已打开</span>');
      else if (previewUiState === 'fallback') chips.push('<span class="meta-chip">预览降级</span>');
      else if (previewUiState === 'error') chips.push('<span class="meta-chip danger">预览失败</span>');
      if (previewMode === 'reader') chips.push('<span class="meta-chip info">阅读模式</span>');
    }
    byId('detailSummaryChips').innerHTML = chips.join('');
  }
  hydrateDetailHeaderIcons(item);
  updateDetailPanelHeadUi(item);
  renderDetailEditUi(item);
  applyDetailSectionUi();
  renderAiQaDialogUi();
  renderDetailRelatedBookmarksUi(item);
  const meta = item.metadata || {};
  const parts = [];
  if (meta.status) parts.push(`metadata: ${meta.status}`);
  if (meta.siteName) parts.push(`site: ${meta.siteName}`);
  if (meta.fetchedAt) parts.push(`fetched: ${new Date(Number(meta.fetchedAt)).toLocaleString()}`);
  if (meta.error) parts.push(`错误：${meta.error}`);
  byId('detailMetaInfo').textContent = parts.join(' · ');
  const article = item.article || {};
  const articleParts = [];
  if (article.status) articleParts.push(`article: ${article.status}`);
  if (article.title) articleParts.push(`reader title: ${article.title}`);
  if (article.extractedAt) articleParts.push(`extracted: ${new Date(Number(article.extractedAt)).toLocaleString()}`);
  if (article.error) articleParts.push(`错误：${article.error}`);
  byId('detailArticleInfo').textContent = articleParts.join(' · ');
  renderDetailReaderSummaryUi(item);
  renderDetailHighlightCandidatesUi(item);
  renderDetailHighlightDigestUi(item);
  renderDetailFetchStatusSummary({ item });
  if (detailHighlightsBookmarkId !== String(item.id)) {
    detailHighlightsBookmarkId = '';
    void loadHighlightsForBookmark(item.id, { force: true });
  }
  if (detailMetadataTaskBookmarkId !== String(item.id)) {
    detailMetadataTaskBookmarkId = String(item.id);
    detailMetadataTaskLatestId = null;
    renderMetadataTaskUi(null, { bookmarkId: item.id });
    void loadLatestMetadataTaskForBookmark(item.id, { force: true });
    void loadMetadataTaskHistoryForBookmark(item.id);
  } else if (['queued', 'fetching', 'retry_scheduled'].includes(String(meta.status || ''))) {
    void loadLatestMetadataTaskForBookmark(item.id, { force: true });
    void loadMetadataTaskHistoryForBookmark(item.id);
  }

  byId('restoreDetailBtn').classList.toggle('hidden', !item.deletedAt);
  byId('deleteDetailBtn').classList.toggle('hidden', Boolean(item.deletedAt));
  byId('detailHeaderRestoreBtn')?.classList.toggle('hidden', !item.deletedAt);
  byId('detailHeaderDeleteBtn')?.classList.toggle('hidden', Boolean(item.deletedAt));
}

function hydrateDetailHeaderIcons(item = null) {
  const mappings = [
    ['detailCloseBtn', 'close', '关闭详情'],
    ['detailPrevBtn', 'chevron-left', '上一条'],
    ['detailNextBtn', 'chevron-right', '下一条'],
    ['detailPanelWebBtn', 'web', '网页预览'],
    ['detailPanelReaderBtn', 'article', '阅读模式'],
    ['detailPanelMoreBtn', 'more', '更多操作'],
    ['detailHeaderOpenBtn', 'open', '打开'],
    ['detailHeaderPreviewBtn', 'preview', '预览'],
    ['detailHeaderAiTagBtn', 'ai', 'AI 自动打标签'],
    ['detailHeaderEditBtn', 'edit', '编辑'],
    ['detailHeaderCancelEditBtn', 'close', '取消编辑'],
    ['detailHeaderDeleteBtn', 'delete', '删除'],
    ['detailHeaderRestoreBtn', 'restore', '恢复']
  ];
  mappings.forEach(([id, icon, label]) => {
    const btn = byId(id);
    if (!btn || btn.dataset.iconHydrated) return;
    btn.innerHTML = `${iconSvg(icon, { title: label })}<span class="sr-only">${escapeHtml(label)}</span>`;
    btn.dataset.iconHydrated = '1';
  });
  const host = String(item?.url || '').trim();
  if (byId('detailHeaderOpenBtn')) byId('detailHeaderOpenBtn').disabled = !host;
  if (byId('detailHeaderPreviewBtn')) byId('detailHeaderPreviewBtn').disabled = !String(item?.id || '').trim();
}

function renderDetailEditUi(item = null) {
  const editableTextIds = ['detailTitle', 'detailUrl', 'detailTags', 'detailNote', 'detailReminder'];
  const editableSelectIds = ['detailFolder'];
  const editableCheckIds = ['detailFavorite', 'detailArchived', 'detailRead'];
  const editable = Boolean(item && detailEditMode);

  editableTextIds.forEach((id) => {
    const el = byId(id);
    if (!el) return;
    if ('readOnly' in el) el.readOnly = !editable;
    el.classList.toggle('readonly-input', !editable);
  });
  editableSelectIds.forEach((id) => {
    const el = byId(id);
    if (!el) return;
    el.disabled = !editable;
    el.classList.toggle('readonly-input', !editable);
  });
  editableCheckIds.forEach((id) => {
    const el = byId(id);
    if (!el) return;
    el.disabled = !editable;
  });

  byId('saveDetailBtn')?.classList.toggle('hidden', !editable);
  byId('cancelDetailEditBtn')?.classList.toggle('hidden', !editable);
  byId('enableDetailEditBtn')?.classList.toggle('hidden', editable || !item);
  byId('detailHeaderEditBtn')?.classList.toggle('hidden', editable || !item);
  byId('detailHeaderCancelEditBtn')?.classList.toggle('hidden', !editable);
  byId('detailForm')?.classList.toggle('detail-readonly', Boolean(item) && !editable);
  updateDetailPanelHeadUi(item);
}

function setDetailEditMode(next, { rerender = true } = {}) {
  detailEditMode = Boolean(next);
  const item = state.bookmarks.find((x) => x.id === state.activeId) || state.allBookmarks.find((x) => x.id === state.activeId) || null;
  if (!item) {
    detailEditMode = false;
    detailEditBookmarkId = null;
    renderDetailEditUi(null);
    return;
  }
  detailEditBookmarkId = String(item.id);
  if (rerender) renderDetail();
  else renderDetailEditUi(item);
}

async function saveDetail() {
  const id = state.activeId;
  if (!id) return;
  if (!detailEditMode) {
    setDetailEditMode(true);
    return;
  }
  const tags = byId('detailTags').value
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

  await api(`/api/bookmarks/${id}`, {
    method: 'PUT',
    body: JSON.stringify({
      title: byId('detailTitle').value,
      url: byId('detailUrl').value,
      folderId: byId('detailFolder').value,
      tags,
      note: byId('detailNote').value,
      reminderAt: byId('detailReminder').value ? Number(byId('detailReminder').value) : null,
      favorite: byId('detailFavorite').checked,
      archived: byId('detailArchived').checked,
      read: byId('detailRead').checked
    })
  });
  detailEditMode = false;
  await refreshAll();
}

function reset预览Surface() {
  byId('previewFrame').classList.add('hidden');
  byId('previewImage').classList.add('hidden');
  byId('previewVideo').classList.add('hidden');
  byId('previewFallback').classList.add('hidden');
  byId('previewError').classList.add('hidden');
  byId('previewError').textContent = '';
  byId('previewFrame').src = 'about:blank';
  byId('previewImage').src = '';
  byId('previewVideo').removeAttribute('src');
  byId('previewVideo').load();
  setPreviewUiState('idle', '选择一个书签以查看预览。');
}

function getReaderSelectionPayload() {
  const frame = byId('previewFrame');
  if (!frame || !frame.contentWindow) throw new Error('预览框架尚未就绪');
  let sel;
  try {
    sel = frame.contentWindow.getSelection();
  } catch (_err) {
    throw new Error('仅可在阅读模式中选区高亮');
  }
  if (!sel || !sel.rangeCount) throw new Error('未选择文本');
  const text = String(sel.toString() || '').trim();
  if (!text) throw new Error('未选择文本');
  const range = sel.getRangeAt(0);
  let prefix = '';
  let suffix = '';
  let startOffset = 0;
  let endOffset = 0;
  try {
    const node = range.startContainer;
    if (node && node.nodeType === Node.TEXT_NODE) {
      const source = String(node.textContent || '');
      startOffset = Number(range.startOffset || 0);
      endOffset = Number(range.endOffset || startOffset + text.length);
      prefix = source.slice(Math.max(0, startOffset - 32), startOffset);
      suffix = source.slice(endOffset, Math.min(source.length, endOffset + 32));
    }
  } catch (_err) {
    // Cross-document constants or non-text node; keep anchors minimal.
  }
  return {
    text,
    quote: text,
    anchors: {
      exact: text,
      prefix,
      suffix,
      startOffset,
      endOffset,
      selector: ''
    }
  };
}

function render预览Dialog() {
  hydratePreviewToolbarIcons();
  const titleEl = byId('previewDialogTitle');
  const metaEl = byId('previewDialogMeta');
  const payloadEl = byId('previewPayload');
  const readerBtn = byId('previewReaderBtn');
  const extractBtn = byId('previewExtractArticleBtn');
  const originalBtn = byId('previewOriginalBtn');
  const addHighlightBtn = byId('previewAddHighlightBtn');
  reset预览Surface();

  if (!previewPayload) {
    titleEl.textContent = '预览';
    metaEl.textContent = '尚未加载预览。';
    payloadEl.textContent = '';
    setIconButtonLabel(readerBtn, 'preview', '阅读模式');
    setIconButtonLabel(addHighlightBtn, 'favorite', '高亮选区');
    readerBtn.disabled = true;
    readerBtn.setAttribute('aria-pressed', 'false');
    extractBtn.disabled = true;
    originalBtn.disabled = true;
    addHighlightBtn.disabled = true;
    addHighlightBtn.classList.remove('active');
    byId('previewFallback').classList.remove('hidden');
    if (previewUiState !== 'error' && previewUiState !== 'loading') {
      setPreviewUiState('idle', '尚未加载预览。');
    }
    return;
  }

  const p = previewPayload.preview || previewPayload;
  const summary = p.summary || {};
  titleEl.textContent = p.title || '预览';
  metaEl.textContent = [kindLabel(p.kind), summary.siteName, summary.contentType, summary.articleStatus, summary.metadataStatus]
    .filter(Boolean)
    .join(' · ');
  payloadEl.textContent = JSON.stringify(p, null, 2);
  originalBtn.disabled = !p?.fallback?.openUrl && !p?.sourceUrl;
  readerBtn.disabled = !Boolean(p?.reader?.available);
  setIconButtonLabel(readerBtn, previewMode === 'reader' ? 'open' : 'preview', previewMode === 'reader' ? '网页模式' : '阅读模式');
  readerBtn.setAttribute('aria-pressed', String(previewMode === 'reader'));
  extractBtn.disabled = String(p?.kind || '') !== 'web';
  addHighlightBtn.disabled = !(previewMode === 'reader' && p?.reader?.available);
  addHighlightBtn.classList.toggle('active', previewMode === 'reader' && p?.reader?.available);

  const useReader = previewMode === 'reader' && p?.reader?.available;
  const mode = useReader ? 'iframe' : String(p?.render?.mode || 'iframe');
  const url = useReader ? String(p.reader.renderUrl || '') : String(p?.render?.url || '');

  if (!url) {
    byId('previewFallback').classList.remove('hidden');
    setPreviewUiState('fallback', '当前条目没有可嵌入预览，已降级为打开原文。');
    return;
  }

  setPreviewUiState('ready', useReader ? '阅读模式已就绪。' : '预览已加载。');

  if (mode === 'image') {
    const img = byId('previewImage');
    img.src = url;
    img.classList.remove('hidden');
    return;
  }

  if (mode === 'video') {
    const video = byId('previewVideo');
    video.src = url;
    video.classList.remove('hidden');
    return;
  }

  const frame = byId('previewFrame');
  frame.src = url;
  frame.classList.remove('hidden');
}

async function load预览ForBookmark(bookmarkId, { preferredMode = 'auto' } = {}) {
  const id = String(bookmarkId || state.activeId || '');
  if (!id) return;
  previewActiveBookmarkId = id;
  if (preferredMode) previewMode = preferredMode;
  byId('previewDialogMeta').textContent = '正在加载预览...';
  byId('previewError').classList.add('hidden');
  setPreviewUiState('loading', '正在请求预览内容…');
  try {
    const payload = await api(`/api/bookmarks/${id}/preview`);
    previewPayload = payload;
    render预览Dialog();
  } catch (err) {
    previewPayload = null;
    render预览Dialog();
    byId('previewError').textContent = `预览加载失败：${err.message}`;
    byId('previewError').classList.remove('hidden');
    byId('previewFallback').classList.remove('hidden');
    setPreviewUiState('error', '预览请求失败，可尝试刷新或打开原文。');
  }
}

async function open预览Dialog(bookmarkId, { preferredMode = 'auto' } = {}) {
  const dlg = byId('previewDialog');
  if (!dlg.open) dlg.showModal();
  await load预览ForBookmark(bookmarkId, { preferredMode });
  if (state.activeId && String(state.activeId) === String(previewActiveBookmarkId || '')) renderDetail();
}

async function extractArticleForActiveBookmark({ openReaderAfter = false } = {}) {
  const id = String(state.activeId || previewActiveBookmarkId || '');
  if (!id) return;
  try {
    byId('detailArticleInfo').textContent = '正文：提取中...';
    renderDetailFetchStatusSummary({
      item: state.bookmarks.find((x) => x.id === id) || state.allBookmarks.find((x) => x.id === id) || null
    });
    const out = await api(`/api/bookmarks/${id}/article/extract`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    await refreshAll();
    if (byId('previewDialog').open && String(previewActiveBookmarkId || '') === id) {
      previewMode = openReaderAfter ? 'reader' : previewMode;
      await load预览ForBookmark(id, { preferredMode: previewMode });
    }
    showToast(`正文已提取${out?.article?.title ? `: ${out.article.title}` : ''}`, { timeoutMs: 3500 });
  } catch (err) {
    byId('detailArticleInfo').textContent = `article: failed · ${err.message}`;
    renderDetailFetchStatusSummary({
      item: state.bookmarks.find((x) => x.id === id) || state.allBookmarks.find((x) => x.id === id) || null,
      task: { status: 'failed' }
    });
    if (byId('previewDialog').open) {
      byId('previewError').textContent = `正文提取失败：${err.message}`;
      byId('previewError').classList.remove('hidden');
      setPreviewUiState('error', '正文提取失败，预览仍可继续使用。');
    }
    showToast(err.message || '正文提取失败', { timeoutMs: 5000 });
  }
}

async function refreshAll() {
  if (refreshAllInFlight) {
    refreshAllQueued = true;
    return refreshAllInFlight;
  }

  refreshAllQueued = false;
  refreshAllInFlight = (async () => {
    do {
      refreshAllQueued = false;
      if (!authState.authenticated) {
        renderAuthUi();
        redirectToLoginPage();
        return;
      }
      await loadState();
      syncAdvancedSearchInputs();
      await loadBookmarks();
    } while (refreshAllQueued);
  })();

  try {
    await refreshAllInFlight;
  } finally {
    refreshAllInFlight = null;
  }
}

async function postBulk(body) {
  return api('/api/bookmarks/bulk', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

function hideToast() {
  const toast = byId('toast');
  if (!toast) return;
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
  toastUndoHandler = null;
  toast.classList.add('hidden');
  byId('toastUndoBtn').classList.add('hidden');
}

function showToast(message, { undoHandler = null, timeoutMs = 5000 } = {}) {
  const toast = byId('toast');
  if (!toast) return;
  if (toastTimer) clearTimeout(toastTimer);
  toastUndoHandler = typeof undoHandler === 'function' ? undoHandler : null;
  byId('toastText').textContent = String(message || '');
  byId('toastUndoBtn').classList.toggle('hidden', !toastUndoHandler);
  toast.classList.remove('hidden');
  toastTimer = setTimeout(() => {
    hideToast();
  }, timeoutMs);
}

async function runToastUndo() {
  if (!toastUndoHandler) return;
  const fn = toastUndoHandler;
  toastUndoHandler = null;
  try {
    await fn();
  } catch (err) {
    console.error(err);
    showToast(err.message || '撤销失败', { timeoutMs: 6000 });
    return;
  }
}

async function reorderFolder(folderId, parentId, position) {
  await api('/api/folders/reorder', {
    method: 'POST',
    body: JSON.stringify({ folderId, parentId, position })
  });
  await refreshAll();
}

function stopPluginTaskPolling() {
  if (pluginTaskPollTimer) {
    clearTimeout(pluginTaskPollTimer);
    pluginTaskPollTimer = null;
  }
}

async function pollPluginTask(taskId) {
  stopPluginTaskPolling();
  const tick = async () => {
    try {
      const task = await api(`/api/plugins/raindropSync/tasks/${encodeURIComponent(taskId)}`);
      byId('pluginOutput').textContent = JSON.stringify({ task }, null, 2);
      if (task.status === 'queued' || task.status === 'running') {
        pluginTaskPollTimer = setTimeout(() => {
          tick().catch((err) => {
            byId('pluginOutput').textContent = err.message;
          });
        }, 1000);
        return;
      }
      stopPluginTaskPolling();
      await loadPluginAudit();
      await loadPluginDevices();
      await loadPluginHealth();
      await loadPluginRuns();
      if (task.status === 'succeeded') {
        await refreshAll();
      }
    } catch (err) {
      stopPluginTaskPolling();
      byId('pluginOutput').textContent = err.message;
    }
  };
  await tick();
}

async function fetchPluginTasks(limit = 20) {
  const resp = await api(`/api/plugins/raindropSync/tasks?limit=${Number(limit) || 20}`);
  return Array.isArray(resp?.items) ? resp.items : [];
}

function bindActions() {
  bindActionDialog();
  bindInlineValidation('bookmarkForm', { errorId: 'bookmarkFormError' });
  bindInlineValidation('collectionForm', { errorId: 'collectionFormError' });
  byId('bookmarkDialog')?.addEventListener('close', () => clearFormValidation('bookmarkForm', 'bookmarkFormError'));
  byId('collectionDialog')?.addEventListener('close', () => clearFormValidation('collectionForm', 'collectionFormError'));

  window.addEventListener('focus', () => {
    runAuthGuardCheck().catch(() => { });
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) runAuthGuardCheck().catch(() => { });
  });

  byId('bookmarkLayoutSwitch')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-layout-mode]');
    if (!btn) return;
    setBookmarkLayoutMode(btn.dataset.layoutMode);
  });
  byId('headerSortBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !headerSortMenuOpen;
    closeHeaderMenus({ keep: next ? 'sort' : '' });
    setHeaderSortMenuOpen(next);
  });
  byId('headerViewBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !headerViewMenuOpen;
    closeHeaderMenus({ keep: next ? 'view' : '' });
    setHeaderViewMenuOpen(next);
  });
  byId('headerMoreBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !headerMoreMenuOpen;
    closeHeaderMenus({ keep: next ? 'more' : '' });
    setHeaderMoreMenuOpen(next);
  });
  byId('addMenuToggleBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !addToolbarMenuOpen;
    closeHeaderMenus({ keep: next ? 'add' : '' });
    setAddToolbarMenuOpen(next);
  });
  byId('headerSortMenu')?.addEventListener('click', (e) => {
    const item = e.target.closest('[data-sort-option]');
    if (!item) return;
    e.preventDefault();
    e.stopPropagation();
    const value = String(item.dataset.sortOption || '');
    if (!value) return;
    const select = byId('sortSelect');
    if (select) {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    setHeaderSortMenuOpen(false);
  });
  byId('headerViewMenu')?.addEventListener('click', (e) => {
    const layoutItem = e.target.closest('[data-layout-option]');
    if (layoutItem) {
      e.preventDefault();
      e.stopPropagation();
      setBookmarkLayoutMode(layoutItem.dataset.layoutOption);
      renderHeaderMenuControls();
      return;
    }
  });
  byId('headerViewColumnsBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (bookmarkLayoutMode !== 'list') return;
    setListColumnsMenuOpen(!listColumnsMenuOpen);
  });
  byId('headerMoreMenu')?.addEventListener('click', (e) => {
    const item = e.target.closest('[data-header-more-action]');
    if (!item) return;
    e.preventDefault();
    e.stopPropagation();
    const action = String(item.dataset.headerMoreAction || '');
    setHeaderMoreMenuOpen(false);
    if (action === 'export') byId('exportBtn')?.click();
    if (action === 'ai-folder-summary') openAiFolderSummaryDialog();
    if (action === 'plugin') byId('pluginPanelBtn')?.click();
  });
  byId('addToolbarMenu')?.addEventListener('click', (e) => {
    const item = e.target.closest('[data-add-menu-action]');
    if (!item) return;
    e.preventDefault();
    e.stopPropagation();
    const action = String(item.dataset.addMenuAction || '');
    setAddToolbarMenuOpen(false);
    if (action === 'bookmark') byId('addBookmarkBtn')?.click();
    if (action === 'collection') byId('newCollectionBtn')?.click();
    if (action === 'import') byId('importBtn')?.click();
    if (action === 'export') byId('exportBtn')?.click();
    if (action === 'upload') {
      byId('importBtn')?.click();
      queueMicrotask(() => byId('ioImportFile')?.click());
    }
  });
  byId('listColumnsBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (bookmarkLayoutMode !== 'list') return;
    setListColumnsMenuOpen(!listColumnsMenuOpen);
  });
  byId('listColumnsMenu')?.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  byId('listColFolder')?.addEventListener('change', (e) => setListColumn('folder', e.target.checked));
  byId('listColType')?.addEventListener('change', (e) => setListColumn('type', e.target.checked));
  byId('listColExcerpt')?.addEventListener('change', (e) => setListColumn('excerpt', e.target.checked));
  byId('listColTags')?.addEventListener('change', (e) => setListColumn('tags', e.target.checked));
  byId('listColTime')?.addEventListener('change', (e) => setListColumn('time', e.target.checked));
  byId('listLoadMoreBtn')?.addEventListener('click', async () => {
    try {
      await loadMoreListPage();
    } catch (err) {
      showToast(err.message || '加载更多失败', { timeoutMs: 3500 });
    }
  });

  byId('sidebarAccountBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    setSidebarAccountMenuOpen(!sidebarAccountMenuOpen);
  });
  byId('sidebarAccountMenuAuth')?.addEventListener('click', async (e) => {
    e.preventDefault();
    setSidebarAccountMenuOpen(false);
    if (!authState.authenticated) {
      redirectToLoginPage();
      return;
    }
    await openAuthDialog();
  });
  byId('sidebarAccountMenuSettings')?.addEventListener('click', (e) => {
    e.preventDefault();
    setSidebarAccountMenuOpen(false);
    window.location.assign('/settings.html');
  });
  byId('sidebarAccountMenuLogout')?.addEventListener('click', async (e) => {
    e.preventDefault();
    await logoutCurrentUser({ next: '/' });
  });
  byId('collectionContextMenu')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-folder-menu-action]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const action = String(btn.getAttribute('data-folder-menu-action') || '');
    const folderId = String(collectionContextMenuState.folderId || byId('collectionContextMenu')?.getAttribute('data-folder-id') || '');
    setCollectionContextMenuOpen(false);
    if (!action || !folderId) return;
    runCollectionMenuAction(action, folderId).catch((err) => {
      showToast(err.message || '集合操作失败', { timeoutMs: 4000 });
    });
  });
  byId('systemViewContextMenu')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-system-view-menu-action]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const action = String(btn.getAttribute('data-system-view-menu-action') || '');
    const view = String(systemViewContextMenuState.view || byId('systemViewContextMenu')?.getAttribute('data-system-view') || '');
    setSystemViewContextMenuOpen(false);
    if (!action || !view) return;
    runSystemViewMenuAction(action, view).catch((err) => {
      showToast(err.message || '系统集合菜单操作失败', { timeoutMs: 4000 });
    });
  });
  byId('collectionsHeaderContextMenu')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-collections-header-action]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const action = String(btn.getAttribute('data-collections-header-action') || '');
    setCollectionsHeaderMenuOpen(false);
    if (!action) return;
    runCollectionsHeaderMenuAction(action).catch((err) => {
      showToast(err.message || '集合分组菜单操作失败', { timeoutMs: 4000 });
    });
  });
  byId('quickFiltersMenuBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !quickFiltersMenuOpen;
    if (quickFilterContextMenuState.open) setQuickFilterContextMenuOpen(false);
    setQuickFiltersMenuOpen(next);
  });
  byId('quickFilterContextMenu')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-quick-filter-menu-action]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const action = String(btn.dataset.quickFilterMenuAction || '');
    const menu = byId('quickFilterContextMenu');
    const query = String(menu?.getAttribute('data-quick-filter-query') || '');
    if (quickFiltersMenuOpen) setQuickFiltersMenuOpen(false);
    if (quickFilterContextMenuState.open) setQuickFilterContextMenuOpen(false);
    runQuickFilterMenuAction(action, { query }).catch((err) => {
      showToast(err.message || '快速过滤菜单操作失败', { timeoutMs: 4000 });
    });
  });
  byId('tagContextMenu')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tag-menu-action]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const action = String(btn.dataset.tagMenuAction || '');
    const tag = String(byId('tagContextMenu')?.getAttribute('data-tag-name') || '');
    setTagContextMenuOpen(false);
    runTagMenuAction(action, tag).catch((err) => {
      showToast(err.message || '标签菜单操作失败', { timeoutMs: 4000 });
    });
  });
  document.addEventListener('click', (e) => {
    if (headerSortMenuOpen) {
      const area = byId('headerSortMenuWrap');
      if (area && !area.contains(e.target)) setHeaderSortMenuOpen(false);
    }
    if (headerViewMenuOpen) {
      const area = byId('headerViewMenuWrap');
      if (area && !area.contains(e.target)) setHeaderViewMenuOpen(false);
    }
    if (headerMoreMenuOpen) {
      const area = byId('headerMoreMenuWrap');
      if (area && !area.contains(e.target)) setHeaderMoreMenuOpen(false);
    }
    if (detailPanelMoreMenuOpen) {
      const area = byId('detailPanelMoreMenuWrap');
      if (area && !area.contains(e.target)) setDetailPanelMoreMenuOpen(false);
    }
    if (addToolbarMenuOpen) {
      const area = byId('addToolbarMenuWrap');
      if (area && !area.contains(e.target)) setAddToolbarMenuOpen(false);
    }
    if (searchSuggestState.open) {
      const area = byId('searchInput')?.closest('.search-wrap');
      if (area && !area.contains(e.target)) setSearchSuggestOpen(false);
    }
    if (listColumnsMenuOpen) {
      const listArea = byId('listColumnsMenu')?.closest('.view-columns-menu-wrap');
      if (listArea && !listArea.contains(e.target)) {
        setListColumnsMenuOpen(false);
      }
    }
    if (collectionContextMenuState.open) {
      const menu = byId('collectionContextMenu');
      if (menu && !menu.contains(e.target)) {
        setCollectionContextMenuOpen(false);
      }
    }
    if (systemViewContextMenuState.open) {
      const menu = byId('systemViewContextMenu');
      if (menu && !menu.contains(e.target)) setSystemViewContextMenuOpen(false);
    }
    if (collectionsHeaderMenuState.open) {
      const menu = byId('collectionsHeaderContextMenu');
      const trigger = byId('collectionsSectionMenuBtn');
      const insideTrigger = trigger && trigger.contains(e.target);
      if (menu && !menu.contains(e.target) && !insideTrigger) setCollectionsHeaderMenuOpen(false);
    }
    if (quickFiltersMenuOpen) {
      const trigger = byId('quickFiltersMenuBtn');
      const menu = byId('quickFilterContextMenu');
      const insideTrigger = trigger && trigger.contains(e.target);
      const insideMenu = menu && menu.contains(e.target);
      if (!insideTrigger && !insideMenu) setQuickFiltersMenuOpen(false);
    }
    if (quickFilterContextMenuState.open) {
      const menu = byId('quickFilterContextMenu');
      if (menu && !menu.contains(e.target)) setQuickFilterContextMenuOpen(false);
    }
    if (tagContextMenuState.open) {
      const menu = byId('tagContextMenu');
      if (menu && !menu.contains(e.target)) setTagContextMenuOpen(false);
    }
    if (!sidebarAccountMenuOpen) return;
    const area = byId('sidebarAccountArea');
    if (area && !area.contains(e.target)) {
      setSidebarAccountMenuOpen(false);
    }
  });
  window.addEventListener('resize', () => {
    if (collectionContextMenuState.open) positionCollectionContextMenu();
    if (systemViewContextMenuState.open) setSystemViewContextMenuOpen(false);
    if (collectionsHeaderMenuState.open) setCollectionsHeaderMenuOpen(false);
    if (quickFiltersMenuOpen) setQuickFiltersMenuOpen(true);
    if (quickFilterContextMenuState.open) setQuickFilterContextMenuOpen(false);
    if (tagContextMenuState.open) setTagContextMenuOpen(false);
    if (detailPanelMoreMenuOpen) setDetailPanelMoreMenuOpen(false);
    scheduleListVirtualRender();
    scheduleCollectionsTreeVirtualRender();
  });
  window.addEventListener('scroll', () => {
    if (collectionContextMenuState.open) setCollectionContextMenuOpen(false);
    if (systemViewContextMenuState.open) setSystemViewContextMenuOpen(false);
    if (collectionsHeaderMenuState.open) setCollectionsHeaderMenuOpen(false);
    if (quickFiltersMenuOpen) setQuickFiltersMenuOpen(false);
    if (quickFilterContextMenuState.open) setQuickFilterContextMenuOpen(false);
    if (tagContextMenuState.open) setTagContextMenuOpen(false);
    if (detailPanelMoreMenuOpen) setDetailPanelMoreMenuOpen(false);
    scheduleListVirtualRender();
    scheduleCollectionsTreeVirtualRender();
  }, { capture: true, passive: true });
  document.addEventListener('keydown', (e) => {
    if (trapDetailDrawerTabFocus(e)) return;
    if (handleMenuArrowNavigation(e)) return;
    if (e.key === 'Escape') {
      let closedTransient = false;
      if (headerSortMenuOpen) { setHeaderSortMenuOpen(false); closedTransient = true; }
      if (headerViewMenuOpen) { setHeaderViewMenuOpen(false); closedTransient = true; }
      if (headerMoreMenuOpen) { setHeaderMoreMenuOpen(false); closedTransient = true; }
      if (addToolbarMenuOpen) { setAddToolbarMenuOpen(false); closedTransient = true; }
      if (searchSuggestState.open) { setSearchSuggestOpen(false); closedTransient = true; }
      if (sidebarAccountMenuOpen) { setSidebarAccountMenuOpen(false); closedTransient = true; }
      if (listColumnsMenuOpen) { setListColumnsMenuOpen(false); closedTransient = true; }
      if (collectionContextMenuState.open) { setCollectionContextMenuOpen(false); closedTransient = true; }
      if (systemViewContextMenuState.open) { setSystemViewContextMenuOpen(false); closedTransient = true; }
      if (collectionsHeaderMenuState.open) { setCollectionsHeaderMenuOpen(false); closedTransient = true; }
      if (quickFiltersMenuOpen) { setQuickFiltersMenuOpen(false); closedTransient = true; }
      if (quickFilterContextMenuState.open) { setQuickFilterContextMenuOpen(false); closedTransient = true; }
      if (tagContextMenuState.open) { setTagContextMenuOpen(false); closedTransient = true; }
      if (detailPanelMoreMenuOpen) { setDetailPanelMoreMenuOpen(false); closedTransient = true; }
      if (!closedTransient && !hasModalOpen() && state.activeId && !isTypingContext(e.target)) {
        store.setActiveId(null);
        renderCards();
        renderDetail();
      }
      return;
    }
    const key = String(e.key || '');
    if ((e.metaKey || e.ctrlKey) && !e.altKey && key.toLowerCase() === 'k') {
      e.preventDefault();
      byId('searchInput')?.focus();
      byId('searchInput')?.select?.();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (isTypingContext(e.target)) return;
    if (key === '/') {
      e.preventDefault();
      byId('searchInput')?.focus();
      byId('searchInput')?.select?.();
      return;
    }
    if (hasModalOpen()) return;
    if (key === 'j' || key === 'J') {
      e.preventDefault();
      moveActiveBookmark(1);
      return;
    }
    if (key === 'k' || key === 'K') {
      e.preventDefault();
      moveActiveBookmark(-1);
      return;
    }
    if (key === 'o' || key === 'O') {
      if (!state.activeId) return;
      e.preventDefault();
      void byId('openPreviewBtn')?.click();
      return;
    }
    if (key === 'p' || key === 'P') {
      if (!state.activeId) return;
      e.preventDefault();
      void byId('detailPanelWebBtn')?.click();
      return;
    }
    if (state.activeId && ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(key)) {
      e.preventDefault();
      moveActiveBookmark((key === 'ArrowUp' || key === 'ArrowLeft') ? -1 : 1);
      return;
    }
    if (key === 'e' || key === 'E') {
      if (!state.activeId) return;
      e.preventDefault();
      if (detailEditMode) byId('cancelDetailEditBtn')?.click();
      else byId('enableDetailEditBtn')?.click();
      return;
    }
    if (key === 'f' || key === 'F') {
      if (!state.activeId) return;
      e.preventDefault();
      toggleFavoriteForActiveBookmark().catch((err) => {
        showToast(err.message || '收藏切换失败', { timeoutMs: 3000 });
      });
      return;
    }
    if (key === 'a' || key === 'A') {
      e.preventDefault();
      if (key === 'A') byId('newCollectionBtn')?.click();
      else byId('addBookmarkBtn')?.click();
      return;
    }
    if (key === 'r' || key === 'R') {
      e.preventDefault();
      refreshAll().catch((err) => {
        showToast(err.message || '刷新失败', { timeoutMs: 3000 });
      });
      return;
    }
    if (key === '?' || (e.shiftKey && key === '/')) {
      e.preventDefault();
      showShortcutHelp();
      return;
    }
    if ((key === 'Delete' || key === 'Backspace') && state.activeId) {
      e.preventDefault();
      (async () => {
        const item = state.bookmarks.find((x) => x.id === state.activeId) || state.allBookmarks.find((x) => x.id === state.activeId);
        if (!item || item.deletedAt) return;
        const ok = await uiConfirm(`确认删除「${item.title || '未命名书签'}」？`, {
          title: '删除书签',
          confirmText: '删除',
          danger: true
        });
        if (!ok) return;
        await api(`/api/bookmarks/${item.id}`, { method: 'DELETE' });
        store.setActiveId(null);
        await refreshAll();
      })().catch((err) => {
        showToast(err.message || '删除失败', { timeoutMs: 4000 });
      });
    }
  });

  byId('searchInput').addEventListener('focus', () => {
    clearSearchSuggestCloseTimer();
    setSearchSuggestOpen(true);
  });

  byId('searchInput').addEventListener('blur', () => {
    clearSearchSuggestCloseTimer();
    searchSuggestCloseTimer = setTimeout(() => {
      setSearchSuggestOpen(false);
    }, 120);
    rememberRecentSearch(byId('searchInput')?.value || '');
    if (searchInputApplyTimer) void applySearchInputFilterNow();
  });

  byId('searchInput').addEventListener('keydown', async (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveSearchSuggestActive(1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveSearchSuggestActive(-1);
      return;
    }
    if (e.key === 'Escape' && searchSuggestState.open) {
      e.preventDefault();
      setSearchSuggestOpen(false);
      return;
    }
    if (e.key === 'Enter') {
      if (searchSuggestState.open && searchSuggestState.activeIndex >= 0) {
        e.preventDefault();
        try {
          await activateSearchSuggestItem(searchSuggestState.activeIndex);
        } catch (err) {
          showToast(err.message || '应用搜索建议失败', { timeoutMs: 3000 });
        }
        return;
      }
      rememberRecentSearch(e.target.value || '', { immediate: true });
      e.preventDefault();
      await applySearchInputFilterNow({ force: true });
      setSearchSuggestOpen(false);
    }
  });

  byId('searchSuggestList')?.addEventListener('mousedown', (e) => {
    e.preventDefault();
  });

  byId('searchSuggestList')?.addEventListener('mousemove', (e) => {
    const btn = e.target.closest('[data-search-suggest-index]');
    if (!btn) return;
    const idx = Number(btn.dataset.searchSuggestIndex);
    if (!Number.isFinite(idx) || idx === searchSuggestState.activeIndex) return;
    setSearchSuggestActiveIndex(idx);
  });

  byId('searchSuggestList')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-search-suggest-index]');
    if (!btn) return;
    const idx = Number(btn.dataset.searchSuggestIndex);
    if (!Number.isFinite(idx)) return;
    try {
      await activateSearchSuggestItem(idx);
    } catch (err) {
      showToast(err.message || '应用搜索建议失败', { timeoutMs: 3000 });
    }
  });

  byId('searchInput').addEventListener('input', async (e) => {
    const next = e.target.value.trim();
    rememberRecentSearch(next);
    scheduleSearchInputFilterApply();
    if (document.activeElement === byId('searchInput')) setSearchSuggestOpen(true);
  });

  byId('sortSelect').addEventListener('change', async (e) => {
    store.setFilter('sort', e.target.value);
    advancedSearchState.activeSavedId = '';
    store.setFilter('page', 1);
    await loadBookmarks();
    renderSidebar();
  });

  byId('advancedSearchToggleBtn')?.addEventListener('click', () => {
    if (searchSuggestState.open) setSearchSuggestOpen(false);
    advancedSearchState.panelOpen = !advancedSearchState.panelOpen;
    syncAdvancedSearchInputs();
  });
  byId('advancedSearchEnabled')?.addEventListener('change', async () => {
    pullAdvancedSearchInputs();
    advancedSearchState.activeSavedId = '';
    store.setFilter('page', 1);
    await loadBookmarks();
    renderSidebar();
  });
  byId('advancedSearchSemanticEnabled')?.addEventListener('change', async () => {
    pullAdvancedSearchInputs();
    advancedSearchState.activeSavedId = '';
    store.setFilter('page', 1);
    await loadBookmarks();
    renderSidebar();
  });
  byId('advancedSearchSemanticMode')?.addEventListener('change', async () => {
    pullAdvancedSearchInputs();
    advancedSearchState.activeSavedId = '';
    store.setFilter('page', 1);
    await loadBookmarks();
    renderSidebar();
  });
  byId('advancedSearchRerankEnabled')?.addEventListener('change', async () => {
    pullAdvancedSearchInputs();
    advancedSearchState.activeSavedId = '';
    store.setFilter('page', 1);
    await loadBookmarks();
    renderSidebar();
  });
  byId('advancedSearchRerankTopK')?.addEventListener('change', async () => {
    pullAdvancedSearchInputs();
    advancedSearchState.activeSavedId = '';
    store.setFilter('page', 1);
    if (isAdvancedSearchActive() && String(state.filters.q || '').trim() && advancedSearchState.rerankEnabled) {
      await loadBookmarks();
      renderSidebar();
    } else {
      syncAdvancedSearchInputs();
    }
  });
  byId('advancedSearchApplyBtn')?.addEventListener('click', async () => {
    pullAdvancedSearchInputs();
    advancedSearchState.activeSavedId = '';
    store.setFilter('page', 1);
    await loadBookmarks();
    renderSidebar();
  });
  byId('advancedSearchSemanticRebuildBtn')?.addEventListener('click', async () => {
    const btn = byId('advancedSearchSemanticRebuildBtn');
    try {
      if (btn) {
        btn.disabled = true;
        btn.dataset.loading = '1';
      }
      const out = await api('/api/product/search/semantic/index/rebuild', {
        method: 'POST',
        body: JSON.stringify({})
      });
      const updated = Number(out?.updated || 0) || 0;
      const indexed = Number(out?.indexed || 0) || 0;
      const providerType = String(out?.provider?.providerType || '');
      const suffix = providerType ? ` · ${providerType}` : '';
      showToast(`语义索引已重建：${indexed} 条（更新 ${updated} 条）${suffix}`, { timeoutMs: 3800 });
      if (isAdvancedSearchActive() && advancedSearchState.semanticEnabled && String(state.filters.q || '').trim()) {
        await loadBookmarks();
        renderSidebar();
      }
    } catch (err) {
      showToast(err.message || '重建语义索引失败', { timeoutMs: 4200 });
    } finally {
      if (btn) {
        btn.disabled = false;
        delete btn.dataset.loading;
      }
    }
  });
  byId('advancedSearchAiParseBtn')?.addEventListener('click', async () => {
    try {
      let text = String(byId('searchInput')?.value || '').trim();
      if (!text) {
        text = await uiPrompt('输入自然语言搜索需求（例如：找最近收藏的天气 API 相关文章）', {
          title: 'AI 解析搜索',
          inputLabel: '自然语言搜索',
          placeholder: '例如：找最近收藏的天气 API 相关文章',
          required: true,
          requiredMessage: '请输入自然语言搜索需求'
        });
      }
      text = String(text || '').trim();
      if (!text) return;
      const btn = byId('advancedSearchAiParseBtn');
      if (btn) {
        btn.disabled = true;
        btn.dataset.loading = '1';
      }
      const out = await api('/api/product/ai/search-to-filters', {
        method: 'POST',
        body: JSON.stringify({
          text,
          current: {
            view: state.filters.view || 'all',
            folderId: state.filters.folderId || 'all',
            sort: state.filters.sort || 'newest'
          }
        })
      });
      applyAiSearchParseToUi(out, text);
      syncAdvancedSearchInputs();
      await loadBookmarks();
      renderSidebar();
      const unsupported = Array.isArray(out?.unsupported) ? out.unsupported.filter(Boolean) : [];
      const confidence = Number(out?.confidence || 0);
      const suffix = unsupported.length ? `；未完全支持：${unsupported.join('、')}` : '';
      const confText = Number.isFinite(confidence) && confidence > 0 ? `（置信度 ${(confidence * 100).toFixed(0)}%）` : '';
      showToast(`AI 已应用搜索筛选${confText}${suffix}`, { timeoutMs: 4500 });
    } catch (err) {
      showToast(err.message || 'AI 解析搜索失败', { timeoutMs: 4200 });
    } finally {
      const btn = byId('advancedSearchAiParseBtn');
      if (btn) {
        btn.disabled = false;
        delete btn.dataset.loading;
      }
    }
  });
  byId('advancedSearchResetBtn')?.addEventListener('click', async () => {
    advancedSearchState.enabled = false;
    advancedSearchState.tags = '';
    advancedSearchState.domain = '';
    advancedSearchState.type = '';
    advancedSearchState.favorite = '';
    advancedSearchState.archived = '';
    advancedSearchState.semanticEnabled = false;
    advancedSearchState.semanticMode = 'hybrid';
    advancedSearchState.rerankEnabled = false;
    advancedSearchState.rerankTopK = 36;
    advancedSearchState.activeSavedId = '';
    advancedSearchState.lastResultMeta = null;
    advancedSearchState.lastAiParseMeta = null;
    store.setFilter('q', '');
    store.setFilter('page', 1);
    byId('searchInput').value = '';
    syncAdvancedSearchInputs();
    await loadBookmarks();
    renderSidebar();
  });
  byId('advancedSearchSaveBtn')?.addEventListener('click', async () => {
    try {
      pullAdvancedSearchInputs();
      const name = await uiPrompt('输入保存查询名称', {
        title: '保存查询',
        inputLabel: '名称',
        placeholder: '例如：设计站点（最近）',
        required: true,
        requiredMessage: '请输入保存查询名称'
      });
      if (!name || !String(name).trim()) return;
      const query = currentAdvancedSearchQueryPayload();
      await api('/api/product/search/saved', {
        method: 'POST',
        body: JSON.stringify({ name: String(name).trim(), query })
      });
      await loadSavedSearches();
      showToast('已创建保存查询', { timeoutMs: 2500 });
    } catch (err) {
      showToast(err.message || '保存查询失败', { timeoutMs: 4000 });
    }
  });
  byId('advancedSearchSavedRefreshBtn')?.addEventListener('click', async () => {
    try {
      await loadSavedSearches();
      showToast('已保存查询已刷新', { timeoutMs: 2000 });
    } catch (err) {
      showToast(err.message || '加载已保存查询失败', { timeoutMs: 4000 });
    }
  });
  byId('advancedSearchSavedApplyBtn')?.addEventListener('click', async () => {
    const id = byId('advancedSearchSavedSelect')?.value;
    if (!id) return;
    const item = (advancedSearchState.saved || []).find((s) => String(s.id) === String(id));
    if (!item) return;
    applySavedSearchToUi(item);
    await loadBookmarks();
    renderSidebar();
  });
  byId('advancedSearchSavedDeleteBtn')?.addEventListener('click', async () => {
    const id = byId('advancedSearchSavedSelect')?.value;
    if (!id) return;
    if (!(await uiConfirm('确认删除这个已保存查询？', { title: '删除已保存查询', confirmText: '删除', danger: true }))) return;
    try {
      await api(`/api/product/search/saved/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await loadSavedSearches();
      showToast('已删除保存查询', { timeoutMs: 2500 });
    } catch (err) {
      showToast(err.message || '删除已保存查询失败', { timeoutMs: 4000 });
    }
  });

  byId('refreshBtn').addEventListener('click', refreshAll);
  byId('savedQueriesSidebarRefreshBtn')?.addEventListener('click', async () => {
    try {
      await loadSavedSearches();
      showToast('已保存查询已刷新', { timeoutMs: 2000 });
    } catch (err) {
      showToast(err.message || '加载已保存查询失败', { timeoutMs: 4000 });
    }
  });
  byId('collapseAllCollectionsBtn')?.addEventListener('click', () => {
    toggleTopLevelCollectionsCollapse();
  });
  byId('collectionsSectionMenuBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openCollectionsHeaderMenu({ anchorEl: e.currentTarget });
  });
  byId('collectionsSectionHead')?.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.section-head-actions')) return;
    e.preventDefault();
    e.stopPropagation();
    openCollectionsHeaderMenu({ x: e.clientX, y: e.clientY });
  });
  byId('tagsSortToggleBtn')?.addEventListener('click', () => {
    sidebarTagsUi = { ...sidebarTagsUi, sort: sidebarTagsUi.sort === 'count' ? 'name' : 'count' };
    persistSidebarTagsUi();
    renderSidebar();
  });
  byId('tagsExpandToggleBtn')?.addEventListener('click', () => {
    sidebarTagsUi = { ...sidebarTagsUi, expanded: !sidebarTagsUi.expanded };
    persistSidebarTagsUi();
    renderSidebar();
  });
  byId('settingsBtn').addEventListener('click', () => {
    setSidebarAccountMenuOpen(false);
    window.location.assign('/settings.html');
  });
  byId('sidebarStatusSettingsBtn')?.addEventListener('click', () => {
    setSidebarAccountMenuOpen(false);
    window.location.assign('/settings.html');
  });
  byId('authBtn').addEventListener('click', async () => {
    setSidebarAccountMenuOpen(false);
    if (!authState.authenticated) {
      redirectToLoginPage();
      return;
    }
    await openAuthDialog();
  });
  byId('sidebarStatusSyncBtn')?.addEventListener('click', () => {
    if (!authState.authenticated) {
      redirectToLoginPage();
      return;
    }
    window.location.assign('/plugin.html');
  });
  byId('authCloseBtn').addEventListener('click', () => {
    byId('authDialog').close();
  });
  byId('authLoginBtn').addEventListener('click', async () => {
    try {
      const out = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: byId('authEmail').value,
          password: byId('authPassword').value
        })
      });
      authState.latestPlainToken = '';
      await loadAuthMe();
      await loadAuthTokens();
      byId('authDialog').close();
      await refreshAll();
      showToast(`已登录：${out?.user?.email || '用户'}`, { timeoutMs: 2500 });
    } catch (err) {
      byId('authTokenOutput').textContent = `登录失败: ${err.message}`;
      showToast(err.message || '登录失败', { timeoutMs: 4000 });
    }
  });
  byId('authRegisterBtn').addEventListener('click', async () => {
    try {
      const out = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          displayName: byId('authRegisterName').value,
          email: byId('authRegisterEmail').value,
          password: byId('authRegisterPassword').value
        })
      });
      authState.latestPlainToken = '';
      await loadAuthMe();
      await loadAuthTokens();
      byId('authDialog').close();
      await refreshAll();
      showToast(`已注册：${out?.user?.email || '用户'}`, { timeoutMs: 2500 });
    } catch (err) {
      byId('authTokenOutput').textContent = `注册失败: ${err.message}`;
      showToast(err.message || '注册失败', { timeoutMs: 4000 });
    }
  });
  byId('authLogoutBtn').addEventListener('click', async () => {
    await logoutCurrentUser({ next: '/' });
  });
  byId('authRefreshTokensBtn').addEventListener('click', async () => {
    try {
      await loadAuthTokens();
      showToast('Token 列表已刷新', { timeoutMs: 2000 });
    } catch (err) {
      byId('authTokenOutput').textContent = err.message;
      showToast(err.message || '加载 Token 失败', { timeoutMs: 4000 });
    }
  });
  byId('authCreateTokenBtn').addEventListener('click', async () => {
    try {
      const name = byId('authTokenName').value.trim();
      if (!name) return showToast('请输入 Token 名称', { timeoutMs: 2500 });
      const out = await api('/api/auth/tokens', {
        method: 'POST',
        body: JSON.stringify({ name })
      });
      authState.latestPlainToken = out?.token || '';
      byId('authTokenName').value = '';
      await loadAuthTokens();
      renderAuthUi();
      showToast('API Token 已创建（仅展示一次）', { timeoutMs: 3000 });
    } catch (err) {
      byId('authTokenOutput').textContent = err.message;
      showToast(err.message || '创建 Token 失败', { timeoutMs: 4000 });
    }
  });
  window.addEventListener('api-unauthorized', () => {
    authState.authenticated = false;
    authState.user = null;
    authState.auth = null;
    authState.tokens = [];
    setSidebarAccountMenuOpen(false);
    renderAuthUi();
    redirectToLoginPage();
  });
  byId('toastCloseBtn').addEventListener('click', hideToast);
  byId('toastUndoBtn').addEventListener('click', async () => {
    await runToastUndo();
  });

  byId('prevPageBtn').addEventListener('click', async () => {
    if (!state.page?.hasPrev) return;
    store.setFilter('page', Math.max(1, Number(state.filters.page || 1) - 1));
    await loadBookmarks();
  });

  byId('nextPageBtn').addEventListener('click', async () => {
    if (!state.page?.hasNext) return;
    store.setFilter('page', Number(state.filters.page || 1) + 1);
    await loadBookmarks();
  });

  byId('pageSizeSelect').addEventListener('change', async (e) => {
    const pageSize = Math.max(1, Number(e.target.value || 24));
    store.setFilter('pageSize', pageSize);
    store.setFilter('page', 1);
    await loadBookmarks();
  });

  byId('addBookmarkBtn').addEventListener('click', () => {
    if (addToolbarMenuOpen) setAddToolbarMenuOpen(false);
    clearFormValidation('bookmarkForm', 'bookmarkFormError');
    byId('bookmarkDialog').showModal();
    byId('newTitle')?.focus();
  });

  byId('viewSelectPageCheckbox')?.addEventListener('change', (e) => {
    const checked = Boolean(e.target.checked);
    for (const item of state.bookmarks || []) {
      store.setSelected(item.id, checked);
    }
    renderHeader();
    renderCards();
  });

  byId('viewOpenBrowserBtn')?.addEventListener('click', () => {
    window.open(window.location.href, '_blank', 'noopener');
  });

  byId('askAiBtn')?.addEventListener('click', () => {
    openAiQaDialog({ bookmarkId: state.activeId || null, scope: 'auto' });
  });
  byId('aiQaAskBtn')?.addEventListener('click', async () => {
    await runAiQaFromDialog();
  });
  byId('aiQaCopyAnswerBtn')?.addEventListener('click', async () => {
    const text = String(aiQaDialogState.answer || '').trim();
    if (!text) return;
    const ok = await copyTextToClipboard(text);
    showToast(ok ? '回答已复制' : text, { timeoutMs: ok ? 2200 : 5000 });
  });
  byId('aiQaClearBtn')?.addEventListener('click', () => {
    aiQaDialogState.question = String(byId('aiQaQuestion')?.value || aiQaDialogState.question || '');
    clearAiQaDialogResult({ preserveQuestion: true });
  });
  byId('aiQaCloseBtn')?.addEventListener('click', () => {
    closeAiQaDialog();
  });
  byId('aiQaQuestion')?.addEventListener('input', (e) => {
    aiQaDialogState.question = String(e.target?.value || '');
    renderAiQaDialogUi();
  });
  byId('aiQaScope')?.addEventListener('change', (e) => {
    aiQaDialogState.scope = String(e.target?.value || 'auto');
    renderAiQaDialogUi();
  });
  byId('aiQaLimit')?.addEventListener('change', (e) => {
    aiQaDialogState.limit = Math.max(1, Math.min(10, Number(e.target?.value || 6) || 6));
    renderAiQaDialogUi();
  });
  byId('aiQaDialog')?.addEventListener('close', () => {
    renderAiQaDialogUi();
  });
  byId('aiFolderSummaryRunBtn')?.addEventListener('click', async () => {
    await runAiFolderSummaryForCurrentCollection();
  });
  byId('aiFolderSummaryClearBtn')?.addEventListener('click', () => {
    clearAiFolderSummaryDialogResult();
  });
  byId('aiFolderSummaryCopyBtn')?.addEventListener('click', async () => {
    const text = formatAiFolderSummaryText(aiFolderSummaryDialogState.result);
    if (!String(text || '').trim()) return showToast('暂无可复制内容', { timeoutMs: 2200 });
    const ok = await copyTextToClipboard(text);
    showToast(ok ? '集合摘要已复制' : text, { timeoutMs: ok ? 2200 : 5000 });
  });
  byId('aiFolderSummaryCloseBtn')?.addEventListener('click', () => {
    closeAiFolderSummaryDialog();
  });
  byId('aiFolderSummaryDialog')?.addEventListener('close', () => {
    aiFolderSummaryDialogState = { ...aiFolderSummaryDialogState, loading: false, error: '' };
    renderAiFolderSummaryDialogUi();
  });

  byId('newCollectionBtn').addEventListener('click', () => {
    if (addToolbarMenuOpen) setAddToolbarMenuOpen(false);
    openCollectionCreateDialog({
      parentId: 'root',
      color: '#8f96a3',
      title: '新建集合',
      subtitle: '创建顶级集合或挂到父级集合下。'
    });
  });

  byId('createBookmarkBtn').addEventListener('click', async (e) => {
    e.preventDefault();
    if (!validateBookmarkCreateForm()) return;
    const tags = byId('newTags').value.split(',').map((x) => x.trim()).filter(Boolean);
    try {
      const created = await api('/api/bookmarks', {
        method: 'POST',
        body: JSON.stringify({
          title: byId('newTitle').value,
          url: byId('newUrl').value,
          folderId: byId('newFolder').value,
          tags,
          note: byId('newNote').value
        })
      });
      byId('bookmarkDialog').close();
      byId('bookmarkForm').reset();
      clearFormValidation('bookmarkForm', 'bookmarkFormError');
      let aiAutoClassifyResult = null;
      try {
        aiAutoClassifyResult = await maybeRunAiAutoClassifyForCreatedBookmark(created);
      } catch (err) {
        aiAutoClassifyResult = { ran: false, error: err };
      }
      await refreshAll();
      if (created?.id) {
        store.setActiveId(String(created.id));
        renderDetail();
      }
      if (aiAutoClassifyResult?.ran) {
        const summaryText = Array.isArray(aiAutoClassifyResult.summary) && aiAutoClassifyResult.summary.length
          ? aiAutoClassifyResult.summary.join('；')
          : 'AI 自动分类已执行';
        if (aiAutoClassifyResult.errors?.length) {
          showToast(`${summaryText}；部分失败：${aiAutoClassifyResult.errors[0]}`, { timeoutMs: 5200 });
        } else {
          showToast(`新书签已创建，${summaryText}`, { timeoutMs: 3800 });
        }
      } else if (aiAutoClassifyResult?.error) {
        showToast(`书签已创建，但 AI 自动分类未执行：${aiAutoClassifyResult.error.message || aiAutoClassifyResult.error}`, { timeoutMs: 5000 });
      } else {
        showToast('书签已创建', { timeoutMs: 2400 });
      }
    } catch (err) {
      setFormBannerError('bookmarkFormError', err.message || '创建书签失败');
    }
  });

  byId('createCollectionBtn').addEventListener('click', async (e) => {
    e.preventDefault();
    if (!validateCollectionCreateForm()) return;
    try {
      await api('/api/folders', {
        method: 'POST',
        body: JSON.stringify({
          name: byId('newCollectionName').value,
          parentId: byId('newCollectionParent').value,
          color: byId('newCollectionColor').value
        })
      });
      byId('collectionDialog').close();
      byId('collectionForm').reset();
      clearFormValidation('collectionForm', 'collectionFormError');
      await refreshAll();
    } catch (err) {
      setFormBannerError('collectionFormError', err.message || '创建集合失败');
    }
  });

  byId('saveDetailBtn').addEventListener('click', saveDetail);
  byId('enableDetailEditBtn')?.addEventListener('click', () => {
    if (!state.activeId) return;
    setDetailEditMode(true);
  });
  byId('cancelDetailEditBtn')?.addEventListener('click', () => {
    if (!state.activeId) return;
    setDetailEditMode(false);
  });
  byId('detailHeaderEditBtn')?.addEventListener('click', () => {
    if (!state.activeId) return;
    setDetailEditMode(true);
  });
  byId('detailHeaderCancelEditBtn')?.addEventListener('click', () => {
    if (!state.activeId) return;
    setDetailEditMode(false);
  });

  byId('deleteDetailBtn').addEventListener('click', async () => {
    if (!state.activeId) return;
    await api(`/api/bookmarks/${state.activeId}`, { method: 'DELETE' });
    store.setActiveId(null);
    await refreshAll();
  });
  byId('detailHeaderDeleteBtn')?.addEventListener('click', async () => {
    if (!state.activeId) return;
    byId('deleteDetailBtn')?.click();
  });

  byId('restoreDetailBtn').addEventListener('click', async () => {
    if (!state.activeId) return;
    await api(`/api/bookmarks/${state.activeId}/restore`, { method: 'POST' });
    await refreshAll();
  });
  byId('detailHeaderRestoreBtn')?.addEventListener('click', async () => {
    if (!state.activeId) return;
    byId('restoreDetailBtn')?.click();
  });

  byId('openLinkBtn').addEventListener('click', async () => {
    if (!state.activeId) return;
    const item = state.bookmarks.find((x) => x.id === state.activeId) || state.allBookmarks.find((x) => x.id === state.activeId);
    if (!item) return;
    window.open(item.url, '_blank', 'noopener');
    await api(`/api/bookmarks/${item.id}/opened`, { method: 'POST' });
    await refreshAll();
  });

  byId('openPreviewBtn').addEventListener('click', async () => {
    if (!state.activeId) return;
    await open预览Dialog(state.activeId, { preferredMode: 'auto' });
  });
  byId('detailHeaderOpenBtn')?.addEventListener('click', async () => {
    if (!state.activeId) return;
    byId('openLinkBtn')?.click();
  });
  byId('detailHeaderPreviewBtn')?.addEventListener('click', async () => {
    if (!state.activeId) return;
    byId('openPreviewBtn')?.click();
  });
  byId('detailHeaderAiTagBtn')?.addEventListener('click', async () => {
    if (!state.activeId) return;
    await runAiAutoTagForActiveBookmark();
  });
  byId('refreshRelatedBookmarksBtn')?.addEventListener('click', async () => {
    if (!state.activeId) return;
    await runAiRelatedBookmarksForActiveBookmark();
  });
  byId('detailPrevBtn')?.addEventListener('click', () => {
    if (!state.activeId) return;
    moveActiveBookmark(-1);
  });
  byId('detailNextBtn')?.addEventListener('click', () => {
    if (!state.activeId) return;
    moveActiveBookmark(1);
  });
  byId('detailPanelViewModeBtn')?.addEventListener('click', () => {
    if (!state.activeId) return;
    setDetailEditMode(false);
  });
  byId('detailPanelEditModeBtn')?.addEventListener('click', () => {
    if (!state.activeId) return;
    setDetailEditMode(true);
  });
  byId('detailPanelWebBtn')?.addEventListener('click', async () => {
    if (!state.activeId) return;
    await open预览Dialog(state.activeId, { preferredMode: 'auto' });
  });
  byId('detailPanelReaderBtn')?.addEventListener('click', async () => {
    if (!state.activeId) return;
    await open预览Dialog(state.activeId, { preferredMode: 'reader' });
  });
  byId('detailPanelMoreBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!state.activeId) return;
    setDetailPanelMoreMenuOpen(!detailPanelMoreMenuOpen);
  });
  byId('detailPanelMoreMenu')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-detail-panel-more-action]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const action = String(btn.getAttribute('data-detail-panel-more-action') || '');
    setDetailPanelMoreMenuOpen(false);
    runDetailPanelMoreAction(action).catch((err) => {
      showToast(err.message || '详情菜单操作失败', { timeoutMs: 4000 });
    });
  });
  byId('detailCloseBtn')?.addEventListener('click', () => {
    if (!state.activeId) return;
    store.setActiveId(null);
    renderCards();
    renderDetail();
  });
  byId('detailPanelBackdrop')?.addEventListener('click', () => {
    if (!state.activeId) return;
    store.setActiveId(null);
    renderCards();
    renderDetail();
  });
  byId('detailForm')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-detail-section-toggle]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const key = String(btn.getAttribute('data-detail-section-toggle') || '');
    if (!key) return;
    toggleDetailSectionCollapsed(key);
  });

  byId('snoozeReminderBtn').addEventListener('click', async () => {
    if (!state.activeId) return;
    try {
      await api(`/api/bookmarks/${state.activeId}/reminder/snooze`, {
        method: 'POST',
        body: JSON.stringify({ minutes: 60 })
      });
      await refreshAll();
      showToast('提醒已延后 1 小时', { timeoutMs: 2500 });
    } catch (err) {
      showToast(err.message || '延后提醒失败', { timeoutMs: 4000 });
    }
  });

  byId('dismissReminderBtn').addEventListener('click', async () => {
    if (!state.activeId) return;
    try {
      await api(`/api/bookmarks/${state.activeId}/reminder/dismiss`, { method: 'POST', body: JSON.stringify({}) });
      await refreshAll();
      showToast('提醒已忽略', { timeoutMs: 2500 });
    } catch (err) {
      showToast(err.message || '忽略提醒失败', { timeoutMs: 4000 });
    }
  });

  byId('clearReminderBtn').addEventListener('click', async () => {
    if (!state.activeId) return;
    try {
      await api(`/api/bookmarks/${state.activeId}/reminder/clear`, { method: 'POST', body: JSON.stringify({}) });
      await refreshAll();
      showToast('提醒已清除', { timeoutMs: 2500 });
    } catch (err) {
      showToast(err.message || '清除提醒失败', { timeoutMs: 4000 });
    }
  });

  byId('scanRemindersBtn').addEventListener('click', async () => {
    try {
      const out = await api('/api/reminders/scan', { method: 'POST', body: JSON.stringify({}) });
      await refreshAll();
      showToast(`提醒扫描：触发 ${out?.dueTriggered ?? 0}`, { timeoutMs: 2500 });
    } catch (err) {
      showToast(err.message || '提醒扫描失败', { timeoutMs: 4000 });
    }
  });

  byId('fetchMetaBtn').addEventListener('click', async () => {
    if (!state.activeId) return;
    try {
      byId('detailMetaTaskInfo').textContent = '元数据任务：排队中...';
      const out = await api(`/api/bookmarks/${state.activeId}/metadata/tasks`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      const task = out?.task || null;
      renderMetadataTaskUi(task, { bookmarkId: state.activeId });
      await loadMetadataTaskHistoryForBookmark(state.activeId);
      if (task) startMetadataTaskPoll(task.id, state.activeId);
      await refreshAll();
      showToast(out?.deduped ? '元数据任务已在队列中或运行中' : '元数据任务已入队', { timeoutMs: 3000 });
    } catch (err) {
      byId('detailMetaTaskInfo').textContent = `元数据任务：failed to queue · ${err.message}`;
      showToast(err.message || '抓取元数据失败', { timeoutMs: 5000 });
    }
  });

  byId('retryMetaTaskBtn').addEventListener('click', async () => {
    if (!detailMetadataTaskLatestId) return;
    try {
      byId('detailMetaTaskInfo').textContent = '元数据任务：重试排队中...';
      const out = await api(`/api/metadata/tasks/${detailMetadataTaskLatestId}/retry`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      const task = out?.task || null;
      renderMetadataTaskUi(task, { bookmarkId: state.activeId });
      await loadMetadataTaskHistoryForBookmark(state.activeId);
      if (task) startMetadataTaskPoll(task.id, state.activeId);
      await refreshAll();
      showToast(out?.deduped ? '重试任务已去重（已有任务运行中）' : '重试任务已入队', { timeoutMs: 3000 });
    } catch (err) {
      byId('detailMetaTaskInfo').textContent = `元数据任务：retry failed · ${err.message}`;
      showToast(err.message || '重试失败', { timeoutMs: 5000 });
    }
  });

  byId('extractArticleBtn').addEventListener('click', async () => {
    await extractArticleForActiveBookmark({ openReaderAfter: false });
  });
  byId('generateReaderSummaryBtn')?.addEventListener('click', async () => {
    await runAiReaderSummaryForActiveBookmark();
  });

  byId('addHighlightBtn').addEventListener('click', async () => {
    if (!state.activeId) return;
    const quote = await uiPrompt('输入高亮文本', {
      title: '新增高亮',
      inputLabel: '高亮文本',
      required: true,
      requiredMessage: '请输入高亮文本'
    });
    if (quote === null) return;
    if (!String(quote).trim()) return showToast('请输入高亮文本');
    const note = (await uiPrompt('高亮备注（可选）', {
      title: '新增高亮',
      inputLabel: '备注',
      placeholder: '可选',
      required: false
    })) ?? '';
    await api(`/api/bookmarks/${state.activeId}/highlights`, {
      method: 'POST',
      body: JSON.stringify({
        text: quote,
        quote,
        note,
        anchors: { exact: quote }
      })
    });
    await refreshAll();
    showToast('高亮已添加', { timeoutMs: 2500 });
  });

  byId('refreshHighlightsBtn').addEventListener('click', async () => {
    if (!state.activeId) return;
    await loadHighlightsForBookmark(state.activeId, { force: true });
    showToast('高亮列表已刷新', { timeoutMs: 2000 });
  });
  byId('aiHighlightSuggestBtn')?.addEventListener('click', async () => {
    await runAiHighlightCandidatesForActiveBookmark();
  });
  byId('aiHighlightDigestBtn')?.addEventListener('click', async () => {
    await runAiHighlightDigestForActiveBookmark();
  });

  byId('refreshFetchStatusBtn').addEventListener('click', async () => {
    if (!state.activeId) return;
    await loadLatestMetadataTaskForBookmark(state.activeId, { force: true });
    await loadMetadataTaskHistoryForBookmark(state.activeId);
    showToast('抓取状态已刷新', { timeoutMs: 2000 });
  });

  byId('previewCloseBtn').addEventListener('click', () => {
    byId('previewDialog').close();
  });

  byId('previewRefreshBtn').addEventListener('click', async () => {
    if (!previewActiveBookmarkId) return;
    await load预览ForBookmark(previewActiveBookmarkId, { preferredMode: previewMode });
  });

  byId('previewOriginalBtn').addEventListener('click', () => {
    const p = previewPayload?.preview || previewPayload;
    const url = p?.fallback?.openUrl || p?.sourceUrl;
    if (url) window.open(url, '_blank', 'noopener');
  });

  byId('previewReaderBtn').addEventListener('click', async () => {
    if (!previewActiveBookmarkId) return;
    previewMode = previewMode === 'reader' ? 'auto' : 'reader';
    await load预览ForBookmark(previewActiveBookmarkId, { preferredMode: previewMode });
  });

  byId('previewExtractArticleBtn').addEventListener('click', async () => {
    if (previewActiveBookmarkId) store.setActiveId(previewActiveBookmarkId);
    await extractArticleForActiveBookmark({ openReaderAfter: true });
  });

  byId('previewAddHighlightBtn').addEventListener('click', async () => {
    const bookmarkId = String(previewActiveBookmarkId || state.activeId || '');
    if (!bookmarkId) return;
    try {
      if (previewMode !== 'reader') throw new Error('请先切换到阅读模式');
      const payload = getReaderSelectionPayload();
      await api(`/api/bookmarks/${bookmarkId}/highlights`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      await refreshAll();
      showToast('已从选区创建高亮', { timeoutMs: 2500 });
    } catch (err) {
      showToast(err.message || '创建高亮失败', { timeoutMs: 4000 });
    }
  });

  byId('previewDialog').addEventListener('close', () => {
    const closingBookmarkId = String(previewActiveBookmarkId || '');
    previewActiveBookmarkId = null;
    previewPayload = null;
    previewMode = 'auto';
    setPreviewUiState('idle', '选择一个书签以查看预览。');
    reset预览Surface();
    if (closingBookmarkId && state.activeId && String(state.activeId) === closingBookmarkId) {
      renderDetail();
    }
  });

  byId('bulkFavoriteBtn').addEventListener('click', async () => {
    const ids = [...state.selected];
    if (!ids.length) return showToast('未选择任何条目');
    const revertIds = state.allBookmarks.filter((x) => ids.includes(x.id) && !x.favorite).map((x) => x.id);
    const out = await postBulk({ ids, action: 'favorite', value: true });
    store.clearSelection();
    await refreshAll();
    showToast(`已收藏 ${out.affected || ids.length} 条`, {
      undoHandler: revertIds.length
        ? async () => {
          await postBulk({ ids: revertIds, action: 'favorite', value: false });
          await refreshAll();
          showToast(`撤销完成（${revertIds.length} 条)`, { timeoutMs: 3000 });
        }
        : null
    });
  });

  byId('bulkArchiveBtn').addEventListener('click', async () => {
    const ids = [...state.selected];
    if (!ids.length) return showToast('未选择任何条目');
    const revertIds = state.allBookmarks.filter((x) => ids.includes(x.id) && !x.archived).map((x) => x.id);
    const out = await postBulk({ ids, action: 'archive', value: true });
    store.clearSelection();
    await refreshAll();
    showToast(`已归档 ${out.affected || ids.length} 条`, {
      undoHandler: revertIds.length
        ? async () => {
          await postBulk({ ids: revertIds, action: 'archive', value: false });
          await refreshAll();
          showToast(`撤销完成（${revertIds.length} 条)`, { timeoutMs: 3000 });
        }
        : null
    });
  });

  byId('bulkAiTagBtn').addEventListener('click', async () => {
    await runBulkAiAutoTagForSelection();
  });

  byId('bulkDeleteBtn').addEventListener('click', async () => {
    const ids = [...state.selected];
    if (!ids.length) return showToast('未选择任何条目');
    const confirmed = await uiConfirm(`删除 ${ids.length} 个已选书签？你可以在提示条中撤销。`, {
      title: '批量删除',
      confirmText: '删除',
      danger: true
    });
    if (!confirmed) return;
    const restorableIds = state.allBookmarks.filter((x) => ids.includes(x.id) && !x.deletedAt).map((x) => x.id);
    const out = await postBulk({ ids, action: 'delete' });
    store.clearSelection();
    store.setActiveId(null);
    await refreshAll();
    showToast(`已删除 ${out.affected || ids.length} 条`, {
      undoHandler: restorableIds.length
        ? async () => {
          await postBulk({ ids: restorableIds, action: 'restore' });
          await refreshAll();
          showToast(`撤销完成（${restorableIds.length} 条)`, { timeoutMs: 3000 });
        }
        : null
    });
  });

  byId('bulkMoveSelect').addEventListener('change', async (e) => {
    const folderId = e.target.value;
    const ids = [...state.selected];
    if (!folderId || !ids.length) return;
    const byPrevFolder = new Map();
    for (const item of state.allBookmarks) {
      if (!ids.includes(item.id)) continue;
      const key = item.folderId || 'root';
      if (!byPrevFolder.has(key)) byPrevFolder.set(key, []);
      byPrevFolder.get(key).push(item.id);
    }
    const out = await postBulk({ ids, action: 'move', folderId });
    store.clearSelection();
    e.target.value = '';
    await refreshAll();
    showToast(`已移动 ${out.affected || ids.length} 条`, {
      undoHandler: byPrevFolder.size
        ? async () => {
          for (const [prevFolderId, restoreIds] of byPrevFolder.entries()) {
            if (!restoreIds.length) continue;
            await postBulk({ ids: restoreIds, action: 'move', folderId: prevFolderId });
          }
          await refreshAll();
          showToast('移动已撤销', { timeoutMs: 3000 });
        }
        : null
    });
  });

  byId('pluginPanelBtn').addEventListener('click', () => {
    window.location.assign('/plugin.html');
  });

  byId('tagManagerBtn').addEventListener('click', () => {
    renderTagManager();
    byId('tagManagerOutput').textContent = '就绪';
    byId('tagManagerDialog').showModal();
  });

  byId('importBtn')?.addEventListener('click', () => {
    populateIoFolderSelects();
    byId('importDialog').showModal();
  });

  byId('exportBtn')?.addEventListener('click', async () => {
    await loadIoTasks();
    byId('ioTaskOutput').textContent = '就绪';
    byId('exportDialog').showModal();
  });

  byId('importCloseBtn')?.addEventListener('click', () => {
    byId('importDialog').close();
  });

  byId('exportCloseBtn')?.addEventListener('click', () => {
    byId('exportDialog').close();
    stopIoTaskPoll();
  });

  byId('exportDialog')?.addEventListener('close', () => {
    stopIoTaskPoll();
  });

  byId('ioRefreshTasksBtn').addEventListener('click', async () => {
    await loadIoTasks();
    showToast('IO 任务已刷新', { timeoutMs: 2000 });
  });

  byId('ioQueueImportBtn').addEventListener('click', async () => {
    await queueIoImportTask();
  });

  byId('ioQueueExportBtn').addEventListener('click', async () => {
    await queueIoExportTask();
  });

  byId('ioClearImportBtn').addEventListener('click', () => {
    byId('ioImportContent').value = '';
    byId('ioImportCsvMapping').value = '';
    byId('ioImportFile').value = '';
  });

  byId('ioImportFile').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      byId('ioImportContent').value = text;
      const name = String(file.name || '').toLowerCase();
      if (name.endsWith('.html') || name.endsWith('.htm')) byId('ioImportFormat').value = 'import_html';
      if (name.endsWith('.json')) byId('ioImportFormat').value = 'import_json';
      if (name.endsWith('.csv')) byId('ioImportFormat').value = 'import_csv';
      showToast(`已加载文件：${file.name}`, { timeoutMs: 2500 });
    } catch (err) {
      showToast(err.message || '读取文件失败', { timeoutMs: 4000 });
    }
  });

  byId('ioRetryTaskBtn').addEventListener('click', async () => {
    const tasks = await loadIoTasks();
    const failed = tasks.find((t) => t.status === 'failed');
    if (!failed) return showToast('没有失败的 IO 任务');
    const out = await api(`/api/io/tasks/${failed.id}/retry`, { method: 'POST', body: JSON.stringify({}) });
    ioActiveTaskId = out?.task?.id || null;
    byId('ioTaskOutput').textContent = JSON.stringify(out, null, 2);
    await loadIoTasks();
    startIoTaskPoll(ioActiveTaskId);
    showToast('重试任务已入队', { timeoutMs: 2500 });
  });

  byId('savePluginCfgBtn')?.addEventListener('click', async () => {
    try {
      const mappings = JSON.parse(byId('pluginMappings').value || '[]');
      const payload = {
        raindropToken: byId('pluginToken').value.trim(),
        topLevelAutoSync: byId('pluginTopLevel').checked,
        mappings
      };
      const out = await api('/api/plugins/raindropSync/config', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      byId('pluginOutput').textContent = JSON.stringify(out, null, 2);
    } catch (err) {
      byId('pluginOutput').textContent = err.message;
    }
  });

  byId('pluginHistoryBtn')?.addEventListener('click', async () => {
    await loadPluginRuns();
  });

  byId('pluginAuditBtn')?.addEventListener('click', async () => {
    await loadPluginAudit();
  });

  byId('pluginDevicesBtn')?.addEventListener('click', async () => {
    await loadPluginDevices();
  });

  byId('pluginHealthBtn')?.addEventListener('click', async () => {
    await loadPluginHealth();
  });

  byId('pluginScheduleLoadBtn')?.addEventListener('click', async () => {
    await loadPluginSchedule();
  });

  byId('pluginScheduleSaveBtn')?.addEventListener('click', async () => {
    try {
      const out = await api('/api/plugins/raindropSync/schedule', {
        method: 'PUT',
        body: JSON.stringify(pluginSchedulePayload())
      });
      byId('pluginScheduleOutput').textContent = JSON.stringify(out, null, 2);
      await loadPluginAudit();
      await loadPluginHealth();
    } catch (err) {
      byId('pluginScheduleOutput').textContent = err.message;
    }
  });

  byId('pluginSchedulePauseBtn')?.addEventListener('click', async () => {
    try {
      const out = await api('/api/plugins/raindropSync/schedule/pause', { method: 'POST', body: '{}' });
      byId('pluginScheduleOutput').textContent = JSON.stringify(out, null, 2);
      await loadPluginSchedule();
      await loadPluginAudit();
      await loadPluginHealth();
    } catch (err) {
      byId('pluginScheduleOutput').textContent = err.message;
    }
  });

  byId('pluginScheduleResumeBtn')?.addEventListener('click', async () => {
    try {
      const out = await api('/api/plugins/raindropSync/schedule/resume', { method: 'POST', body: '{}' });
      byId('pluginScheduleOutput').textContent = JSON.stringify(out, null, 2);
      await loadPluginSchedule();
      await loadPluginAudit();
      await loadPluginHealth();
    } catch (err) {
      byId('pluginScheduleOutput').textContent = err.message;
    }
  });

  byId('pluginScheduleTickBtn')?.addEventListener('click', async () => {
    try {
      const out = await api('/api/plugins/raindropSync/schedule/tick', {
        method: 'POST',
        body: JSON.stringify({ force: true })
      });
      byId('pluginScheduleOutput').textContent = JSON.stringify(out, null, 2);
      await loadPluginSchedule();
      await loadPluginAudit();
      await loadPluginHealth();
      await loadPluginRuns();
      const taskId = out?.results?.[0]?.task?.id;
      if (taskId) await pollPluginTask(taskId);
    } catch (err) {
      byId('pluginScheduleOutput').textContent = err.message;
    }
  });

  byId('pluginRetryBtn')?.addEventListener('click', async () => {
    try {
      const tasks = await fetchPluginTasks(30);
      const latestFailed = tasks.find((t) => t.status === 'failed');
      if (!latestFailed) {
        byId('pluginOutput').textContent = '没有可重试的失败任务';
        return;
      }
      const out = await api(`/api/plugins/raindropSync/tasks/${encodeURIComponent(latestFailed.id)}/retry`, {
        method: 'POST',
        body: '{}'
      });
      byId('pluginOutput').textContent = JSON.stringify(out, null, 2);
      await loadPluginRuns();
      await loadPluginAudit();
      await loadPluginDevices();
      await loadPluginHealth();
      if (out?.task?.id) await pollPluginTask(out.task.id);
    } catch (err) {
      byId('pluginOutput').textContent = err.message;
    }
  });

  byId('pluginReplayBtn')?.addEventListener('click', async () => {
    try {
      const tasks = await fetchPluginTasks(30);
      const latest = tasks[0];
      if (!latest) {
        byId('pluginOutput').textContent = '没有可重放的任务';
        return;
      }
      const out = await api(`/api/plugins/raindropSync/tasks/${encodeURIComponent(latest.id)}/replay`, {
        method: 'POST',
        body: '{}'
      });
      byId('pluginOutput').textContent = JSON.stringify(out, null, 2);
      await loadPluginRuns();
      await loadPluginAudit();
      await loadPluginDevices();
      await loadPluginHealth();
      if (out?.task?.id) await pollPluginTask(out.task.id);
    } catch (err) {
      byId('pluginOutput').textContent = err.message;
    }
  });

  byId('previewPluginBtn')?.addEventListener('click', async () => {
    try {
      const out = await api('/api/plugins/raindropSync/preview', { method: 'POST', body: '{}' });
      byId('pluginOutput').textContent = JSON.stringify(out, null, 2);
      await loadPluginAudit();
      await loadPluginDevices();
      await loadPluginHealth();
      await loadPluginRuns();
    } catch (err) {
      byId('pluginOutput').textContent = err.message;
    }
  });

  byId('runPluginBtn')?.addEventListener('click', async () => {
    try {
      const out = await api('/api/plugins/raindropSync/tasks', {
        method: 'POST',
        body: JSON.stringify({ kind: 'run', input: {} })
      });
      byId('pluginOutput').textContent = JSON.stringify(out, null, 2);
      await loadPluginAudit();
      await loadPluginDevices();
      await loadPluginHealth();
      await loadPluginRuns();
      if (out?.task?.id) {
        await pollPluginTask(out.task.id);
      }
    } catch (err) {
      byId('pluginOutput').textContent = err.message;
    }
  });

  byId('renameTagBtn').addEventListener('click', async () => {
    const from = byId('tagRenameFrom').value.trim();
    const to = byId('tagRenameTo').value.trim();
    if (!from || !to) {
      byId('tagManagerOutput').textContent = '请选择来源/目标标签';
      return;
    }
    try {
      const out = await api('/api/tags/rename', {
        method: 'POST',
        body: JSON.stringify({ from, to })
      });
      byId('tagManagerOutput').textContent = JSON.stringify(out, null, 2);
      byId('tagRenameTo').value = '';
      await refreshAll();
      renderTagManager();
    } catch (err) {
      byId('tagManagerOutput').textContent = err.message;
    }
  });

  byId('mergeTagsBtn').addEventListener('click', async () => {
    const sources = byId('tagMergeSources').value
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    const target = byId('tagMergeTarget').value.trim();
    if (!sources.length || !target) {
      byId('tagManagerOutput').textContent = '请输入来源标签和目标标签';
      return;
    }
    try {
      const out = await api('/api/tags/merge', {
        method: 'POST',
        body: JSON.stringify({ sources, target })
      });
      byId('tagManagerOutput').textContent = JSON.stringify(out, null, 2);
      byId('tagMergeSources').value = '';
      byId('tagMergeTarget').value = '';
      await refreshAll();
      renderTagManager();
    } catch (err) {
      byId('tagManagerOutput').textContent = err.message;
    }
  });

  byId('aiTagStandardizeBtn')?.addEventListener('click', async () => {
    const output = byId('tagManagerOutput');
    try {
      output.textContent = 'AI 正在分析标签并生成标准化建议...';
      const suggestOut = await api('/api/product/ai/tags/standardize', {
        method: 'POST',
        body: JSON.stringify({ apply: false })
      });
      output.textContent = JSON.stringify(suggestOut, null, 2);
      const suggestions = Array.isArray(suggestOut?.suggestions) ? suggestOut.suggestions : [];
      if (!suggestions.length) {
        showToast('AI 未给出可应用的标签标准化建议', { timeoutMs: 3200 });
        return;
      }
      const ok = await uiConfirm(`AI 生成了 ${suggestions.length} 条标签标准化建议。是否立即应用（批量合并标签）？`, {
        title: 'AI 标签标准化建议',
        confirmText: '应用建议',
        cancelText: '仅查看建议'
      });
      if (!ok) {
        showToast(`AI 已生成 ${suggestions.length} 条标签标准化建议`, { timeoutMs: 3200 });
        return;
      }
      output.textContent = '正在应用 AI 标签标准化建议...';
      const applyOut = await api('/api/product/ai/tags/standardize', {
        method: 'POST',
        body: JSON.stringify({ apply: true, suggestions })
      });
      output.textContent = JSON.stringify(applyOut, null, 2);
      await refreshAll();
      renderTagManager();
      const appliedGroups = Number(applyOut?.applyResult?.appliedGroups || 0) || 0;
      const affectedBookmarks = Number(applyOut?.applyResult?.affectedBookmarks || 0) || 0;
      showToast(`已应用 ${appliedGroups} 条标签标准化建议（影响 ${affectedBookmarks} 条书签）`, { timeoutMs: 3800 });
    } catch (err) {
      output.textContent = err.message || String(err);
      showToast(err.message || 'AI 标签标准化失败', { timeoutMs: 4200 });
    }
  });

  byId('aiTagLocalizeBtn')?.addEventListener('click', async () => {
    const output = byId('tagManagerOutput');
    try {
      output.textContent = 'AI 正在识别标签语言并生成本地化统一建议...';
      const suggestOut = await api('/api/product/ai/tags/localize', {
        method: 'POST',
        body: JSON.stringify({ apply: false })
      });
      output.textContent = JSON.stringify(suggestOut, null, 2);
      const suggestions = Array.isArray(suggestOut?.suggestions) ? suggestOut.suggestions : [];
      if (!suggestions.length) {
        showToast('AI 未给出可应用的标签本地化建议', { timeoutMs: 3200 });
        return;
      }
      const preferChinese = suggestOut?.strategy?.preferChinese !== false;
      const ok = await uiConfirm(`AI 生成了 ${suggestions.length} 条标签本地化建议（目标策略：${preferChinese ? '优先中文' : '保留英文优先'}）。是否立即应用？`, {
        title: 'AI 标签本地化建议',
        confirmText: '应用建议',
        cancelText: '仅查看建议'
      });
      if (!ok) {
        showToast(`AI 已生成 ${suggestions.length} 条标签本地化建议`, { timeoutMs: 3200 });
        return;
      }
      output.textContent = '正在应用 AI 标签本地化建议...';
      const applyOut = await api('/api/product/ai/tags/localize', {
        method: 'POST',
        body: JSON.stringify({ apply: true, suggestions })
      });
      output.textContent = JSON.stringify(applyOut, null, 2);
      await refreshAll();
      renderTagManager();
      const appliedGroups = Number(applyOut?.applyResult?.appliedGroups || 0) || 0;
      const affectedBookmarks = Number(applyOut?.applyResult?.affectedBookmarks || 0) || 0;
      showToast(`已应用 ${appliedGroups} 条标签本地化建议（影响 ${affectedBookmarks} 条书签）`, { timeoutMs: 4000 });
    } catch (err) {
      output.textContent = err.message || String(err);
      showToast(err.message || 'AI 标签本地化失败', { timeoutMs: 4200 });
    }
  });
}

async function loadPluginConfig() {
  try {
    const config = await api('/api/plugins/raindropSync/config');
    store.setPluginConfig(config);
    if (byId('pluginToken')) byId('pluginToken').value = config.raindropToken || '';
    if (byId('pluginTopLevel')) byId('pluginTopLevel').checked = Boolean(config.topLevelAutoSync);
    if (byId('pluginMappings')) byId('pluginMappings').value = JSON.stringify(config.mappings || [], null, 2);
    if (byId('pluginOutput')) byId('pluginOutput').textContent = '就绪';
  } catch (err) {
    if (byId('pluginOutput')) byId('pluginOutput').textContent = err.message;
  }
}

function pluginSchedulePayload() {
  return {
    enabled: byId('pluginScheduleEnabled')?.checked ?? false,
    paused: byId('pluginSchedulePaused')?.checked ?? false,
    intervalMinutes: Number(byId('pluginScheduleInterval')?.value || 15),
    maxConcurrent: Number(byId('pluginScheduleMaxConcurrent')?.value || 1),
    windowEnabled: byId('pluginScheduleWindowEnabled')?.checked ?? false,
    windowStartHour: Number(byId('pluginScheduleWindowStart')?.value || 0),
    windowEndHour: Number(byId('pluginScheduleWindowEnd')?.value || 24)
  };
}

function applyPluginScheduleToForm(schedule = {}) {
  if (byId('pluginScheduleEnabled')) byId('pluginScheduleEnabled').checked = Boolean(schedule.enabled);
  if (byId('pluginSchedulePaused')) byId('pluginSchedulePaused').checked = Boolean(schedule.paused);
  if (byId('pluginScheduleInterval')) byId('pluginScheduleInterval').value = String(Number(schedule.intervalMinutes || 15));
  if (byId('pluginScheduleMaxConcurrent')) byId('pluginScheduleMaxConcurrent').value = String(Number(schedule.maxConcurrent || 1));
  if (byId('pluginScheduleWindowEnabled')) byId('pluginScheduleWindowEnabled').checked = Boolean(schedule.windowEnabled);
  if (byId('pluginScheduleWindowStart')) byId('pluginScheduleWindowStart').value = String(Number(schedule.windowStartHour ?? 0));
  if (byId('pluginScheduleWindowEnd')) byId('pluginScheduleWindowEnd').value = String(Number(schedule.windowEndHour ?? 24));
}

async function loadPluginSchedule() {
  try {
    const schedule = await api('/api/plugins/raindropSync/schedule');
    applyPluginScheduleToForm(schedule);
    if (byId('pluginScheduleOutput')) byId('pluginScheduleOutput').textContent = JSON.stringify(schedule, null, 2);
  } catch (err) {
    if (byId('pluginScheduleOutput')) byId('pluginScheduleOutput').textContent = err.message;
  }
}

async function loadPluginRuns() {
  try {
    const [runs, tasks] = await Promise.all([
      api('/api/plugins/raindropSync/runs?limit=20'),
      api('/api/plugins/raindropSync/tasks?limit=20')
    ]);
    if (byId('pluginHistory')) byId('pluginHistory').textContent = JSON.stringify({ tasks, runs }, null, 2);
  } catch (err) {
    if (byId('pluginHistory')) byId('pluginHistory').textContent = err.message;
  }
}

async function loadPluginAudit() {
  try {
    const audit = await api('/api/plugins/raindropSync/audit');
    if (byId('pluginAudit')) byId('pluginAudit').textContent = JSON.stringify(audit, null, 2);
  } catch (err) {
    if (byId('pluginAudit')) byId('pluginAudit').textContent = err.message;
  }
}

async function loadPluginDevices() {
  try {
    const devices = await api('/api/plugins/raindropSync/devices?limit=20');
    if (byId('pluginDevices')) byId('pluginDevices').textContent = JSON.stringify(devices, null, 2);
  } catch (err) {
    if (byId('pluginDevices')) byId('pluginDevices').textContent = err.message;
  }
}

async function loadPluginHealth() {
  try {
    const health = await api('/api/plugins/raindropSync/health');
    if (byId('pluginHealth')) byId('pluginHealth').textContent = JSON.stringify(health, null, 2);
  } catch (err) {
    if (byId('pluginHealth')) byId('pluginHealth').textContent = err.message;
  }
}

function stopIoTaskPoll() {
  if (ioTaskPollTimer) {
    clearInterval(ioTaskPollTimer);
    ioTaskPollTimer = null;
  }
}

function isIoTaskTerminal(status) {
  return ['succeeded', 'failed'].includes(String(status || ''));
}

function renderIoTaskList(tasks = []) {
  const listEl = byId('ioTaskList');
  if (!listEl) return;
  if (!Array.isArray(tasks) || !tasks.length) {
    listEl.innerHTML = `<div class="muted">暂无导入/导出任务。</div>`;
    return;
  }
  listEl.innerHTML = tasks
    .map((t) => {
      const active = ioActiveTaskId && ioActiveTaskId === t.id ? 'active' : '';
      const resultText = t.result ? JSON.stringify(t.result) : (t.error?.message || '');
      return `<div class="io-task-item ${active}" data-io-task="${t.id}">
        <div class="io-task-row">
          <strong>${escapeHtml(String(t.type || 'task'))}</strong>
          <span class="meta-chip ${t.status === 'succeeded' ? 'success' : t.status === 'failed' ? 'danger' : t.status === 'running' ? 'info' : 'neutral'}">${escapeHtml(String(t.status || 'unknown'))}</span>
        </div>
        <div class="muted">${escapeHtml(`${t.progress?.percent ?? 0}% · ${t.progress?.step || ''}`)}</div>
        <div class="muted">${escapeHtml(resultText ? resultText.slice(0, 180) : '')}</div>
        <div class="io-task-row">
          <div class="muted">${t.updatedAt ? new Date(Number(t.updatedAt)).toLocaleString() : ''}</div>
          <div class="detail-inline-actions">
            <button type="button" class="ghost" data-io-open="${t.id}">详情</button>
            ${t.outputFile?.url ? `<button type="button" data-io-download="${t.id}">⬇️ 下载</button>` : ''}
            ${t.reportFile?.url ? `<button type="button" class="ghost" data-io-report="${t.id}">日志</button>` : ''}
            ${t.status === 'failed' ? `<button type="button" class="ghost danger" data-io-retry="${t.id}">重试</button>` : ''}
          </div>
        </div>
      </div>`;
    })
    .join('');

  const showTaskOutput = async (taskId) => {
    const out = await api(`/api/io/tasks/${taskId}`);
    ioActiveTaskId = taskId;
    byId('ioTaskOutput').textContent = JSON.stringify(out, null, 2);
    const task = out?.task || null;
    if (task && !isIoTaskTerminal(task.status)) startIoTaskPoll(task.id);
    const latest = await api('/api/io/tasks?limit=20');
    renderIoTaskList(latest?.tasks || []);
  };

  listEl.querySelectorAll('[data-io-open]').forEach((el) => {
    el.addEventListener('click', async () => {
      await showTaskOutput(el.dataset.ioOpen);
    });
  });

  listEl.querySelectorAll('[data-io-download]').forEach((el) => {
    el.addEventListener('click', async () => {
      const out = await api(`/api/io/tasks/${el.dataset.ioDownload}`);
      const url = out?.task?.outputFile?.url;
      if (url) {
        const a = document.createElement('a');
        a.href = url;
        a.download = '';
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    });
  });

  listEl.querySelectorAll('[data-io-report]').forEach((el) => {
    el.addEventListener('click', async () => {
      const out = await api(`/api/io/tasks/${el.dataset.ioReport}`);
      const url = out?.task?.reportFile?.url;
      if (url) window.open(url, '_blank', 'noopener');
    });
  });

  listEl.querySelectorAll('[data-io-retry]').forEach((el) => {
    el.addEventListener('click', async () => {
      const out = await api(`/api/io/tasks/${el.dataset.ioRetry}/retry`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      ioActiveTaskId = out?.task?.id || null;
      byId('ioTaskOutput').textContent = JSON.stringify(out, null, 2);
      startIoTaskPoll(ioActiveTaskId);
      showToast('重试任务已入队', { timeoutMs: 2500 });
    });
  });
}

async function loadIoTasks() {
  try {
    const out = await api('/api/io/tasks?limit=30');
    const tasks = out?.tasks || [];
    renderIoTaskList(tasks);
    if (!ioActiveTaskId && tasks.length) ioActiveTaskId = tasks[0].id;
    return tasks;
  } catch (err) {
    byId('ioTaskList').innerHTML = `<div class="muted">${escapeHtml(err.message || '加载任务失败')}</div>`;
    return [];
  }
}

function startIoTaskPoll(taskId) {
  stopIoTaskPoll();
  const id = String(taskId || '');
  if (!id) return;
  ioTaskPollTimer = setInterval(async () => {
    try {
      const out = await api(`/api/io/tasks/${id}`);
      byId('ioTaskOutput').textContent = JSON.stringify(out, null, 2);
      const task = out?.task || null;
      await loadIoTasks();
      if (!task || isIoTaskTerminal(task.status)) {
        stopIoTaskPoll();
        if (task?.type?.startsWith?.('import_') && task.status === 'succeeded') {
          await refreshAll();
        }
      }
    } catch (_err) {
      stopIoTaskPoll();
    }
  }, 1200);
}

function populateIoFolderSelects() {
  const target = byId('ioImportTargetFolder');
  if (!target) return;
  target.innerHTML = folderParentOptionsHtml('root');
}

function ioExportOptionsFromUi() {
  const scope = byId('ioExportScope').value;
  const options = {
    includeTrash: byId('ioExportIncludeTrash').checked
  };
  if (scope === 'currentFolder' && state.filters.folderId && state.filters.folderId !== 'all') {
    options.folderId = state.filters.folderId;
  }
  if (scope === 'selected') {
    options.ids = [...state.selected];
  }
  return options;
}

async function queueIoImportTask() {
  const type = byId('ioImportFormat').value;
  const content = byId('ioImportContent').value;
  if (!String(content || '').trim()) {
    showToast('导入内容为空', { timeoutMs: 3000 });
    return;
  }
  let mapping = null;
  if (type === 'import_csv') {
    const raw = byId('ioImportCsvMapping').value.trim();
    if (raw) {
      try {
        mapping = JSON.parse(raw);
      } catch (err) {
        showToast(`CSV 映射 JSON 无效：${err.message}`, { timeoutMs: 4000 });
        return;
      }
    }
  }
  const out = await api('/api/io/tasks', {
    method: 'POST',
    body: JSON.stringify({
      type,
      input: {
        content,
        targetFolderId: byId('ioImportTargetFolder').value || 'root',
        conflictStrategy: byId('ioImportConflict').value || 'skip',
        mapping
      }
    })
  });
  ioActiveTaskId = out?.task?.id || null;
  byId('ioTaskOutput').textContent = JSON.stringify(out, null, 2);
  await loadIoTasks();
  startIoTaskPoll(ioActiveTaskId);
  showToast('导入任务已入队', { timeoutMs: 2500 });
}

async function queueIoExportTask() {
  const type = byId('ioExportFormat').value;
  const out = await api('/api/io/tasks', {
    method: 'POST',
    body: JSON.stringify({
      type,
      input: {
        options: ioExportOptionsFromUi()
      }
    })
  });
  ioActiveTaskId = out?.task?.id || null;
  byId('ioTaskOutput').textContent = JSON.stringify(out, null, 2);
  await loadIoTasks();
  startIoTaskPoll(ioActiveTaskId);
  showToast('导出任务已入队', { timeoutMs: 2500 });
}

async function init() {
  if (window.location.pathname === '/login.html') return;
  setSavedSearchesUiVisible(SAVED_SEARCHES_UI_ENABLED);
  bindActions();
  hydrateWorkbenchHeaderIcons();
  byId('sortSelect').value = state.filters.sort;
  byId('pageSizeSelect').value = String(state.filters.pageSize);
  syncAdvancedSearchInputs();
  renderBookmarkLayoutSwitch();
  renderAuthUi();
  await loadAuthMe();
  if (!authState.authenticated) {
    redirectToLoginPage();
    return;
  }
  authGuardLastCheckAt = Date.now();
  await loadAuthTokens().catch(() => []);
  await loadSavedSearches().catch(() => []);
  await refreshAll();
}

init().catch((err) => {
  console.error(err);
  alert(err.message);
});
